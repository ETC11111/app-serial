#include <SoftwareSerial.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include "DFRobot_ECPRO.h"
#include "DFRobot_PH.h"
#include <EEPROM.h>
#include "nutCycle.h"

// ============================================
// Slave: Arduino Uno (SoftwareSerial 사용)
// RS485: RO->RX_PIN, DI->TX_PIN, (DE와 /RE를 묶어서) DE_RE_PIN으로 제어
// 프레이밍: '\n' 줄바꿈 기반
// ============================================

// --- RS485 SoftwareSerial 핀 설정 ---
#define RX_PIN 2   // RS485 모듈의 RO가 연결될 핀
#define TX_PIN 3   // RS485 모듈의 DI가 연결될 핀
SoftwareSerial rs485(RX_PIN, TX_PIN); // RX, TX

// --- DE/RE 합산 제어 핀 (DE와 /RE를 물리적으로 묶어 이 핀에 연결) ---
#define DE_RE_PIN A1

// --- 통신/타이밍 파라미터 (속도 최적화) ---
const uint32_t BAUD_RATE = 57600;       // slave_test.cpp와 동일
const uint16_t TURNAROUND_US = 250;     // slave_test.cpp와 동일
const uint16_t INTENTIONAL_REPLY_US = 250; // slave_test.cpp와 동일

// SoftwareSerial은 .flush()가 "입력 버퍼 비우기"라 TX 완료 보장이 안 됩니다.
// 바이트 전송 시간으로 근사 대기:
const uint8_t  BITS_PER_BYTE = 10;  // 1Start + 8Data + 1Stop(=10)
inline uint32_t byte_time_us(uint32_t baud) {
  // 올림 처리(ceiling): (bits*1e6 + baud -1)/baud
  return ( (uint32_t)BITS_PER_BYTE * 1000000UL + baud - 1 ) / baud;
}

inline void wait_tx_done_by_time(size_t bytes) {
  // 고속 통신용 최적화: 바이트 시간 + 최소 가드 시간
  uint32_t byteTime = byte_time_us(BAUD_RATE) * bytes;
  uint32_t guardTime = TURNAROUND_US;
  delayMicroseconds(byteTime + guardTime);
}

// --- 모드 전환 ---
inline void enterTransmitMode() { digitalWrite(DE_RE_PIN, HIGH); } // DE=1, /RE=1 → TX
inline void enterReceiveMode()  { digitalWrite(DE_RE_PIN, LOW);  } // DE=0, /RE=0 → RX

// '\n'까지 읽어 buf에 저장 (바이트 배열로 처리). 성공시 true, 길이는 idx에 저장
bool readLine(SoftwareSerial& s, char* buf, size_t maxLen, uint16_t timeout_ms, int* receivedLen) {
  size_t idx = 0;
  unsigned long t0 = millis();
  bool hasData = false;
  
  while (millis() - t0 < timeout_ms) {
    while (s.available()) {
      hasData = true;
      char c = (char)s.read();
      
      if (c == '\n') {
        // null 문자로 종료하지 않고 실제 바이트 길이 반환
        *receivedLen = idx;
        return true; 
      }
      if (idx < maxLen - 1) {
        buf[idx++] = c;
      } else {
        //Serial.println(F("Buffer overflow"));
        return false; // 버퍼 오버플로우 시 즉시 종료
      }
    }
  }
  
  if (hasData) {
    // null 문자로 종료하지 않고 실제 바이트 길이 반환
    *receivedLen = idx;
    //Serial.print(F("Incomplete: "));
    //Serial.print(idx);
    //Serial.println(F("B"));
  }
  
  return false;
}

// 릴레이 핀 설정 (절대 고정)
int pins[] = {8, 7, 6, 5, 9, 10, 11, A2, 12, 13}; // 제어할 핀 배열. A3 고장
int numPins = 10; // 핀 개수

// 🔥 비트연산 명령 상수 추가
const uint8_t CMD_MULTI_ON = 0x30;   // 다중 릴레이 ON
const uint8_t CMD_MULTI_OFF = 0x31;  // 다중 릴레이 OFF


// 바이트 기반 명령 정의 (NPN 충돌 방지) - 상단으로 이동
#define CMD_RESET          0x20  // 서버 호환성 (모든 핀 OFF)
#define CMD_ALLOFF         0x21  // 서버 호환성 (모든 핀 OFF)
#define CMD_TOGGLE         0x22  // 단일 핀 토글
#define CMD_ON             0x23  // 단일 핀 ON (채널 지정)
#define CMD_OFF            0x24  // 단일 핀 OFF (채널 지정)
#define CMD_SENSOR_REQUEST 0x25  // 센서 데이터 요청
#define CMD_EC_PULSE       0x26  // EC 펄스 토글 (2개 핀 동시 제어)
#define CMD_EC_OFF         0x27  // EC OFF (2개 핀 동시 제어)
#define CMD_BED_ON         0x29  // 베드 ON (4개 핀 동시 제어) - NPN 충돌 방지
#define CMD_NUTCYCLE_CONFIG 0x32 // nutCycle 설정 전달 (JSON)
#define CMD_STATUS_REQUEST 0x33 // nutCycle 상태 요청

// 응답 코드 정의
#define ACK_OK             0x80
#define ACK_ERROR          0x81
#define ACK_SENSOR_DATA    0x82
#define ACK_STATUS_DATA    0x83 // 상태 데이터 응답

// 센서 핀 정의 (요청사항에 따라 수정)
const int PH_PIN = A0;    // PH 센서 아날로그 핀
const int EC_PIN = A4;    // EC 센서 아날로그 핀
const int TEMP_PIN = A5;  // 온도 센서 아날로그 핀 (EC 및 pH 센서 온도 보정용)

// 객체 생성 (slave_A에서 가져옴)
DFRobot_ECPRO ec;
DFRobot_ECPRO_PT1000 ecpt; // EC 센서의 온도 센서 객체
DFRobot_PH ph;

// JSON 문서 (메모리 최적화: 192 → 128)
StaticJsonDocument<128> doc;

// 타이머 변수 (고속 통신용 최적화)
const unsigned long SENSOR_INTERVAL = 5000; // 10초 → 5초로 단축

// 변수 선언
float Temperature;
float Conductivity;
float pH_Value;
float ecValue = 0.0;       // EC 값 (μS/cm, 전송 시 dS/m로 변환)
float waterTemp = 25.0;    // 수온 (기본값 25°C)
uint16_t EC_Voltage = 0;   // EC 센서 전압 값 (mV)
uint16_t TE_Voltage = 0;   // 온도 센서 전압 값 (mV)
float phValue = 0.0;       // pH 값
float phVoltage = 0.0;     // pH 센서 전압 값

// EC 센서 관련 상수
#define EC_84_MIN 72
#define EC_84_MAX 105
#define EC_1413_MIN 1050
#define EC_1413_MAX 1200
#define EC_HISTORY_SIZE 8  // 10 → 8 (메모리 최적화)

// pH 센서 관련 상수
#define PH_HISTORY_SIZE 8  // 10 → 8 (메모리 최적화)

// 이동 평균 필터 관련 변수
float ecHistory[EC_HISTORY_SIZE] = {0};
int ecHistoryIndex = 0;
bool ecHistoryFilled = false;
float phReadingsHistory[PH_HISTORY_SIZE] = {0};
int phHistoryIndex = 0;
bool phHistoryFilled = false;

// EC 보정 상수 (slave_A에서 그대로 가져옴)
const float RAW_EC1413 = 1125.00f;
const float RAW_EC84 = 85.25f;
const float STD_EC_HIGH = 1413.0f;
const float STD_EC_LOW = 84.0f;
const float slope = (STD_EC_HIGH - STD_EC_LOW) / (RAW_EC1413 - RAW_EC84);
const float intercept = STD_EC_HIGH - slope * RAW_EC1413;

// pH 보정 상수 (slave_A에서 그대로 가져옴)
float RAW_PH4 = 2.215;
float RAW_PH7 = 1.762;
float phSlope = -3.0;
float phIntercept = 7.0;

// ===================== 릴레이 제어 함수 (nutCycle과 공통 사용) =====================
// 자가복구 기능 포함: setRelay 후 실제 상태 확인 및 재시도
void setRelay(uint8_t channel, bool state) {
    if (channel >= numPins) return;
    
    const uint8_t MAX_RETRIES = 3;
    bool targetState = state ? HIGH : LOW;
    
    for (uint8_t retry = 0; retry < MAX_RETRIES; retry++) {
        digitalWrite(pins[channel], targetState);
        delayMicroseconds(100); // 하드웨어 안정화 대기
        
        bool actualState = digitalRead(pins[channel]) == HIGH;
        bool expectedState = state;
        
        if (actualState == expectedState) {
            return; // 성공
        }
        
        // 재시도
        if (retry < MAX_RETRIES - 1) {
            delayMicroseconds(500); // 재시도 전 대기
        }
    }
    
    // 최종 실패 시 로그 출력
    //Serial.print(F("Relay recovery failed: CH"));
    //Serial.print(channel);
    //Serial.print(F(" expected="));
    //Serial.print(state ? F("H") : F("L"));
    //Serial.print(F(" actual="));
    //Serial.println(getRelayStatus(channel) ? F("H") : F("L"));
}

bool getRelayStatus(uint8_t channel) {
    if (channel < numPins) {
        return digitalRead(pins[channel]) == HIGH;
    }
    return false;
}

void setup() {
  pinMode(DE_RE_PIN, OUTPUT);
  enterReceiveMode();

  rs485.begin(BAUD_RATE);
  
  // RS485 하드웨어 테스트 (간소화)
  //Serial.println(F("RS485 initialized"));

  // 모든 릴레이 핀을 출력 모드로 설정
  for (int i = 0; i < numPins; i++) {
    pinMode(pins[i], OUTPUT);
    digitalWrite(pins[i], LOW); // 초기값을 LOW로 설정
  }
  
  
  // 센서 핀 설정
  pinMode(EC_PIN, INPUT);
  pinMode(PH_PIN, INPUT);
  pinMode(TEMP_PIN, INPUT);
  
  Serial.begin(115200);  // 디버그용 시리얼 속도 향상
  rs485.begin(BAUD_RATE); // 57600 보드레이트 사용
  
  // 센서 초기화
  ph.begin();
  ec.setCalibration(1.0);
  
  // pH 보정 계수 계산
  updatePhCalibrationFactors();
  
  //Serial.println(F("UNO Ready"));
  
  // nutCycle 초기화
  initNutrientCycle();
}

void loop() {
  // 제어용 UNO 존재 알림: 주기적으로 헬로 토큰 전송 (Mega가 수신 시 활성화)
  {
    static unsigned long lastHello = 0;
    if (millis() - lastHello > 3000) {
      lastHello = millis();
      enterTransmitMode();
      delayMicroseconds(TURNAROUND_US);
      const char hello[] = "UNO_CTRL_HELLO\n";
      for (size_t i=0;i<sizeof(hello)-1;i++) rs485.write((uint8_t)hello[i]);
      rs485.flush();
      wait_tx_done_by_time(sizeof(hello)-1);
      enterReceiveMode();
    }
  }
  
  // 하트비트 출력 (30초마다, 메모리 최적화)
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    //Serial.print(F("Heartbeat: "));
    //Serial.println(millis() / 1000);
  }
  
  // 마스터 메시지 수신 처리
  // 바이트 기반 명령과 JSON 명령(길이 기반)을 분리 처리
  if (rs485.available() >= 1) {
    char firstByte = rs485.peek();
    
    // 상태 요청 처리 (CMD_STATUS_REQUEST - 2바이트, CMD + param, \n 없음)
    if (firstByte == CMD_STATUS_REQUEST) {
      // CMD_STATUS_REQUEST는 2바이트만 (CMD + param, \n 없음)
      char line[10] = {0};
      int receivedLen = 0;
      unsigned long startTime = millis();
      while (millis() - startTime < 50 && receivedLen < 2) {
        if (rs485.available()) {
          line[receivedLen++] = rs485.read();
        }
        delay(1);
      }
      
      if (receivedLen >= 1) {
        sendNutrientStatus();
      }
    }
    // JSON 명령 처리 (CMD_NUTCYCLE_CONFIG - 길이 기반 프로토콜)
    else if (firstByte == CMD_NUTCYCLE_CONFIG) {
      // 길이 기반 프로토콜: CMD(1) + 길이(2) + JSON 데이터
      unsigned long startTime = millis();
      uint8_t cmd = 0;
      uint16_t jsonLen = 0;
      
      // 명령 코드 읽기
      while (millis() - startTime < 100 && rs485.available() < 1) delay(1);
      if (rs485.available() >= 1) {
        cmd = rs485.read();
      } else {
        return; // 타임아웃
      }
      
      // 길이 헤더 읽기 (2바이트)
      while (millis() - startTime < 100 && rs485.available() < 2) delay(1);
      if (rs485.available() >= 2) {
        uint8_t lenHigh = rs485.read();
        uint8_t lenLow = rs485.read();
        jsonLen = (lenHigh << 8) | lenLow;
        if (jsonLen > 512) jsonLen = 512; // 최대 길이 제한
      } else {
        sendAck(ACK_ERROR);
        return; // 타임아웃
      }
      
      // JSON 데이터 읽기 (메모리 최적화: 200바이트로 제한)
      if (jsonLen > 200) jsonLen = 200;
      char jsonStr[201] = {0}; // 최대 200 + null
      uint16_t received = 0;
      startTime = millis();
      while (millis() - startTime < 1000 && received < jsonLen) {
        while (rs485.available() && received < jsonLen) {
          jsonStr[received++] = rs485.read();
        }
        delay(1);
      }
      
      if (received == jsonLen) {
        jsonStr[jsonLen] = '\0';
        //Serial.print(F("JSON received: "));
        //Serial.print(jsonLen);
        //Serial.println(F("B"));
        processNutrientCommand(jsonStr);
        sendAck(ACK_OK);
        //Serial.println(F("JSON processing complete"));
      } else {
        //Serial.print(F("JSON incomplete: "));
        //Serial.print(received);
        //Serial.print(F("/"));
        //Serial.print(jsonLen);
        //Serial.println(F("B"));
        sendAck(ACK_ERROR);
      }
      delayMicroseconds(INTENTIONAL_REPLY_US);
    }
    // 바이트 기반 명령 처리
    // CMD_SENSOR_REQUEST는 2바이트 (CMD + param, \n 없음)
    // CMD_ON, CMD_OFF, CMD_TOGGLE, CMD_BED_ON 등은 3바이트 (CMD + param + \n)
    else if (firstByte == CMD_SENSOR_REQUEST) {
      // CMD_SENSOR_REQUEST는 2바이트만 (CMD + param, \n 없음)
      char line[10] = {0};
      int receivedLen = 0;
      unsigned long startTime = millis();
      while (millis() - startTime < 50 && receivedLen < 2) {
        if (rs485.available()) {
          line[receivedLen++] = rs485.read();
        }
        delay(1);
      }
      
      if (receivedLen >= 1) {
        processRS485Command(line, receivedLen);
        // ACK는 processRS485Command 내부에서 전송되므로 추가 지연 불필요
      }
    } else if (firstByte >= 0x20 && firstByte <= 0x2F) {
      // 기타 바이트 명령은 라인 단위로 처리 (\n으로 종료)
      // Mega는 CMD_ON/OFF 등을 CMD + param + \n 형식으로 전송
      char line[64] = {0};  // 100 → 64 (메모리 최적화)
      int receivedLen = 0;
      if (readLine(rs485, line, sizeof(line), 100, &receivedLen)) {
        processRS485Command(line, receivedLen);
        // ACK는 processRS485Command 내부에서 전송되므로 추가 지연 불필요
      }
    } else {
      // 기타 라인 단위 명령 처리 (\n으로 종료) - CMD_MULTI_ON/OFF 등
      char line[64] = {0};  // 100 → 64 (메모리 최적화)
      int receivedLen = 0;
      if (readLine(rs485, line, sizeof(line), 100, &receivedLen)) {
        processRS485Command(line, receivedLen);
        // ACK는 processRS485Command 내부에서 전송되므로 추가 지연 불필요
      }
    }
  }
  
  // 주기적으로 RS485 버퍼 정리 (통신 안정성 향상)
  static unsigned long lastBufferCleanup = 0;
  if (millis() - lastBufferCleanup > 5000) { // 5초마다 버퍼 정리
    lastBufferCleanup = millis();
    int availableBytes = 0;
    while (rs485.available()) {
      uint8_t byte = rs485.read(); // 잔여 데이터 제거
      availableBytes++;
    }
    if (availableBytes > 0) {
      //Serial.print(F("Buffer cleanup: "));
      //Serial.println(availableBytes);
    }
  }
  
  static unsigned long debugTimer = millis();
  if (millis() - debugTimer > SENSOR_INTERVAL) {
    debugTimer = millis();
    readSensors();
    // printSensorValues();
  }
  
  // nutCycle 처리 (매 루프마다)
  if (nutSystemFlags.isCycle) {
    if (cycle > 0) {
      updatePulseControl();
      updateCycle();
    } else if (cycle == 0) {
      static uint32_t lastCycleCheck = 0;
      if (millis() - lastCycleCheck >= 2000) {
        checkCycleRestart();
        lastCycleCheck = millis();
      }
    }
  }
  
  // 시간 기반 스케줄 체크 (10초마다)
  static uint32_t lastTimeCheck = 0;
  if (millis() - lastTimeCheck >= 10000) {
    lastTimeCheck = millis();
    
    if (!manualStartMode && !scheduleSettings.once_based_enabled && 
        scheduleSettings.daily_based_enabled && nutSystemFlags.timeReceived) {
      if (scheduleSettings.time_based_enabled) {
        if (isCurrentTimeInRange() && !nutSystemFlags.cycle_started_today && !nutSystemFlags.isCycle) {
          //Serial.println(F("Daily schedule in range - starting first cycle of the day"));
          nutSystemFlags.cycle_started_today = true;
          startNewCycle();
        }
      } else {
        if (!nutSystemFlags.isCycle) {
          //Serial.println(F("24h interval mode - starting first cycle"));
          startNewCycle();
        }
      }
    }
  }
  
  // 매일 리셋 체크
  checkDailyReset();
}

// 센서 값 읽기 함수
void readSensors() {
  // 1. 온도 읽기
  Temperature = readWaterTemperature();
  waterTemp = Temperature;
  
  // 2. EC 읽기
  Conductivity = readEC();
  ecValue = Conductivity;
  
  // 3. pH 읽기
  pH_Value = readPH();
  phValue = pH_Value;
}

// 센서 값 출력 함수
// void printSensorValues() {
//   //Serial.print("Temperature: ");
//   //Serial.print(Temperature, 2);
//   //Serial.print("°C (");
//   //Serial.print(TE_Voltage);
//   //Serial.print("mV), EC: ");
//   //Serial.print(ecValue, 1);
//   //Serial.print("μS/cm (");
//   //Serial.print(EC_Voltage);
//   //Serial.print("mV), pH: ");
//   //Serial.print(pH_Value, 2);
//   //Serial.print(" (");
//   //Serial.print(phVoltage, 3);
//   //Serial.println("V)");
// }

// PT1000 온도 센서에서 수온 읽기 함수 (고속 통신용 최적화)
float readWaterTemperature() {
  int rawTemp = 0;
  for (int i = 0; i < 5; i++) { // 10회 → 5회로 감소 (속도 향상)
    rawTemp += analogRead(TEMP_PIN);
    delay(2); // 5ms → 2ms로 단축
  }
  rawTemp = rawTemp / 5;
  
  TE_Voltage = (uint32_t)rawTemp * 5000 / 1024;
  float temperature = ecpt.convVoltagetoTemperature_C((float)TE_Voltage/1000);
  
  if (temperature < 0) temperature = 0;
  if (temperature > 40) temperature = 40;
  
  return temperature;
}

// EC 원시값 측정 함수 (slave_A에서 그대로 가져옴)
float getRawECValue() {
  const int numReadings = 8;  // 10 → 8 (메모리 최적화)
  int readings[numReadings];
  
  for (int i = 0; i < numReadings; i++) {
      readings[i] = analogRead(EC_PIN);
      delay(5);
  }
  
  // 정렬
  for (int i = 0; i < numReadings - 1; i++) {
      for (int j = i + 1; j < numReadings; j++) {
          if (readings[i] > readings[j]) {
              int temp = readings[i];
              readings[i] = readings[j];
              readings[j] = temp;
          }
      }
  }
  
  // 이상치 제거 평균
  long sum = 0;
  for (int i = 2; i < numReadings - 2; i++) {
      sum += readings[i];
  }
  int avgReading = sum / (numReadings - 4);
  
  uint16_t mV = (uint16_t)(avgReading * 5000UL / 1024);
  float currentEC = ec.getEC_us_cm(mV, waterTemp);
  
  // 이동 평균 필터
  ecHistory[ecHistoryIndex] = currentEC;
  ecHistoryIndex = (ecHistoryIndex + 1) % EC_HISTORY_SIZE;
  
  if (ecHistoryIndex == 0) {
      ecHistoryFilled = true;
  }
  
  float sumEC = 0;
  int count = ecHistoryFilled ? EC_HISTORY_SIZE : ecHistoryIndex;
  
  for (int i = 0; i < count; i++) {
      sumEC += ecHistory[i];
  }
  
  return count > 0 ? sumEC / count : currentEC;
}

// EC 보정 함수 (slave_A에서 그대로 가져옴)
float calibrateEC(float rawEC) {
  return slope * rawEC + intercept;
}

// EC 값 읽기 함수 (고속 통신용 최적화)
float readEC() {
  int rawEC = 0;
  for (int i = 0; i < 5; i++) { // 10회 → 5회로 감소 (속도 향상)
    rawEC += analogRead(EC_PIN);
    delay(2); // 5ms → 2ms로 단축
  }
  rawEC = rawEC / 5;
  
  EC_Voltage = (uint32_t)rawEC * 5000 / 1024;
  float rawEcValue = ec.getEC_us_cm(EC_Voltage, waterTemp);
  float calibrationFactor = 1413.0 / 1195.0;
  float calibratedEcValue = rawEcValue * calibrationFactor;
  
  return calibratedEcValue;
}

// pH 보정 계수 업데이트 (slave_A에서 그대로 가져옴)
void updatePhCalibrationFactors() {
  phSlope = (7.0 - 4.0) / (RAW_PH7 - RAW_PH4);
  phIntercept = 7.0 - phSlope * RAW_PH7;
}

// pH 원시 전압값 측정 함수 (slave_A에서 그대로 가져옴)
float readRawPH() {
  const int numReadings = 10;  // 20 → 10 (메모리 최적화)
  float readings[numReadings];
  
  for (int i = 0; i < numReadings; i++) {
      readings[i] = analogRead(PH_PIN);
      delay(10);
  }
  
  // 정렬
  for (int i = 0; i < numReadings - 1; i++) {
      for (int j = i + 1; j < numReadings; j++) {
          if (readings[i] > readings[j]) {
              float temp = readings[i];
              readings[i] = readings[j];
              readings[j] = temp;
          }
      }
  }
  
  // 이상치 제거 평균 (10개 기준으로 조정)
  float sum = 0;
  for (int i = 2; i < numReadings - 2; i++) {  // 4 → 2 (10개 기준)
    sum += readings[i];
  }
  float avgReading = sum / (numReadings - 4);  // 8 → 4 (10개 기준)
  
  float voltage = avgReading * 5.0 / 1024.0;
  
  // 이동 평균 필터
  phReadingsHistory[phHistoryIndex] = voltage;
  phHistoryIndex = (phHistoryIndex + 1) % PH_HISTORY_SIZE;
  
  if (phHistoryIndex == 0) {
      phHistoryFilled = true;
  }
  
  float sumVoltage = 0;
  int count = phHistoryFilled ? PH_HISTORY_SIZE : phHistoryIndex;
  
  for (int i = 0; i < count; i++) {
      sumVoltage += phReadingsHistory[i];
  }
  
  float averageVoltage = (count > 0) ? (sumVoltage / count) : voltage;
  
  return averageVoltage;
}

// pH 전압을 pH 값으로 변환 (slave_A에서 그대로 가져옴)
float voltageToPhValue(float voltage) {
  return phSlope * voltage + phIntercept;
}

// pH 값 읽기 함수 (slave_A에서 그대로 가져옴)
float readPH() {
  float voltage = readRawPH();
  phVoltage = voltage;
  return voltageToPhValue(voltage);
}

// RS485 명령 처리 함수 (바이트 기반)
void processRS485Command(const char* line, int lineLen) {
  if (lineLen < 1) {
    //Serial.println(F("Command length insufficient"));
    return;
  }
  
  uint8_t cmd = (uint8_t)line[0];
  uint8_t param = (lineLen >= 2) ? (uint8_t)line[1] : 0;
  
  // NPN Modbus 명령 완전 차단 (0x00-0x1F는 모두 무시)
  if (cmd < 0x20) {
    return; // NPN 명령 무시
  }
  
  // 🔥 비트연산 다중 릴레이 명령 처리
  if (cmd == CMD_MULTI_ON || cmd == CMD_MULTI_OFF) {
    if (lineLen < 2) {
      //Serial.println(F("MULTI length insufficient"));
      sendAck(ACK_ERROR);
      return;
    }
    // 디버깅: 다중 릴레이 명령
    //Serial.print(cmd == CMD_MULTI_ON ? F("MULTI_ON") : F("MULTI_OFF"));
    //Serial.print(F(" bitmask=0x"));
    //Serial.print(param, HEX);
    //Serial.print(F(" ("));
    // 비트마스크 해석
    bool first = true;
    for (int i = 0; i < 10; i++) {
      if (param & (1 << i)) {
        if (!first) //Serial.print(F(","));
        //Serial.print(i);
        first = false;
      }
    }
    //Serial.println(F(")"));
    processMultiRelayCommand(cmd, param);
    return;
  }
  
  // UNO 명령 범위 검증 (0x20-0x2F, 0x32 허용)
  // 0x30-0x31: CMD_MULTI_ON/OFF (이미 위에서 처리됨)
  // 0x32: CMD_NUTCYCLE_CONFIG (JSON 명령)
  if (cmd > 0x2F && cmd != CMD_NUTCYCLE_CONFIG) {
    //Serial.print(F("Unknown command: 0x"));
    //Serial.println(cmd, HEX);
    sendAck(ACK_ERROR);
    return;
  }
  
  switch (cmd) {
    case CMD_RESET:
    case CMD_ALLOFF:
      //Serial.print(cmd == CMD_RESET ? F("RESET") : F("ALLOFF"));
      //Serial.println();
      allPinsOff();
      sendAck(ACK_OK);
      break;
      
    case CMD_TOGGLE:
      if (lineLen >= 2 && param < numPins) {
        //Serial.print(F("TOGGLE CH"));
        //Serial.println(param);
        bool currentState = getRelayStatus(param);
        setRelay(param, !currentState);
        //Serial.print(F("CH"));
        //Serial.print(param);
        //Serial.print(F(" -> "));
        //Serial.println(!currentState ? F("ON") : F("OFF"));
        sendAck(ACK_OK);
      } else {
        //Serial.println(F("TOGGLE parameter error"));
        sendAck(ACK_ERROR);
      }
      break;
      
    case CMD_ON:
      if (lineLen >= 2 && param < numPins) {
        //Serial.print(F("ON CH"));
        //Serial.println(param);
        setRelay(param, HIGH);
        //Serial.print(F("CH"));
        //Serial.print(param);
        //Serial.println(F(" ON"));
        sendAck(ACK_OK);
      } else {
        //Serial.println(F("ON parameter error"));
        sendAck(ACK_ERROR);
      }
      break;
      
    case CMD_OFF:
      if (lineLen >= 2 && param < numPins) {
        //Serial.print(F("OFF CH"));
        //Serial.println(param);
        setRelay(param, LOW);
        //Serial.print(F("CH"));
        //Serial.print(param);
        //Serial.println(F(" OFF"));
        sendAck(ACK_OK);
      } else {
        //Serial.println(F("OFF parameter error"));
        sendAck(ACK_ERROR);
      }
      break;
      
    case CMD_SENSOR_REQUEST:
      // 센서 값 요청 시 즉시 응답 (고속 통신용)
      delay(10); // 50ms → 10ms로 단축 (명령 수신 후 안정화 대기)
      readSensors(); // 센서값 업데이트
      sendSensorData();
      break;
      
    case CMD_STATUS_REQUEST:
      // 상태 요청은 loop()에서 처리되므로 여기서는 오류
      sendAck(ACK_ERROR);
      break;
      
    case CMD_EC_PULSE:
      // EC 펄스 토글 (2개 핀 동시 제어: 채널 4, 5)
      // EC1 토글 (채널 4 = pins[4] = 9번 핀)
      bool currentState1 = getRelayStatus(4);
      setRelay(4, !currentState1);
      
      // EC2 토글 (채널 5 = pins[5] = 10번 핀)
      bool currentState2 = getRelayStatus(5);
      setRelay(5, !currentState2);
      
      sendAck(ACK_OK);
      break;
      
    case CMD_EC_OFF:
      // EC OFF (2개 핀 동시 제어: 채널 4, 5)
      setRelay(UNO_CH_EC, LOW);
      setRelay(UNO_CH_EC2, LOW);
      
      sendAck(ACK_OK);
      break;
      
    case CMD_BED_ON:
      // 베드 ON (4개 핀 동시 제어: 채널 0, 1, 2, 3)
      // param의 비트마스크로 어떤 베드를 ON할지 결정
      // param: 0x01=A, 0x02=B, 0x04=C, 0x08=D
      if (lineLen >= 2) {
        //Serial.print(F("BED_ON: "));
        if (param & 0x01) {
          setRelay(UNO_CH_BED_A, HIGH);
          //Serial.print(F("A"));
        }
        if (param & 0x02) {
          setRelay(UNO_CH_BED_B, HIGH);
          //Serial.print(F("B"));
        }
        if (param & 0x04) {
          setRelay(UNO_CH_BED_C, HIGH);
          //Serial.print(F("C"));
        }
        if (param & 0x08) {
          setRelay(UNO_CH_BED_D, HIGH);
          //Serial.print(F("D"));
        }
        //Serial.println();
        sendAck(ACK_OK);
      } else {
        sendAck(ACK_ERROR);
      }
      break;
      
    case CMD_NUTCYCLE_CONFIG:
      // JSON 명령은 loop()에서 길이 기반 프로토콜로 처리되므로 여기서는 오류
      //Serial.println(F("CMD_NUTCYCLE_CONFIG must be processed in loop()"));
      sendAck(ACK_ERROR);
      break;
      
    default:
      sendAck(ACK_ERROR);
      break;
  }
}

// 바이트 기반 ACK 응답 전송 함수
void sendAck(uint8_t ackCode) {
  // ========== 프로토콜: ACK(1바이트) ==========
  enterTransmitMode();
  delayMicroseconds(TURNAROUND_US);
  
  rs485.write((uint8_t)ackCode);
  rs485.flush();
  wait_tx_done_by_time(1);
  
  // Mega가 수신 모드로 전환할 시간 확보
  delayMicroseconds(INTENTIONAL_REPLY_US);
  
  enterReceiveMode();
  
  // 디버깅: ACK 전송 (간소화)
  if (ackCode == ACK_OK) {
    //Serial.println(F("ACK_OK"));
  } else if (ackCode == ACK_ERROR) {
    //Serial.println(F("ACK_ERROR"));
  } else {
    //Serial.print(F("ACK=0x"));
    //Serial.println(ackCode, HEX);
  }
}

// 센서 데이터 바이트 전송 함수
void sendSensorData() {
  // 센서 데이터를 바이트로 변환
  uint16_t ph_int = (uint16_t)(pH_Value * 100); // pH * 100 (소수점 2자리)
  uint16_t ec_int = (uint16_t)(ecValue / 10);   // EC / 10 (dS/m * 10)
  uint16_t temp_int = (uint16_t)(Temperature * 10); // 온도 * 10 (소수점 1자리)
  
  // ---------- 응답 송신 ----------
  enterTransmitMode();
  delayMicroseconds(TURNAROUND_US);
  
  // 센서 데이터 전송 (8바이트) - 고속 통신용 최적화
  uint8_t sensorData[8] = {
    (uint8_t)ACK_SENSOR_DATA,  // 응답 코드 (1바이트)
    (uint8_t)(ph_int >> 8),    // pH High (1바이트)
    (uint8_t)(ph_int & 0xFF),  // pH Low (1바이트)
    (uint8_t)(ec_int >> 8),    // EC High (1바이트)
    (uint8_t)(ec_int & 0xFF),  // EC Low (1바이트)
    (uint8_t)(temp_int >> 8),  // TEMP High (1바이트)
    (uint8_t)(temp_int & 0xFF), // TEMP Low (1바이트)
    (uint8_t)0x00              // Reserved (1바이트)
  };
  
  // 한 번에 모든 데이터 전송 (개별 write보다 빠름)
  for (uint8_t i = 0; i < 8; i++) {
    rs485.write(sensorData[i]);
  }
  rs485.flush();  // SoftwareSerial의 flush는 입력 버퍼 비움 용도 → TX 완료 보장 X
  wait_tx_done_by_time(8); // 실제 송신 완료 보장(근사)
  
  enterReceiveMode();
  
  // SENSOR 디버깅 출력 제거 (사용자 요청)
}

// 모든 릴레이 핀 끄기
void allPinsOff() {
  for (int i = 0; i < numPins; i++) {
    setRelay(i, LOW);
  }
}

// nutCycle 상태 전송 함수 (JSON 형식) - 메모리 최적화
void sendNutrientStatus() {
  // JSON 문서 생성 (메모리 최적화: 160 → 192)
  StaticJsonDocument<192> statusDoc;
  statusDoc.clear();
  
  // 기본 정보
  statusDoc["id"] = "status";
  statusDoc["ts"] = millis();
  statusDoc["cycle"] = cycle;
  statusDoc["status"] = (int)cycleStatus;
  statusDoc["time_received"] = nutSystemFlags.timeReceived ? 1 : 0;
  
  // 현재 시간 (문자열 최소화)
  char timeStr[6];
  snprintf(timeStr, sizeof(timeStr), "%02d:%02d", currentHour, currentMinute);
  statusDoc["current_time"] = timeStr;
  statusDoc["in_range"] = isCurrentTimeInRange() ? 1 : 0;
  statusDoc["cycle_started_today"] = nutSystemFlags.cycle_started_today ? 1 : 0;
  
  // 릴레이 상태 정보 (9개만: 0~8)
  JsonArray relays = statusDoc.createNestedArray("relays");
  for (uint8_t i = 0; i <= UNO_CH_PUMP; i++) {
    relays.add(getRelayStatus(i) ? 1 : 0);
  }
  
  // 타이머 정보
  if (nutSystemFlags.pumpRunning && cycle > 5) {
    uint32_t pumpRunTime = getIrrigationElapsedTime() / 1000;
    statusDoc["rm"] = pumpRunTime / 60; // 실행 분
    statusDoc["rs"] = pumpRunTime % 60; // 실행 초
  } else {
    statusDoc["rm"] = 0;
    statusDoc["rs"] = 0;
  }
  
  // 대기 시간 계산
  if (cycle == 0 && nutSystemFlags.isCycle && nutrientSettings.cycle_time > 0) {
    uint32_t currentMillis = millis();
    uint32_t intervalMillis = (uint32_t)(nutrientSettings.cycle_time * 3600000.0f);
    uint32_t timeToNextActivation = intervalMillis - (currentMillis - motorTimer.lastCycleMillis);
    
    if (timeToNextActivation > intervalMillis) {
      timeToNextActivation = 0;
    }
    
    statusDoc["rh"] = timeToNextActivation / 3600000;
    statusDoc["rm_wait"] = (timeToNextActivation % 3600000) / 60000;
    statusDoc["rs_wait"] = (timeToNextActivation % 60000) / 1000;
  } else {
    statusDoc["rh"] = 0;
    statusDoc["rm_wait"] = 0;
    statusDoc["rs_wait"] = 0;
  }
  
  // 센서 데이터
  JsonObject sensors = statusDoc.createNestedObject("sensors");
  sensors["ph"] = pH_Value;
  sensors["ec"] = ecValue / 1000.0f; // μS/cm → dS/m
  sensors["temp"] = waterTemp;
  
  // JSON 직렬화 (String 대신 직접 전송으로 메모리 절약)
  char jsonBuffer[200] = {0};
  size_t jsonLen = serializeJson(statusDoc, jsonBuffer, sizeof(jsonBuffer));
  if (jsonLen >= sizeof(jsonBuffer)) {
    // 버퍼가 부족하면 JSON 문서 크기 증가 필요
    jsonLen = sizeof(jsonBuffer) - 1; // null 문자 공간 확보
    //Serial.println(F("⚠️ STATUS JSON 버퍼 부족"));
  }
  
  // JSON 직렬화 검증 (디버깅용)
  //Serial.print(F("📤 STATUS JSON: "));
  //Serial.print(jsonLen);
  //Serial.println(F("B"));
  
  // 길이 기반 프로토콜로 전송: ACK_STATUS_DATA(0x83) + LEN_H(1) + LEN_L(1) + JSON(N)
  enterTransmitMode();
  delayMicroseconds(TURNAROUND_US);
  
  // 응답 코드 전송
  rs485.write((uint8_t)ACK_STATUS_DATA);
  
  // 길이 헤더 전송 (2바이트, big-endian)
  rs485.write((uint8_t)((jsonLen >> 8) & 0xFF)); // 상위 바이트
  rs485.write((uint8_t)(jsonLen & 0xFF));       // 하위 바이트
  
  // JSON 데이터 전송
  for (size_t i = 0; i < jsonLen; i++) {
    rs485.write((uint8_t)jsonBuffer[i]);
  }
  rs485.flush();
  wait_tx_done_by_time(jsonLen + 3); // ACK + LEN(2) + JSON
  
  enterReceiveMode();
}

  // 🔥 비트연산 다중 릴레이 제어 함수 (메모리 최적화: String 제거)
void processMultiRelayCommand(uint8_t cmd, uint8_t bitmask) {
  for (int i = 0; i < numPins; i++) {
    bool shouldTurnOn = (bitmask & (1 << i)) != 0;
    bool currentState = getRelayStatus(i);
    
    if (cmd == CMD_MULTI_ON && shouldTurnOn) {
      if (!currentState) {
        setRelay(i, HIGH);
      }
    } else if (cmd == CMD_MULTI_OFF && shouldTurnOn) {
      if (currentState) {
        setRelay(i, LOW);
      }
    }
  }
  
  // ACK 전송
  sendAck(ACK_OK);
}
