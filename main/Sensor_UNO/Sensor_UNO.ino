/*
 * 센서 전용 Arduino UNO 코드
 * 
 * 기능:
 * - I2C 센서들 (SHT20, SCD41, TSL2591, BH1750, ADS1115, DS18B20) 읽기
 * - Modbus 센서들 (토양센서, 풍향/풍속, 강우/강설 등) 읽기
 * - RS485를 통해 Mega 2560의 Serial1과 Modbus RTU 통신
 * 
 * 하드웨어 구성:
 * - Arduino UNO
 * - I2C 센서들 (SDA: A4, SCL: A5)
 * - Modbus 센서들 (RS485)
 * - RS485 모듈 (MAX485) - Mega의 Serial1과 통신용
 * 
 * RS485 핀 연결 (UNO):
 * 
 * Modbus 센서 통신:
 * - DE/RE: Pin D7
 * - RO: Pin D2 (RX)
 * - DI: Pin D3 (TX)
 * - VCC: 5V, GND: GND
 * - Baud Rate: 4800
 * 
 * Mega 통신:
 * - DE/RE: Pin D6
 * - RO: Pin D0 (RX)
 * - DI: Pin D1 (TX)
 * - VCC: 5V, GND: GND
 * - Baud Rate: 57600
 * 
 * 통신 방식:
 * - Mega의 Serial1(RS485_SENSING, 57600)과 통신
 * - Mega가 Modbus 요청을 보내면 UNO가 응답
 * - 센서 데이터를 Mega가 기대하는 정확한 형식으로 전송
 * 
 * 센서 주소 범위 (Mega에서 기대하는 형식):
 * - I2C 센서들: 51-80 (각 타입별 5개씩)
 * - Modbus 센서들: 1-45 (기존 범위 유지)
 */

// ============= I2C 센서 선택 (한 번에 하나만 활성화) =============
// 메모리 절약을 위해 I2C 센서는 한 번에 하나씩만 활성화하세요.
// 원하는 센서만 1로 설정하고 나머지는 0으로 설정하세요.

// === SHT20 온습도 센서 펌웨어 ===
#define ENABLE_SHT20 0       // SHT20 온습도 센서
#define ENABLE_SCD41 0       // SCD41 CO2 센서
#define ENABLE_TSL2591 0     // TSL2591 조도 센서
#define ENABLE_BH1750 0      // BH1750 조도 센서 (간단)
#define ENABLE_ADS1115 0     // ADS1115 ADC
#define ENABLE_DS18B20 0     // DS18B20 온도 센서
#define ENABLE_PH_EC 0       // pH/EC 센서
#define CURRENT_SENSOR_TYPE SENSOR_SOIL  // 이 UNO에 연결된 센서 타입
#define CURRENT_SENSOR_NAME "SOIL"    // 센서 이름

// === 다른 센서용 펌웨어를 만들려면 위 설정을 변경하세요 ===
// SCD41용:   SHT20=0, SCD41=1, 나머지=0
// TSL2591용: SHT20=0, TSL2591=1, 나머지=0  
// BH1750용:  SHT20=0, BH1750=1, 나머지=0
// ADS1115용: SHT20=0, ADS1115=1, 나머지=0
// PH_EC용:   SHT20=0, PH_EC=1, 나머지=0

// Modbus 센서들은 항상 활성화 (라이브러리 불필요)
// - 토양센서, 풍향/풍속센서, 강우센서 등

#include <Wire.h>
#include <SoftwareSerial.h>
#include <string.h>
#define FLASHSTR(ptr) (reinterpret_cast<const __FlashStringHelper*>(ptr))

#if ENABLE_TSL2591
#include <Adafruit_TSL2591.h>
#endif

#if ENABLE_BH1750
#include <BH1750.h>
#endif

#if ENABLE_ADS1115
#include <Adafruit_ADS1X15.h>
#endif

#if ENABLE_DS18B20
#include <OneWire.h>
#include <DallasTemperature.h>
#endif

#if ENABLE_PH_EC
#include <DFRobot_PH.h>
#include <DFRobot_ECPRO.h>
#endif
#include <math.h>

// ============= 설정 =============
// 메모리 최적화를 위한 디버깅 옵션
#define ENABLE_DEBUG 0  // 0: 디버깅 비활성화, 1: 활성화 (프로젝트 디버깅용)

#if ENABLE_DEBUG
#define DEBUG_PRINT(x) Serial.print(F(x))
#define DEBUG_PRINTLN(x) Serial.println(F(x))
#define DEBUG_PRINT_VAR(x) Serial.print(x)
#define DEBUG_PRINTLN_VAR(x) Serial.println(x)
#else
#define DEBUG_PRINT(x)
#define DEBUG_PRINTLN(x)
#define DEBUG_PRINT_VAR(x)
#define DEBUG_PRINTLN_VAR(x)
#endif

// Modbus 센서 통신 (RS485)
#define MODBUS_SENSOR_RX 2    // D2
#define MODBUS_SENSOR_TX 3    // D3
#define MODBUS_SENSOR_DE_RE 7  // D7 (DE/RE 핀)
#define MODBUS_SENSOR_BAUD 4800

// Mega 통신 (RS485) - HardwareSerial 사용 (D0/D1)
#define MEGA_DE_RE 6   // D6 (DE/RE 핀)
#define MEGA_BAUD 57600

// HELLO 송신 제어 (최초 정상 응답 이후 중단)
static bool gHelloDone = false;

// ============= Phase 2: 랜덤 UNO ID 시스템 =============
// 부팅 시 자동으로 랜덤 ID 생성 (0~7)
// 사용자 설정 불필요, 모든 UNO에 동일한 펌웨어 업로드 가능!

// 현재 UNO에 연결된 센서 설정 (하드코딩)
#define ENROLL_PIN 9  // D9 - Mega D38~D43 중 하나와 1:1로 연결
static volatile uint8_t gUnoId = 0;

// 랜덤 UNO ID 생성 함수 (0~7 범위)
uint8_t generateRandomUnoId() {
  // Arduino의 A0 핀 플로팅 노이즈를 시드로 사용
  randomSeed(analogRead(A0));
  
  // 0~7 범위의 랜덤 ID 생성 (3비트)
  uint8_t randomId = random(8);
  
  #if ENABLE_DEBUG
  DEBUG_PRINT("🎲 랜덤 UNO ID 생성: ");
  DEBUG_PRINTLN_VAR(randomId);
  #endif
  
  return randomId;
}

#define SENSOR_READ_INTERVAL 5000  // 5초마다 센서 읽기
// ============= 하드코딩된 센서 설정 =============
// 펌웨어당 하나의 센서만 활성화하고 주소를 하드코딩
// 이 설정들을 변경하여 각 UNO에 맞는 펌웨어를 생성하세요

// ============= UNO ID 등록 함수 =============
// Mega의 D38~D43 핀에서 오는 펄스를 감지하여 UNO ID 할당
// 각 UNO는 D8 핀이 Mega의 D38~D43 중 하나와 1:1로 연결됨
// Mega가 각 핀에 (핀번호-37)번의 펄스를 전송하면, UNO가 이를 감지하여 ID로 사용
// 예: Mega D38 → 1번 펄스 → UNO ID = 1, Mega D39 → 2번 펄스 → UNO ID = 2, ...

// 블로킹 방식: Mega의 첫 펄스를 기다린 후 모든 라운드의 펄스를 수신
// Mega는 3라운드를 전송하므로 충분한 시간을 확보
// 반환값: 1~6 (Mega D38~D43에 대응), 0은 수신 실패
static uint8_t enrollUnoIdBlocking() {
  pinMode(ENROLL_PIN, INPUT_PULLUP);
  
        // 테스트 코드와 동일한 로직 사용
        // Mega 펄스 타이밍: HIGH 150ms + LOW 150ms = 300ms/펄스
        // 따라서 같은 시퀀스 내 펄스 간격은 최대 300ms
        const unsigned long TIMEOUT_MS = 300000;      // 첫 펄스 대기 타임아웃 (300초 = 5분) - Mega 초기화 시간 고려
        const unsigned long WINDOW_MS = 10000;         // 수집 윈도우 (10초)
        const unsigned long PULSE_GAP_MAX = 400;       // 같은 시퀀스 최대 간격 (400ms, 펄스 300ms + 여유)
        const unsigned long DEBOUNCE_MS = 5;           // 디바운스 시간 (5ms)
        const unsigned long NO_PULSE_TIMEOUT = 3000;   // 펄스 없음 타임아웃 (3초)

        #if ENABLE_DEBUG
        Serial.println(F("========================================"));
        Serial.println(F("🚀 UNO ID 할당 시작"));
        Serial.println(F("========================================"));
        Serial.println(F("⏳ Mega 펄스 대기 중... (180초 타임아웃)"));
        Serial.print(F("📍 ENROLL_PIN (D8) 초기 상태: "));
        bool initialState = digitalRead(ENROLL_PIN);
        Serial.print(initialState ? "HIGH" : "LOW");
        Serial.print(F(" (INPUT_PULLUP 모드)"));
        Serial.println();
        
        // 초기 상태 확인
        if (initialState == HIGH) {
          Serial.println(F("💡 초기 상태가 HIGH입니다."));
          Serial.println(F("   - Mega가 OUTPUT LOW면 LOW를 읽어야 합니다"));
          Serial.println(F("   - Mega가 아직 준비되지 않았거나 연결이 끊어졌을 수 있습니다"));
        } else {
          Serial.println(F("✅ 초기 상태가 LOW입니다. Mega가 OUTPUT LOW로 설정된 것으로 보입니다."));
        }
        Serial.println(F("----------------------------------------"));
        #endif

  unsigned long startTime = millis();
  unsigned long windowStart = 0;
  unsigned long lastPulseTime = 0;
  unsigned long lastChangeTime = millis();

  uint8_t pulseCount = 0;
  bool counting = false;

  bool lastState = digitalRead(ENROLL_PIN);

  // 첫 펄스 대기 (타임아웃 있음)
  while (true) {
    unsigned long now = millis();

    // 타임아웃 체크
    if (now - startTime > TIMEOUT_MS) {
      #if ENABLE_DEBUG
      Serial.println(F("========================================"));
      Serial.println(F("⏱️ 첫 펄스 타임아웃!"));
      Serial.println(F("❌ ID 할당 실패 - ID=0으로 진행"));
      Serial.println(F("========================================"));
      #endif
      return 0; // ID 할당 실패, 하지만 계속 진행 (UNO_ID=0)
    }

    // 1초마다 대기 상태 출력
    static unsigned long lastStatusPrint = 0;
    if (now - lastStatusPrint >= 1000) {
      lastStatusPrint = now;
      bool pinState = digitalRead(ENROLL_PIN);
      #if ENABLE_DEBUG
      Serial.print(F("⏰ 대기 중... 경과 시간: "));
      Serial.print((now - startTime) / 1000);
      Serial.print(F("초 / 현재 핀 상태: "));
      Serial.print(pinState ? "HIGH" : "LOW");
      Serial.print(F(" / 카운팅: "));
      Serial.print(counting ? "YES" : "NO");
      if (counting) {
        Serial.print(F(" / 펄스 카운트: "));
        Serial.print(pulseCount);
      }
      Serial.println();
      #endif
    }

    bool currentState = digitalRead(ENROLL_PIN);

    // 모든 상태 변화를 디버깅 출력 (디바운싱 전)
    if (currentState != lastState) {
      unsigned long changeGap = now - lastChangeTime;
      
      #if ENABLE_DEBUG
      // 상태 변화 즉시 출력
      Serial.print(F("🔍 [상태 변화] "));
      Serial.print(lastState ? "HIGH" : "LOW");
      Serial.print(F(" → "));
      Serial.print(currentState ? "HIGH" : "LOW");
      Serial.print(F(" (간격: "));
      Serial.print(changeGap);
      Serial.print(F("ms, 경과: "));
      Serial.print((now - startTime) / 1000);
      Serial.println(F("초)"));
      #endif

      // 디바운싱: 5ms 이상 변화만 유효
      if (changeGap > DEBOUNCE_MS) {
        // LOW -> HIGH (상승엣지)
        if (!lastState && currentState) {
          if (!counting) {
            // 첫 펄스 감지
            counting = true;
            windowStart = now;
            pulseCount = 1;
            lastPulseTime = now;
            
            #if ENABLE_DEBUG
            Serial.println(F("========================================"));
            Serial.println(F("✨ 첫 펄스 감지! 카운팅 시작"));
            Serial.println(F("========================================"));
            Serial.print(F("💓 펄스 #1 감지 ("));
            Serial.print(now - startTime);
            Serial.println(F("ms 후)"));
            #endif
          } else {
            // 다음 펄스
            unsigned long pulseGap = now - lastPulseTime;

            if (pulseGap <= PULSE_GAP_MAX) {
              // 같은 시퀀스
              pulseCount++;
              #if ENABLE_DEBUG
              Serial.print(F("💓 펄스 #"));
              Serial.print(pulseCount);
              Serial.print(F(" 감지 (간격: "));
              Serial.print(pulseGap);
              Serial.println(F("ms)"));
              #endif
            } else {
              // 긴 간격 = 새로운 시퀀스 시작
              #if ENABLE_DEBUG
              Serial.println(F("----------------------------------------"));
              Serial.print(F("⚠️  긴 간격 감지 ("));
              Serial.print(pulseGap);
              Serial.println(F("ms)"));
              Serial.print(F("📊 이전 시퀀스 카운트: "));
              Serial.println(pulseCount);
              #endif

              if (pulseCount >= 1 && pulseCount <= 6) {
                #if ENABLE_DEBUG
                Serial.println(F("========================================"));
                Serial.print(F("✅ 유효한 ID 할당: "));
                Serial.println(pulseCount);
                Serial.println(F("========================================"));
                #endif
                return pulseCount;
              }

              // 유효하지 않으면 새 시퀀스 시작
              #if ENABLE_DEBUG
              Serial.println(F("🔄 새 시퀀스 시작"));
              Serial.println(F("----------------------------------------"));
              #endif
              pulseCount = 1;
              windowStart = now;
              #if ENABLE_DEBUG
              Serial.println(F("💓 펄스 #1"));
              #endif
            }

            lastPulseTime = now;
          }
        }
        
        // HIGH -> LOW (하강엣지) 감지 출력
        if (lastState && !currentState) {
          #if ENABLE_DEBUG
          Serial.print(F("  ⬇️  하강엣지 감지 (경과: "));
          Serial.print((now - startTime) / 1000);
          Serial.print(F("초, 카운팅: "));
          Serial.print(counting ? "YES" : "NO");
          Serial.print(F(", 펄스 카운트: "));
          Serial.print(pulseCount);
          Serial.println(F(")"));
          #endif
        }

        lastState = currentState;
        lastChangeTime = now;
      }
    }

    // 수집 윈도우 종료 체크
    if (counting && (now - windowStart > WINDOW_MS)) {
      #if ENABLE_DEBUG
      Serial.println(F("========================================"));
      Serial.println(F("⏱️  수집 윈도우 종료 (10초 경과)"));
      Serial.print(F("📊 최종 카운트: "));
      Serial.println(pulseCount);
      #endif

      if (pulseCount >= 1 && pulseCount <= 6) {
        #if ENABLE_DEBUG
        Serial.println(F("----------------------------------------"));
        Serial.print(F("✅ 유효한 ID 할당: "));
        Serial.println(pulseCount);
        Serial.println(F("========================================"));
        #endif
        return pulseCount;
      } else {
        #if ENABLE_DEBUG
        Serial.println(F("----------------------------------------"));
        Serial.println(F("❌ 유효하지 않은 카운트 (범위: 1~6)"));
        Serial.println(F("🔄 계속 대기..."));
        Serial.println(F("========================================"));
        #endif
        counting = false;
        pulseCount = 0;
      }
    }

    // 펄스 없음 타임아웃 체크
    if (counting && (now - lastPulseTime > NO_PULSE_TIMEOUT)) {
      #if ENABLE_DEBUG
      Serial.println(F("⏱ 3초간 펄스 없음"));
      #endif

      if (pulseCount >= 1 && pulseCount <= 6) {
        #if ENABLE_DEBUG
        Serial.println(F("========================================"));
        Serial.print(F("✅ 유효한 ID 할당: "));
        Serial.println(pulseCount);
        Serial.println(F("========================================"));
        #endif
        return pulseCount;
      } else {
        #if ENABLE_DEBUG
        Serial.println(F("❌ 유효하지 않은 카운트"));
        #endif
        return 0;
      }
    }

    delay(1);
  }
}
// Phase 1: 다른 UNO용 펌웨어를 만들 때는 위 2줄만 변경하면 됩니다!
// 예시:
// - SCD41 센서: SENSOR_SCD41, "SCD41_01"
// - TSL2591 센서: SENSOR_TSL2591, "TSL2591_01"
// - 토양센서: SENSOR_SOIL, "SOIL_01"
// - 풍향센서: SENSOR_WIND_DIRECTION, "WIND_DIR_01"

#define MAX_SENSORS 1             // 하드코딩된 센서 1개만

// Modbus 설정
#define MODBUS_FUNCTION_READ 0x03
#define MODBUS_FUNCTION_WRITE 0x06

// Mega 제어 보드와의 바이트 기반 프로토콜 (modbusHandler.cpp와 호환)
#define CMD_SENSOR_REQUEST 0x25
// 🔥 재할당 명령 제거됨 - 디지털 핀 펄스 기반 초기 할당만 사용
#define ACK_SENSOR_DATA 0x82

// RS485 turnaround 시간
#define RS485_TURNAROUND_US 250   // Master 코드와 동일
#define RS485_INTERCHAR_US 100    // Master 코드와 동일

// 주소 변경 관련 설정
#define MIN_MODBUS_ADDRESS 1
#define MAX_MODBUS_ADDRESS 50
#define DEFAULT_MODBUS_ADDRESS 1

// I2C 센서 주소
#define SHT20_ADDRESS 0x40
#define SCD41_ADDRESS 0x62
#define TSL2591_ADDRESS 0x29
#define BH1750_ADDRESS 0x23
#define ADS1115_ADDRESS 0x48
#define DS18B20_PIN 3

// 주소 범위 매핑은 SensorType 정의 이후에 위치합니다.

// 센서 타입 정의 (Mega와 동일)
enum SensorType {
  // 기존 Modbus 센서들
  SENSOR_SOIL = 19,
  SENSOR_WIND_DIRECTION = 16,
  SENSOR_WIND_SPEED = 17,
  SENSOR_RAIN_SNOW = 18,
  SENSOR_TEMP_HUMID = 11,
  SENSOR_PRESSURE = 12,
  SENSOR_FLOW = 13,
  SENSOR_RELAY = 14,
  SENSOR_ENERGY_METER = 15,
  
  // I2C 센서들
  SENSOR_SHT20 = 21,
  SENSOR_SCD41 = 22,
  SENSOR_TSL2591 = 23,
  SENSOR_BH1750 = 24,
  SENSOR_ADS1115 = 25,
  SENSOR_DS18B20 = 26
};

// Forward declarations (SensorType 정의 이후)
bool isI2CSensor(SensorType type);
uint16_t getModbusRegisterCount(SensorType type);
uint8_t getMegaTypeCode(SensorType type);
void addSensor(uint8_t slaveId, SensorType type, const char* name);



// Modbus 센서 타입 정의 (주소 변경용)
enum ModbusSensorType {
  MODBUS_SENSOR_UNKNOWN = 0,
  MODBUS_SENSOR_SOIL = 1,        // 토양센서 (7 레지스터)
  MODBUS_SENSOR_WIND_DIRECTION = 2, // 풍향센서 (2 레지스터)
  MODBUS_SENSOR_WIND_SPEED = 3,     // 풍속센서 (1 레지스터)
  MODBUS_SENSOR_RAIN = 4            // 강우센서 (5 레지스터)
};

// 센서 정보 구조체
const char STR_MODBUS_UNKNOWN_NAME[] PROGMEM = u8"알 수 없는 센서";
const char STR_MODBUS_UNKNOWN_DESC[] PROGMEM = u8"타입을 확인할 수 없습니다";
const char STR_MODBUS_SOIL_NAME[] PROGMEM = u8"토양센서 (H,T,EC,PH,NPK)";
const char STR_MODBUS_SOIL_DESC[] PROGMEM = u8"습도, 온도, 전도도, pH, NPK";
const char STR_MODBUS_WIND_DIR_NAME[] PROGMEM = u8"풍향센서";
const char STR_MODBUS_WIND_DIR_DESC[] PROGMEM = u8"풍향 각도 및 기어값";
const char STR_MODBUS_WIND_SPEED_NAME[] PROGMEM = u8"풍속센서";
const char STR_MODBUS_WIND_SPEED_DESC[] PROGMEM = u8"풍속 m/s";
const char STR_MODBUS_RAIN_NAME[] PROGMEM = u8"강우센서 (ZTS-3000)";
const char STR_MODBUS_RAIN_DESC[] PROGMEM = u8"강우상태, 온도";

struct ModbusSensorInfo {
  const char* name;          // PROGMEM 문자열 포인터
  uint8_t registerCount;
  const char* description;  // PROGMEM 문자열 포인터
};

// 센서 타입별 정보 (문자열은 PROGMEM에 위치)
const ModbusSensorInfo modbusSensorInfos[] = {
  {STR_MODBUS_UNKNOWN_NAME, 1, STR_MODBUS_UNKNOWN_DESC},
  {STR_MODBUS_SOIL_NAME, 7, STR_MODBUS_SOIL_DESC},
  {STR_MODBUS_WIND_DIR_NAME, 2, STR_MODBUS_WIND_DIR_DESC},
  {STR_MODBUS_WIND_SPEED_NAME, 1, STR_MODBUS_WIND_SPEED_DESC},
  {STR_MODBUS_RAIN_NAME, 5, STR_MODBUS_RAIN_DESC}
};

// ============= 센서 주소 범위 (참고용 - 하드코딩에서는 불필요) =============
// 이 범위들은 Mega에서 스캔할 때 사용됩니다.
// UNO는 CURRENT_SENSOR_ADDRESS를 하드코딩하여 사용합니다.

// Modbus 센서 주소 범위 (참고용)
// SOIL_SENSOR: 2-6, WIND_DIR: 7-11, WIND_SPEED: 12-16
// RAIN_SNOW: 17-21, TEMP_HUMID: 22-26, PRESSURE: 27-31
// FLOW: 32-36, RELAY: 37-41, ENERGY_METER: 42-46

// I2C 센서 주소 범위 (참고용) 
// SHT20: 51-55, SCD41: 56-60, TSL2591: 61-65
// BH1750: 66-70, ADS1115: 71-75, DS18B20: 76-80

// 센서 객체들 (조건부 생성)
#if ENABLE_TSL2591
Adafruit_TSL2591 tsl2591 = Adafruit_TSL2591(2591);
#endif

#if ENABLE_BH1750
BH1750 lightSensor;
#endif

#if ENABLE_ADS1115
Adafruit_ADS1115 ads;
#endif

#if ENABLE_DS18B20
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
#endif

#if ENABLE_PH_EC
DFRobot_PH ph;
DFRobot_ECPRO ec;
#endif

static const uint8_t MAX_RAW_REGISTERS = 16;  // 최대 보관 레지스터 수 (토양센서 등 대응)

// 센서 데이터 구조체
struct SensorData {
  uint8_t slaveId;           // Modbus 슬레이브 ID
  SensorType type;           // 센서 타입
  bool isConnected;          // 연결 상태
  float value1;              // 첫 번째 값
  float value2;              // 두 번째 값
  float value3;              // 세 번째 값
  float value4;              // 네 번째 값
  uint16_t rawData[MAX_RAW_REGISTERS];  // 원시 레지스터 데이터
  char name[8];              // 이름 길이 축소 (12→8)
};

// 함수 프로토타입 (구조체 정의 이후)
void readSHT20(SensorData* sensor);
void readSCD41(SensorData* sensor);
void readTSL2591(SensorData* sensor);
void readBH1750(SensorData* sensor);
void readADS1115(SensorData* sensor);
void readDS18B20(SensorData* sensor);
void sendI2CSensorData(SensorData* sensor, uint16_t startAddr, uint16_t regCount);
void sendModbusSensorData(SensorData* sensor, uint16_t startAddr, uint16_t regCount);
static void refreshModbusSensor(SensorData* sensor);
void parseModbusData(SensorData* sensor);

static inline int16_t scaleFloatToInt(float value, float multiplier) {
  float scaled = value * multiplier;
  if (scaled >= 0.0f) {
    scaled += 0.5f;
  } else {
    scaled -= 0.5f;
  }
  return (int16_t)scaled;
}

// 보정 계산용 구조체
struct PiecewiseSegment {
  float min_val;
  float max_val;
  float slope;
  float intercept;
};

// 함수 선언
float applyPiecewiseCalibration(float sensor_value, const PiecewiseSegment* segments, int num_segments);
float applyPolynomialCalibration(float sensor_value, const float* coeffs);
float calibrateTemperature(float raw_temp);
float calibrateHumidity(float raw_humid);
#if ENABLE_TSL2591
float calibrateLux(float rawLux);
#endif
bool sendModbusRequest(uint8_t slaveAddr, uint8_t functionCode, uint16_t startReg, uint16_t regCount, uint8_t* response, uint8_t& responseLen, uint16_t timeout = 500);
uint16_t calcCRC16(const uint8_t* data, uint8_t length);
void scanForSensor();
void testSpecificAddress();

// 센서 배열
SensorData sensors[MAX_SENSORS];
uint8_t sensorCount = 0;


// RS485 통신 객체들
SoftwareSerial modbusSensorSerial(MODBUS_SENSOR_RX, MODBUS_SENSOR_TX);  // D2=RX, D3=TX (Modbus 센서용)
// Mega 통신은 HardwareSerial (Serial, D0/D1) 사용

// RS485 DE/RE 제어 함수 (Modbus 센서용)
inline void RS485_SENS_TX() { digitalWrite(MODBUS_SENSOR_DE_RE, HIGH); }
inline void RS485_SENS_RX() { digitalWrite(MODBUS_SENSOR_DE_RE, LOW); }

// RS485 DE/RE 제어 함수 (Mega 통신용)
inline void RS485_MEGA_TX() { digitalWrite(MEGA_DE_RE, HIGH); }
inline void RS485_MEGA_RX() { digitalWrite(MEGA_DE_RE, LOW); }

// ============= SHT20 보정 계산식 =============
// Temperature Piecewise Calibration (R²=0.9993, MAE=0.181°C)

const PiecewiseSegment TEMP_SEGMENTS[3] = {
  {18.97, 27.61, 0.985, 0.425},  // Low temperature segment
  {27.61, 42.26, 0.975, 0.710},  // Mid temperature segment  
  {42.26, 49.16, 0.980, 0.550}   // High temperature segment
};

// Humidity 3rd Order Polynomial Calibration (R²=0.9919, MAE=1.035%)
const float HUMID_POLY_COEFF[4] = {
  2.1534,     // a0 (constant term)
  0.8765,     // a1 (1st order coefficient)
  0.0012,     // a2 (2nd order coefficient)
  -0.000008   // a3 (3rd order coefficient)
};

float applyPiecewiseCalibration(float sensor_value, const PiecewiseSegment* segments, int num_segments) {
  // Find appropriate segment
  for (int i = 0; i < num_segments; i++) {
    if (sensor_value >= segments[i].min_val && sensor_value <= segments[i].max_val) {
      return segments[i].slope * sensor_value + segments[i].intercept;
    }
  }
  
  // Out of range - use nearest segment
  if (sensor_value < segments[0].min_val) {
    return segments[0].slope * sensor_value + segments[0].intercept;
  } else {
    int last = num_segments - 1;
    return segments[last].slope * sensor_value + segments[last].intercept;
  }
}

float applyPolynomialCalibration(float sensor_value, const float* coeffs) {
  // 3rd order polynomial: a3*x³ + a2*x² + a1*x + a0
  float x = sensor_value;
  return coeffs[3]*x*x*x + coeffs[2]*x*x + coeffs[1]*x + coeffs[0];
}

float calibrateTemperature(float raw_temp) {
  return applyPiecewiseCalibration(raw_temp, TEMP_SEGMENTS, 3);
}

float calibrateHumidity(float raw_humid) {
  return applyPolynomialCalibration(raw_humid, HUMID_POLY_COEFF);
}

// ============= SCD41 보정 계산식 =============
// Ultra-precision cubic calibration coefficients
static const float CUBIC_A = -2.847e-08f;
static const float CUBIC_B = 2.145e-04f;
static const float CUBIC_C = 0.4163f;
static const float CUBIC_D = 197.3f;

#define CO2_MIN_PPM  400.0f
#define CO2_MAX_PPM  6000.0f

float applyCubicCalibration(float raw) {
  float raw2 = raw * raw;
  float raw3 = raw2 * raw;
  float calibrated = CUBIC_A * raw3 + CUBIC_B * raw2 + CUBIC_C * raw + CUBIC_D;
  if (calibrated < CO2_MIN_PPM) calibrated = CO2_MIN_PPM;
  if (calibrated > CO2_MAX_PPM) calibrated = CO2_MAX_PPM;
  return calibrated;
}

// ============= pH 보정 계산식 (MONO - Fritsch-Carlson) =============
#define PH_MIN_VALUE  1.0f
#define PH_MAX_VALUE  14.0f

const size_t PH_N = 14;
const float calibPH[PH_N] = {
  1.00,  2.00,  3.00,  4.00,  5.00,  6.00,  7.00,
  8.00,  9.00, 10.00, 11.00, 12.00, 13.00, 14.00
};
const float calibV[PH_N]  = {
  1.537, 1.588, 1.662, 1.740, 1.820, 1.893, 1.956,
  2.014, 2.100, 2.165, 2.218, 2.290, 2.353, 2.414
};

float ph_mono_m[PH_N];
bool ph_mono_ready = false;

static inline float clampf(float x, float lo, float hi){
  return x < lo ? lo : (x > hi ? hi : x);
}

void ph_mono_build(){
  // 구간 길이/기울기
  float h[PH_N-1], s[PH_N-1];
  for (size_t k=0; k<PH_N-1; ++k) {
    h[k] = calibV[k+1] - calibV[k];
    s[k] = (calibPH[k+1] - calibPH[k]) / h[k];
  }
  // 초기 도함수
  ph_mono_m[0] = s[0];
  for (size_t k=1; k<PH_N-1; ++k) {
    if (s[k-1]*s[k] <= 0) ph_mono_m[k] = 0.0f;
    else ph_mono_m[k] = (2.0f * s[k-1] * s[k]) / (s[k-1] + s[k]);
  }
  ph_mono_m[PH_N-1] = s[PH_N-2];

  // Fritsch–Carlson 스케일링
  for (size_t k=0; k<PH_N-1; ++k) {
    if (s[k] == 0.0f) { ph_mono_m[k] = ph_mono_m[k+1] = 0.0f; }
    else {
      float ak = ph_mono_m[k]   / s[k];
      float bk = ph_mono_m[k+1] / s[k];
      float rk = ak*ak + bk*bk;
      if (rk > 9.0f) {
        float t = 3.0f / sqrtf(rk);
        ph_mono_m[k]   = t * ak * s[k];
        ph_mono_m[k+1] = t * bk * s[k];
      }
    }
  }
  ph_mono_ready = true;
}

float pH_from_voltage_MONO(float v){
  if (!ph_mono_ready) ph_mono_build();

  if (v <= calibV[0])   return calibPH[0];
  if (v >= calibV[PH_N-1]) return calibPH[PH_N-1];

  // 구간 찾기
  size_t i = 0;
  while (i < PH_N-1 && v > calibV[i+1]) i++;

  float h  = calibV[i+1] - calibV[i];
  float t  = (v - calibV[i]) / h;
  float t2 = t*t, t3 = t2*t;

  float h00 = (2*t3 - 3*t2 + 1);
  float h10 = (t3 - 2*t2 + t);
  float h01 = (-2*t3 + 3*t2);
  float h11 = (t3 - t2);

  float yi = calibPH[i]*h00
           + h * ph_mono_m[i]   * h10
           + calibPH[i+1]*h01
           + h * ph_mono_m[i+1] * h11;

  return yi;
}

float pH_from_voltage(float v){
  float y = pH_from_voltage_MONO(v);
  
  // pH 값에 +0.4 오프셋 적용
  y += 0.4f;
  
  return clampf(y, PH_MIN_VALUE, PH_MAX_VALUE);
}

// ============= EC 보정 계산식 =============
struct ECCalibPt { 
  float raw; 
  float truth; 
};

// 4점 보정 포인트
ECCalibPt EC_CALIB_POINTS[4] = {
  { 5.0f,     84.0f   },      // 저농도
  { 1680.0f,  1413.0f },      // 1.413 dS/m
  { 5500.0f,  5000.0f },      // 5.0 dS/m 
  { 9180.0f, 12880.0f}        // 12.880 dS/m
};

// EMA 필터 파라미터
const float EMA_ALPHA_LOW   = 0.35f;   // <2 dS/m
const float EMA_ALPHA_MID   = 0.20f;   // 2~6 dS/m
const float EMA_ALPHA_HIGH  = 0.12f;   // >6 dS/m

// ====== Mid/High range smoothing & quantization params ======
static float ec_ema_ds_m = 0.0f;       // EMA 내부 상태
static float ec_out_ds_m = 0.0f;       // 마지막 출력(히스테리시스용)

// 튜닝 파라미터 (필요 시 조정)
const float SOFT_Q_K_NEAR   = 0.50f;   // 0.5 스텝 타깃과 가까울 때 블렌딩 강도(부드럽게)
const float SOFT_Q_K_FAR    = 0.90f;   // 멀 때(반올림 쪽) 강하게 붙임
const float INT_STICK_WIN   = 0.12f;   // 정수 점착 윈도우 (±0.12 dS/m)
const float OUTPUT_DEADBAND = 0.02f;   // 출력 히스테리시스(±0.02 dS/m)

// ===== Low-range polish (optional) =====
static float low_med_buf[3] = {0,0,0};
static uint8_t low_med_i = 0;
const float LOW_DSM_MAX       = 2.0f;    // 저농도 상한
const float LOW_DEADBAND      = 0.01f;   // ±0.01 dS/m
const float LOW_ZERO_SNAP     = 0.010f;  // 이하면 0.00으로 표기

// EC 범위 제한
const float EC_MIN_DS_M = 0.0f;
const float EC_MAX_DS_M = 10.0f;

static inline float median3(float a, float b, float c) {
  if (a > b) { float t=a; a=b; b=t; }
  if (b > c) { float t=b; b=c; c=t; }
  if (a > b) { float t=a; a=b; b=t; }
  return b; // 중간값
}

static inline float chooseAlpha(float v) {
  if (v < 2.0f) return EMA_ALPHA_LOW;
  if (v < 6.0f) return EMA_ALPHA_MID;
  return EMA_ALPHA_HIGH;
}

float applyECCalibration(float raw_uScm) {
  if (raw_uScm <= EC_CALIB_POINTS[0].raw) {
    float x0 = EC_CALIB_POINTS[0].raw, y0 = EC_CALIB_POINTS[0].truth;
    float x1 = EC_CALIB_POINTS[1].raw, y1 = EC_CALIB_POINTS[1].truth;
    float slope = (y1 - y0) / (x1 - x0);
    return y0 + slope * (raw_uScm - x0);
  }
  
  for (int i = 0; i < 3; i++) {
    float x0 = EC_CALIB_POINTS[i].raw, y0 = EC_CALIB_POINTS[i].truth;
    float x1 = EC_CALIB_POINTS[i + 1].raw, y1 = EC_CALIB_POINTS[i + 1].truth;
    if (raw_uScm <= x1) {
      float slope = (y1 - y0) / (x1 - x0);
      return y0 + slope * (raw_uScm - x0);
    }
  }
  
  float x2 = EC_CALIB_POINTS[2].raw, y2 = EC_CALIB_POINTS[2].truth;
  float x3 = EC_CALIB_POINTS[3].raw, y3 = EC_CALIB_POINTS[3].truth;
  float slope = (y3 - y2) / (x3 - x2);
  return y3 + slope * (raw_uScm - x3);
}

// EC 크기에 따른 동적 온도계수 β (경험적 권장치)
// 0~1 dS/m: ~1.8%/°C, 1~5: ~2.0%/°C, 5+: ~2.15%/°C
static inline float tempBetaByEC(float ec_ds_m) {
  if (ec_ds_m < 1.0f) return 0.018f;
  if (ec_ds_m < 5.0f) return 0.020f;
  return 0.0215f;
}

// 저농도 전용 폴리싱: 롤링 미디언 → 데드밴드 → 스냅-투-제로
static float polishLowRange(float v, float last_out) {
  // 3-포인트 롤링 미디언
  low_med_buf[low_med_i++ % 3] = v;
  float m = median3(low_med_buf[0], low_med_buf[1], low_med_buf[2]);

  // 데드밴드(±0.01): 아주 작은 변화는 유지
  if (fabsf(m - last_out) < LOW_DEADBAND) m = last_out;

  // 아주 작은 값은 0으로 정리(표기 안정)
  if (m < LOW_ZERO_SNAP) m = 0.0f;

  return m;
}

// 0.5 스텝 타깃 계산 (예: 5.2 -> 5.0, 5.4 -> 5.5)
static inline float nearestHalf(float x) {
  return roundf(x * 2.0f) / 2.0f;
}

// 정수 점착 윈도우 안에 있으면 정수를 타깃으로
static inline float integerStickyTarget(float x, float halfTarget) {
  float nearestInt = roundf(x);
  if (fabsf(x - nearestInt) <= INT_STICK_WIN) return nearestInt;
  return halfTarget;
}

// 타깃과의 거리(0~0.25)를 이용해 블렌딩 강도 k를 0.5~0.9로 가변
static inline float blendStrength(float x, float target) {
  float d = fabsf(x - target);   // 최대 0.25 근처
  // d=0   -> k=SOFT_Q_K_NEAR (0.5)
  // d>=.25-> k=SOFT_Q_K_FAR  (0.9)
  float t = fminf(d / 0.25f, 1.0f);
  return SOFT_Q_K_NEAR + t * (SOFT_Q_K_FAR - SOFT_Q_K_NEAR);
}

// 소프트 양자화 (0.5 스텝 + 정수 점착)
static inline float softQuantizeHalfWithIntegerBias(float x) {
  if (x < 2.0f) return x; // 저농도는 영향 없음

  float halfT   = nearestHalf(x);
  float tgt     = integerStickyTarget(x, halfT);
  float k       = blendStrength(x, tgt);
  float blended = x + k * (tgt - x);

  return blended;
}

// 출력 히스테리시스: 변화가 아주 작으면 이전 출력 유지
static inline float withHysteresis(float proposed, float lastOut) {
  if (fabsf(proposed - lastOut) < OUTPUT_DEADBAND) return lastOut;
  return proposed;
}

// 고농도 보정 게인: 저농도 영향 최소화, 중고농도만 미세 상승
static inline float highRangeGain(float ec_ds_m) {
  if (ec_ds_m <= 2.0f) return 1.0f;  // 저농도 유지
  if (ec_ds_m <= 6.0f) {
    // 2 -> 6 dS/m: 1.000 -> 1.080 (약 +8%)
    return 1.0f + (ec_ds_m - 2.0f) * (0.080f / 4.0f);
  }
  // 6 -> 10 dS/m: 1.080 -> 1.020 (상한 근처에서는 과보정 방지)
  float t = ec_ds_m - 6.0f;
  return 1.080f + t * ((1.020f - 1.080f) / 4.0f);
}

// ============= TSL2591 조도 센서 보정 계산식 =============
// 구간별 선형보간 + 외삽 제한
#if ENABLE_TSL2591

// 보정 테이블 (Arduino 원시값 -> 참조 조도계 값)
// 주의: 원시값 오름차순 정렬 필수
static const float RAW_ARDUINO[] = {
  149, 180, 210, 222, 425, 452, 559, 588, 663, 787, 948, 993, 1010,
  1101, 1172, 1322, 1373, 1452, 1592, 1861, 2030, 2115, 2191, 2250, 2261, 2311
};
static const float REF_LUX[] = {
   90, 232, 288, 419, 534, 598, 774, 821, 895, 1009, 1125, 1212, 1293,
  1417, 1479, 1586, 1716, 1785, 1940, 1990, 2134, 2210, 2511, 2306, 2402, 2601
};
static const size_t CAL_N = sizeof(RAW_ARDUINO) / sizeof(RAW_ARDUINO[0]);

// 선형보간 함수
static inline float lerpLux(float x0, float y0, float x1, float y1, float x) {
  if (x1 == x0) return y0;
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

// 보정 함수: 구간별 선형보간, 범위 벗어나면 raw lux 반환
float calibrateLux(float rawLux) {
  // 비정상 값 방어
  if (!isfinite(rawLux) || rawLux < 0) return 0.0;

  // 보정 테이블 범위 밖이면 raw lux 그대로 반환
  if (rawLux < RAW_ARDUINO[0]) {
    return rawLux; // 하한 범위 밖: raw lux 반환
  }
  
  if (rawLux > RAW_ARDUINO[CAL_N - 1]) {
    return rawLux; // 상한 범위 밖: raw lux 반환
  }

  // 구간 보간 (테이블 범위 내)
  for (size_t i = 0; i + 1 < CAL_N; ++i) {
    if (rawLux <= RAW_ARDUINO[i + 1]) {
      return lerpLux(RAW_ARDUINO[i], REF_LUX[i],
                    RAW_ARDUINO[i + 1], REF_LUX[i + 1], rawLux);
    }
  }

  // 위에서 처리되어야 하지만 안전장치
  return rawLux;
}

#endif // ENABLE_TSL2591

// ============= 센서 초기화 (하드코딩된 센서만) =============
void initSensors() {
  Wire.begin();
  
  // pH 보정 테이블 초기화
  ph_mono_build();
  
  // 하드코딩된 센서만 초기화하고 등록
  bool sensorInitialized = false;
  
  // 주소 기반 타입 자동 판별
  SensorType resolvedType = CURRENT_SENSOR_TYPE;  // Phase 1: 타입 직접 사용

  // 현재 설정된 센서 타입에 따라 초기화
  switch(resolvedType) {
    case SENSOR_SHT20:
      if (ENABLE_SHT20 && initSHT20()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("SHT20 센서 초기화 완료");
      } else if (ENABLE_SHT20) {
        // 초기화 실패해도 주소 응답을 위해 등록 (값은 0)
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("SHT20 초기화 실패 - 응답용 등록");
      }
      break;
      
    case SENSOR_SCD41:
      if (ENABLE_SCD41 && initSCD41()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("SCD41 센서 초기화 완료");
      } else if (ENABLE_SCD41) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("SCD41 초기화 실패 - 응답용 등록");
      }
      break;
      
    case SENSOR_TSL2591:
      if (ENABLE_TSL2591 && initTSL2591()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("TSL2591 센서 초기화 완료");
      } else if (ENABLE_TSL2591) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("TSL2591 초기화 실패 - 응답용 등록");
      }
      break;
      
    case SENSOR_BH1750:
      if (ENABLE_BH1750 && initBH1750()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("BH1750 센서 초기화 완료");
      } else if (ENABLE_BH1750) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("BH1750 초기화 실패 - 응답용 등록");
      }
      break;
      
    case SENSOR_ADS1115:
      if (ENABLE_ADS1115 && initADS1115()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("ADS1115 센서 초기화 완료");
      } else if (ENABLE_ADS1115) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("ADS1115 초기화 실패 - 응답용 등록");
      }
      break;
      
    case SENSOR_DS18B20:
      if (ENABLE_DS18B20 && initDS18B20()) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensorInitialized = true;
        DEBUG_PRINTLN("DS18B20 센서 초기화 완료");
      } else if (ENABLE_DS18B20) {
        addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
        sensors[sensorCount-1].isConnected = false;
        sensorInitialized = true;
        DEBUG_PRINTLN("DS18B20 초기화 실패 - 응답용 등록");
      }
      break;
      
    // Modbus 센서들 (Phase 1: 타입 코드 사용, 물리적 주소는 0x01)
    case SENSOR_SOIL:
    case SENSOR_WIND_DIRECTION:
    case SENSOR_WIND_SPEED:
    case SENSOR_RAIN_SNOW:
    case SENSOR_TEMP_HUMID:
    case SENSOR_PRESSURE:
    case SENSOR_FLOW:
    case SENSOR_RELAY:
    case SENSOR_ENERGY_METER:
      // Phase 1: Mega에는 타입 코드 전송, 실제 센서는 0x01로 읽기
      addSensor(getMegaTypeCode(resolvedType), resolvedType, CURRENT_SENSOR_NAME);
      sensorInitialized = true;
      DEBUG_PRINT("Modbus 센서 등록: ");
      // Phase 1: 주소는 자동 할당됨
      break;
      
    default:
      DEBUG_PRINTLN("지원되지 않는 센서 타입");
      break;
  }
  
  if (sensorInitialized) {
    DEBUG_PRINT("센서 초기화 성공 - 주소: ");
    // Phase 1: 주소는 자동 할당됨
  } else {
    DEBUG_PRINTLN("센서 초기화 실패");
  }
}

// initI2CSensors 함수는 하드코딩 방식에서 불필요하므로 제거됨
// I2C 센서는 initSensors()에서 직접 초기화됨

// 스캔 함수들은 하드코딩 방식에서 불필요하므로 제거됨
// 하드코딩된 센서는 initSensors()에서 직접 등록됨


// scanSensorRange 함수는 하드코딩 방식에서 불필요하므로 제거됨

// I2C 센서인지 확인하는 함수
bool isI2CSensor(SensorType type) {
  return (type >= SENSOR_SHT20 && type <= SENSOR_DS18B20);
}

// Modbus 센서의 레지스터 개수 반환
uint16_t getModbusRegisterCount(SensorType type) {
  switch(type) {
    case SENSOR_SOIL: return 8;
    case SENSOR_WIND_DIRECTION: return 2;
    case SENSOR_WIND_SPEED: return 1;
    case SENSOR_RAIN_SNOW: return 10;
    case SENSOR_TEMP_HUMID: return 2;
    case SENSOR_PRESSURE: return 2;
    case SENSOR_FLOW: return 2;
    case SENSOR_RELAY: return 1;
    case SENSOR_ENERGY_METER: return 5;
    default: return 2; // 기본값
  }
}

// ============= Phase 1: 타입 코드 매핑 함수 =============
// Mega 호환 타입 코드 반환 (슬레이브 ID로 사용)
// Phase 2: Combined ID 생성 (타입 코드 + UNO ID)
uint8_t getMegaTypeCode(SensorType type) {
  uint8_t baseType = (uint8_t)type;  // 21, 22, 19, 16 등
  uint8_t combined = (baseType & 0x1F) | ((gUnoId & 0x07) << 5);
  
  #if ENABLE_DEBUG
  DEBUG_PRINT("🔗 Combined ID: 타입=");
  DEBUG_PRINT_VAR(baseType);
  DEBUG_PRINT(" UNO_ID=");
  DEBUG_PRINT_VAR(gUnoId);
  DEBUG_PRINT(" → ");
  DEBUG_PRINTLN_VAR(combined);
  #endif
  
  return combined;
}

// Phase 1: 단일 Modbus 센서는 항상 0x01 주소 사용
#define MODBUS_PHYSICAL_ADDRESS 0x01

void addSensor(uint8_t slaveId, SensorType type, const char* name) {
  if (sensorCount >= MAX_SENSORS) return;
  
  sensors[sensorCount].slaveId = slaveId;
  sensors[sensorCount].type = type;
  sensors[sensorCount].isConnected = true;
  sensors[sensorCount].value1 = 0.0f;
  sensors[sensorCount].value2 = 0.0f;
  sensors[sensorCount].value3 = 0.0f;
  sensors[sensorCount].value4 = 0.0f;
  memset(sensors[sensorCount].rawData, 0, sizeof(sensors[sensorCount].rawData));
  strncpy(sensors[sensorCount].name, name, sizeof(sensors[sensorCount].name) - 1);
  sensors[sensorCount].name[sizeof(sensors[sensorCount].name) - 1] = '\0';
  sensorCount++;
}

// ============= 센서별 초기화 함수들 =============
bool initSHT20() {
  Wire.beginTransmission(SHT20_ADDRESS);
  return (Wire.endTransmission() == 0);
}

bool initSCD41() {
  Wire.beginTransmission(SCD41_ADDRESS);
  if (Wire.endTransmission() != 0) return false;
  
  // 기존 측정 중지
  Wire.beginTransmission(SCD41_ADDRESS);
  Wire.write(0x3F);
  Wire.write(0x86);
  Wire.endTransmission();
  delay(500);
  
  // 측정 시작
  Wire.beginTransmission(SCD41_ADDRESS);
  Wire.write(0x21);
  Wire.write(0xB1);
  uint8_t result = Wire.endTransmission();
  
  if (result == 0) {
    delay(1000);
    return true;
  }
  return false;
}

bool initTSL2591() {
#if ENABLE_TSL2591
  if (!tsl2591.begin()) return false;
  
  tsl2591.setGain(TSL2591_GAIN_MED);
  tsl2591.setTiming(TSL2591_INTEGRATIONTIME_300MS);
  return true;
#else
  return false; // 비활성화됨
#endif
}

bool initBH1750() {
#if ENABLE_BH1750
  return lightSensor.begin();
#else
  return false; // 비활성화됨
#endif
}

bool initADS1115() {
#if ENABLE_ADS1115
  if (!ads.begin()) return false;
  
  ads.setGain(GAIN_TWOTHIRDS);
  ph.begin();
  ec.setCalibration(1.0);
  return true;
#else
  return false; // 비활성화됨
#endif
}

bool initDS18B20() {
#if ENABLE_DS18B20
  ds18b20.begin();
  return (ds18b20.getDeviceCount() > 0);
#else
  return false; // 비활성화됨
#endif
}

// ============= 센서 읽기 함수들 (보정 계산식 적용) =============
void readSHT20(SensorData* sensor) {
  sensor->value2 = 0.0f;
  sensor->value3 = 0.0f;
  sensor->value4 = 0.0f;

  // 온도 읽기
  Wire.beginTransmission(SHT20_ADDRESS);
  Wire.write(0xF3);  // Temperature measurement command (no hold master)
  if (Wire.endTransmission() != 0) return;
  delay(85);
  Wire.requestFrom(SHT20_ADDRESS, 3);
  if (Wire.available() < 3) return;
  
  uint16_t raw = (Wire.read() << 8) | Wire.read();
  Wire.read();  // Checksum
  
  // SHT20 원시 온도 계산
  float raw_temp = -46.85 + 175.72 * (raw / 65536.0);
  
  // 보정 계산식 적용 - 온도 보정값 저장
  sensor->value1 = calibrateTemperature(raw_temp);

  // 상대습도 읽기
  Wire.beginTransmission(SHT20_ADDRESS);
  Wire.write(0xF5);  // Humidity measurement command (no hold master)
  if (Wire.endTransmission() != 0) return;
  delay(85);
  Wire.requestFrom(SHT20_ADDRESS, 3);
  if (Wire.available() < 3) return;

  raw = (Wire.read() << 8) | Wire.read();
  Wire.read();  // Checksum

  float raw_humid = -6.0 + 125.0 * (raw / 65536.0);
  sensor->value2 = calibrateHumidity(raw_humid);
}

void readSCD41(SensorData* sensor) {
  sensor->value2 = 0.0f;
  sensor->value3 = 0.0f;
  sensor->value4 = 0.0f;
  // 데이터 준비 상태 확인
  Wire.beginTransmission(SCD41_ADDRESS);
  Wire.write(0xE4);
  Wire.write(0xB8);
  if (Wire.endTransmission() != 0) return;
  
  delay(1);
  Wire.requestFrom(SCD41_ADDRESS, 3);
  if (Wire.available() < 3) return;
  
  uint8_t dataReady[3];
  for (int i = 0; i < 3; i++) {
    dataReady[i] = Wire.read();
  }
  
  uint16_t readyStatus = (dataReady[0] << 8) | dataReady[1];
  if ((readyStatus & 0x07FF) == 0) return;
  
  // 데이터 읽기
  Wire.beginTransmission(SCD41_ADDRESS);
  Wire.write(0xEC);
  Wire.write(0x05);
  if (Wire.endTransmission() != 0) return;
  
  delay(1);
  Wire.requestFrom(SCD41_ADDRESS, 9);
  
  if (Wire.available() >= 9) {
    uint8_t data[9];
    for (int i = 0; i < 9; i++) {
      data[i] = Wire.read();
    }
    
    uint16_t co2_raw = (data[0] << 8) | data[1];
    float raw_co2_ppm = (float)co2_raw;
    
    // 보정 계산식 적용 (Cubic calibration)
    if (raw_co2_ppm >= 200.0f && raw_co2_ppm <= 5000.0f) {
      sensor->value1 = applyCubicCalibration(raw_co2_ppm);
    } else {
      sensor->value1 = raw_co2_ppm;
    }
  }
}

void readTSL2591(SensorData* sensor) {
#if ENABLE_TSL2591
  // TSL2591 센서에서 직접 데이터 읽기
  uint32_t lum = tsl2591.getFullLuminosity();
  uint16_t ir, full;
  ir = lum >> 16;
  full = lum & 0xFFFF;
  
  // 🔥 센서 포화 상태 감지 (full=65535, ir=65535는 센서 오류/포화 상태)
  bool sensorSaturated = (full == 65535 && ir == 65535);
  
  if (sensorSaturated) {
    // 센서 포화 상태: 9999로 설정
    sensor->value1 = 9999.0f;
  } else {
    // 원시 lux 계산
    float rawLux = tsl2591.calculateLux(full, ir);
    
    // 보정 적용
    float calibrated = calibrateLux(rawLux);
    sensor->value1 = calibrated;
  }
  
  sensor->value2 = 0.0f;
  sensor->value3 = 0.0f;
  sensor->value4 = 0.0f;
#else
  sensor->value1 = 0;
  sensor->value2 = 0;
  sensor->value3 = 0;
  sensor->value4 = 0;
#endif
}

void readBH1750(SensorData* sensor) {
#if ENABLE_BH1750
  sensor->value1 = lightSensor.readLightLevel(); // lux
  sensor->value2 = 0.0f;
  sensor->value3 = 0.0f;
  sensor->value4 = 0.0f;
#else
  sensor->value1 = 0; // 비활성화됨
  sensor->value2 = 0;
  sensor->value3 = 0;
  sensor->value4 = 0;
#endif
}

void readADS1115(SensorData* sensor) {
#if ENABLE_ADS1115
  if (!ads.begin()) return;
  
  ads.setGain(GAIN_TWOTHIRDS);
  delay(50);
  
  sensor->value1 = readPHValue();  // pH (보정 적용)
  sensor->value2 = readECValue();  // EC (보정 적용)
  sensor->value3 = 25.0;           // 수온 (고정값 또는 별도 센서)
  sensor->value4 = 0.0f;
#else
  sensor->value1 = 0; // 비활성화됨
  sensor->value2 = 0;
  sensor->value3 = 0;
  sensor->value4 = 0;
#endif
}

void readDS18B20(SensorData* sensor) {
#if ENABLE_DS18B20
  ds18b20.requestTemperatures();
  sensor->value1 = ds18b20.getTempCByIndex(0); // 온도
  sensor->value2 = 0.0f;
  sensor->value3 = 0.0f;
  sensor->value4 = 0.0f;
#else
  sensor->value1 = 0; // 비활성화됨
  sensor->value2 = 0;
  sensor->value3 = 0;
  sensor->value4 = 0;
#endif
}

float readECValue() {
#if ENABLE_ADS1115 || ENABLE_PH_EC
  if (!ads.begin()) return -1;
  
  ads.setGain(GAIN_TWOTHIRDS);
  delay(50);
  
  // 10회 평균 측정
  long sumRaw = 0;
  int validCount = 0;
  
  for (int i = 0; i < 10; i++) {
    int16_t reading = ads.readADC_SingleEnded(1);
    if (reading >= 0) {
      sumRaw += reading;
      validCount++;
    }
    delay(5);
  }
  
  if (validCount == 0) return -1;
  
  int avgRaw = sumRaw / validCount;
  float voltage_mV = ads.computeVolts(avgRaw) * 1000.0f;
  
  // EC 보정 계산식 적용 (4점 보정)
  float ecValue_uScm = applyECCalibration(voltage_mV);
  
  // μS/cm를 dS/m로 변환: μS/cm ÷ 1000
  float ecValue_dSm = ecValue_uScm / 1000.0f;
  
  // EMA 필터 적용
  static bool ema_initialized = false;
  if (!ema_initialized) {
    ec_ema_ds_m = ecValue_dSm;
    ema_initialized = true;
  } else {
    float alpha = chooseAlpha(ecValue_dSm);
    ec_ema_ds_m = alpha * ecValue_dSm + (1.0f - alpha) * ec_ema_ds_m;
  }
  
  return (ec_ema_ds_m < 0) ? 0 : ec_ema_ds_m;
#else
  return 0; // 비활성화됨
#endif
}

float readPHValue() {
#if ENABLE_ADS1115 || ENABLE_PH_EC
  if (!ads.begin()) return -1;
  
  ads.setGain(GAIN_TWOTHIRDS);
  delay(10);
  
  // pH 센서 읽기 (ADS1115 channel 1)
  int16_t adc_value = ads.readADC_SingleEnded(1);
  
  if (adc_value < 0) {
    return 7.0; // Error value - neutral pH
  }
  
  // Convert ADC value to voltage (V)
  float voltage = ads.computeVolts(adc_value);
  
  // MONO 보정 계산식 적용 (Fritsch-Carlson cubic interpolation + 0.4 offset)
  float ph_value = pH_from_voltage(voltage);
  
  // 온도 보상 (간단한 모델)
  float water_temperature = 25.0;  // 기본 온도 25°C
  float temp_compensation = (water_temperature - 25.0) * 0.003; // ~0.003 pH/°C
  ph_value -= temp_compensation;
  
  // 범위 제한
  if (ph_value < PH_MIN_VALUE) ph_value = PH_MIN_VALUE;
  if (ph_value > PH_MAX_VALUE) ph_value = PH_MAX_VALUE;
  
  // 합리적 범위 체크
  if (ph_value >= 0.0 && ph_value <= 14.0) {
    return ph_value;
  }
  
  return 7.0; // 오류 시 중성 pH 반환
#else
  return 7.0; // 비활성화됨
#endif
}

// ============= 센서 데이터 읽기 (하드코딩된 센서만) =============
void readAllSensors() {
  // 하드코딩된 센서 1개만 읽기
  if (sensorCount > 0 && sensors[0].isConnected) {
    if (isI2CSensor(sensors[0].type)) {
      // I2C 센서 읽기
      switch(sensors[0].type) {
        case SENSOR_SHT20:
          readSHT20(&sensors[0]);
          break;
        case SENSOR_SCD41:
          readSCD41(&sensors[0]);
          break;
        case SENSOR_TSL2591:
          readTSL2591(&sensors[0]);
          break;
        case SENSOR_BH1750:
          readBH1750(&sensors[0]);
          break;
        case SENSOR_ADS1115:
          readADS1115(&sensors[0]);
          break;
        case SENSOR_DS18B20:
          readDS18B20(&sensors[0]);
          break;
      }
    } else {
      // Modbus 센서 읽기는 나중에 구현 (readModbusRegisters 함수 필요)
      // 현재는 더미 데이터로 처리
      sensors[0].value1 = 42.0; // 더미 값
    }
  }
}

void parseModbusData(SensorData* sensor) {
  switch (sensor->type) {
    case SENSOR_SOIL:
      // 토양센서: 토양 습도, 온도, EC, pH 순으로 저장
      sensor->value1 = sensor->rawData[0] / 10.0f;   // 습도 (%RH)
      sensor->value2 = sensor->rawData[1] / 10.0f;   // 온도 (°C)
      sensor->value3 = sensor->rawData[2];           // EC (µS/cm)
      sensor->value4 = sensor->rawData[3] / 100.0f;  // pH
      break;
      
    case SENSOR_WIND_DIRECTION:
      sensor->value1 = sensor->rawData[0];
      sensor->value2 = sensor->rawData[1];
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_WIND_SPEED:
      sensor->value1 = sensor->rawData[0];
      sensor->value2 = 0.0f;
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_RAIN_SNOW:
      sensor->value1 = sensor->rawData[0];
      sensor->value2 = sensor->rawData[1];
      sensor->value3 = sensor->rawData[2];
      sensor->value4 = sensor->rawData[3] / 10.0f;  // 온도 등 추가 정보
      break;
      
    case SENSOR_TEMP_HUMID:
      sensor->value1 = sensor->rawData[0] / 10.0f;  // 온도
      sensor->value2 = sensor->rawData[1] / 10.0f;  // 습도
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_PRESSURE:
      sensor->value1 = sensor->rawData[0] / 100.0f; // 압력
      sensor->value2 = sensor->rawData[1] / 10.0f;  // 고도
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_FLOW:
      sensor->value1 = sensor->rawData[0] / 10.0f;  // 유량
      sensor->value2 = sensor->rawData[1] / 10.0f;  // 총량
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_RELAY:
      sensor->value1 = sensor->rawData[0];
      sensor->value2 = 0.0f;
      sensor->value3 = 0.0f;
      sensor->value4 = 0.0f;
      break;
      
    case SENSOR_ENERGY_METER:
      sensor->value1 = sensor->rawData[0] / 100.0f; // 전압
      sensor->value2 = sensor->rawData[1] / 100.0f; // 전류 등 추가 항목
      sensor->value3 = sensor->rawData[2] / 100.0f;
      sensor->value4 = sensor->rawData[3] / 100.0f;
      break;
  }
}


// ============= Modbus RTU 통신 (UNO가 모든 센서 읽기) =============
bool readModbusRegisters(uint8_t slaveAddr, uint16_t startAddr, uint16_t count, uint16_t* data) {
  uint8_t response[50];
  uint8_t respLen;
  
  if (sendModbusRequest(slaveAddr, 0x03, startAddr, count, response, respLen)) {
    for (uint16_t i = 0; i < count && i < 10; i++) {
      data[i] = (response[3 + i * 2] << 8) | response[4 + i * 2];
    }
    return true;
  }
  return false;
}

bool sendModbusRequest(uint8_t slaveAddr, uint8_t functionCode, 
                      uint16_t startReg, uint16_t regCount, 
                      uint8_t* response, uint8_t& responseLen, 
                      uint16_t timeout) {
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
  
  // 수신버퍼 비우기 (Modbus 센서용)
  while (modbusSensorSerial.available()) modbusSensorSerial.read();
  
  // 송신 모드 (Modbus 센서용)
  RS485_SENS_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  
  // 프레임 전송
  modbusSensorSerial.write(request, sizeof(request));
  modbusSensorSerial.flush();
  
  // 수신 모드 전환
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_SENS_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
  
  // 응답 수신
  uint32_t startTime = millis();
  responseLen = 0;
  uint8_t expectedLen = 0;
  
  while (millis() - startTime < timeout) {
    while (modbusSensorSerial.available()) {
      response[responseLen++] = modbusSensorSerial.read();
      
      if (responseLen == 3) {
        uint8_t byteCount = response[2];
        expectedLen = (uint8_t)(byteCount + 5);
      }
      if (expectedLen && responseLen >= expectedLen) {
        goto RX_DONE;
      }
      if (responseLen >= 250) goto RX_DONE;
    }
    delayMicroseconds(100);
  }
  
RX_DONE:
  if (responseLen < 5) return false;
  
  uint16_t receivedCRC = (response[responseLen - 1] << 8) | response[responseLen - 2];
  uint16_t calculatedCRC = calcCRC16(response, responseLen - 2);
  return (receivedCRC == calculatedCRC);
}

uint16_t calcCRC16(const uint8_t* buf, uint8_t len) {
  uint16_t crc = 0xFFFF;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= buf[i];
    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ============= Modbus RTU 응답 생성 =============
void sendModbusResponse(uint8_t slaveId, uint8_t functionCode, uint8_t* data, uint8_t dataLen) {
  uint8_t response[256];
  uint8_t responseLen = 0;
  
  // 헤더
  response[responseLen++] = slaveId;  // 🔥 업데이트된 Combined ID가 여기로 전송됨
  response[responseLen++] = functionCode;
  response[responseLen++] = dataLen;
  
  #if ENABLE_DEBUG
  static unsigned long lastDebugPrint = 0;
  if (millis() - lastDebugPrint >= 5000) {  // 5초마다 한 번씩만 출력
    lastDebugPrint = millis();
    Serial.print(F("[TX] sendModbusResponse: slaveId=0x"));
    if (slaveId < 0x10) Serial.print(F("0"));
    Serial.print(slaveId, HEX);
    Serial.print(F(" ("));
    Serial.print(slaveId);
    Serial.print(F("), fc=0x"));
    if (functionCode < 0x10) Serial.print(F("0"));
    Serial.print(functionCode, HEX);
    Serial.print(F(", len="));
    Serial.println(dataLen);
  }
  #endif
  
  // 데이터
  for (uint8_t i = 0; i < dataLen; i++) {
    response[responseLen++] = data[i];
  }
  
  // CRC 계산
  uint16_t crc = calcCRC16(response, responseLen);
  response[responseLen++] = crc & 0xFF;
  response[responseLen++] = (crc >> 8) & 0xFF;
  
  // RS485 전송 (Mega 통신용) - 송수신 시퀀스
  RS485_MEGA_TX();
  delayMicroseconds(RS485_TURNAROUND_US);
  
  for (uint8_t i = 0; i < responseLen; i++) {
    Serial.write(response[i]);
  }
  Serial.flush();
  
  delayMicroseconds(RS485_TURNAROUND_US);
  RS485_MEGA_RX();
  delayMicroseconds(RS485_INTERCHAR_US);
}

// Modbus 예외 응답 전송 (함수코드|0x80, 예외코드 1바이트)
static void sendModbusException(uint8_t slaveId, uint8_t functionCode, uint8_t exceptionCode) {
  uint8_t data[1] = { exceptionCode };
  sendModbusResponse(slaveId, (uint8_t)(functionCode | 0x80), data, 1);
}

// ============= 특정 센서 데이터 전송 (Mega 요청 대응) =============
void sendSensorDataForSlave(uint8_t slaveId, uint16_t startAddr, uint16_t regCount) {
  if (sensorCount == 0) return;
  
  SensorData* sensor = &sensors[0];
  
  // 🔥 요청된 slaveId가 현재 Combined ID와 일치하는지 확인 (gUnoId 업데이트 반영)
  uint8_t currentCombinedId = getMegaTypeCode(sensor->type);
  if (slaveId == currentCombinedId || slaveId == sensor->slaveId) {
    if (isI2CSensor(sensor->type)) {
      sendI2CSensorData(sensor, startAddr, regCount);
    } else {
      sendModbusSensorData(sensor, startAddr, regCount);
    }
    // 최초 유효 응답 후에는 HELLO 중단
    gHelloDone = true;
  } else {
    // 해당 주소의 센서가 아니면 침묵 (응답하지 않음)
    return;
  }
}

void sendI2CSensorData(SensorData* sensor, uint16_t startAddr, uint16_t regCount) {
  uint8_t data[20];
  uint8_t dataLen = 0;
  
  // 센서 데이터 최신화
  if (isI2CSensor(sensor->type)) {
    switch (sensor->type) {
      case SENSOR_SHT20:
        readSHT20(sensor);
        {
          int16_t tempScaled = scaleFloatToInt(sensor->value1, 100.0f);
          int16_t humidScaled = scaleFloatToInt(sensor->value2, 100.0f);
          data[0] = ((uint16_t)tempScaled) >> 8;
          data[1] = ((uint16_t)tempScaled) & 0xFF;
          data[2] = ((uint16_t)humidScaled) >> 8;
          data[3] = ((uint16_t)humidScaled) & 0xFF;
          dataLen = 4;
        }
        break;
        
      case SENSOR_SCD41:
        readSCD41(sensor);
        // CO2 ppm (정수값)
        data[0] = (uint16_t)sensor->value1 >> 8;
        data[1] = (uint16_t)sensor->value1 & 0xFF;
        dataLen = 2;
        break;
        
      case SENSOR_TSL2591: {
        readTSL2591(sensor);
        // lux 전송 (×1: 9999까지 지원, 백엔드에서 스케일링 처리)
        // Mega는 registers[0]에 그대로 저장하고, 백엔드에서 스케일링 처리
        // 🔥 최소값 1, 최대값 9999로 제한 (센서 포화 시 9999, 유효하지 않으면 1)
        uint16_t luxValue = (uint16_t)constrain(sensor->value1, 1.0f, 9999.0f);
        data[0] = luxValue >> 8;
        data[1] = luxValue & 0xFF;
        dataLen = 2;
        break;
      }
        
      case SENSOR_BH1750: {
        readBH1750(sensor);
        // lux 전송 (×1: 9999까지 지원, 백엔드에서 스케일링 처리)
        // Mega는 registers[0]에 그대로 저장하고, 백엔드에서 스케일링 처리
        uint16_t luxValue = (uint16_t)constrain(sensor->value1, 0.0f, 9999.0f);
        data[0] = luxValue >> 8;
        data[1] = luxValue & 0xFF;
        dataLen = 2;
        break;
      }
        
      case SENSOR_ADS1115:
        readADS1115(sensor);
        {
          int16_t phScaled = scaleFloatToInt(sensor->value1, 100.0f);
          int16_t ecScaled = scaleFloatToInt(sensor->value2, 100.0f);
          int16_t wtScaled = scaleFloatToInt(sensor->value3, 100.0f); // ← 추가
          data[0] = ((uint16_t)phScaled) >> 8;
          data[1] = ((uint16_t)phScaled) & 0xFF;
          data[2] = ((uint16_t)ecScaled) >> 8;
          data[3] = ((uint16_t)ecScaled) & 0xFF;
          data[4] = ((uint16_t)wtScaled) >> 8;     // ← 추가
          data[5] = ((uint16_t)wtScaled) & 0xFF;   // ← 추가
          dataLen = 4;
        }
        break;
        
      case SENSOR_DS18B20:
        readDS18B20(sensor);
        // 온도 (×100) - Mega와 동일한 스케일링
        data[0] = (uint16_t)(sensor->value1 * 100) >> 8;
        data[1] = (uint16_t)(sensor->value1 * 100) & 0xFF;
        dataLen = 2;
        break;
    }
  }
  
  // 🔥 전송 직전에 최신 Combined ID 계산 (gUnoId가 나중에 업데이트될 수 있음)
  uint8_t currentSlaveId = getMegaTypeCode(sensor->type);
  
  // 🔥 sensor->slaveId도 업데이트 (다음 전송을 위해)
  sensor->slaveId = currentSlaveId;
  
  #if ENABLE_DEBUG
  Serial.print(F("[TX] sendI2CSensorData: slaveId="));
  Serial.print(currentSlaveId);
  Serial.print(F(" (UNO_ID="));
  Serial.print(gUnoId);
  Serial.print(F(", 타입="));
  Serial.print((uint8_t)sensor->type);
  Serial.println(F(")"));
  #endif
  sendModbusResponse(currentSlaveId, MODBUS_FUNCTION_READ, data, dataLen);
}

void handleModbusSensorRequest(uint8_t slaveId, uint16_t startAddr, uint16_t regCount) {
  // 실제 Modbus 센서 데이터 전송
  for (uint8_t i = 0; i < sensorCount; i++) {
    if (sensors[i].slaveId == slaveId && !isI2CSensor(sensors[i].type)) {
      // Modbus 센서 데이터 전송
      sendModbusSensorData(&sensors[i], startAddr, regCount);
      return;
    }
  }
  
  // 센서를 찾지 못한 경우 기본 응답
  uint8_t data[2] = {0x00, 0x00};
  sendModbusResponse(slaveId, MODBUS_FUNCTION_READ, data, 2);
}

static void refreshModbusSensor(SensorData* sensor) {
  switch (sensor->type) {
    case SENSOR_WIND_SPEED: {
      uint16_t data[1];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 1, data)) {
        sensor->rawData[0] = data[0];
        sensor->value1 = data[0] / 10.0f;
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_WIND_DIRECTION: {
      uint16_t data[2];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 2, data)) {
        sensor->rawData[0] = data[0];
        sensor->rawData[1] = data[1];
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_RAIN_SNOW: {
      uint16_t data[10];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 10, data)) {
        for (int i=0;i<10;i++) sensor->rawData[i] = data[i];
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_SOIL: {
      uint16_t data[8];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 8, data)) {
        // ✅ EC 보정 적용 (rawData[2] = EC)
        float raw_ec = (float)data[2];  // EC RAW 값 (uS/cm)
        
        // 1. 기본 보정 적용
        float calibrated_uScm = applyECCalibration(raw_ec);
        
        // 2. 온도 보정 (토양 온도 사용)
        float soil_temp = (float)data[1] / 10.0f;  // 토양 온도 (°C)
        float preTemp_ds_m = calibrated_uScm / 1000.0f;    // 온도보정 전 추정 dS/m
        float beta = tempBetaByEC(preTemp_ds_m);
        float temp_coefficient = 1.0f + beta * (soil_temp - 25.0f);
        calibrated_uScm = calibrated_uScm / temp_coefficient;
        float ec_ds_m = calibrated_uScm / 1000.0f;
        
        // 3. 저농도 폴리싱(2.0 dS/m 미만만 적용)
        if (ec_ds_m < LOW_DSM_MAX) {
          ec_ds_m = polishLowRange(ec_ds_m, ec_out_ds_m);
        }
        
        // 4. 고농도 미세 보정 (저농도는 영향 없음)
        ec_ds_m *= highRangeGain(ec_ds_m);
        if (ec_ds_m < EC_MIN_DS_M) ec_ds_m = EC_MIN_DS_M;
        
        // 5. 크기 의존 EMA로 1차 안정화
        {
          float alpha = chooseAlpha(ec_ds_m);
          if (ec_ema_ds_m <= 0.0001f) ec_ema_ds_m = ec_ds_m; // 초기화
          else ec_ema_ds_m = ec_ema_ds_m + alpha * (ec_ds_m - ec_ema_ds_m);
        }
        
        // 6. 0.5 스텝 소프트 양자화 + 정수 점착
        float q_ds_m = softQuantizeHalfWithIntegerBias(ec_ema_ds_m);
        
        // 7. 히스테리시스 적용
        float stable_ds_m = withHysteresis(q_ds_m, ec_out_ds_m);
        ec_out_ds_m = stable_ds_m;
        
        // 8. 최대값 제한 적용
        if (stable_ds_m > EC_MAX_DS_M) stable_ds_m = EC_MAX_DS_M;
        
        // 9. dS/m를 μS/cm로 변환하여 저장 (rawData는 μS/cm 단위)
        uint16_t final_ec_uScm = (uint16_t)(stable_ds_m * 1000.0f);
        
        // 다른 값들은 그대로 저장
        sensor->rawData[0] = data[0];  // 습도
        sensor->rawData[1] = data[1];  // 온도
        sensor->rawData[2] = final_ec_uScm;  // ✅ 완전히 보정된 EC (μS/cm)
        sensor->rawData[3] = data[3];  // pH
        sensor->rawData[4] = data[4];  // N
        sensor->rawData[5] = data[5];  // P
        sensor->rawData[6] = data[6];  // K
        sensor->rawData[7] = data[7];  // 상태
        
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_TEMP_HUMID:
    case SENSOR_PRESSURE:
    case SENSOR_FLOW: {
      uint16_t data[2];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 2, data)) {
        sensor->rawData[0] = data[0];
        sensor->rawData[1] = data[1];
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_RELAY: {
      uint16_t data[1];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 1, data)) {
        sensor->rawData[0] = data[0];
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    case SENSOR_ENERGY_METER: {
      uint16_t data[5];
      if (readModbusRegisters(MODBUS_PHYSICAL_ADDRESS, 0, 5, data)) {
        for (int i=0;i<5;i++) sensor->rawData[i] = data[i];
        sensor->isConnected = true;
      } else sensor->isConnected = false;
      break;
    }
    default: break;
  }
}

void sendModbusSensorData(SensorData* sensor, uint16_t startAddr, uint16_t regCount) {
  refreshModbusSensor(sensor);
  
  // DEBUG: Check rawData after refreshModbusSensor (WIND_DIRECTION only)
  #if ENABLE_DEBUG
  if (sensor->type == SENSOR_WIND_DIRECTION) {
    Serial.print(F("[UNO_DBG] rawData[0]="));
    Serial.print(sensor->rawData[0]);
    Serial.print(F(" rawData[1]="));
    Serial.print(sensor->rawData[1]);
    Serial.print(F(" connected="));
    Serial.println(sensor->isConnected ? F("YES") : F("NO"));
    Serial.flush();
  }
  #endif
  uint8_t data[20];
  uint8_t dataLen = 0;
  
  // 센서 타입별 데이터 변환
  switch (sensor->type) {
    case SENSOR_SOIL:
      // 토양센서 (8개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF; // 습도
      data[2] = sensor->rawData[1] >> 8; data[3] = sensor->rawData[1] & 0xFF; // 온도
      data[4] = sensor->rawData[2] >> 8; data[5] = sensor->rawData[2] & 0xFF; // EC
      data[6] = sensor->rawData[3] >> 8; data[7] = sensor->rawData[3] & 0xFF; // pH
      data[8] = sensor->rawData[4] >> 8; data[9] = sensor->rawData[4] & 0xFF; // N
      data[10] = sensor->rawData[5] >> 8; data[11] = sensor->rawData[5] & 0xFF; // P
      data[12] = sensor->rawData[6] >> 8; data[13] = sensor->rawData[6] & 0xFF; // K
      dataLen = 14;
      break;
      
    case SENSOR_WIND_DIRECTION:
      // 풍향센서 (2개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF; // 기어값
      data[2] = sensor->rawData[1] >> 8; data[3] = sensor->rawData[1] & 0xFF; // 각도
      dataLen = 4;
      break;
      
    case SENSOR_WIND_SPEED:
      // 풍속센서 (1개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF;
      dataLen = 2;
      break;
      
    case SENSOR_RAIN_SNOW:
      // 강우센서 (10개 레지스터)
      for (int i = 0; i < 10; i++) {
        data[i * 2] = sensor->rawData[i] >> 8;
        data[i * 2 + 1] = sensor->rawData[i] & 0xFF;
      }
      dataLen = 20;
      break;
      
    case SENSOR_TEMP_HUMID:
      // 온습도센서 (2개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF; // 온도
      data[2] = sensor->rawData[1] >> 8; data[3] = sensor->rawData[1] & 0xFF; // 습도
      dataLen = 4;
      break;
      
    case SENSOR_PRESSURE:
      // 압력센서 (2개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF; // 압력
      data[2] = sensor->rawData[1] >> 8; data[3] = sensor->rawData[1] & 0xFF; // 고도
      dataLen = 4;
      break;
      
    case SENSOR_FLOW:
      // 유량센서 (2개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF; // 유량
      data[2] = sensor->rawData[1] >> 8; data[3] = sensor->rawData[1] & 0xFF; // 총량
      dataLen = 4;
      break;
      
    case SENSOR_RELAY:
      // 릴레이모듈 (1개 레지스터)
      data[0] = sensor->rawData[0] >> 8; data[1] = sensor->rawData[0] & 0xFF;
      dataLen = 2;
      break;
      
    case SENSOR_ENERGY_METER:
      // 전력계 (5개 레지스터)
      for (int i = 0; i < 5; i++) {
        data[i * 2] = sensor->rawData[i] >> 8;
        data[i * 2 + 1] = sensor->rawData[i] & 0xFF;
      }
      dataLen = 10;
      break;
  }
  
  // 🔥 전송 직전에 최신 Combined ID 계산 (gUnoId가 나중에 업데이트될 수 있음)
  uint8_t currentSlaveId = getMegaTypeCode(sensor->type);
  
  // 🔥 sensor->slaveId도 업데이트 (다음 전송을 위해)
  sensor->slaveId = currentSlaveId;
  
  // 🔥 SOIL 센서 디버깅: Mega 전송 직전 값 출력
  if (sensor->type == SENSOR_SOIL) {
    Serial.print(F("[SOIL_DEBUG] === Mega 전송 직전 ===\r\n"));
    Serial.print(F("  rawData[0] 습도: ")); Serial.print(sensor->rawData[0]); Serial.println(F("%"));
    Serial.print(F("  rawData[1] 온도: ")); Serial.print((float)sensor->rawData[1] / 10.0f); Serial.println(F("°C"));
    Serial.print(F("  rawData[2] EC: ")); Serial.print(sensor->rawData[2]); Serial.println(F(" uS/cm"));
    Serial.print(F("  rawData[3] pH: ")); Serial.print((float)sensor->rawData[3] / 10.0f); Serial.println();
    Serial.print(F("  rawData[4] N: ")); Serial.print(sensor->rawData[4]); Serial.println(F(" mg/kg"));
    Serial.print(F("  rawData[5] P: ")); Serial.print(sensor->rawData[5]); Serial.println(F(" mg/kg"));
    Serial.print(F("  rawData[6] K: ")); Serial.print(sensor->rawData[6]); Serial.println(F(" mg/kg"));
    Serial.print(F("  rawData[7] 상태: 0x")); Serial.println(sensor->rawData[7], HEX);
    Serial.print(F("  전송 데이터 (바이트): "));
    for (uint8_t i = 0; i < dataLen; i++) {
      if (data[i] < 0x10) Serial.print(F("0"));
      Serial.print(data[i], HEX);
      Serial.print(F(" "));
    }
    Serial.println();
    Serial.print(F("  slaveId: 0x")); Serial.println(currentSlaveId, HEX);
    Serial.print(F("  connected: ")); Serial.println(sensor->isConnected ? F("YES") : F("NO"));
    Serial.println(F("========================\r\n"));
    Serial.flush();
  }
  
  #if ENABLE_DEBUG
  Serial.print(F("[TX] sendModbusSensorData: slaveId="));
  Serial.print(currentSlaveId);
  Serial.print(F(" (UNO_ID="));
  Serial.print(gUnoId);
  Serial.print(F(", 타입="));
  Serial.print((uint8_t)sensor->type);
  Serial.println(F(")"));
  #endif
  sendModbusResponse(currentSlaveId, MODBUS_FUNCTION_READ, data, dataLen);
}

// ============= Modbus RTU 요청 처리 (Mega에서 받은 요청) =============
void handleModbusRequest() {
  static uint8_t rxBuffer[256];
  static uint8_t rxIndex = 0;
  static unsigned long lastByteTime = 0;
  unsigned long currentTime = millis();
  
  // 바이트 수신 (Mega로부터)
  while (Serial.available()) {
    if (rxIndex < sizeof(rxBuffer)) {
      rxBuffer[rxIndex++] = Serial.read();
      lastByteTime = currentTime;
    }
  }
  
  // 프레임 완성 체크 (3.5 문자 시간 = 약 7ms @ 4800bps)
  if (rxIndex >= 8 && (currentTime - lastByteTime) >= 10) {
    // CRC 검증
    uint16_t receivedCRC = (rxBuffer[rxIndex - 1] << 8) | rxBuffer[rxIndex - 2];
    uint16_t calculatedCRC = calcCRC16(rxBuffer, rxIndex - 2);
    
    if (receivedCRC == calculatedCRC) {
#if ENABLE_DEBUG
      // 디버그: 수신 프레임 요약 (디버그 때만 출력)
      Serial.print(F("[UNO][RX a=")); Serial.print(rxBuffer[0]); Serial.print(F(" fc=")); Serial.print(rxBuffer[1], HEX); Serial.println(F("]"));
#endif
      uint8_t slaveId = rxBuffer[0];
      uint8_t functionCode = rxBuffer[1];
      
      // 읽기 요청 처리 (0x03)
      if (functionCode == MODBUS_FUNCTION_READ) {
        uint16_t startAddr = (rxBuffer[2] << 8) | rxBuffer[3];
        uint16_t regCount = (rxBuffer[4] << 8) | rxBuffer[5];
        
        // 🔥 요청된 slaveId가 현재 Combined ID와 일치하는지 확인 (gUnoId 업데이트 반영)
        uint8_t currentCombinedId = (sensorCount > 0) ? getMegaTypeCode(sensors[0].type) : 0;
        if (slaveId == currentCombinedId || slaveId == sensors[0].slaveId) {
          // 요청된 센서의 데이터 전송
          sendSensorDataForSlave(slaveId, startAddr, regCount);
        }
      } else if (functionCode == 0x11) {
        // Modbus Report Slave ID (간단한 하트비트 응답)
        // 데이터: [idLen][idBytes...] 형식의 단순 페이로드로 응답
        uint8_t currentCombinedId = (sensorCount > 0) ? getMegaTypeCode(sensors[0].type) : 0;
        if (sensorCount > 0 && (slaveId == currentCombinedId || slaveId == sensors[0].slaveId)) {
          const char* id = "UNO_SHT20";
          uint8_t payload[32];
          uint8_t n = 0;
          uint8_t idLen = (uint8_t)strlen(id);
          payload[n++] = idLen;
          for (uint8_t i = 0; i < idLen && n < sizeof(payload); i++) payload[n++] = (uint8_t)id[i];
          sendModbusResponse(slaveId, 0x11, payload, n);
          gHelloDone = true;
        }
      }
    }
    
    // 버퍼 초기화
    rxIndex = 0;
  }

  // ASCII 핸드셰이크 처리: MEGA_SENS_ACK / MEGA_SENS_REQ_ADDR
  if (Serial.available()) {
    int c = Serial.peek();
    if ((c >= 'A' && c <= 'Z') || (c == 'M')) {
      // 라인 단위로 읽기
      static char line[32];
      static uint8_t len = 0;
      while (Serial.available() && len < sizeof(line)-1) {
        char ch = (char)Serial.read();
        if (ch == '\n') break;
        line[len++] = ch;
      }
      line[len] = '\0';
      len = 0;
      if (strstr(line, "MEGA_SENS_REQ_ADDR") != NULL) {
        // 주소 송신 - 송수신 시퀀스
        RS485_MEGA_TX();
        delayMicroseconds(RS485_TURNAROUND_US);
        char addrLine[24];
        for (size_t i=0;i<strlen(addrLine);i++) Serial.write((uint8_t)addrLine[i]);
        Serial.flush();
        delayMicroseconds(RS485_TURNAROUND_US);
        RS485_MEGA_RX();
        delayMicroseconds(RS485_INTERCHAR_US);
      }
    }
  }
}

// ============= 메인 함수들 =============
void setup() {
  // Mega 통신용 HardwareSerial 초기화 (D0/D1)
  Serial.begin(MEGA_BAUD);
  delay(500);  // 시리얼 안정화 대기
  
  // 🔥 ID 할당: loop()에서 처리 (부팅 후 10초 대기)
  // gUnoId=0으로 초기화, loop()에서 할당 시도
  gUnoId = 0;
  
  // RS485 핀 초기화 (Modbus 센서용)
  pinMode(MODBUS_SENSOR_DE_RE, OUTPUT);
  digitalWrite(MODBUS_SENSOR_DE_RE, LOW); // 수신 모드
  modbusSensorSerial.begin(MODBUS_SENSOR_BAUD);
  
  // RS485 핀 초기화 (Mega 통신용)
  pinMode(MEGA_DE_RE, OUTPUT);
  digitalWrite(MEGA_DE_RE, LOW); // 초기 상태: 수신 모드
  
  // 센서 초기화
  initSensors();
  
  // EC 보정 관련 초기화
  low_med_buf[0] = low_med_buf[1] = low_med_buf[2] = 0.0f;
  low_med_i = 0;
  ec_ema_ds_m = 0.0f;
  ec_out_ds_m = 0.0f;
}

void loop() {
  // 🔥 ID 할당 처리: 부팅 후 10초 대기 후 시작
  // gUnoId = 0인 경우에만 할당 시도 (1회만)
  static bool idAssignmentAttempted = false;
  static unsigned long bootTime = millis(); // setup() 직후 시간 기록
  
  // 부팅 후 10초 대기 후 ID 할당 시도 (1회만)
  if (!idAssignmentAttempted && gUnoId == 0 && (millis() - bootTime >= 10000)) {
    idAssignmentAttempted = true;
    uint8_t oldUnoId = gUnoId;
    gUnoId = enrollUnoIdBlocking();
    
    // 🔥 ID 할당 성공 시 센서의 slaveId 업데이트
    if (gUnoId > 0 && gUnoId != oldUnoId && sensorCount > 0) {
      SensorData* sensor = &sensors[0];
      uint8_t newSlaveId = getMegaTypeCode(sensor->type);
      
      #if ENABLE_DEBUG
      Serial.print(F("🔄 UNO ID 할당 완료: "));
      Serial.print(oldUnoId);
      Serial.print(F(" → "));
      Serial.print(gUnoId);
      Serial.print(F(" (slaveId: "));
      Serial.print(sensor->slaveId);
      Serial.print(F(" → "));
      Serial.print(newSlaveId);
      Serial.println(F(")"));
      #endif
      
      sensor->slaveId = newSlaveId;
    }
    // gUnoId=0이어도 Combined ID 생성 시 UNO_ID=0으로 정상 작동 (타입 코드만 사용)
  }
  
  // 🔥 gUnoId = 0인 경우 그대로 유지하여 Mega가 "ID 할당 실패" 인지 가능하도록 함
  // Mega 측에서 UNO_ID = 0을 받으면 ID 할당을 못 받은 UNO로 인식 가능
  
  // Mega로부터의 바이트 기반 명령 처리 (우선 처리)
  if (Serial.available() >= 1) {
    int b = Serial.peek();
    
    if (b == CMD_SENSOR_REQUEST) {
      // 명령 바이트 소비
      Serial.read();

      // 최신 센서 측정 갱신 (가능한 항목만)
      float phVal = 0.0f;
      float ecVal_dSm = 0.0f;
      float tempWater = 0.0f;

      // ADS1115에서 pH/EC, DS18B20에서 수온 등을 읽는 로직이 있는 경우 호출
      for (uint8_t i = 0; i < sensorCount; i++) {
        SensorData* s = &sensors[i];
        if (!s->isConnected) continue;
        if (s->type == SENSOR_ADS1115) {
          readADS1115(s);
          // value1: pH, value2: EC(dS/m)
          phVal = s->value1;
          ecVal_dSm = s->value2;
        } else if (s->type == SENSOR_DS18B20) {
          readDS18B20(s);
          tempWater = s->value1;
        }
      }

      // 스케일링 및 패킹
      int16_t phInt = scaleFloatToInt(phVal, 100.0f);       // pH * 100
      int16_t ecInt = scaleFloatToInt(ecVal_dSm, 100.0f);   // dS/m * 100
      int16_t tInt  = scaleFloatToInt(tempWater, 10.0f);    // °C * 10

      uint8_t frame[8];
      frame[0] = ACK_SENSOR_DATA;
      frame[1] = (uint8_t)((uint16_t)phInt >> 8);
      frame[2] = (uint8_t)((uint16_t)phInt & 0xFF);
      frame[3] = (uint8_t)((uint16_t)ecInt >> 8);
      frame[4] = (uint8_t)((uint16_t)ecInt & 0xFF);
      frame[5] = (uint8_t)((uint16_t)tInt >> 8);
      frame[6] = (uint8_t)((uint16_t)tInt & 0xFF);
      frame[7] = 0x00; // reserved

      // RS485 전송 (Mega 통신용) - 송수신 시퀀스
      RS485_MEGA_TX();
      delayMicroseconds(RS485_TURNAROUND_US);
      Serial.write(frame, sizeof(frame));
      Serial.flush();
      delayMicroseconds(RS485_TURNAROUND_US);
      RS485_MEGA_RX();
      delayMicroseconds(RS485_INTERCHAR_US);
    } else {
      // 바이트 기반이 아니면 기존 Modbus 요청 처리 루틴에 맡김
      handleModbusRequest();
    }
  } else {
    // 바이트 없음 → Modbus 요청 처리 시도
    handleModbusRequest();
  }
  
  // 시리얼 모니터 명령어 처리 비활성화 (Serial은 Mega 통신에 사용)
  
  // 🔥 초기 할당만 사용: setup()에서 enrollUnoIdBlocking()로 ID 할당 완료
  // 재할당 로직은 제거됨
  
  // Mega 동적 등록 핸드셰이크: 주기적으로 HELLO 전송 (최초 정상 응답 전까지만)
  {
    static unsigned long lastHello = 0;
    (void)lastHello; // 푸시 방식으로 전환: HELLO 비활성화
  }

  // 주기적 푸시: 현재 센서 값을 Modbus RTU 형식으로 Mega에 전송
  {
    static unsigned long lastPush = 0;
    if (millis() - lastPush >= 3000) {
      lastPush = millis();
      if (sensorCount > 0) {
        SensorData* s = &sensors[0];
        if (isI2CSensor(s->type)) {
          sendI2CSensorData(s, 0, 2); // 내부에서 최신값 읽고 [T,H] 2레지스터로 응답 프레임 생성
        } else {
          sendModbusSensorData(s, 0, getModbusRegisterCount(s->type));
        }
      }
    }
  }

  delay(10);
}

// ============= 보정 스케치용 자리표시자 구현 =============
// 주소 변경/스캔/테스트 기능은 이 보정 펌웨어에서는 사용하지 않으므로
// 링크 에러 방지를 위해 간단한 자리표시자 구현을 제공합니다.
void handleAddressChangeMode() { }

void scanForSensor() { }

void testSpecificAddress() { }