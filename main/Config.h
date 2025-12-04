#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include "NetworkDiagnosis.h"

// ================== 디바이스/서버 정보 ==================
extern const char* DEVICE_ID;
extern const char* DEVICE_NAME;
extern const char* serverHost;
extern const int   serverPort;
extern const int   mqttPort;
extern byte        mac[];

// ================== 상태 머신 ==================
enum SystemState {
  STATE_DEVICE_REGISTRATION,
  STATE_I2C_SENSOR_INIT,
  STATE_MODBUS_INIT,
  STATE_MQTT_INIT,
  STATE_NORMAL_OPERATION,
  STATE_NETWORK_RECOVERY  // 네트워크 복구 대기 상태
};

// ================== 전역 데이터 구조 ==================
struct UnoSensorData {
  float ph;                 // pH
  float ec;                 // dS/m
  float waterTemp;          // °C
  bool  isValid;            // 유효성
  unsigned long lastUpdate; // 마지막 업데이트
};

// ================== 전역 변수 선언(다른 .cpp에서 정의) ==================
extern SystemState currentState;
extern UnoSensorData unoSensorData;

extern unsigned long stateChangeTime;
extern const unsigned long STATE_DELAY;

extern EthernetServer httpServer;
extern EthernetClient ethClient;
extern PubSubClient mqttClient;

// 시스템 상태 플래그
extern bool isRegistered;
extern bool mqttConnected;
// extern bool i2cSensorsReady; // I2C 센서는 Modbus로 통합됨
extern bool modbusSensorsReady;
extern bool httpActive;
extern bool registrationAttempted;

// 타이머/인터벌
extern String registrationUrl;
extern unsigned long lastSensorRead;
extern unsigned long lastModbusRead;
extern unsigned long lastMQTTAttempt;
extern unsigned long lastRegCheck;
extern unsigned long lastNetworkCheck;
extern unsigned long networkRecoveryStartTime;
extern unsigned long bootTime;
extern unsigned long mqttFailureStartTime;

extern const unsigned long SENSOR_INTERVAL;
extern const unsigned long MODBUS_INTERVAL;
extern const unsigned long MQTT_RETRY;
extern const unsigned long REG_CHECK_INTERVAL;
extern const unsigned long NETWORK_CHECK_INTERVAL;
extern const unsigned long NETWORK_RECOVERY_TIMEOUT;
extern const unsigned long MQTT_FAILURE_TIMEOUT;
extern const unsigned long BOOT_TIMEOUT;

// ================== 네오픽셀 LED ==================
#define NEOPIXEL_PIN         4   // 네오픽셀 데이터 핀 (D4)
#define NEOPIXEL_COUNT       1   // 네오픽셀 개수 (단일 LED)
#define NEOPIXEL_BRIGHTNESS  50  // 밝기 (0-255)

// ================== 부저 ==================
#define BUZZER_PIN          A10  // 부저 핀
#define BUZZER_FREQ_LOW     250  // 낮은 주파수 (Hz)
#define BUZZER_FREQ_MID     500  // 중간 주파수 (Hz)
#define BUZZER_FREQ_HIGH    750  // 높은 주파수 (Hz)
#define BUZZER_FREQ_SUCCESS 1000 // 성공 음 (Hz)

// ================== 보드/쉴드 핀 (ENC28J60 사용) ==================
// ENC28J60 CS 핀은 NetworkDiagnosis.h에서 정의됨 (53번 핀)
// #ifndef SD_CS_PIN
// #define SD_CS_PIN 4     // SD CS (SPI 간섭 방지용 HIGH)
// #endif

// ================== 네트워크 유틸 프로토타입 ==================
// ENC28J60 네트워크 진단 및 초기화
void initNetworkModule(byte* macAddress);
void initNetworkWithDiagnosis();
DiagnosisResult runSmartDiagnosis(void (*setTextFunc)(const char*, const char*));
void printNetInfoToSerial();
bool maintainDHCP();

// ================== 장치 등록/HTTP 서버/초기화 ==================
void initSetup();
bool checkRegistration();
bool registerDevice();
void handleDeviceRegistration();
void handleWeb();

// ================== 네트워크 모니터링 ==================
bool isNetworkConnected();
void checkNetworkStatus();
void handleNetworkRecovery();

// ================== 네오픽셀 상태 표시 ==================
void initNeoPixel();
void updateNeoPixelStatus();
void setNeoPixelColor(uint8_t r, uint8_t g, uint8_t b);
void setNeoPixelBlink(uint8_t r, uint8_t g, uint8_t b, uint16_t interval);
void setNeoPixelOff();

// ================== 부저 상태 표시 ==================
void initBuzzer();
void updateBuzzerStatus();
void playBuzzerBeep(uint16_t frequency, uint16_t duration);
void playBuzzerPattern(uint16_t frequency, uint16_t onTime, uint16_t offTime, uint8_t count);
void setBuzzerOff();

// ================== 시스템 재시작 관리 ==================
void checkBootTimeout();
void performSoftRestart();
