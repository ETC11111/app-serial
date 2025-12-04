#define SCAN_DEBUG 0
#define NPN_HW_PRESENT 0   // 0: NPN 모듈 없음 (드라이런), 1: 실제 모듈 있음
#include "Config.h"
#include "modbusHandler.h"
#include <math.h>  // fabsf, sqrtf
// CMD 및 ACK 정의는 modbusHandler.h로 이동됨
// RS485 타이밍 상수도 modbusHandler.h로 이동됨

// ============= UNO ID 할당 시스템 (디지털 핀 펄스 기반) =============
// Mega의 D38~D43 핀을 사용하여 각 UNO에 고유 ID 할당
// 각 UNO는 D9 핀이 Mega의 D38~D43 중 하나와 1:1로 연결됨
// Mega가 각 핀에 (핀번호-37)번의 펄스를 전송하면, UNO가 이를 감지하여 ID로 사용
// 예: D38 → 1번 펄스 → UNO ID = 1, D39 → 2번 펄스 → UNO ID = 2, ...

// ============= Combined ID 함수 =============
// Combined ID 생성 (타입 코드 + UNO ID)
// 하위 5비트: 타입 코드 (0~31)
// 상위 3비트: UNO ID (0~7)
uint8_t makeCombinedId(uint8_t typeCode, uint8_t unoId) {
  return (typeCode & 0x1F) | ((unoId & 0x07) << 5);
}

// Combined ID 분리
void splitCombinedId(uint8_t combinedId, uint8_t* typeCode, uint8_t* unoId) {
  *typeCode = combinedId & 0x1F;  // 하위 5비트
  *unoId = (combinedId >> 5) & 0x07;  // 상위 3비트
}

// RS485 제어 함수들은 헤더 파일에서 인라인으로 정의됨

// ============= 전역 변수 정의 =============
ModbusSlave modbusSensors[MAX_MODBUS_SLAVES];
uint8_t modbusSlaveCount = 0;

// ============= RS485 제어 함수들 (센싱용) =============
void handleModbusInitialization()
{
  // 네트워크 연결 상태 확인 - 연결되지 않으면 복구 모드로 전환
  if (!isNetworkConnected()) {
    static unsigned long lastNetworkWarning = 0;
    unsigned long currentTime = millis();
    
    // 10초마다 네트워크 연결 필요 메시지 출력
    if (currentTime - lastNetworkWarning >= 10000) {
      Serial.println(F("⚠ Modbus 초기화 중 네트워크 연결 끊어짐 - 복구 대기"));
      lastNetworkWarning = currentTime;
    }
    
    // 네트워크 복구 모드로 전환
    if (currentState != STATE_NETWORK_RECOVERY) {
      currentState = STATE_NETWORK_RECOVERY;
      networkRecoveryStartTime = currentTime;
      Serial.println(F("🔄 네트워크 복구 대기 모드로 전환"));
    }
    return;
  }
  
  if (millis() - stateChangeTime > STATE_DELAY)
  {
    Serial.println(F("Modbus 초기화..."));
    
    pinMode(RS485_SENSING_DE_RE_PIN, OUTPUT);
    digitalWrite(RS485_SENSING_DE_RE_PIN, LOW);  // 초기 상태: 수신 모드
    RS485_SENSING_SERIAL.begin(RS485_SENSING);

    pinMode(RS485_CONTROL_DE_RE_PIN, OUTPUT);
    digitalWrite(RS485_CONTROL_DE_RE_PIN, HIGH);
    RS485_CONTROL_SERIAL.begin(RS485_CONTROL);

    delay(100);
    
    // 🔥 실전 버전: UNO ID 할당 수행
    assignUnoIdsByPulses();
    
    delay(500);
    
    currentState = STATE_MQTT_INIT;
    stateChangeTime = millis();
  }
}
// (제거됨) Mega에서는 보정/보간 함수를 보유하지 않음. UNO/서버에서 처리.




// ============= 센서 타입별 주소 범위 정의 =============
struct SensorAddressRange {
  modbusSensorType type;
  uint8_t startAddr;
  uint8_t endAddr;
  uint8_t testRegCount;
  const char* typeName;
};

// 각 센서 타입별로 5개 주소 범위 할당
static const SensorAddressRange SENSOR_RANGES[] = {
  {MODBUS_SOIL_SENSOR,    SOIL_SENSOR_START,    SOIL_SENSOR_END,    7,  "토양센서"},      // 주소 1-5
  {MODBUS_WIND_DIRECTION, WIND_DIR_START,       WIND_DIR_END,       2,  "풍향센서"},      // 주소 6-10
  {MODBUS_WIND_SPEED,     WIND_SPEED_START,     WIND_SPEED_END,     1,  "풍속센서"},      // 주소 11-15
  {MODBUS_RAIN_SNOW,      RAIN_SNOW_START,      RAIN_SNOW_END,      10, "강우/강설센서"}, // 주소 16-20
  {MODBUS_TEMP_HUMID,     TEMP_HUMID_START,     TEMP_HUMID_END,     2,  "온습도센서"},    // 주소 21-25
  {MODBUS_PRESSURE,       PRESSURE_START,       PRESSURE_END,       2,  "압력센서"},      // 주소 26-30
  {MODBUS_FLOW,           FLOW_START,           FLOW_END,           2,  "유량센서"},      // 주소 31-35
  {MODBUS_RELAY,          RELAY_START,          RELAY_END,          1,  "릴레이모듈"},    // 주소 36-40
  {MODBUS_ENERGY_METER,   ENERGY_METER_START,   ENERGY_METER_END,   5,  "전력계"},        // 주소 41-45
};

#define SENSOR_RANGE_COUNT (sizeof(SENSOR_RANGES) / sizeof(SENSOR_RANGES[0]))
// ============= 디지털 핀 펄스 기반 UNO ID 할당 =============
// D38~D43 핀 정의
#define ENROLL_PIN_38 38
#define ENROLL_PIN_39 39
#define ENROLL_PIN_40 40
#define ENROLL_PIN_41 41
#define ENROLL_PIN_42 42
#define ENROLL_PIN_43 43

// 펄스 타이밍 상수
#define PULSE_HIGH_MS 150   // HIGH 펄스 폭
#define PULSE_LOW_MS 150    // LOW 펄스 폭
#define PULSE_TOTAL_MS 300  // 전체 펄스 주기
#define PIN_INTERVAL_MS 500 // 핀 간 간격
#define ROUNDS 1            // 전송 라운드 수 (1라운드만으로 충분)

// 디지털 핀 초기화 (모두 OUTPUT + LOW)
static void enrollPinsPrepOutputLow() {
  pinMode(ENROLL_PIN_38, OUTPUT);
  pinMode(ENROLL_PIN_39, OUTPUT);
  pinMode(ENROLL_PIN_40, OUTPUT);
  pinMode(ENROLL_PIN_41, OUTPUT);
  pinMode(ENROLL_PIN_42, OUTPUT);
  pinMode(ENROLL_PIN_43, OUTPUT);
  
  digitalWrite(ENROLL_PIN_38, LOW);
  digitalWrite(ENROLL_PIN_39, LOW);
  digitalWrite(ENROLL_PIN_40, LOW);
  digitalWrite(ENROLL_PIN_41, LOW);
  digitalWrite(ENROLL_PIN_42, LOW);
  digitalWrite(ENROLL_PIN_43, LOW);
  
  Serial.println(F("🔧 UNO ID 할당 준비: D38~D43 OUTPUT+LOW"));
}

// 디지털 핀 해제 (모두 INPUT Hi-Z)
static void enrollPinsReleaseInput() {
  pinMode(ENROLL_PIN_38, INPUT);
  pinMode(ENROLL_PIN_39, INPUT);
  pinMode(ENROLL_PIN_40, INPUT);
  pinMode(ENROLL_PIN_41, INPUT);
  pinMode(ENROLL_PIN_42, INPUT);
  pinMode(ENROLL_PIN_43, INPUT);
  
  Serial.println(F("🔧 UNO ID 할당 완료: D38~D43 INPUT(Hi-Z)"));
}

// 단일 핀에 펄스 전송 (UNO_ID만큼 반복)
static void sendPulsesToPin(uint8_t pin, uint8_t unoId) {
  Serial.print(F("      [펄스 전송 시작] D"));
  Serial.print(pin);
  Serial.print(F(" → "));
  Serial.print(unoId);
  Serial.println(F("회"));
  
  for (uint8_t i = 0; i < unoId; i++) {
    unsigned long pulseStart = millis();
    
    // HIGH 전송
    digitalWrite(pin, HIGH);
    Serial.print(F("      [펄스 #"));
    Serial.print(i + 1);
    Serial.print(F("/"));
    Serial.print(unoId);
    Serial.print(F("] D"));
    Serial.print(pin);
    Serial.print(F(" → HIGH ("));
    Serial.print(PULSE_HIGH_MS);
    Serial.println(F("ms)"));
    
    delay(PULSE_HIGH_MS);
    
    // LOW 전송
    digitalWrite(pin, LOW);
    unsigned long pulseDuration = millis() - pulseStart;
    Serial.print(F("      [펄스 #"));
    Serial.print(i + 1);
    Serial.print(F("/"));
    Serial.print(unoId);
    Serial.print(F("] D"));
    Serial.print(pin);
    Serial.print(F(" → LOW ("));
    Serial.print(PULSE_LOW_MS);
    Serial.print(F("ms) [총 지속: "));
    Serial.print(pulseDuration);
    Serial.println(F("ms]"));
    
    delay(PULSE_LOW_MS);
  }
  
  Serial.print(F("      [펄스 전송 완료] D"));
  Serial.print(pin);
  Serial.print(F(" → 총 "));
  Serial.print(unoId);
  Serial.print(F("회 (총 소요: "));
  Serial.print((PULSE_HIGH_MS + PULSE_LOW_MS) * unoId);
  Serial.println(F("ms)"));
}

// UNO ID 할당 펄스 전송 (초기화 시 1회만 실행)
void assignUnoIdsByPulses() {
  unsigned long assignStartTime = millis();
  
  Serial.println(F("========================================"));
  Serial.println(F("📡 UNO ID 할당 시작 (D38~D43 펄스 전송)"));
  Serial.println(F("========================================"));
  Serial.print(F("⏰ 시작 시간: "));
  Serial.print(assignStartTime / 1000);
  Serial.println(F("초"));
  Serial.println(F("========================================"));
  
  // 모든 핀을 OUTPUT + LOW로 초기화
  enrollPinsPrepOutputLow();
  delay(100); // 안정화 대기
  
  // 1라운드 전송 (1라운드만으로 충분)
  for (uint8_t round = 0; round < ROUNDS; round++) {
    unsigned long roundStartTime = millis();
    
    Serial.println(F("----------------------------------------"));
    Serial.print(F("  🔄 라운드 "));
    Serial.print(round + 1);
    Serial.print(F("/"));
    Serial.print(ROUNDS);
    Serial.print(F(" 시작 (시간: "));
    Serial.print(roundStartTime / 1000);
    Serial.println(F("초)"));
    Serial.println(F("----------------------------------------"));
    
    // D38~D43 순서로 각각 1~6회 펄스 전송
    for (uint8_t pin = ENROLL_PIN_38; pin <= ENROLL_PIN_43; pin++) {
      uint8_t unoId = pin - ENROLL_PIN_38 + 1; // D38=1, D39=2, ..., D43=6
      unsigned long pinStartTime = millis();
      
      Serial.println(F("----------------------------------------"));
      Serial.print(F("    📌 D"));
      Serial.print(pin);
      Serial.print(F(" → UNO ID "));
      Serial.print(unoId);
      Serial.print(F(" ("));
      Serial.print(unoId);
      Serial.print(F("회 펄스) - 시작 시간: "));
      Serial.print(pinStartTime / 1000);
      Serial.print(F("초 (경과: "));
      Serial.print((pinStartTime - assignStartTime) / 1000);
      Serial.println(F("초)"));
      
      sendPulsesToPin(pin, unoId);
      
      unsigned long pinEndTime = millis();
      Serial.print(F("    ✅ D"));
      Serial.print(pin);
      Serial.print(F(" 완료 - 소요 시간: "));
      Serial.print(pinEndTime - pinStartTime);
      Serial.println(F("ms"));
      
      // 핀 간 간격 (마지막 핀 제외)
      if (pin < ENROLL_PIN_43) {
        Serial.print(F("    ⏸  핀 간 간격: "));
        Serial.print(PIN_INTERVAL_MS);
        Serial.println(F("ms"));
        delay(PIN_INTERVAL_MS);
      }
    }
    
    unsigned long roundEndTime = millis();
    Serial.print(F("  ✅ 라운드 "));
    Serial.print(round + 1);
    Serial.print(F(" 완료 - 소요 시간: "));
    Serial.print(roundEndTime - roundStartTime);
    Serial.print(F("ms (경과: "));
    Serial.print((roundEndTime - assignStartTime) / 1000);
    Serial.println(F("초)"));
    
    // 라운드 간 간격 (마지막 라운드 제외)
    if (round < ROUNDS - 1) {
      Serial.print(F("  ⏸  라운드 간 간격: 200ms"));
      Serial.println();
      delay(200); // 짧은 간격
    }
  }
  
  unsigned long assignEndTime = millis();
  Serial.println(F("========================================"));
  Serial.print(F("✅ UNO ID 할당 완료 - 총 소요 시간: "));
  Serial.print((assignEndTime - assignStartTime) / 1000);
  Serial.print(F("초 ("));
  Serial.print(assignEndTime - assignStartTime);
  Serial.println(F("ms)"));
  Serial.println(F("========================================"));
  
  // 모든 핀을 INPUT(Hi-Z)로 해제
  enrollPinsReleaseInput();
}
// ============= Modbus 센서 스캔 (UNO가 담당하므로 주석처리) =============
/*
void scanModbusSensors()
{
  Serial.println(F("🔍 Modbus 센서 스캔 시작..."));
  modbusSlaveCount = 0;
  
  // 각 센서 타입별로 범위 스캔
  for (uint8_t rangeIdx = 0; rangeIdx < SENSOR_RANGE_COUNT; rangeIdx++)
  {
    const SensorAddressRange& range = SENSOR_RANGES[rangeIdx];
    Serial.print(F("🔍 "));
    Serial.print(range.typeName);
    Serial.print(F(" 스캔 (주소 "));
    Serial.print(range.startAddr);
    Serial.print(F("-"));
    Serial.print(range.endAddr);
    Serial.println(F(")..."));
    
    uint8_t foundCount = 0;
    
    // 해당 범위 내의 모든 주소 스캔
    for (uint8_t slaveId = range.startAddr; slaveId <= range.endAddr && modbusSlaveCount < MAX_MODBUS_SLAVES; slaveId++)
    {
      Serial.print(F("  주소 "));
      Serial.print(slaveId);
      Serial.print(F(" 확인... "));
      
      // 센서 타입별로 다른 테스트 레지스터 수 사용
      uint16_t testData[10];
      bool found = false;
      
      // 스캔 속도 개선: 재시도 횟수 감소, 지연 시간 단축
      for (int attempt = 0; attempt < 2; attempt++)
      {
        if (readModbusRegisters(slaveId, 0, range.testRegCount, testData))
        {
          found = true;
          break;
        }
        delay(50); // 200ms → 50ms로 단축
      }
      
      if (found)
      {
        modbusSensors[modbusSlaveCount].slaveId = slaveId;
        modbusSensors[modbusSlaveCount].type = range.type;
        modbusSensors[modbusSlaveCount].active = true;
        modbusSensors[modbusSlaveCount].lastRead = 0;
        modbusSensors[modbusSlaveCount].name = String(range.typeName) + "_" + String(slaveId);
        modbusSlaveCount++;
        foundCount++;
        Serial.print(F("✅ 발견 (타입: "));
        Serial.print(range.type);
        Serial.println(F(")"));
      }
      else
      {
        Serial.println(F("❌ 응답 없음"));
      }
      delay(100);
    }
    
    Serial.print(F("  "));
    Serial.print(range.typeName);
    Serial.print(F(" 총 "));
    Serial.print(foundCount);
    Serial.println(F("개 발견"));
  }
  
  modbusSensorsReady = (modbusSlaveCount > 0);
  Serial.println(F(""));
  Serial.println(F("📊 Modbus 센서 스캔 완료"));
  Serial.print(F("총 Modbus 장치 "));
  Serial.print(modbusSlaveCount);
  Serial.print(F("개 발견 (최대 "));
  Serial.print(MAX_MODBUS_SLAVES);
  Serial.println(F("개 지원)"));
  
  // 발견된 센서 목록 출력 (타입별로 그룹화)
  Serial.println(F("📋 발견된 센서 목록:"));
  for (uint8_t rangeIdx = 0; rangeIdx < SENSOR_RANGE_COUNT; rangeIdx++)
  {
    const SensorAddressRange& range = SENSOR_RANGES[rangeIdx];
    bool hasSensors = false;
    
    for (uint8_t i = 0; i < modbusSlaveCount; i++) {
      if (modbusSensors[i].type == range.type) {
        if (!hasSensors) {
          Serial.print(F("  "));
          Serial.print(range.typeName);
          Serial.print(F(" (주소 범위: "));
          Serial.print(range.startAddr);
          Serial.print(F("-"));
          Serial.print(range.endAddr);
          Serial.println(F("):"));
          hasSensors = true;
        }
        Serial.print(F("    - "));
        Serial.print(modbusSensors[i].name);
        Serial.print(F(" (주소: "));
        Serial.print(modbusSensors[i].slaveId);
        Serial.println(F(")"));
      }
    }
  }
  Serial.println(F(""));
}
*/

// UNO가 모든 센서 읽기를 담당하므로 주석처리
/*
bool readModbusRegisters(uint8_t slaveAddr, uint16_t startAddr, uint16_t count, uint16_t *data)
{
  uint8_t response[50];
  uint8_t respLen;
  
  if (sendModbusRequest(slaveAddr, 0x03, startAddr, count, response, respLen))
  {
    for (uint16_t i = 0; i < count && i < 10; i++)
    {
      data[i] = (response[3 + i * 2] << 8) | response[4 + i * 2];
    }
    return true;
  }
  return false;
}
*/
// UNO가 모든 센서 읽기를 담당하므로 주석처리
/*
bool sendModbusRequest(uint8_t slaveAddr, uint8_t functionCode, 
  uint16_t startReg, uint16_t regCount, 
  uint8_t *response, uint8_t &responseLen, 
  uint16_t timeout)
{
uint8_t request[8];
request[0] = slaveAddr;
request[1] = functionCode;
request[2] = highByte(startReg);
request[3] = lowByte(startReg);
request[4] = highByte(regCount);
request[5] = lowByte(regCount);

uint16_t crc = calcCRC16(request, 6);
request[6] = lowByte(crc);
request[7] = highByte(crc);

// ── (1) 수신버퍼 비우기
while (RS485_SENSING_SERIAL.available()) RS485_SENSING_SERIAL.read();

// ── (2) 송신 모드 + 가드
RS485_SENS_TX();
delayMicroseconds(RS485_TURNAROUND_US);

// ── (3) 프레임 전송 + 선로 비움
RS485_SENSING_SERIAL.write(request, sizeof(request));
RS485_SENSING_SERIAL.flush();

// ── (4) flush 후 가드 + 수신 모드
delayMicroseconds(RS485_TURNAROUND_US);
RS485_SENS_RX();
// (선택) 1 char 정도 추가 여유
delayMicroseconds(RS485_INTERCHAR_US);

// ── (5) 응답 수신
uint32_t startTime = millis();
responseLen = 0;

// 기대 길이: [addr][fc][byteCount][data...][crcLo][crcHi]
// byteCount는 3바이트 이후 등장 → 최소 5바이트 수신 전엔 판단 불가
uint8_t expectedLen = 0;

while (millis() - startTime < timeout) {
while (RS485_SENSING_SERIAL.available()) {
response[responseLen++] = RS485_SENSING_SERIAL.read();

if (responseLen == 3) {
uint8_t byteCount = response[2];
expectedLen = (uint8_t)(byteCount + 5);
}
if (expectedLen && responseLen >= expectedLen) {
// 충분히 받았음
goto RX_DONE;
}
if (responseLen >= 250) goto RX_DONE; // 안전 상한
}
// (짧게 양보)
delayMicroseconds(100);
}

RX_DONE:
if (responseLen < 5) return false;

uint16_t receivedCRC   = (response[responseLen - 1] << 8) | response[responseLen - 2];
uint16_t calculatedCRC = calcCRC16(response, responseLen - 2);
return (receivedCRC == calculatedCRC);
}
*/


// void setRS485SensingTransmitMode() {
//   digitalWrite(RS485_SENSING_DE_RE_PIN, HIGH);
//   delayMicroseconds(50);
// }

// void setRS485SensingReceiveMode() {
//   digitalWrite(RS485_SENSING_DE_RE_PIN, LOW);
//   delayMicroseconds(50);
// }

uint16_t calcCRC16(const uint8_t *buf, uint8_t len)
{
  uint16_t crc = 0xFFFF;
  for (uint8_t i = 0; i < len; i++)
  {
    crc ^= buf[i];
    for (uint8_t j = 0; j < 8; j++)
    {
      if (crc & 0x0001)
      {
        crc = (crc >> 1) ^ 0xA001;
      }
      else
      {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ============= Serial1(Modbus RTU) 마스터 함수 (센서 전용 UNO와 통신) =============
bool sendModbusRequest(uint8_t slaveAddr, uint8_t functionCode,
                       uint16_t startReg, uint16_t regCount,
                       uint8_t *response, uint8_t &responseLen,
                       uint16_t timeout)
{
  
  uint8_t request[8];
  request[0] = slaveAddr;
  request[1] = functionCode;
  request[2] = highByte(startReg);
  request[3] = lowByte(startReg);
  request[4] = highByte(regCount);
  request[5] = lowByte(regCount);

  uint16_t crc = calcCRC16(request, 6);
  request[6] = lowByte(crc);
  request[7] = highByte(crc);

  // 수신버퍼 비우기
  while (RS485_SENSING_SERIAL.available()) RS485_SENSING_SERIAL.read();

  // 송신 모드 전환 + 가드
  RS485_SENS_TX();
  delayMicroseconds(RS485_TURNAROUND_US);

  // 전송
  RS485_SENSING_SERIAL.write(request, sizeof(request));
#if SCAN_DEBUG
  Serial.print(F("[SCAN][TX a=")); Serial.print(slaveAddr); Serial.print(F(" fc=")); Serial.print(functionCode, HEX); Serial.print(F("] "));
  for (uint8_t i=0;i<sizeof(request);i++){ Serial.print(F("0x")); Serial.print(request[i], HEX); Serial.print(F(" ")); }
  Serial.println();
#endif
  RS485_SENSING_SERIAL.flush();

  // 수신 모드 전환 + 가드
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_SENS_RX();
  delayMicroseconds(RS485_INTERCHAR_US);

  // 응답 수신
  uint32_t startTime = millis();
  responseLen = 0;
  uint8_t expectedLen = 0;

  while (millis() - startTime < timeout)
  {
    while (RS485_SENSING_SERIAL.available())
    {
      response[responseLen++] = RS485_SENSING_SERIAL.read();
      if (responseLen == 3)
      {
        uint8_t byteCount = response[2];
        expectedLen = (uint8_t)(byteCount + 5);
      }
      if (expectedLen && responseLen >= expectedLen) goto RX_DONE;
      if (responseLen >= 250) goto RX_DONE;
    }
    delayMicroseconds(100);
  }

RX_DONE:
#if SCAN_DEBUG
  Serial.print(F("[SCAN][RX len=")); Serial.print(responseLen); Serial.print(F("] "));
  for (uint8_t i=0;i<responseLen;i++){ Serial.print(F("0x")); Serial.print(response[i], HEX); Serial.print(F(" ")); }
  Serial.println();
#endif
  if (responseLen < 5) { 
#if SCAN_DEBUG
    Serial.println(F("[SCAN] RX too short")); 
#endif
    return false; 
  }
  {
    uint16_t receivedCRC   = (response[responseLen - 1] << 8) | response[responseLen - 2];
    uint16_t calculatedCRC = calcCRC16(response, responseLen - 2);
    bool ok = (receivedCRC == calculatedCRC);
    
#if SCAN_DEBUG
    Serial.print(F("[SCAN] CRC rx=")); Serial.print(receivedCRC, HEX); Serial.print(F(" calc=")); Serial.print(calculatedCRC, HEX); Serial.print(F(" -> "));
    Serial.println(ok ? F("OK") : F("FAIL"));
#endif
    return ok;
  }
}

bool readModbusRegisters(uint8_t slaveAddr, uint16_t startAddr, uint16_t count, uint16_t *data)
{
  uint8_t response[50];
  uint8_t respLen;
  if (sendModbusRequest(slaveAddr, 0x03, startAddr, count, response, respLen, 300))
  {
    // 기본 검증: 주소/예외코드
    if (respLen < 5) return false;
    if (response[0] != slaveAddr) return false;
    if (response[1] & 0x80) return false; // 예외 응답
    
    for (uint16_t i = 0; i < count && i < 10; i++)
    {
      data[i] = (response[3 + i * 2] << 8) | response[4 + i * 2];
    }
    return true;
  }
  return false;
}

// 디버그: 센서 전용 UNO(SHT20)에서 주기적으로 TEMP/HUMID 읽기
void debugPollSHT20FromUno(uint8_t slaveAddr)
{
  static unsigned long lastPoll = 0;
  unsigned long now = millis();
  if (now - lastPoll < 5000) return; // 5초 주기
  lastPoll = now;

  uint16_t regs[2];
  if (readModbusRegisters(slaveAddr, 0, 2, regs))
  {
    float tempC = regs[0] / 100.0f;
    float humid = regs[1] / 100.0f;
    Serial.print(F("Serial1 UNO SHT20 → T="));
    Serial.print(tempC, 2);
    Serial.print(F("°C, H="));
    Serial.print(humid, 2);
    Serial.println(F("%"));

    // 센서 테이블 업데이트 및 활성화 표시
    bool updated = false;
    for (uint8_t i = 0; i < modbusSlaveCount; i++) {
      if (modbusSensors[i].slaveId == slaveAddr && modbusSensors[i].type == MODBUS_SHT20) {
        modbusSensors[i].registers[0] = regs[0]; // temp * 100
        modbusSensors[i].registers[1] = regs[1]; // humid * 100
        modbusSensors[i].active = true;
        modbusSensors[i].isOnline = true;
        modbusSensors[i].lastResponse = millis();
        updated = true;
        break;
      }
    }
    if (!updated && modbusSlaveCount < MAX_MODBUS_SLAVES) {
      modbusSensors[modbusSlaveCount].slaveId = slaveAddr;
      modbusSensors[modbusSlaveCount].type = MODBUS_SHT20;
      modbusSensors[modbusSlaveCount].active = true;
      modbusSensors[modbusSlaveCount].registers[0] = regs[0];
      modbusSensors[modbusSlaveCount].registers[1] = regs[1];
      modbusSensors[modbusSlaveCount].name = String("SHT20_") + String(slaveAddr);
      modbusSensors[modbusSlaveCount].isOnline = true;
      modbusSensors[modbusSlaveCount].lastResponse = millis();
      modbusSlaveCount++;
    }
    modbusSensorsReady = (modbusSlaveCount > 0);
  }
  else
  {
    Serial.println(F("Serial1 UNO SHT20 읽기 실패"));
    // 링크 점검: 하트비트 시도
    unoHeartbeat(slaveAddr);
  }
}

// 순환 폴링: 지정한 주소 구간을 라운드로빈으로 읽음
void debugPollSHT20Cycle(uint8_t startAddr, uint8_t endAddr)
{
  static uint8_t current = 0;
  if (current < startAddr || current > endAddr) current = startAddr;
  debugPollSHT20FromUno(current);
  current = (current >= endAddr) ? startAddr : (uint8_t)(current + 1);
}

bool unoHeartbeat(uint8_t slaveAddr)
{
  uint8_t resp[32];
  uint8_t respLen = 0;
  bool ok = sendModbusRequest(slaveAddr, 0x11, 0, 0, resp, respLen, 300);
  if (!ok)
  {
    Serial.println(F("HB fail (no response)"));
    return false;
  }
  if (respLen >= 5 && resp[1] == 0x11)
  {
    uint8_t byteCount = resp[2];
    Serial.print(F("HB ok: "));
    Serial.print(byteCount);
    Serial.print(F(" bytes: "));
    for (uint8_t i=0; i<byteCount && (3+i)<respLen-2; i++) Serial.write(resp[3+i]);
    Serial.println();
    return true;
  }
  Serial.println(F("HB fail (malformed)"));
  return false;
}

// ============= 주소 범위 스캔 (UNO 래핑 포함) =============
// Phase 2: Combined ID를 고려한 센서 추가 함수
static void addDiscoveredSensor(uint8_t combinedId, modbusSensorType type, const char* typeName)
{
  if (modbusSlaveCount >= MAX_MODBUS_SLAVES) return;
  // Phase 2: 중복 방지 (Combined ID로 비교)
  for (uint8_t i=0;i<modbusSlaveCount;i++) if (modbusSensors[i].slaveId == combinedId) return;
  
  // Phase 2: Combined ID 분리하여 이름에 UNO_ID 포함
  uint8_t typeCode = 0;
  uint8_t unoId = 0;
  splitCombinedId(combinedId, &typeCode, &unoId);
  
  modbusSensors[modbusSlaveCount].slaveId = combinedId;  // Combined ID 저장
  modbusSensors[modbusSlaveCount].type = type;
  modbusSensors[modbusSlaveCount].active = true;
  modbusSensors[modbusSlaveCount].lastRead = 0;
  // Phase 2: 이름에 타입 코드와 UNO_ID 모두 포함
  modbusSensors[modbusSlaveCount].name = String(typeName) + "_T" + String(typeCode) + "_U" + String(unoId);
  modbusSensors[modbusSlaveCount].isOnline = true;
  modbusSensors[modbusSlaveCount].lastResponse = millis();
  modbusSensors[modbusSlaveCount].consecutiveFailures = 0;
  modbusSlaveCount++;
}

void scanAllUnoSensors()
{
  Serial.println(F("🔍 UNO 래핑 센서 스캔 시작..."));
  modbusSlaveCount = 0;
  // 스캔 전 버퍼 드레인 (ASCII/잔여 프레임 제거)
  unsigned long t0 = millis();
  while (RS485_SENSING_SERIAL.available() && (millis()-t0) < 50) RS485_SENSING_SERIAL.read();

  struct Range { modbusSensorType type; uint8_t s; uint8_t e; uint8_t testRegs; const char* name; };
  const Range ranges[] = {
#if SCAN_LEGACY_MODBUS_RANGES
    { MODBUS_SOIL_SENSOR,    SOIL_SENSOR_START,    SOIL_SENSOR_END,    8,  "SOIL" },
    { MODBUS_WIND_DIRECTION, WIND_DIR_START,       WIND_DIR_END,       2,  "WIND_DIR" },
    { MODBUS_WIND_SPEED,     WIND_SPEED_START,     WIND_SPEED_END,     1,  "WIND_SPEED" },
    { MODBUS_RAIN_SNOW,      RAIN_SNOW_START,      RAIN_SNOW_END,      10, "RAIN" },
    { MODBUS_TEMP_HUMID,     TEMP_HUMID_START,     TEMP_HUMID_END,     2,  "MODBUS_T_H" },
    { MODBUS_PRESSURE,       PRESSURE_START,       PRESSURE_END,       2,  "PRESSURE" },
    { MODBUS_FLOW,           FLOW_START,           FLOW_END,           2,  "FLOW" },
    { MODBUS_RELAY,          RELAY_START,          RELAY_END,          1,  "RELAY" },
    { MODBUS_ENERGY_METER,   ENERGY_METER_START,   ENERGY_METER_END,   5,  "ENERGY" },
#endif
    // UNO가 래핑한 I2C 범위만 기본 스캔
    { MODBUS_SHT20,          SHT20_START,          SHT20_END,          2,  "SHT20" },
    { MODBUS_SCD41,          SCD41_START,          SCD41_END,          1,  "SCD41" },
    { MODBUS_TSL2591,        TSL2591_START,        TSL2591_END,        1,  "TSL2591" },
    { MODBUS_BH1750,         BH1750_START,         BH1750_END,         1,  "BH1750" },
    { MODBUS_ADS1115,        ADS1115_START,        ADS1115_END,        3,  "ADS1115" },
    { MODBUS_DS18B20,        DS18B20_START,        DS18B20_END,        1,  "DS18B20" }
  };

  for (const auto &rg : ranges) {
    Serial.print(F("  ▶ 스캔: ")); Serial.print(rg.name); Serial.print(F(" [")); Serial.print(rg.s); Serial.print(F("-")); Serial.print(rg.e); Serial.println(F("]"));
    for (uint8_t addr = rg.s; addr <= rg.e && modbusSlaveCount < MAX_MODBUS_SLAVES; addr++) {
      uint16_t dataBuf[10];
      bool ok = readModbusRegisters(addr, 0, rg.testRegs, dataBuf);
      if (ok) {
        addDiscoveredSensor(addr, rg.type, rg.name);
        // 초기 데이터 저장(앞의 두 레지스터만)
        modbusSensors[modbusSlaveCount-1].registers[0] = dataBuf[0];
        modbusSensors[modbusSlaveCount-1].registers[1] = dataBuf[1];
        Serial.print(F("    ✅ 발견 @")); Serial.println(addr);
      } else {
        // 보조 탐지: FC 0x11(Report Slave ID) 시도
        uint8_t hbResp[64]; uint8_t hbLen = 0;
        bool hbOk = sendModbusRequest(addr, 0x11, 0, 0, hbResp, hbLen, 400);
        if (hbOk && hbLen >= 5 && hbResp[0] == addr && (hbResp[1] == 0x11) && !(hbResp[1] & 0x80)) {
          Serial.print(F("    🔎 HB 응답 감지 @")); Serial.println(addr);
          addDiscoveredSensor(addr, rg.type, rg.name);
          // HB로 존재 확인 시 즉시 데이터 1회 읽어 등록
          if (readModbusRegisters(addr, 0, rg.testRegs, dataBuf)) {
            modbusSensors[modbusSlaveCount-1].registers[0] = dataBuf[0];
            modbusSensors[modbusSlaveCount-1].registers[1] = dataBuf[1];
          }
        }
      }
      delay(30);
    }
  }

  modbusSensorsReady = (modbusSlaveCount > 0);
  Serial.print(F("📊 발견된 장치 수: ")); Serial.println(modbusSlaveCount);
}

// 주기적으로 발견된 UNO 센서 값을 갱신 (간단 폴링)
void refreshUnoWrappedSensors()
{
  static unsigned long lastRefresh = 0;
  unsigned long now = millis();
  if (now - lastRefresh < 3000) return; // 3초 주기
  lastRefresh = now;

  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (!modbusSensors[i].active) continue;
    uint8_t addr = modbusSensors[i].slaveId;
    uint8_t regsToRead = 2;
    switch (modbusSensors[i].type) {
      case MODBUS_SHT20: regsToRead = 2; break;
      case MODBUS_SCD41: regsToRead = 1; break;
      case MODBUS_TSL2591: regsToRead = 1; break;
      case MODBUS_BH1750: regsToRead = 1; break;
      case MODBUS_ADS1115: regsToRead = 3; break;
      case MODBUS_DS18B20: regsToRead = 1; break;
      default: regsToRead = 2; break;
    }
    uint16_t regs[10];
    if (readModbusRegisters(addr, 0, regsToRead, regs)) {
      for (uint8_t k=0;k<regsToRead && k<10;k++) modbusSensors[i].registers[k] = regs[k];
      modbusSensors[i].isOnline = true;
      modbusSensors[i].lastResponse = now;
      // 간단 값 로그 (SHT20 우선)
      if (modbusSensors[i].type == MODBUS_SHT20) {
        float t = regs[0] / 100.0f;
        float h = regs[1] / 100.0f;
        Serial.print(F("🌡 SHT20@")); Serial.print(addr); Serial.print(F(" T=")); Serial.print(t,2); Serial.print(F(" H=")); Serial.println(h,2);
      }
    }
  }
}

// ==== UNO 자발 푸시 프레임 수집 ====
void pollUnoPushFrames()
{
  static uint8_t buf[256];
  static uint8_t len = 0;
  static unsigned long lastByte = 0;
  static unsigned long lastDebugPrint = 0;

  while (RS485_SENSING_SERIAL.available()) {
    uint8_t byte = RS485_SENSING_SERIAL.read();
    
    // 디버그: 첫 바이트 수신 시 로그 (10초마다)
    if (len == 0 && (millis() - lastDebugPrint >= 10000)) {
      Serial.print(F("📥 [Serial1] 첫 바이트 수신: 0x"));
      if (byte < 0x10) Serial.print(F("0"));
      Serial.println(byte, HEX);
      lastDebugPrint = millis();
    }

    if (len < sizeof(buf)) {
      buf[len++] = byte;
    } else {
      Serial.println(F("⚠️ Serial1 입력 버퍼 초과 - 리셋"));
      len = 0;
      continue;
    }
    lastByte = millis();

    while (len >= 3) {
      uint8_t byteCount = buf[2];
      uint16_t frameLen = (uint16_t)byteCount + 5;
      if (len < frameLen) {
        break;
      }

      uint16_t rxCrc = (buf[frameLen - 1] << 8) | buf[frameLen - 2];
      uint16_t calc = calcCRC16(buf, frameLen - 2);

      if (rxCrc == calc && frameLen >= 5) {
        uint8_t addr = buf[0];
        uint8_t fc = buf[1];
        const uint8_t* payload = &buf[3];

        // Modbus Read (FC=0x03) 프레임만 처리
        if (fc == 0x03) {
          uint8_t typeCode = 0;
          uint8_t unoId = 0;
          splitCombinedId(addr, &typeCode, &unoId);

#if SCAN_DEBUG
          Serial.print(F("📦 Combined ID 수신: "));
          Serial.print(addr);
          Serial.print(F(" → 타입="));
          Serial.print(typeCode);
          Serial.print(F(", UNO_ID="));
          Serial.println(unoId);
#endif

          modbusSensorType t = MODBUS_SHT20;
          const char* name = "UNKNOWN";

          switch (typeCode) {
            case 21: t = MODBUS_SHT20;    name = "SHT20";    break;
            case 22: t = MODBUS_SCD41;    name = "SCD41";    break;
            case 23: t = MODBUS_TSL2591;  name = "TSL2591";  break;
            case 24: t = MODBUS_BH1750;   name = "BH1750";   break;
            case 25: t = MODBUS_ADS1115;  name = "ADS1115";  break;
            case 26: t = MODBUS_DS18B20;  name = "DS18B20";  break;
            case 19: t = MODBUS_SOIL_SENSOR;     name = "SOIL";     break;
            case 16: t = MODBUS_WIND_DIRECTION;  name = "WIND_DIR"; break;
            case 17: t = MODBUS_WIND_SPEED;      name = "WIND_SPD"; break;
            case 18: t = MODBUS_RAIN_SNOW;       name = "RAIN";     break;
            default:
              Serial.print(F("⚠️ Unknown type code: "));
              Serial.println(typeCode);
              break;
          }

          int idx = -1;
          for (uint8_t i = 0; i < modbusSlaveCount; i++) {
            if (modbusSensors[i].slaveId == addr) {
              idx = i;
              break;
            }
          }
          if (idx == -1 && modbusSlaveCount < MAX_MODBUS_SLAVES) {
            addDiscoveredSensor(addr, t, name);
            idx = modbusSlaveCount - 1;
          }
          if (idx >= 0) {
            uint8_t regCount = byteCount / 2;
            for (uint8_t k = 0; k < regCount && k < 10; k++) {
              modbusSensors[idx].registers[k] = (buf[3 + k * 2] << 8) | buf[4 + k * 2];
            }
            modbusSensors[idx].isOnline = true;
            modbusSensors[idx].lastResponse = millis();
            modbusSensorsReady = (modbusSlaveCount > 0);

            Serial.print(F("📦 [Serial1] Combined_ID="));
            Serial.print(addr);
            Serial.print(F(" (타입="));
            Serial.print(typeCode);
            Serial.print(F(", UNO_ID="));
            Serial.print(unoId);
            Serial.print(F(") 센서="));
            Serial.print(name);
            Serial.print(F(" FC=0x03 BC="));
            Serial.print(byteCount);
            Serial.print(F(" CRC_OK"));

            Serial.print(F(" RAW["));
            for (uint8_t i = 0; i < frameLen && i < 20; i++) {
              Serial.print(F("0x"));
              if (buf[i] < 0x10) Serial.print(F("0"));
              Serial.print(buf[i], HEX);
              if (i < frameLen - 1) Serial.print(F(" "));
            }
            Serial.print(F("]"));

            Serial.print(F(" 값:"));
            switch (t) {
              case MODBUS_SHT20: {
                if (regCount >= 2) {
                  float temp = modbusSensors[idx].registers[0] / 100.0f;
                  float humid = modbusSensors[idx].registers[1] / 100.0f;
                  Serial.print(F(" T=")); Serial.print(temp, 2); Serial.print(F("°C"));
                  Serial.print(F(" H=")); Serial.print(humid, 2); Serial.print(F("%"));
                }
                break;
              }
              case MODBUS_SCD41: {
                if (regCount >= 1) {
                  uint16_t co2 = modbusSensors[idx].registers[0];
                  Serial.print(F(" CO2=")); Serial.print(co2); Serial.print(F("ppm"));
                }
                break;
              }
              case MODBUS_TSL2591:
              case MODBUS_BH1750: {
                if (regCount >= 1) {
                  float lux = modbusSensors[idx].registers[0] / 10.0f;
                  Serial.print(F(" LUX=")); Serial.print(lux, 1);
                }
                break;
              }
              case MODBUS_ADS1115: {
                if (regCount >= 3) {
                  float ph = modbusSensors[idx].registers[0] / 100.0f;
                  float ec = modbusSensors[idx].registers[1] / 100.0f;
                  float wt = modbusSensors[idx].registers[2] / 100.0f;
                  Serial.print(F(" pH=")); Serial.print(ph, 2);
                  Serial.print(F(" EC=")); Serial.print(ec, 2); Serial.print(F("dS/m"));
                  Serial.print(F(" WT=")); Serial.print(wt, 1); Serial.print(F("°C"));
                }
                break;
              }
              case MODBUS_DS18B20: {
                if (regCount >= 1) {
                  float temp = modbusSensors[idx].registers[0] / 100.0f;
                  Serial.print(F(" T=")); Serial.print(temp, 2); Serial.print(F("°C"));
                }
                break;
              }
              case MODBUS_SOIL_SENSOR: {
                if (regCount >= 4) {
                  Serial.print(F(" r0=")); Serial.print(modbusSensors[idx].registers[0]); // 습도
                  Serial.print(F(" r1=")); Serial.print(modbusSensors[idx].registers[1]); // 온도
                  Serial.print(F(" r2=")); Serial.print(modbusSensors[idx].registers[2]); // EC
                  Serial.print(F(" r3=")); Serial.print(modbusSensors[idx].registers[3]); // pH
                } else {
                  Serial.print(F(" r0=")); Serial.print(modbusSensors[idx].registers[0]);
                  if (regCount >= 2) {
                    Serial.print(F(" r1=")); Serial.print(modbusSensors[idx].registers[1]);
                  }
                }
                break;
              }
              default: {
                Serial.print(F(" r0=")); Serial.print(modbusSensors[idx].registers[0]);
                if (regCount >= 2) {
                  Serial.print(F(" r1=")); Serial.print(modbusSensors[idx].registers[1]);
                }
                break;
              }
            }
            Serial.println();
          }
        } else {
          Serial.print(F("ℹ️ [Serial1] 알 수 없는 FC 0x"));
          Serial.print(fc, HEX);
          Serial.println(F(" 무시"));
        }
      } else {
        Serial.print(F("❌ [Serial1] CRC 오류: addr="));
        Serial.print(buf[0]);
        Serial.print(F(" rxCRC=0x"));
        Serial.print(rxCrc, HEX);
        Serial.print(F(" calcCRC=0x"));
        Serial.print(calc, HEX);
        Serial.print(F(" RAW["));
        for (uint8_t i = 0; i < frameLen && i < 20; i++) {
          Serial.print(F("0x"));
          if (buf[i] < 0x10) Serial.print(F("0"));
          Serial.print(buf[i], HEX);
          if (i < frameLen - 1) Serial.print(F(" "));
        }
        Serial.println(F("]"));
      }

      if (frameLen > len) frameLen = len;
      uint8_t remain = len - frameLen;
      if (remain > 0) {
        memmove(buf, buf + frameLen, remain);
      }
      len = remain;
    }
  }

  if (len > 0 && (millis() - lastByte) > 20) {
    len = 0;
  }
}

void resetUnoBucketsIfExpired()
{
  // 버킷 리셋 기능 제거 (초기 할당만 사용하므로 불필요)
  // 필요 시 별도 구현
}

// Phase 1: Legacy - bool unoSensingPresent = false;
// Phase 1: Legacy - unsigned long lastUnoSensingHelloMs = 0;
// Phase 1: Legacy - 완전히 제거됨
// static bool waitingUnoAddr = false;
// static unsigned long waitingUnoAddrUntil = 0;

// Phase 1: 레거시 UNO_ADDR 헬스체크 방식 - 더 이상 사용하지 않음
// Phase1-Legacy: // pollUnoPushFrames()가 타입 코드로 직접 인식하므로 불필요
// Phase1-Legacy: void pollUnoSensingHandshake()
// Phase1-Legacy: {
// Phase1-Legacy:   // Phase 1: 비활성화됨 - pollUnoPushFrames() 사용
// Phase1-Legacy:   return;
// Phase1-Legacy:   // Serial1(센서용) 라인이 비어 있지 않다면 라인 기반으로 토큰 감지
// Phase1-Legacy:   if (!RS485_SENSING_SERIAL.available()) return;
// Phase1-Legacy: 
// Phase1-Legacy:   static char hbBuf[32];
// Phase1-Legacy:   static uint8_t hbLen = 0;
// Phase1-Legacy: 
// Phase1-Legacy:   while (RS485_SENSING_SERIAL.available())
// Phase1-Legacy:   {
// Phase1-Legacy:     char c = (char)RS485_SENSING_SERIAL.read();
// Phase1-Legacy:     if (c == '\n' || hbLen >= sizeof(hbBuf)-1)
// Phase1-Legacy:     {
// Phase1-Legacy:       hbBuf[hbLen] = '\0';
// Phase1-Legacy:       if (hbLen > 0)
// Phase1-Legacy:       {
// Phase1-Legacy:         if (strstr(hbBuf, UNO_SENSING_HELLO) != NULL)
// Phase1-Legacy:         {
// Phase1-Legacy:           unsigned long now = millis();
// Phase1-Legacy:           // 디바운스: 최초 감지 또는 30초 지난 경우만 처리
// Phase1-Legacy:           if (!unoSensingPresent || (now - lastUnoSensingHelloMs) > 30000) {
// Phase1-Legacy:             unoSensingPresent = true;
// Phase1-Legacy:             lastUnoSensingHelloMs = now;
// Phase1-Legacy:             Serial.println(F("✅ 센서용 UNO 감지됨 - 응답 후 스캔 갱신"));
// Phase1-Legacy:             // 응답 전송
// Phase1-Legacy:             RS485_SENS_TX();
// Phase1-Legacy:             delayMicroseconds(RS485_TURNAROUND_US);
// Phase1-Legacy:             const char ack[] = "MEGA_SENS_ACK\n";
// Phase1-Legacy:             for (size_t i=0;i<sizeof(ack)-1;i++) RS485_SENSING_SERIAL.write((uint8_t)ack[i]);
// Phase1-Legacy:             const char req[] = "MEGA_SENS_REQ_ADDR\n";
// Phase1-Legacy:             for (size_t i=0;i<sizeof(req)-1;i++) RS485_SENSING_SERIAL.write((uint8_t)req[i]);
// Phase1-Legacy:             RS485_SENSING_SERIAL.flush();
// Phase1-Legacy:             delayMicroseconds(RS485_TURNAROUND_US);
// Phase1-Legacy:             RS485_SENS_RX();
// Phase1-Legacy:             // 주소 응답 대기 상태 진입 (2초)
// Phase1-Legacy:             waitingUnoAddr = true;
// Phase1-Legacy:             waitingUnoAddrUntil = millis() + 2000;
// Phase1-Legacy:           }
// Phase1-Legacy:         }
// Phase1-Legacy:         else if (strstr(hbBuf, UNO_SENSING_ADDR_PREFIX) == hbBuf) {
// Phase1-Legacy:           // 형식: UNO_ADDR:<num>
// Phase1-Legacy:           uint8_t addr = (uint8_t)atoi(hbBuf + strlen(UNO_SENSING_ADDR_PREFIX));
// Phase1-Legacy:           if (addr >= SHT20_START && addr <= DS18B20_END) {
// Phase1-Legacy:             // 타입 추정
// Phase1-Legacy:             modbusSensorType t = MODBUS_SHT20;
// Phase1-Legacy:             const char* name = "SHT20";
// Phase1-Legacy:             if (addr >= SHT20_START && addr <= SHT20_END) { t = MODBUS_SHT20; name = "SHT20"; }
// Phase1-Legacy:             else if (addr >= SCD41_START && addr <= SCD41_END) { t = MODBUS_SCD41; name = "SCD41"; }
// Phase1-Legacy:             else if (addr >= TSL2591_START && addr <= TSL2591_END) { t = MODBUS_TSL2591; name = "TSL2591"; }
// Phase1-Legacy:             else if (addr >= BH1750_START && addr <= BH1750_END) { t = MODBUS_BH1750; name = "BH1750"; }
// Phase1-Legacy:             else if (addr >= ADS1115_START && addr <= ADS1115_END) { t = MODBUS_ADS1115; name = "ADS1115"; }
// Phase1-Legacy:             else if (addr >= DS18B20_START && addr <= DS18B20_END) { t = MODBUS_DS18B20; name = "DS18B20"; }
// Phase1-Legacy:             addDiscoveredSensor(addr, t, name);
// Phase1-Legacy:             // 즉시 1회 읽기 시도
// Phase1-Legacy:             uint16_t regs[3];
// Phase1-Legacy:             uint8_t cnt = (t==MODBUS_SHT20)?2:(t==MODBUS_ADS1115?3:1);
// Phase1-Legacy:             if (readModbusRegisters(addr, 0, cnt, regs)) {
// Phase1-Legacy:               for (uint8_t k=0;k<cnt;k++) modbusSensors[modbusSlaveCount-1].registers[k] = regs[k];
// Phase1-Legacy:             }
// Phase1-Legacy:             waitingUnoAddr = false;
// Phase1-Legacy:             Serial.print(F("📝 등록: addr=")); Serial.print(addr); Serial.print(F(" type=")); Serial.println(name);
// Phase1-Legacy:           }
// Phase1-Legacy:         }
// Phase1-Legacy:       }
// Phase1-Legacy:       hbLen = 0;
// Phase1-Legacy:     }
// Phase1-Legacy:     else
// Phase1-Legacy:     {
// Phase1-Legacy:       hbBuf[hbLen++] = c;
// Phase1-Legacy:     }
// Phase1-Legacy:   }
// Phase1-Legacy: 
// Phase1-Legacy:   // Phase 1: 레거시 코드 제거됨
// Phase1-Legacy: }
// Phase1-Legacy: 
// Phase1-Legacy: // ============= 제어용 UNO(Serial3) 존재 감지 및 활성화 토글 =============
bool unoControlPresent = false;

void pollUnoControlHandshake()
{
  // Serial3이 비어 있고 IDLE일 때만 비간섭 읽기
  if (serial3Owner != SERIAL3_IDLE) return;
  if (!RS485_CONTROL_SERIAL.available()) return;

  static char hbBuf[32];
  static uint8_t hbLen = 0;

  while (RS485_CONTROL_SERIAL.available())
  {
    char c = (char)RS485_CONTROL_SERIAL.read();
    if (c == '\n' || hbLen >= sizeof(hbBuf)-1)
    {
      hbBuf[hbLen] = '\0';
      if (hbLen > 0)
      {
        if (strstr(hbBuf, UNO_CONTROL_HELLO) != NULL)
        {
          if (!unoControlPresent)
          {
            unoControlPresent = true;
            Serial.println(F("✅ 제어용 UNO 감지됨 - Serial3 센서 요청 활성화"));
          }
        }
      }
      hbLen = 0; // 라인 리셋
    }
    else
    {
      hbBuf[hbLen++] = c;
    }
  }
}
// UNO가 모든 센서 읽기를 담당하므로 주석처리
/*
bool readSoilSensor(uint8_t slaveAddr, SoilData *soilData)
{
  // NPK가 reg 5,6,7에 있으므로 8개 읽기 (0~7)
  uint16_t data[8];
  if (readModbusRegisters(slaveAddr, 0, 8, data))
  {
    // 습도/온도: 기존 유지 (센서가 U16×10)
    soilData->humidity    = data[0] / 10.0f;
    soilData->temperature = data[1] / 10.0f;

    // === EC ===
    // reg2=w0, reg3=w1
    const uint16_t w0 = data[2];
    const uint16_t w1 = data[3];
    float ec_raw_uScm = parseEC_uScm_from_w0w1(w0, w1);
    float ec_corr_uScm = ecCalibrate_uScm(ec_raw_uScm);

    // KS 단위( dS/m )로 저장: μS/cm ÷ 1000
    soilData->EC = ec_corr_uScm / 1000.0f;

    // === pH (기존 로직 유지) ===
    // 센서 주소 8 기준: pH RAW는 reg 0x0004, 스케일 U16×100
    const float ph_raw = data[4] / 100.0f;
    float ph_corr = phCalibrate(ph_raw);
    if (ph_corr < 0.0f)  ph_corr = 0.0f;
    if (ph_corr > 14.5f) ph_corr = 14.5f;
    soilData->pH = ph_corr;

    // === NPK ===
    soilData->nitrogen    = data[5];
    soilData->phosphorus  = data[6];
    soilData->potassium   = data[7];

    soilData->isValid     = true;

#if 0 // 디버깅: EC/P H 모두 확인
    Serial.print(F("[SOIL] EC_RAW="));  Serial.print(ec_raw_uScm, 3); Serial.print(F(" μS/cm"));
    Serial.print(F(" -> EC_CORR="));    Serial.print(ec_corr_uScm, 1); Serial.print(F(" μS/cm ("));
    Serial.print(soilData->EC, 3); Serial.print(F(" dS/m)"));
    Serial.print(F(" | w0=")); Serial.print(w0); Serial.print(F(" w1=")); Serial.print(w1);
    Serial.print(F(" | pH_raw=")); Serial.print(ph_raw, 3);
    Serial.print(F(" -> pH_corr=")); Serial.println(ph_corr, 3);
#endif
    return true;
  }
  soilData->isValid = false;
  return false;
}
*/



// UNO가 모든 센서 읽기를 담당하므로 주석처리
/*
bool readWindDirection(uint8_t slaveAddr, uint16_t *gearValue, uint16_t *degreeValue)
{
  uint16_t data[2];
  if (readModbusRegisters(slaveAddr, 0, 2, data))
  {
    *gearValue = data[0];
    *degreeValue = data[1];
    return true;
  }
  return false;
}

bool readWindSpeed(uint8_t slaveAddr, uint16_t *rawSpeed)
{
  uint16_t data[1];
  if (readModbusRegisters(slaveAddr, 0, 1, data))
  {
    *rawSpeed = data[0];
    return true;
  }
  return false;
}

bool readRainSnowSensor(uint8_t slaveAddr, uint16_t *rainFlag, uint16_t *snowFlag,
                        float *temperature, uint16_t *humidity, uint16_t *moistureLevel)
{
  uint16_t data[10];
  if (readModbusRegisters(slaveAddr, 0, 10, data))
  {
    *rainFlag = data[0];
    *snowFlag = data[1];
    *temperature = data[3] / 10.0;
    *humidity = data[4];
    *moistureLevel = data[5];
    return true;
  }
  return false;
}

uint8_t getPrecipitationStatus(uint16_t rainFlag, uint16_t snowFlag)
{
  if (snowFlag > 0)
    return 2;
  else if (rainFlag > 0)
    return 1;
  else
    return 0;
}
*/

// ============= RS485 제어 함수들 (Serial3 제어용-UNO and NPN)=============
// CRC16 테이블 (NPN 제어용)
const uint16_t PROGMEM crc_table[256] = {
    0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
    0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
    0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
    0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
    0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
    0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
    0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
    0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
    0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
    0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
    0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
    0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
    0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
    0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
    0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
    0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
    0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
    0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
    0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
    0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
    0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
    0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
    0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
    0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
    0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
    0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
    0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
    0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
    0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
    0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
    0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
    0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040};

// ============= NPN 모듈 제어 함수들 =============
bool sendNPNModbusCommand(uint8_t *command, uint8_t length, uint16_t timeout = 300)
{
  // 안전 장치: 비정상적으로 큰 타임아웃 값이 들어오는 것을 방지
  if (timeout > 2000) timeout = 2000;

  // NPN 명령 - Modbus RTU 응답 대기 포함
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write(command, length);
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);

  // 전송된 프레임 디버그 출력
  Serial.print(F("📤 NPN 전송: "));
  for (int i = 0; i < length; i++)
  {
    Serial.print(F("0x"));
    if (command[i] < 0x10) Serial.print(F("0"));
    Serial.print(command[i], HEX);
    Serial.print(F(" "));
  }
  Serial.println();

  // Modbus RTU 응답 대기 (Write Single Register는 8바이트 응답)
  uint8_t response[8];
  uint8_t responseLen = 0;
  unsigned long startTime = millis();
  unsigned long endTime = startTime + timeout;

  // millis() 오버플로우 안전한 타임아웃 체크
  while ((long)(millis() - endTime) < 0)
  {
    while (RS485_CONTROL_SERIAL.available() && responseLen < sizeof(response))
    {
      response[responseLen++] = RS485_CONTROL_SERIAL.read();
    }
    
    // Modbus RTU Write Single Register 응답은 정확히 8바이트
    if (responseLen >= 8)
    {
      // CRC 검증
      uint16_t receivedCRC = (response[7] << 8) | response[6];
      uint16_t calculatedCRC = calculateCRC16(response, 6);
      
      if (receivedCRC == calculatedCRC)
      {
        Serial.print(F("📥 NPN 응답 수신: "));
        for (int i = 0; i < responseLen; i++)
        {
          Serial.print(F("0x"));
          if (response[i] < 0x10) Serial.print(F("0"));
          Serial.print(response[i], HEX);
          Serial.print(F(" "));
        }
        Serial.println(F("✅"));
        return true;
      }
      else
      {
        Serial.print(F("❌ NPN CRC 오류: rx=0x"));
        Serial.print(receivedCRC, HEX);
        Serial.print(F(" calc=0x"));
        Serial.println(calculatedCRC, HEX);
        return false;
      }
    }
    
    // UNO 명령과 동일하게 delay(1) 사용 (CPU 독점 방지)
    delay(1);
  }

  // 타임아웃
  Serial.print(F("⏱ NPN 응답 타임아웃 (수신: "));
  Serial.print(responseLen);
  Serial.println(F(" 바이트)"));
  return false;
}


bool controlSingleNPNRelay(uint8_t channel, uint16_t command)
{
    uint8_t frame[8];
    
  frame[0] = NPN_SLAVE_ADDRESS; // 0x01 (NPN 전용)
  frame[1] = 0x06;              // Modbus Write Single Register
  frame[2] = 0x00;              // High address
  frame[3] = channel;           // Low address (channel)
    frame[4] = (command >> 8) & 0xFF;
    frame[5] = command & 0xFF;
    
    uint16_t crc = calculateCRC16(frame, 6);
    frame[6] = crc & 0xFF;
    frame[7] = (crc >> 8) & 0xFF;
    
    return sendNPNModbusCommand(frame, 8);
}

bool allNPNChannelsOff()
{
    return controlSingleNPNRelay(0, 0x0800);
}

bool npnChannelOn(uint8_t channel)
{
  if (channel < TOTAL_NPN_CHANNELS)
  {
        return controlSingleNPNRelay(channel, 0x0100);
    }
  return false;
}

bool npnChannelOff(uint8_t channel)
{
  if (channel < TOTAL_NPN_CHANNELS)
  {
        return controlSingleNPNRelay(channel, 0x0200);
    }
  return false;
}

uint16_t calculateCRC16(uint8_t *data, uint8_t length)
{
    uint16_t crc = 0xFFFF;
  for (uint8_t i = 0; i < length; i++)
  {
        crc = (crc >> 8) ^ pgm_read_word(&crc_table[(crc ^ data[i]) & 0xFF]);
    }
    return crc;
}

// ============= UNO 제어 함수들 =============
void unoStart()
{
  // 콜백 방식으로 변경
  resetUnoImmediate();
}

void unoStop()
{
  // 콜백 방식으로 변경
  allOffUnoImmediate();
}

void unoReset()
{
  // 콜백 방식으로 변경
  resetUnoImmediate();
}

void unoAllOff()
{
  // 콜백 방식으로 변경
  allOffUnoImmediate();
}

void unoChannelOn(uint8_t channel)
{
  // 콜백 방식으로 변경
  unoChannelOnImmediate(channel);
}

void unoChannelOff(uint8_t channel)
{
  // 콜백 방식으로 변경
  unoChannelOffImmediate(channel);
}

// 🔥 중요 제어 명령 (즉시 처리 - 콜백 방식)
bool waitForUnoAck(unsigned long timeoutMs = 1000)
{
  unsigned long startTime = millis();

  while (millis() - startTime < timeoutMs)
  {
    if (RS485_CONTROL_SERIAL.available() >= 1)
    {
      uint8_t ack = RS485_CONTROL_SERIAL.read();
      Serial.println(ack, HEX);

      if (ack == ACK_OK)
      {
        return true; // 성공 - 즉시 반환
      }
      else if (ack == ACK_ERROR)
      {
        return false; // 실패 - 즉시 반환
      }
    }
    delay(1);
  }
  // 타임아웃 발생 시에만 메시지 출력
  return false; // 타임아웃
}

void unoChannelOnImmediate(uint8_t channel)
{
  // ========== 프로토콜: CMD_ON(0x23) + CHANNEL(1) + \n(0x0A) = 3바이트 ==========
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();
  
  // 송신 시퀀스
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 명령 전송
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_ON);
  RS485_CONTROL_SERIAL.write((uint8_t)channel);
  RS485_CONTROL_SERIAL.write('\n');
  RS485_CONTROL_SERIAL.flush();
  
  // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 수신 모드 전환
  RS485_CTRL_RX();

  // ACK 수신 대기 (타임아웃: 20ms - 테스트 코드와 동일)
  unsigned long startTime = millis();
  bool ackReceived = false;
  
  while (millis() - startTime < 20) {
    if (RS485_CONTROL_SERIAL.available()) {
      uint8_t ackCode = RS485_CONTROL_SERIAL.read();
      if (ackCode == ACK_OK) {
        ackReceived = true;
        break;
      } else if (ackCode == ACK_ERROR) {
        break; // 명시적 에러
      }
    }
    delay(1);
  }

  // 결과 처리
  if (ackReceived) {
    Serial.print(F("✅ CH"));
    Serial.print(channel);
    Serial.println(F(" ON"));
    sendUnoAckToServer("ON", channel, true);
  } else {
    Serial.print(F("❌ CH"));
    Serial.print(channel);
    Serial.println(F(" ON (타임아웃)"));
    sendUnoAckToServer("ON", channel, false);
  }
}

void unoChannelOffImmediate(uint8_t channel)
{
  // ========== 프로토콜: CMD_OFF(0x24) + CHANNEL(1) + \n(0x0A) = 3바이트 ==========
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();
  
  // 송신 시퀀스
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 명령 전송
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_OFF);
  RS485_CONTROL_SERIAL.write((uint8_t)channel);
  RS485_CONTROL_SERIAL.write('\n');
  RS485_CONTROL_SERIAL.flush();
  
  // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 수신 모드 전환
  RS485_CTRL_RX();

  // ACK 수신 대기 (타임아웃: 20ms - 테스트 코드와 동일)
  unsigned long startTime = millis();
  bool ackReceived = false;
  
  while (millis() - startTime < 20) {
    if (RS485_CONTROL_SERIAL.available()) {
      uint8_t ackCode = RS485_CONTROL_SERIAL.read();
      if (ackCode == ACK_OK) {
        ackReceived = true;
        break;
      } else if (ackCode == ACK_ERROR) {
        break; // 명시적 에러
      }
    }
    delay(1);
  }

  // 결과 처리
  if (ackReceived) {
    Serial.print(F("✅ CH"));
    Serial.print(channel);
    Serial.println(F(" OFF"));
    sendUnoAckToServer("OFF", channel, true);
  } else {
    Serial.print(F("❌ CH"));
    Serial.print(channel);
    Serial.println(F(" OFF (타임아웃)"));
    sendUnoAckToServer("OFF", channel, false);
  }
}

void togglePulseImmediate(int pinIndex)
{
  // UNO 제어 - 단순화된 버전 (빠른 테스트용)
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_TOGGLE);
  RS485_CONTROL_SERIAL.write((uint8_t)pinIndex);
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);

  Serial.print(F("⚡ TOGGLE Pin "));
  Serial.println(pinIndex);
}

// 양액 핀 전용 함수 (단순화된 버전)
void togglePulseFast(int pinIndex)
{
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_TOGGLE);
  RS485_CONTROL_SERIAL.write((uint8_t)pinIndex);
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

// EC 펄스 전용 함수 (고수준 - 단일 명령으로 2개 릴레이 동시 제어)
void toggleECPulseFast()
{
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_EC_PULSE);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 (사용하지 않음)
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

// EC OFF 전용 함수 (고수준 - 단일 명령으로 2개 릴레이 동시 제어)
void ecOffFast()
{
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_EC_OFF);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 (사용하지 않음)
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

// 베드 ON 전용 함수 (고수준 - 단일 명령으로 4개 릴레이 동시 제어)
void bedOnFast(uint8_t bedMask)
{
  Serial.print(F("🛏️ bedOnFast 호출 - bedMask: 0x"));
  Serial.println(bedMask, HEX);

  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();

  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_BED_ON);
  RS485_CONTROL_SERIAL.write((uint8_t)bedMask);
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);

  Serial.println(F("📤 베드 ON 명령 전송 완료"));
}

void resetUnoImmediate()
{
  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_RESET);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 없음
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

void allOffUnoImmediate()
{
  // 송신 시퀀스 (가드 포함)
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_ALLOFF);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 없음
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

// ============= 통합 제어 함수들 =============
bool handleNPNCommand(const String &command, uint8_t channel, String &response)
{
  Serial.println(F("➡ handleNPNCommand 진입"));
#if NPN_HW_PRESENT == 0
  // 하드웨어 미연결 상태에서는 실제 Modbus 전송/응답 대기를 하지 않고 DRY RUN으로 처리
  Serial.print(F("⚠️ NPN 모듈 미연결 - DRY RUN: command="));
  Serial.print(command);
  Serial.print(F(", ch="));
  Serial.println(channel);

  if (command == "ON")
  {
    response = "NPN Channel " + String(channel) + " turned ON (DRY RUN)";
    return true;
  }
  else if (command == "OFF")
  {
    response = "NPN Channel " + String(channel) + " turned OFF (DRY RUN)";
    return true;
  }
  else if (command == "ALL_OFF")
  {
    response = "All NPN channels turned OFF (DRY RUN)";
    return true;
  }
  else
  {
    response = "Invalid NPN command (DRY RUN): " + command;
    return false;
  }
#endif

  bool success = false;

  if (command == "ON")
  {
    success = npnChannelOn(channel);
    if (success) {
      response = "NPN Channel " + String(channel) + " turned ON";
    } else {
      response = "NPN Channel " + String(channel) + " ON failed";
    }
    return success;
  }
  else if (command == "OFF")
  {
    success = npnChannelOff(channel);
    if (success) {
      response = "NPN Channel " + String(channel) + " turned OFF";
    } else {
      response = "NPN Channel " + String(channel) + " OFF failed";
    }
    return success;
  }
  else if (command == "ALL_OFF")
  {
    success = allNPNChannelsOff();
    if (success) {
      response = "All NPN channels turned OFF";
    } else {
      response = "All NPN channels OFF failed";
    }
    return success;
  }
  else
  {
    response = "Invalid NPN command: " + command;
    return false;
  }
}


bool handleUNOCommand(const String &command, int channel, String &response)
{
    String ucmd = command;
    ucmd.toUpperCase();
    
  if (ucmd == "START")
  {
        unoStart();
        response = "UNO_START";
        return true;
    }
  else if (ucmd == "STOP")
  {
        unoStop();
        response = "UNO_STOP";
        return true;
    }
  else if (ucmd == "RESET")
  {
        unoReset();
        response = "UNO_RESET";
        return true;
    }
  else if (ucmd == "ALLOFF")
  {
        unoAllOff();
        response = "UNO_ALLOFF";
        return true;
    }
  else if (ucmd == "ON" && channel >= 0)
  {
    unoChannelOnImmediate(channel); // 콜백 방식으로 변경
        response = String("UNO_ON") + channel;
        return true;
    }
  else if (ucmd == "OFF" && channel >= 0)
  {
    unoChannelOffImmediate(channel); // 콜백 방식으로 변경
        response = String("UNO_OFF") + channel;
        return true;
    }
  else
  {
        response = "Invalid UNO command";
        return false;
    }
}

bool handleKindCommand(const String &kind, const String &command, uint8_t channel, String &response)
{
  if (kind == "NPN_MODULE")
  {
        return handleNPNCommand(command, channel, response);
    }
  else
  {
        response = "Unsupported kind: " + kind;
        return false;
    }
}

// 우노에서 센서 데이터 수신하는 함수
bool requestUnoSensorData()
{
  // 송신 모드로 전환
  digitalWrite(RS485_CONTROL_DE_RE_PIN, HIGH);
  delay(50); // 송신 모드 전환 대기

  // RS485 제어 라인을 통해 우노에 센서 요청
  RS485_CONTROL_SERIAL.println("UNO_SENSOR_REQUEST");
  RS485_CONTROL_SERIAL.flush(); // 전송 완료 대기
  delay(100);                   // 전송 완료 대기

  // 수신 모드로 전환
  digitalWrite(RS485_CONTROL_DE_RE_PIN, LOW);
  delay(50); // 수신 모드 전환 대기

  // 응답 대기 (타임아웃 15초, SoftwareSerial 고려)
  unsigned long timeout = millis() + 15000;
  String response = "";
  
  // UNO가 응답할 시간을 충분히 주기 위해 추가 대기
  delay(500); // SoftwareSerial을 위한 충분한 대기시간

  while (millis() < timeout)
  {
    if (RS485_CONTROL_SERIAL.available())
    {
          char c = RS485_CONTROL_SERIAL.read();
      if (c == '\n')
      {
              break;
          }
          response += c;
      }
    delay(20); // SoftwareSerial을 위한 더 긴 지연
  }
  
  if (response.length() == 0)
  {
      unoSensorData.isValid = false;
      return false;
  }

  Serial.print(F("📥 UNO 센서: "));
  Serial.println(response);
  
  return parseUnoSensorData(response);
}

bool parseUnoSensorData(const String &data)
{
  // 예상 형식: "PH:7.25,EC:1.5,TEMP:24.3"
  int phIndex = data.indexOf("PH:");
  int ecIndex = data.indexOf("EC:");
  int tempIndex = data.indexOf("TEMP:");
  
  if (phIndex == -1 || ecIndex == -1 || tempIndex == -1)
  {
      unoSensorData.isValid = false;
      return false;
  }
  
      // pH 값 파싱
      int phStart = phIndex + 3;
      int phEnd = data.indexOf(",", phStart);
  if (phEnd == -1)
    phEnd = data.length();
  if (phStart >= phEnd)
  {
    unoSensorData.isValid = false;
    return false;
  }
      unoSensorData.ph = data.substring(phStart, phEnd).toFloat();
      
      // EC 값 파싱
      int ecStart = ecIndex + 3;
      int ecEnd = data.indexOf(",", ecStart);
  if (ecEnd == -1)
    ecEnd = data.length();
  if (ecStart >= ecEnd)
  {
    unoSensorData.isValid = false;
    return false;
  }
      unoSensorData.ec = data.substring(ecStart, ecEnd).toFloat();
      
      // 수온 값 파싱
      int tempStart = tempIndex + 5;
      int tempEnd = data.indexOf(",", tempStart);
  if (tempEnd == -1)
    tempEnd = data.length();
  if (tempStart >= tempEnd)
  {
    unoSensorData.isValid = false;
    return false;
  }
      unoSensorData.waterTemp = data.substring(tempStart, tempEnd).toFloat();
      
  // // 유효성 검증
  // if (unoSensorData.ph >= 0 && unoSensorData.ph <= 14 &&
  //     unoSensorData.ec >= 0 && unoSensorData.ec <= 10 &&
  //     unoSensorData.waterTemp >= 0 && unoSensorData.waterTemp <= 50) {

  //     unoSensorData.isValid = true;
  //     unoSensorData.lastUpdate = millis();

  //     Serial.print(unoSensorData.ph);
  //     Serial.print(F(", EC="));
  //     Serial.print(unoSensorData.ec);
  //     Serial.print(F(", WaterTemp="));
  //     Serial.println(unoSensorData.waterTemp);

  //     return true;
  // } else {
  //     unoSensorData.isValid = false;
  //     return false;
  // }
}

// 우노 센서 데이터가 유효한지 확인 (5분 이내 데이터)
bool isUnoSensorDataValid()
{
  return unoSensorData.isValid &&
         (millis() - unoSensorData.lastUpdate) < 300000; // 5분
}

// ============= Serial3 통신 관리 시스템 =============

// Serial3 관리 시스템 변수
Serial3Owner serial3Owner = SERIAL3_IDLE;
unsigned long serial3LastUsed = 0;
unsigned long serial3CooldownTime = 20; // 20ms 쿨다운

void initSerial3Manager()
{
  serial3Owner = SERIAL3_IDLE;
  serial3LastUsed = 0;
  serial3CooldownTime = 5; // 5ms 쿨다운 (더 단축)
}

bool requestSerial3Access(Serial3Owner requester)
{
  unsigned long currentTime = millis();

  // 쿨다운 시간 체크 (단축)
  if (currentTime - serial3LastUsed < serial3CooldownTime)
  {
    return false; // 아직 쿨다운 중
  }

  // 타임아웃 체크 (5초 이상 사용 중이면 강제 해제)
  if (serial3Owner != SERIAL3_IDLE && (currentTime - serial3LastUsed) > 5000)
  {
    Serial.println(F("⚠️ Serial3 타임아웃 - 강제 해제"));
    serial3Owner = SERIAL3_IDLE;
  }

  // 우선순위 기반 접근 제어
  if (serial3Owner != SERIAL3_IDLE)
  {
    // 현재 사용자와 같은 경우만 허용
    if (serial3Owner == requester)
    {
      serial3LastUsed = currentTime;
      return true;
    }

    // 우선순위 체크
    int currentPriority = getPriority(serial3Owner);
    int requestPriority = getPriority(requester);

    if (requestPriority >= currentPriority)
    {
      return false; // 현재 사용자가 더 높은 우선순위
    }

    // 더 높은 우선순위 요청이면 현재 사용자 강제 해제
    Serial.print(F("🔄 Serial3 강제 해제: "));
    Serial.print(serial3Owner);
    Serial.print(F(" -> "));
    Serial.println(requester);
  }

  // 접근 허용
  serial3Owner = requester;
  serial3LastUsed = currentTime;
  return true;
}

int getPriority(Serial3Owner owner)
{
  switch (owner)
  {
  case SERIAL3_UNO_CONTROL:
    return PRIORITY_UNO_CONTROL;
  case SERIAL3_NPN:
    return PRIORITY_NPN;
  case SERIAL3_UNO_SENSOR:
    return PRIORITY_UNO_SENSOR;
  default:
    return 999; // IDLE은 최저 우선순위
  }
}

void releaseSerial3Access()
{
  serial3Owner = SERIAL3_IDLE;
  serial3LastUsed = millis();
}

bool isSerial3Available()
{
  return serial3Owner == SERIAL3_IDLE &&
         (millis() - serial3LastUsed) >= serial3CooldownTime;
}

bool isSerial3AvailableFor(Serial3Owner requester)
{
  unsigned long currentTime = millis();

  // 쿨다운 시간 체크
  if (currentTime - serial3LastUsed < serial3CooldownTime)
  {
    return false;
  }

  // IDLE 상태이거나 같은 사용자
  if (serial3Owner == SERIAL3_IDLE || serial3Owner == requester)
  {
    return true;
  }

  // 우선순위 체크 - 요청자가 더 높은 우선순위인지 확인
  int currentPriority = getPriority(serial3Owner);
  int requestPriority = getPriority(requester);

  return requestPriority < currentPriority; // 낮은 숫자가 높은 우선순위
}

// ============= Non-blocking 센서 요청 시스템 =============

// Non-blocking 센서 요청 시스템 변수
UnoRequestState unoRequestState = UNO_IDLE;
unsigned long unoRequestStartTime = 0;
String unoResponseBuffer = "";

// Non-blocking 상태 요청 시스템 변수
UnoRequestState unoStatusRequestState = UNO_IDLE;
unsigned long unoStatusRequestStartTime = 0;
String unoStatusResponseBuffer = "";

// UNO 상태 데이터 구조
struct UnoNutrientStatus {
  int8_t cycle;
  uint8_t status;
  bool time_received;
  String current_time;
  bool in_range;
  bool cycle_started_today;
  uint8_t relays[10];
  uint8_t rm; // 실행 분
  uint8_t rs; // 실행 초
  uint8_t rh; // 대기 시간
  uint8_t rm_wait; // 대기 분
  uint8_t rs_wait; // 대기 초
  float ph;
  float ec;
  float temp;
  bool isValid;
  unsigned long lastUpdate;
};

UnoNutrientStatus unoNutrientStatus = {0};

void initUnoSensorRequest()
{
  unoRequestState = UNO_IDLE;
  unoResponseBuffer = "";
}

void startUnoSensorRequest()
{
  // 제어용 UNO 존재하기 전에는 요청 비활성화
  if (!unoControlPresent) return;
  if (unoRequestState != UNO_IDLE)
  {
    // 10초 이상 요청 중이면 강제 초기화
    if (millis() - unoRequestStartTime > 10000)
    {
      unoRequestState = UNO_IDLE;
      serial3Owner = SERIAL3_IDLE;
      unoResponseBuffer = "";
    }
    else
    {
      return; // 이미 요청 중이면 무시
    }
  }

  // Serial3 접근 요청 (최저 우선순위) - 제어 명령 우선
  if (!requestSerial3Access(SERIAL3_UNO_SENSOR))
  {
    // UNO 센서 요청은 제어 명령이 없을 때만 처리
    if (serial3Owner == SERIAL3_IDLE && (millis() - serial3LastUsed) > 5000)
    { // 2초 → 5초로 증가
      serial3Owner = SERIAL3_UNO_SENSOR;
      serial3LastUsed = millis();
    }
    else
    {
      return;
    }
  }

  unoRequestState = UNO_SENDING;
  unoRequestStartTime = millis();
  unoResponseBuffer = "";

  // ========== 프로토콜: CMD_SENSOR_REQUEST(0x25) + PARAM(0x00) = 2바이트 (no \n) ==========
  Serial.println(F("📤 SENSOR 요청"));
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_SENSOR_REQUEST);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 없음
  RS485_CONTROL_SERIAL.flush();
  
  // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 수신 모드 전환
  RS485_CTRL_RX();

  unoRequestState = UNO_WAITING;
}

bool updateUnoSensorRequest()
{
  switch (unoRequestState)
  {
  case UNO_IDLE:
    return false; // 요청 중이 아님

  case UNO_SENDING:
    // 전송 중 (이미 startUnoSensorRequest에서 처리됨)
    return true;

  case UNO_WAITING:
  case UNO_RECEIVING:
    // 바이트 기반 응답 수신 중
    if (RS485_CONTROL_SERIAL.available() >= 8)
    { // 센서 데이터 8바이트 대기
      uint8_t responseCode = RS485_CONTROL_SERIAL.read();

      if (responseCode == ACK_SENSOR_DATA)
      {
        // ========== 프로토콜: ACK_SENSOR_DATA(0x82) + pH_H + pH_L + EC_H + EC_L + TEMP_H + TEMP_L + RESERVED = 8바이트 ==========
        uint8_t ph_high = RS485_CONTROL_SERIAL.read();
        uint8_t ph_low = RS485_CONTROL_SERIAL.read();
        uint8_t ec_high = RS485_CONTROL_SERIAL.read();
        uint8_t ec_low = RS485_CONTROL_SERIAL.read();
        uint8_t temp_high = RS485_CONTROL_SERIAL.read();
        uint8_t temp_low = RS485_CONTROL_SERIAL.read();
        uint8_t reserved = RS485_CONTROL_SERIAL.read();

        // 데이터 변환
        uint16_t ph_int = (ph_high << 8) | ph_low;
        uint16_t ec_int = (ec_high << 8) | ec_low;
        uint16_t temp_int = (temp_high << 8) | temp_low;

        // float로 변환
        unoSensorData.ph = ph_int / 100.0f;            // pH * 100 → pH
        unoSensorData.ec = (ec_int * 10.0f) / 1000.0f; // (EC/10) * 10 / 1000 → dS/m
        unoSensorData.waterTemp = temp_int / 10.0f;    // TEMP * 10 → TEMP
        unoSensorData.isValid = true;

        Serial.print(F("📥 SENSOR: pH="));
        Serial.print(unoSensorData.ph, 2);
        Serial.print(F(", EC="));
        Serial.print(unoSensorData.ec, 3);
        Serial.print(F("dS/m, TEMP="));
        Serial.print(unoSensorData.waterTemp, 1);
        Serial.println(F("°C"));

        // 응답 완료
        unoRequestState = UNO_IDLE;
        releaseSerial3Access(); // Serial3 접근 해제

        return false; // 요청 완료
      }
      else
      {
        Serial.print(F("❌ SENSOR 응답 오류: 0x"));
        Serial.println(responseCode, HEX);
        unoRequestState = UNO_IDLE;
        releaseSerial3Access();
        unoSensorData.isValid = false;
        return false;
      }
    }
    else
    {
      // 타임아웃 체크
      if (millis() - unoRequestStartTime > 10000)
      { // 10초 타임아웃
        Serial.println(F("⏱ SENSOR 응답 타임아웃"));
        unoRequestState = UNO_IDLE;
        releaseSerial3Access();
        unoSensorData.isValid = false;
        return false;
      }
}
    return true; // 아직 처리 중

  default:
    unoRequestState = UNO_IDLE;
    return false;
  }
}

// ============= Non-blocking 상태 요청 시스템 =============

void initUnoStatusRequest()
{
  unoStatusRequestState = UNO_IDLE;
  unoStatusResponseBuffer = "";
  unoNutrientStatus.isValid = false;
}

void startUnoStatusRequest()
{
  // 제어용 UNO 존재하기 전에는 요청 비활성화
  if (!unoControlPresent) return;
  if (unoStatusRequestState != UNO_IDLE)
  {
    // 10초 이상 요청 중이면 강제 초기화
    if (millis() - unoStatusRequestStartTime > 10000)
    {
      unoStatusRequestState = UNO_IDLE;
      serial3Owner = SERIAL3_IDLE;
      unoStatusResponseBuffer = "";
    }
    else
    {
      return; // 이미 요청 중이면 무시
    }
  }

  // Serial3 접근 요청 (최저 우선순위) - 제어 명령 우선
  if (!requestSerial3Access(SERIAL3_UNO_SENSOR))
  {
    // UNO 상태 요청은 제어 명령이 없을 때만 처리
    if (serial3Owner == SERIAL3_IDLE && (millis() - serial3LastUsed) > 5000)
    {
      serial3Owner = SERIAL3_UNO_SENSOR;
      serial3LastUsed = millis();
    }
    else
    {
      return;
    }
  }

  unoStatusRequestState = UNO_SENDING;
  unoStatusRequestStartTime = millis();
  unoStatusResponseBuffer = "";

  // ========== 프로토콜: CMD_STATUS_REQUEST(0x33) + PARAM(0x00) = 2바이트 (no \n) ==========
  Serial.println(F("📤 STATUS 요청"));
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CONTROL_SERIAL.write((uint8_t)CMD_STATUS_REQUEST);
  RS485_CONTROL_SERIAL.write((uint8_t)0x00); // 파라미터 없음
  RS485_CONTROL_SERIAL.flush();
  
  // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 수신 모드 전환
  RS485_CTRL_RX();

  unoStatusRequestState = UNO_WAITING;
}

bool updateUnoStatusRequest()
{
  switch (unoStatusRequestState)
  {
  case UNO_IDLE:
    return false; // 요청 중이 아님

  case UNO_SENDING:
    // 전송 중 (이미 startUnoStatusRequest에서 처리됨)
    return true;

  case UNO_WAITING:
  case UNO_RECEIVING:
    // 길이 기반 프로토콜 응답 수신: ACK_STATUS_DATA(0x83) + LEN_H(1) + LEN_L(1) + JSON(N)
    if (RS485_CONTROL_SERIAL.available() >= 3)
    {
      uint8_t responseCode = RS485_CONTROL_SERIAL.read();
      
      if (responseCode == ACK_STATUS_DATA)
      {
        // 길이 헤더 읽기 (2바이트, big-endian)
        uint8_t lenHigh = RS485_CONTROL_SERIAL.read();
        uint8_t lenLow = RS485_CONTROL_SERIAL.read();
        uint16_t jsonLen = (lenHigh << 8) | lenLow;
        if (jsonLen > 255) jsonLen = 255; // 최대 길이 제한
        
        // JSON 데이터 읽기 (타임아웃: 2초로 증가)
        char jsonStr[256] = {0};
        uint16_t received = 0;
        unsigned long startTime = millis();
        while (millis() - startTime < 2000 && received < jsonLen) {
          while (RS485_CONTROL_SERIAL.available() && received < jsonLen) {
            jsonStr[received++] = RS485_CONTROL_SERIAL.read();
          }
          if (received < jsonLen) {
            delay(2); // 데이터 대기 시간 증가
          }
        }
        
        if (received == jsonLen) {
          jsonStr[jsonLen] = '\0';
          
          // 디버깅: 수신된 JSON 길이 출력
          Serial.print(F("📥 STATUS JSON 수신: "));
          Serial.print(received);
          Serial.print(F("B"));
          if (received < 50) {
            Serial.print(F(" ["));
            Serial.print(jsonStr);
            Serial.print(F("]"));
          }
          Serial.println();
          
          // JSON 파싱
          StaticJsonDocument<256> doc;
          DeserializationError error = deserializeJson(doc, jsonStr);
          
          if (!error) {
            // 상태 데이터 저장
            unoNutrientStatus.cycle = doc["cycle"] | -1;
            unoNutrientStatus.status = doc["status"] | 0;
            unoNutrientStatus.time_received = doc["time_received"] | 0;
            unoNutrientStatus.current_time = doc["current_time"].as<String>();
            unoNutrientStatus.in_range = doc["in_range"] | 0;
            unoNutrientStatus.cycle_started_today = doc["cycle_started_today"] | 0;
            
            // 릴레이 상태
            if (doc.containsKey("relays") && doc["relays"].is<JsonArray>()) {
              JsonArray relays = doc["relays"];
              for (uint8_t i = 0; i < 10 && i < relays.size(); i++) {
                unoNutrientStatus.relays[i] = relays[i] | 0;
              }
            }
            
            // 타이머 정보
            unoNutrientStatus.rm = doc["rm"] | 0;
            unoNutrientStatus.rs = doc["rs"] | 0;
            unoNutrientStatus.rh = doc["rh"] | 0;
            unoNutrientStatus.rm_wait = doc["rm_wait"] | 0;
            unoNutrientStatus.rs_wait = doc["rs_wait"] | 0;
            
            // 센서 데이터
            if (doc.containsKey("sensors")) {
              JsonObject sensors = doc["sensors"];
              unoNutrientStatus.ph = sensors["ph"] | 0.0f;
              unoNutrientStatus.ec = sensors["ec"] | 0.0f;
              unoNutrientStatus.temp = sensors["temp"] | 0.0f;
            }
            
            unoNutrientStatus.isValid = true;
            unoNutrientStatus.lastUpdate = millis();
            
            Serial.println(F("📥 STATUS 수신 완료"));
            
            // 서버로 즉시 전송
            sendStatusToMQTT();
          } else {
            Serial.print(F("❌ STATUS JSON 파싱 오류: "));
            Serial.println(error.f_str());
            unoNutrientStatus.isValid = false;
          }
        } else {
          Serial.print(F("❌ STATUS JSON 불완전: "));
          Serial.print(received);
          Serial.print(F("/"));
          Serial.print(jsonLen);
          Serial.print(F("B (타임아웃: "));
          Serial.print(millis() - startTime);
          Serial.println(F("ms)"));
          unoNutrientStatus.isValid = false;
        }
        
        // 응답 완료
        unoStatusRequestState = UNO_IDLE;
        releaseSerial3Access(); // Serial3 접근 해제
        
        return false; // 요청 완료
      }
      else
      {
        Serial.print(F("❌ STATUS 응답 오류: 0x"));
        Serial.println(responseCode, HEX);
        unoStatusRequestState = UNO_IDLE;
        releaseSerial3Access();
        unoNutrientStatus.isValid = false;
        return false;
      }
    }
    else
    {
      // 타임아웃 체크
      if (millis() - unoStatusRequestStartTime > 10000)
      { // 10초 타임아웃
        Serial.println(F("⏱ STATUS 응답 타임아웃"));
        unoStatusRequestState = UNO_IDLE;
        releaseSerial3Access();
        unoNutrientStatus.isValid = false;
        return false;
      }
    }
    return true; // 아직 처리 중

  default:
    unoStatusRequestState = UNO_IDLE;
    return false;
  }
}

// ============= UNO 상태 기반 서버 전송 함수 =============
bool sendStatusToMQTT()
{
  if (!mqttConnected || !unoNutrientStatus.isValid) {
    return false;
  }
  
  // 메모리 최적화: JSON 문서 크기 축소 (512 → 384)
  StaticJsonDocument<384> statusDoc;
  statusDoc.clear();
  
  // 기본 정보 (UNO에서 받은 데이터 사용)
  statusDoc["id"] = "status";
  statusDoc["ts"] = millis();
  statusDoc["cycle"] = unoNutrientStatus.cycle;
  statusDoc["status"] = unoNutrientStatus.status;
  statusDoc["time_received"] = unoNutrientStatus.time_received ? 1 : 0;
  statusDoc["current_time"] = unoNutrientStatus.current_time;
  statusDoc["in_range"] = unoNutrientStatus.in_range ? 1 : 0;
  statusDoc["cycle_started_today"] = unoNutrientStatus.cycle_started_today ? 1 : 0;
  
  // 릴레이 상태 정보
  JsonArray relays = statusDoc.createNestedArray("relays");
  for (uint8_t i = 0; i < 10; i++) {
    relays.add(unoNutrientStatus.relays[i]);
  }
  
  // 타이머 정보
  statusDoc["rm"] = unoNutrientStatus.rm;
  statusDoc["rs"] = unoNutrientStatus.rs;
  
  // 대기 시간
  statusDoc["rh"] = unoNutrientStatus.rh;
  statusDoc["rm_wait"] = unoNutrientStatus.rm_wait;
  statusDoc["rs_wait"] = unoNutrientStatus.rs_wait;
  
  // 센서 데이터
  JsonObject sensors = statusDoc.createNestedObject("sensors");
  sensors["ph"] = unoNutrientStatus.ph;
  sensors["ec"] = unoNutrientStatus.ec;
  sensors["temp"] = unoNutrientStatus.temp;
  
  // String 객체 제거: char 배열 사용 (메모리 최적화)
  char statusJson[400] = {0};
  size_t jsonLen = serializeJson(statusDoc, statusJson, sizeof(statusJson));
  if (jsonLen >= sizeof(statusJson)) {
    jsonLen = sizeof(statusJson) - 1; // null 문자 공간 확보
  }
  
  // 토픽도 char 배열로 구성 (String 제거)
  char statusTopic[64] = {0};
  snprintf_P(statusTopic, sizeof(statusTopic), PSTR("nutrient/status/%s"), DEVICE_ID);
  
  bool published = mqttClient.publish(statusTopic, statusJson);
  
  if (published) {
    Serial.println(F("📡 STATUS 서버 전송 완료"));
  } else {
    Serial.println(F("❌ STATUS 서버 전송 실패"));
  }
  
  return published;
}

// ============= UNO ACK 서버 전달 함수 =============

// 전역 변수: 현재 처리 중인 UNO 명령의 command_id
String currentUnoCommandId = "";

void sendUnoAckToServer(const char* command, uint8_t channel, bool success, const char* commandId) {
  // MQTT로 서버에 ACK 전달
  if (mqttClient.connected()) {
    String topic = "modbus/command-responses/" + String(DEVICE_ID);
    
    // JSON 응답 생성
    String response = "{";
    // command_id 우선순위: 파라미터 > 전역 변수 > 생성
    const char* finalCommandId = nullptr;
    if (commandId && strlen(commandId) > 0) {
      finalCommandId = commandId;
    } else if (currentUnoCommandId.length() > 0) {
      finalCommandId = currentUnoCommandId.c_str();
    }
    
    if (finalCommandId) {
      // 서버가 보낸 원래 command_id 사용
      response += "\"command_id\":\"" + String(finalCommandId) + "\",";
    } else {
      // command_id가 없으면 생성 (하위 호환성)
      response += "\"command_id\":\"uno_ack_" + String(millis()) + "\",";
    }
    response += "\"kind\":\"UNO_MODULE\",";
    response += "\"command\":\"" + String(command) + "\",";
    response += "\"channel\":" + String(channel) + ",";
    response += "\"success\":" + String(success ? "true" : "false") + ",";
    response += "\"timestamp\":\"" + String(millis()) + "\"";
    response += "}";
    
    Serial.print(F("📤 서버로 ACK 전달: "));
    Serial.println(response);
    
    mqttClient.publish(topic.c_str(), response.c_str());
    
    // command_id 사용 후 초기화
    currentUnoCommandId = "";
  } else {
    Serial.println(F("❌ MQTT 연결 없음 - ACK 전달 실패"));
  }
}

// UNO로 nutCycle 설정 전달 함수
void sendNutrientConfigToUno(const char* jsonConfig) {
  // ========== 프로토콜: CMD_NUTCYCLE_CONFIG(0x32) + LEN_H(1) + LEN_L(1) + JSON(N) ==========
  
  // JSON 파싱하여 STOP 명령인지 확인
  StaticJsonDocument<128> doc;
  bool isStopCommand = false;
  if (deserializeJson(doc, jsonConfig) == DeserializationError::Ok) {
    if (doc.containsKey("cmd")) {
      String cmd = doc["cmd"].as<String>();
      cmd.toUpperCase();
      isStopCommand = (cmd == "STOP");
    }
  }
  
  size_t jsonLen = strlen(jsonConfig);
  if (jsonLen > 256) jsonLen = 256; // 최대 길이 제한
  
  // 재시도 횟수 설정 (STOP 명령은 최대 3회, 일반 명령은 1회)
  uint8_t maxRetries = isStopCommand ? 3 : 1;
  bool success = false;
  
  for (uint8_t retry = 0; retry < maxRetries; retry++) {
    if (retry > 0) {
      Serial.print(F("🔄 재시도 "));
      Serial.print(retry);
      Serial.print(F("/"));
      Serial.print(maxRetries - 1);
      Serial.println();
      delay(100); // 재시도 전 대기
    }
    
    while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();
    
    Serial.print(F("📤 JSON 전송: "));
    Serial.print(jsonLen);
    Serial.println(F("B"));
    
    // 송신 시퀀스
    RS485_CTRL_TX();
    delayMicroseconds(RS485_TURNAROUND_US);
    
    // 명령 코드 전송
    RS485_CONTROL_SERIAL.write((uint8_t)0x32); // CMD_NUTCYCLE_CONFIG
    
    // 길이 헤더 전송 (2바이트, big-endian)
    RS485_CONTROL_SERIAL.write((uint8_t)((jsonLen >> 8) & 0xFF)); // 상위 바이트
    RS485_CONTROL_SERIAL.write((uint8_t)(jsonLen & 0xFF));       // 하위 바이트
    
    // JSON 데이터 전송 (바이너리, \n 없음)
    for (size_t i = 0; i < jsonLen; i++) {
      RS485_CONTROL_SERIAL.write((uint8_t)jsonConfig[i]);
    }
    RS485_CONTROL_SERIAL.flush();
    
    // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
    delayMicroseconds(RS485_TURNAROUND_US);
    
    // 수신 모드 전환
    RS485_CTRL_RX();
    
    // ACK 수신 대기 (타임아웃: 500ms)
    unsigned long startTime = millis();
    bool ackReceived = false;
    bool ackError = false;
    
    while (millis() - startTime < 500) {
      if (RS485_CONTROL_SERIAL.available()) {
        uint8_t ackCode = RS485_CONTROL_SERIAL.read();
        if (ackCode == ACK_OK) {
          ackReceived = true;
          success = true;
          break;
        } else if (ackCode == ACK_ERROR) {
          ackError = true;
          break; // 명시적 에러
        }
      }
      delay(1);
    }
    
    if (ackReceived) {
      if (isStopCommand && retry > 0) {
        Serial.print(F("✅ STOP 명령 전달 성공 (재시도 "));
        Serial.print(retry);
        Serial.println(F("회)"));
      } else {
        Serial.println(F("✅ nutCycle 설정 전달 성공"));
      }
      break; // 성공 시 루프 종료
    } else {
      // ACK를 못 받은 경우 (타임아웃 또는 ACK_ERROR)
      if (ackError) {
        if (isStopCommand && retry < maxRetries - 1) {
          Serial.println(F("❌ ACK_ERROR - 재시도 예정"));
        } else {
          Serial.println(F("❌ nutCycle 설정 전달 실패 (ACK_ERROR)"));
          if (!isStopCommand) break; // 일반 명령은 ACK_ERROR 시 즉시 종료
        }
      } else {
        // 타임아웃
        if (retry < maxRetries - 1) {
          Serial.println(F("❌ 타임아웃 - 재시도 예정"));
        } else {
          Serial.println(F("❌ nutCycle 설정 전달 실패 (타임아웃)"));
        }
      }
    }
  }
}

// ============= 센서 상태 모니터링 함수들 (UNO가 담당하므로 주석처리) =============
/*
// 센서 상태 업데이트
void updateSensorStatus(uint8_t slaveId, bool success) {
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (modbusSensors[i].slaveId == slaveId) {
      if (success) {
        modbusSensors[i].isOnline = true;
        modbusSensors[i].lastResponse = millis();
        modbusSensors[i].consecutiveFailures = 0;
        Serial.print(F("✅ 센서 "));
        Serial.print(slaveId);
        Serial.println(F(" 온라인"));
      } else {
        modbusSensors[i].consecutiveFailures++;
        if (modbusSensors[i].consecutiveFailures >= 3) {
          modbusSensors[i].isOnline = false;
          Serial.print(F("❌ 센서 "));
          Serial.print(slaveId);
          Serial.println(F(" 오프라인 (3회 연속 실패)"));
        }
      }
      break;
    }
  }
}

// 센서 온라인 상태 확인
bool isSensorOnline(uint8_t slaveId) {
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (modbusSensors[i].slaveId == slaveId) {
      return modbusSensors[i].isOnline;
    }
  }
  return false;
}

// 센서 헬스체크 수행
void performHealthCheck() {
  static unsigned long lastHealthCheck = 0;
  unsigned long currentTime = millis();
  
  // 30초마다 헬스체크 수행
  if (currentTime - lastHealthCheck < 30000) {
    return;
  }
  lastHealthCheck = currentTime;
  
  Serial.println(F("🔍 센서 헬스체크 시작"));
  
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (!modbusSensors[i].active) continue;
    
    // 간단한 읽기 요청으로 센서 상태 확인
    uint16_t testData[2];
    bool success = readModbusRegisters(modbusSensors[i].slaveId, 0, 2, testData);
    
    updateSensorStatus(modbusSensors[i].slaveId, success);
    
    if (success) {
      Serial.print(F("✅ 센서 "));
      Serial.print(modbusSensors[i].slaveId);
      Serial.print(F(" ("));
      Serial.print(modbusSensors[i].name);
      Serial.println(F(") 정상"));
    } else {
      Serial.print(F("❌ 센서 "));
      Serial.print(modbusSensors[i].slaveId);
      Serial.print(F(" ("));
      Serial.print(modbusSensors[i].name);
      Serial.println(F(") 응답 없음"));
    }
    
    delay(100); // 센서 간 간격
  }
  
  Serial.println(F("🔍 센서 헬스체크 완료"));
}

// 센서 실패 카운트 리셋
void resetSensorFailureCount(uint8_t slaveId) {
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (modbusSensors[i].slaveId == slaveId) {
      modbusSensors[i].consecutiveFailures = 0;
      break;
    }
  }
}

// 센서 오프라인 마킹
void markSensorOffline(uint8_t slaveId) {
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (modbusSensors[i].slaveId == slaveId) {
      modbusSensors[i].isOnline = false;
      modbusSensors[i].consecutiveFailures = 0;
      break;
    }
  }
}

// 센서 온라인 마킹
void markSensorOnline(uint8_t slaveId) {
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (modbusSensors[i].slaveId == slaveId) {
      modbusSensors[i].isOnline = true;
      modbusSensors[i].lastResponse = millis();
      modbusSensors[i].consecutiveFailures = 0;
      break;
    }
  }
}

// 전체 센서 상태 체크
void checkSensorHealth() {
  unsigned long currentTime = millis();
  
  for (uint8_t i = 0; i < modbusSlaveCount; i++) {
    if (!modbusSensors[i].active) continue;
    
    // 5분 이상 응답이 없으면 오프라인으로 마킹
    if (currentTime - modbusSensors[i].lastResponse > 300000) {
      if (modbusSensors[i].isOnline) {
        modbusSensors[i].isOnline = false;
        Serial.print(F("⚠️ 센서 "));
        Serial.print(modbusSensors[i].slaveId);
        Serial.print(F(" ("));
        Serial.print(modbusSensors[i].name);
        Serial.println(F(") 타임아웃 - 오프라인"));
      }
    }
  }
}
*/

// ============= I2C 센서 Modbus 통합 함수들 (UNO가 담당하므로 주석처리) =============
/*
// SHT20 온습도 센서 읽기 (Modbus)
bool readSHT20Modbus(uint8_t slaveId, float* temp, float* humid) {
  uint16_t data[2];
  bool success = readModbusRegisters(slaveId, 0, 2, data);
  
  if (success) {
    // 레지스터 값을 실제 값으로 변환
    *temp = (float)data[0] / 100.0f;   // 온도 (×100으로 전송)
    *humid = (float)data[1] / 100.0f;  // 습도 (×100으로 전송)
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}

// SCD41 CO2 센서 읽기 (Modbus)
bool readSCD41Modbus(uint8_t slaveId, float* co2_ppm) {
  uint16_t data[1];
  bool success = readModbusRegisters(slaveId, 0, 1, data);
  
  if (success) {
    *co2_ppm = (float)data[0];  // CO2 ppm 값
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}

// TSL2591 조도 센서 읽기 (Modbus)
bool readTSL2591Modbus(uint8_t slaveId, float* lux, uint16_t* visible, uint16_t* infrared) {
  uint16_t data[3];
  bool success = readModbusRegisters(slaveId, 0, 3, data);
  
  if (success) {
    *lux = (float)data[0] / 10.0f;  // lux (×10으로 전송)
    *visible = data[1];              // 가시광
    *infrared = data[2];            // 적외선
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}

// BH1750 조도 센서 읽기 (Modbus)
bool readBH1750Modbus(uint8_t slaveId, float* lux) {
  uint16_t data[1];
  bool success = readModbusRegisters(slaveId, 0, 1, data);
  
  if (success) {
    *lux = (float)data[0] / 10.0f;  // lux (×10으로 전송)
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}

// ADS1115 pH/EC 센서 읽기 (Modbus)
bool readADS1115Modbus(uint8_t slaveId, float* ph_val, float* ec_val, float* water_temp) {
  uint16_t data[3];
  bool success = readModbusRegisters(slaveId, 0, 3, data);
  
  if (success) {
    *ph_val = (float)data[0] / 100.0f;      // pH (×100으로 전송)
    *ec_val = (float)data[1] / 100.0f;       // EC (×100으로 전송)
    *water_temp = (float)data[2] / 100.0f;  // 수온 (×100으로 전송)
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}

// DS18B20 온도 센서 읽기 (Modbus)
bool readDS18B20Modbus(uint8_t slaveId, float* temperature) {
  uint16_t data[1];
  bool success = readModbusRegisters(slaveId, 0, 1, data);
  
  if (success) {
    *temperature = (float)data[0] / 100.0f;  // 온도 (×100으로 전송)
    updateSensorStatus(slaveId, true);
    return true;
  } else {
    updateSensorStatus(slaveId, false);
    return false;
  }
}
*/

// 🔥 다중 릴레이 명령 처리 함수 (비트연산 방식)
bool handleMultiRelayCommand(const String &action, JsonArray &channels, String &response)
{
  String actionUpper = action;
  actionUpper.toUpperCase();
  
  // 비트마스크 생성 (0-9번 채널만 지원)
  uint8_t bitmask = 0;
  String channelList = "";
  for (int i = 0; i < channels.size(); i++) {
    uint8_t channel = channels[i].as<uint8_t>();
    if (channel < 10) { // UNO는 10개 채널만 지원
      bitmask |= (1 << channel);
      if (channelList.length() > 0) channelList += ",";
      channelList += String(channel);
    }
  }
  
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();
  
  if (actionUpper == "ON")
  {
    // ========== 프로토콜: CMD_MULTI_ON(0x30) + BITMASK(1) + \n(0x0A) = 3바이트 ==========
    Serial.print(F("📤 MULTI_ON ["));
    Serial.print(channelList);
    Serial.print(F("] bitmask=0x"));
    Serial.println(bitmask, HEX);
    
    // 송신 시퀀스
    RS485_CTRL_TX();
    delayMicroseconds(RS485_TURNAROUND_US);
    RS485_CONTROL_SERIAL.write((uint8_t)0x30); // CMD_MULTI_ON
    RS485_CONTROL_SERIAL.write(bitmask);
    RS485_CONTROL_SERIAL.write('\n');
    RS485_CONTROL_SERIAL.flush();
    
    // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
    delayMicroseconds(RS485_TURNAROUND_US);
    
    // 수신 모드 전환
    RS485_CTRL_RX();
    
    // ACK 수신 대기 (타임아웃: 50ms - 다중 릴레이 처리 시간 고려)
    unsigned long startTime = millis();
    bool ackReceived = false;
    while (millis() - startTime < 50) {
      if (RS485_CONTROL_SERIAL.available()) {
        uint8_t ackCode = RS485_CONTROL_SERIAL.read();
        if (ackCode == ACK_OK) {
          ackReceived = true;
          break;
        } else if (ackCode == ACK_ERROR) {
          break;
        }
      }
      delay(1);
    }
    
    if (ackReceived) {
      Serial.print(F("✅ MULTI_ON ["));
      Serial.print(channelList);
      Serial.println(F("]"));
      response = "MULTI_RELAY_ON_" + String(channels.size()) + "_BITS";
      return true;
    } else {
      Serial.print(F("❌ MULTI_ON ["));
      Serial.print(channelList);
      Serial.println(F("] (타임아웃)"));
      response = "MULTI_RELAY_ON_FAILED";
      return false;
    }
  }
  else if (actionUpper == "OFF")
  {
    // ========== 프로토콜: CMD_MULTI_OFF(0x31) + BITMASK(1) + \n(0x0A) = 3바이트 ==========
    Serial.print(F("📤 MULTI_OFF ["));
    Serial.print(channelList);
    Serial.print(F("] bitmask=0x"));
    Serial.println(bitmask, HEX);
    
    // 송신 시퀀스
    RS485_CTRL_TX();
    delayMicroseconds(RS485_TURNAROUND_US);
    RS485_CONTROL_SERIAL.write((uint8_t)0x31); // CMD_MULTI_OFF
    RS485_CONTROL_SERIAL.write(bitmask);
    RS485_CONTROL_SERIAL.write('\n');
    RS485_CONTROL_SERIAL.flush();
    
    // 마지막 바이트 선로 이탈 가드 (테스트 코드와 동일)
    delayMicroseconds(RS485_TURNAROUND_US);
    
    // 수신 모드 전환
    RS485_CTRL_RX();
    
    // ACK 수신 대기 (타임아웃: 50ms - 다중 릴레이 처리 시간 고려)
    unsigned long startTime = millis();
    bool ackReceived = false;
    while (millis() - startTime < 50) {
      if (RS485_CONTROL_SERIAL.available()) {
        uint8_t ackCode = RS485_CONTROL_SERIAL.read();
        if (ackCode == ACK_OK) {
          ackReceived = true;
          break;
        } else if (ackCode == ACK_ERROR) {
          break;
        }
      }
      delay(1);
    }
    
    if (ackReceived) {
      Serial.print(F("✅ MULTI_OFF ["));
      Serial.print(channelList);
      Serial.println(F("]"));
      response = "MULTI_RELAY_OFF_" + String(channels.size()) + "_BITS";
      return true;
    } else {
      Serial.print(F("❌ MULTI_OFF ["));
      Serial.print(channelList);
      Serial.println(F("] (타임아웃)"));
      response = "MULTI_RELAY_OFF_FAILED";
      return false;
    }
  }
  else
  {
    response = "Invalid multi-relay action: " + action;
    return false;
  }
}

// ============= NPN 비트연산 제어 함수들 =============

// 🔥 NPN 다중 채널 제어 (비트연산 방식)
bool sendNPNMultiCommand(uint8_t cmd, uint16_t bitmask) {
  // Modbus RTU 프레임 구성: [SlaveAddr][Function][StartAddr_H][StartAddr_L][Count_H][Count_L][CRC_L][CRC_H]
  uint8_t frame[8];
  frame[0] = NPN_SLAVE_ADDRESS;  // Slave Address
  frame[1] = 0x10;               // Function Code (Write Multiple Coils)
  frame[2] = 0x00;               // Start Address High
  frame[3] = 0x00;               // Start Address Low
  frame[4] = (bitmask >> 8) & 0xFF;  // Count High (상위 8비트)
  frame[5] = bitmask & 0xFF;         // Count Low (하위 8비트)
  
  // CRC 계산
  uint16_t crc = calculateCRC16(frame, 6);
  frame[6] = crc & 0xFF;         // CRC Low
  frame[7] = (crc >> 8) & 0xFF;  // CRC High
  
  // 버퍼 비움
  while (RS485_CONTROL_SERIAL.available()) RS485_CONTROL_SERIAL.read();
  
  // RS485 전송
  RS485_CTRL_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  
  for (int i = 0; i < 8; i++) {
    RS485_CONTROL_SERIAL.write(frame[i]);
  }
  RS485_CONTROL_SERIAL.flush();
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_CTRL_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
  
  Serial.print(F("🔥 NPN 다중 제어: 0x"));
  Serial.print(cmd, HEX);
  Serial.print(F(", 비트마스크: 0x"));
  Serial.println(bitmask, HEX);
  
  // Modbus RTU 응답 대기 (Write Multiple Coils는 8바이트 응답)
  uint8_t response[8];
  uint8_t responseLen = 0;
  unsigned long startTime = millis();
  uint16_t timeout = 300;
  unsigned long endTime = startTime + timeout;

  // millis() 오버플로우 안전한 타임아웃 체크
  while ((long)(millis() - endTime) < 0)
  {
    while (RS485_CONTROL_SERIAL.available() && responseLen < sizeof(response))
    {
      response[responseLen++] = RS485_CONTROL_SERIAL.read();
    }
    
    // Modbus RTU Write Multiple Coils 응답은 정확히 8바이트
    if (responseLen >= 8)
    {
      // CRC 검증
      uint16_t receivedCRC = (response[7] << 8) | response[6];
      uint16_t calculatedCRC = calculateCRC16(response, 6);
      
      if (receivedCRC == calculatedCRC)
      {
        Serial.print(F("📥 NPN 다중 응답 수신: "));
        for (int i = 0; i < responseLen; i++)
        {
          Serial.print(F("0x"));
          if (response[i] < 0x10) Serial.print(F("0"));
          Serial.print(response[i], HEX);
          Serial.print(F(" "));
        }
        Serial.println(F("✅"));
        return true;
      }
      else
      {
        Serial.print(F("❌ NPN 다중 CRC 오류: rx=0x"));
        Serial.print(receivedCRC, HEX);
        Serial.print(F(" calc=0x"));
        Serial.println(calculatedCRC, HEX);
        return false;
      }
    }
    
    // UNO 명령과 동일하게 delay(1) 사용 (CPU 독점 방지)
    delay(1);
  }

  // 타임아웃
  Serial.print(F("⏱ NPN 다중 응답 타임아웃 (수신: "));
  Serial.print(responseLen);
  Serial.println(F(" 바이트)"));
  return false;
}

// 🔥 NPN 다중 채널 ON
bool npnMultiChannelOn(uint16_t channelMask) {
  return sendNPNMultiCommand(NPN_CMD_MULTI_ON, channelMask);
}

// 🔥 NPN 다중 채널 OFF  
bool npnMultiChannelOff(uint16_t channelMask) {
  return sendNPNMultiCommand(NPN_CMD_MULTI_OFF, channelMask);
}