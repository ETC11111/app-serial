#pragma once

#include <Arduino.h>

// RS485 핀 정의 (센싱용과 제어용 분리)
#define RS485_SENSING_DE_RE_PIN 5     // Modbus 센싱용 (Serial1)
#define RS485_CONTROL_DE_RE_PIN 6     // NPN 모듈 제어용 (Serial3)

// RS485 시리얼 정의
#define RS485_SENSING_SERIAL Serial1  // 센싱용 (UNO 센서 통신)
#define RS485_CONTROL_SERIAL Serial3  // NPN 제어용
#define RS485_SENSING 57600  // UNO와 통신 (이전 4800에서 변경)
#define RS485_CONTROL 57600

// RS485 제어 헬퍼 (헤더에서 인라인 정의)
inline void RS485_CTRL_TX() { digitalWrite(RS485_CONTROL_DE_RE_PIN, HIGH); }
inline void RS485_CTRL_RX() { digitalWrite(RS485_CONTROL_DE_RE_PIN, LOW); }
inline void RS485_SENS_TX() { digitalWrite(RS485_SENSING_DE_RE_PIN, HIGH); }
inline void RS485_SENS_RX() { digitalWrite(RS485_SENSING_DE_RE_PIN, LOW); }

// RS485 타이밍 상수
#define RS485_TURNAROUND_US 250   // RS485 송수신 전환 시간 (마이크로초)
#define RS485_INTERCHAR_US 100    // RS485 문자 간 시간 (마이크로초)

// NPN 모듈 제어용 상수
#define NPN_SLAVE_ADDRESS 0x01
#define TOTAL_NPN_CHANNELS 12
#define MAX_MODBUS_SLAVES 10

// 🔥 NPN 비트연산 명령 상수
#define NPN_CMD_MULTI_ON 0x10   // 다중 NPN ON
#define NPN_CMD_MULTI_OFF 0x11  // 다중 NPN OFF

// ============= 바이트 기반 명령 정의 (UNO와 동일) =============
#define CMD_RESET 0x20          // 서버 호환성 (모든 핀 OFF)
#define CMD_ALLOFF 0x21         // 서버 호환성 (모든 핀 OFF)
#define CMD_TOGGLE 0x22         // 단일 핀 토글
#define CMD_ON 0x23             // 단일 핀 ON (채널 지정)
#define CMD_OFF 0x24            // 단일 핀 OFF (채널 지정)
#define CMD_SENSOR_REQUEST 0x25 // 센서 데이터 요청
#define CMD_EC_PULSE 0x26       // EC 펄스 토글 (2개 핀 동시 제어)
#define CMD_EC_OFF 0x28         // EC OFF (2개 핀 동시 제어)
#define CMD_BED_ON 0x29         // 베드 ON (4개 핀 동시 제어) - NPN 충돌 방지

// 응답 코드 정의 (UNO와 동일)
#define ACK_OK 0x80
#define ACK_ERROR 0x81
#define ACK_SENSOR_DATA 0x82
#define ACK_STATUS_DATA 0x83 // 상태 데이터 응답
#define CMD_STATUS_REQUEST 0x33 // nutCycle 상태 요청

// CRC16 테이블
extern const uint16_t PROGMEM crc_table[256];

// ============= 센서 타입 정의 =============
enum modbusSensorType { 
  // 기존 Modbus 센서들
  MODBUS_TEMP_HUMID = 11,
  MODBUS_PRESSURE = 12,
  MODBUS_FLOW = 13,
  MODBUS_RELAY = 14,
  MODBUS_ENERGY_METER = 15,
  MODBUS_WIND_DIRECTION = 16,
  MODBUS_WIND_SPEED = 17,
  MODBUS_RAIN_SNOW = 18,
  MODBUS_SOIL_SENSOR = 19,
  
  // I2C 센서들을 Modbus로 통일
  MODBUS_SHT20 = 21,        // 온습도 센서
  MODBUS_SCD41 = 22,        // CO2 센서
  MODBUS_TSL2591 = 23,      // 조도 센서
  MODBUS_BH1750 = 24,       // 조도 센서 (대체)
  MODBUS_ADS1115 = 25,      // pH/EC 센서
  MODBUS_DS18B20 = 26       // 온도 센서
};

// ============= 센서 주소 범위 정의 =============
// 각 센서 타입별로 5개 주소 범위 할당
#define SOIL_SENSOR_START     1
#define SOIL_SENSOR_END       5
#define WIND_DIR_START        6
#define WIND_DIR_END          10
#define WIND_SPEED_START      11
#define WIND_SPEED_END        15
#define RAIN_SNOW_START       16
#define RAIN_SNOW_END         20
#define TEMP_HUMID_START      21
#define TEMP_HUMID_END        25
#define PRESSURE_START        26
#define PRESSURE_END          30
#define FLOW_START            31
#define FLOW_END              35
#define RELAY_START           36
#define RELAY_END             40
#define ENERGY_METER_START    41
#define ENERGY_METER_END      45

// I2C 센서들을 Modbus로 통일한 주소 범위
#define SHT20_START           51
#define SHT20_END             55
#define SCD41_START           56
#define SCD41_END             60
#define TSL2591_START         61
#define TSL2591_END           65
#define BH1750_START          66
#define BH1750_END            70
#define ADS1115_START         71
#define ADS1115_END           75
#define DS18B20_START         76
#define DS18B20_END           80

struct ModbusSlave {
  uint16_t slaveId;
  modbusSensorType type;
  bool active;
  uint16_t registers[10];
  unsigned long lastRead;
  String name;
  
  // 센서 상태 모니터링
  bool isOnline;           // 센서 온라인 상태
  unsigned long lastResponse; // 마지막 응답 시간
  uint8_t consecutiveFailures; // 연속 실패 횟수
  unsigned long lastHealthCheck; // 마지막 헬스체크 시간
};

struct SoilData {
  float humidity;
  float temperature;
  float EC;
  float pH;
  uint16_t nitrogen;
  uint16_t phosphorus;
  uint16_t potassium;
  bool isValid;
};

extern ModbusSlave modbusSensors[];
extern uint8_t modbusSlaveCount;

// ============= RS485 통신 함수들 (Serial1 센싱용: 센서 전용 UNO와 통신) =============
void handleModbusInitialization();
void scanModbusSensors();
bool readModbusRegisters(uint8_t slaveAddr, uint16_t startAddr, uint16_t count, uint16_t* data);
bool sendModbusRequest(uint8_t slaveAddr, uint8_t functionCode, 
                       uint16_t startReg, uint16_t regCount, 
                       uint8_t *response, uint8_t &responseLen, 
                       uint16_t timeout = 500);

// 디버그 폴링 (SHT20)
void debugPollSHT20FromUno(uint8_t slaveAddr);

// 하트비트 (Report Slave ID, FC=0x11)
bool unoHeartbeat(uint8_t slaveAddr);

// ============= 제어용 UNO(Serial3) 존재 감지 및 활성화 토글 =============
extern bool unoControlPresent;             // 제어용 UNO 존재 여부
void pollUnoControlHandshake();            // IDLE 시 Serial3에서 헬로 토큰 감지
#define UNO_CONTROL_HELLO "UNO_CTRL_HELLO" // UNO_RELAY가 주기적으로 전송하는 토큰

// 센서 전용 UNO(SHT20) 주소 범위 (Serial1/Modbus RTU)
#ifndef UNO_SHT20_START
#define UNO_SHT20_START 51
#endif
#ifndef UNO_SHT20_END
#define UNO_SHT20_END 55
#endif

// 순환 폴링 (하나씩 차례로 폴링)
void debugPollSHT20Cycle(uint8_t startAddr, uint8_t endAddr);

// 전체 주소 범위 스캔 (UNO 래핑 포함)
void scanAllUnoSensors();

// 센서용 UNO(Serial1) 핸드셰이크 (동적 장착 지원)
#define UNO_SENSING_HELLO "UNO_SENS_HELLO"
extern bool unoSensingPresent;
extern unsigned long lastUnoSensingHelloMs;
// 신규: 주소 질의 및 응답 포맷
#define MEGA_SENSING_REQ_ADDR "MEGA_SENS_REQ_ADDR"
#define UNO_SENSING_ADDR_PREFIX "UNO_ADDR:"

// 레거시 Modbus 범위까지 스캔할지 여부 (기본 비활성화)
#ifndef SCAN_LEGACY_MODBUS_RANGES
#define SCAN_LEGACY_MODBUS_RANGES 0
#endif
void pollUnoSensingHandshake();
void refreshUnoWrappedSensors();
void pollUnoPushFrames();
void resetUnoBucketsIfExpired();

// ============= 디지털 핀 펄스 기반 UNO ID 할당 =============
void assignUnoIdsByPulses();  // 초기화 시 UNO ID 할당

// ============= Modbus CRC 계산 =============
uint16_t calcCRC16(const uint8_t *buf, uint8_t len);
/*
// ============= Modbus 센서 읽기 함수들 =============
bool readSoilSensor(uint8_t slaveAddr, SoilData* soilData);
bool readWindDirection(uint8_t slaveAddr, uint16_t* gearValue, uint16_t* degreeValue);
bool readWindSpeed(uint8_t slaveAddr, uint16_t* rawSpeed);
bool readRainSnowSensor(uint8_t slaveAddr, uint16_t* rainFlag, uint16_t* snowFlag, 
                        float* temperature, uint16_t* humidity, uint16_t* moistureLevel);
uint8_t getPrecipitationStatus(uint16_t rainFlag, uint16_t snowFlag);
*/

// ============= RS485 제어 함수들 (Serial3 제어용-UNO and NPN)=============
bool sendNPNModbusCommand(uint8_t *command, uint8_t length, uint16_t timeout = 300);
bool controlSingleNPNRelay(uint8_t channel, uint16_t command);
bool allNPNChannelsOff();
bool npnChannelOn(uint8_t channel);
bool npnChannelOff(uint8_t channel);
uint16_t calculateCRC16(uint8_t *data, uint8_t length);

// ============= UNO 제어 함수들 추가 =============
void unoStart();
void unoStop();

// ============= UNO 센서 데이터 함수들 =============
bool requestUnoSensorData();
bool isUnoSensorDataValid();
bool parseUnoSensorData(const String& data);

// ============= Non-blocking 센서 요청 시스템 =============
enum UnoRequestState {
    UNO_IDLE,           // 대기 상태
    UNO_SENDING,        // 요청 전송 중
    UNO_WAITING,        // 응답 대기 중
    UNO_RECEIVING       // 응답 수신 중
};

extern UnoRequestState unoRequestState;
extern unsigned long unoRequestStartTime;
extern String unoResponseBuffer;

void initUnoSensorRequest();
bool updateUnoSensorRequest(); // Non-blocking 업데이트
void startUnoSensorRequest();  // 센서 요청 시작

// ============= Non-blocking 상태 요청 시스템 =============
extern UnoRequestState unoStatusRequestState;
extern unsigned long unoStatusRequestStartTime;
extern String unoStatusResponseBuffer;

void initUnoStatusRequest();
bool updateUnoStatusRequest(); // Non-blocking 업데이트
void startUnoStatusRequest();  // 상태 요청 시작
bool sendStatusToMQTT(); // UNO 상태 기반으로 서버에 전송

// ============= Serial3 통신 관리 시스템 =============
enum Serial3Owner {
    SERIAL3_IDLE,       // 사용 중이 아님
    SERIAL3_UNO_CONTROL, // UNO 제어 (최우선)
    SERIAL3_NPN,        // NPN 모듈 제어 (중간 우선순위)
    SERIAL3_UNO_SENSOR  // UNO 센서 (최저 우선순위)
};

// 우선순위 정의 (낮은 숫자가 높은 우선순위)
#define PRIORITY_UNO_CONTROL 1
#define PRIORITY_NPN         2
#define PRIORITY_UNO_SENSOR  3

extern Serial3Owner serial3Owner;
extern unsigned long serial3LastUsed;
extern unsigned long serial3CooldownTime;

bool requestSerial3Access(Serial3Owner requester);
void releaseSerial3Access();
bool isSerial3Available();
bool isSerial3AvailableFor(Serial3Owner requester); // 특정 요청자용 사용 가능 여부
int getPriority(Serial3Owner owner); // 우선순위 조회
void initSerial3Manager();
void unoReset();
void unoAllOff();
void unoChannelOn(uint8_t channel);
void unoChannelOff(uint8_t channel);


// UNO 즉시 제어 함수들 (콜백 방식)
bool waitForUnoAck(unsigned long timeoutMs = 1000);
void unoChannelOnImmediate(uint8_t channel);
void unoChannelOffImmediate(uint8_t channel);
void togglePulseImmediate(int pinIndex);
void togglePulseFast(int pinIndex);
void toggleECPulseFast(); // EC 펄스 전용 (2개 릴레이 동시 제어)
void ecOffFast(); // EC OFF 전용 (2개 릴레이 동시 제어)
void bedOnFast(uint8_t bedMask); // 베드 ON 전용 (4개 릴레이 동시 제어)
void resetUnoImmediate();
void allOffUnoImmediate();


// ============= UNO ACK 서버 전달 함수 =============
void sendUnoAckToServer(const char* command, uint8_t channel, bool success, const char* commandId = nullptr);

// ============= UNO nutCycle 설정 전달 함수 =============
void sendNutrientConfigToUno(const char* jsonConfig);

// ============= NPN 비트연산 제어 함수들 =============
bool sendNPNMultiCommand(uint8_t cmd, uint16_t bitmask);
bool npnMultiChannelOn(uint16_t channelMask);
bool npnMultiChannelOff(uint16_t channelMask);

// ============= 센서 상태 모니터링 함수들 (UNO가 담당하므로 주석처리) =============
/*
void checkSensorHealth();
void updateSensorStatus(uint8_t slaveId, bool success);
bool isSensorOnline(uint8_t slaveId);
void performHealthCheck();
void resetSensorFailureCount(uint8_t slaveId);
void markSensorOffline(uint8_t slaveId);
void markSensorOnline(uint8_t slaveId);
*/

// ============= I2C 센서 Modbus 통합 함수들 (UNO가 담당하므로 주석처리) =============
/*
bool readSHT20Modbus(uint8_t slaveId, float* temp, float* humid);
bool readSCD41Modbus(uint8_t slaveId, float* co2_ppm);
bool readTSL2591Modbus(uint8_t slaveId, float* lux, uint16_t* visible, uint16_t* infrared);
bool readBH1750Modbus(uint8_t slaveId, float* lux);
bool readADS1115Modbus(uint8_t slaveId, float* ph_val, float* ec_val, float* water_temp);
bool readDS18B20Modbus(uint8_t slaveId, float* temperature);
*/

// ============= 통합 제어 함수들 =============
bool handleNPNCommand(const String& command, uint8_t channel, String& response);
bool handleUNOCommand(const String& command, int channel, String& response);
bool handleKindCommand(const String& kind, const String& command, uint8_t channel, String& response);
bool handleMultiRelayCommand(const String& action, JsonArray& channels, String& response);

void updateUnoIdAssignmentManager();

// ============= Phase 2: Combined ID 함수들 =============
// Combined ID 생성 (타입 코드 + UNO ID)
// 하위 5비트: 타입 코드 (0~31)
// 상위 3비트: UNO ID (0~7)
uint8_t makeCombinedId(uint8_t typeCode, uint8_t unoId);

// Combined ID 분리
void splitCombinedId(uint8_t combinedId, uint8_t* typeCode, uint8_t* unoId);