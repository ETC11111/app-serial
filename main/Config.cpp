#include "Config.h"
// #include "i2cHandler.h"     // i2cSensorCount 등 사용
#include "modbusHandler.h"  // modbusSlaveCount 등 사용
#include <avr/wdt.h>        // Watchdog Timer for software restart
#include <Adafruit_NeoPixel.h>  // 네오픽셀 라이브러리

// ================== 디바이스/서버 정보 정의 ==================
const char* DEVICE_ID   = "SERIALLOG_005";
const char* DEVICE_NAME = "SERIALLOG_005";
const char* serverHost  = "seriallog.com"; // serialfarm.com 으로 교체하면 헬스체크 대상도 자동 변경
const int   serverPort  = 80;
const int   mqttPort    = 1883;
byte        mac[]       = { 0x02, 0x11, 0xA5, 0x7C, 0xB2, 0x40 };

// ================== 전역 변수 정의 ==================
SystemState currentState = STATE_DEVICE_REGISTRATION;
UnoSensorData unoSensorData = { 0.0f, 0.0f, 25.0f, false, 0 };

unsigned long stateChangeTime = 0;
const unsigned long STATE_DELAY = 2000;

EthernetServer httpServer(80);
EthernetClient ethClient;
PubSubClient mqttClient(ethClient);

// 상태 플래그
bool isRegistered = false;
bool mqttConnected = false;
// bool i2cSensorsReady = false; // I2C 센서는 Modbus로 통합됨
bool modbusSensorsReady = false;
bool httpActive = false;
bool registrationAttempted = false;

// 타이머류
String registrationUrl = "";
unsigned long lastSensorRead = 0;
unsigned long lastModbusRead = 0;
unsigned long lastMQTTAttempt = 0;
unsigned long lastRegCheck = 0;
unsigned long lastNetworkCheck = 0;
unsigned long networkRecoveryStartTime = 0;
unsigned long bootTime = 0;
unsigned long mqttFailureStartTime = 0;  // MQTT 연결 실패 시작 시간

const unsigned long SENSOR_INTERVAL   = 6000;
const unsigned long MODBUS_INTERVAL   = 3000;
const unsigned long MQTT_RETRY        = 10000;
const unsigned long REG_CHECK_INTERVAL= 30000;
const unsigned long NETWORK_CHECK_INTERVAL = 5000;  // 5초마다 네트워크 상태 체크
const unsigned long NETWORK_RECOVERY_TIMEOUT = 30000; // 30초 네트워크 복구 대기
const unsigned long MQTT_FAILURE_TIMEOUT = 60000; // 60초 이상 MQTT 연결 실패 시 상태머신 초기화
const unsigned long BOOT_TIMEOUT = 60000; // 20초 부팅 타임아웃 (외부 통신 실패 시 빠른 재시작)

// ================== 네오픽셀 관련 변수 ==================
Adafruit_NeoPixel neopixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);
unsigned long lastNeoPixelUpdate = 0;
bool neoPixelBlinkState = false;
uint8_t neoPixelBlinkR = 0, neoPixelBlinkG = 0, neoPixelBlinkB = 0;
uint16_t neoPixelBlinkInterval = 500;
static SystemState lastNeoPixelState = STATE_NETWORK_RECOVERY; // 상태 변경 감지용

// ================== 부저 관련 변수 ==================
unsigned long lastBuzzerUpdate = 0;
bool buzzerActive = false;
bool buzzerPatternActive = false;
uint16_t buzzerFrequency = 0;
uint16_t buzzerDuration = 0;
uint16_t buzzerPatternOnTime = 0;
uint16_t buzzerPatternOffTime = 0;
uint8_t buzzerPatternCount = 0;
uint8_t buzzerPatternCurrentCount = 0;

// ================== 내부 전용 헬퍼 ==================
// ENC28J60 네트워크 진단 결과 저장
static DiagnosisResult g_lastDiagResult = DIAG_CRITICAL_FAIL;

// ================== 네트워크 유틸 구현 ==================
// ENC28J60 네트워크 초기화 및 진단
void initNetworkWithDiagnosis() {
  // 네트워크 모듈 초기화
  initNetworkModule(mac);
  
  // 네트워크 정보 출력
  printNetInfoToSerial();
  
  // 스마트 진단 실행
  g_lastDiagResult = runSmartDiagnosis(nullptr);
  
  // 진단 결과에 따른 처리
  switch (g_lastDiagResult) {
    case DIAG_SUCCESS:
      Serial.println(F("✅ 네트워크 진단 성공 - 정상 운영 모드"));
      break;
    case DIAG_PARTIAL_FAIL:
      Serial.println(F("⚠️ 네트워크 부분 실패 - 서버 접근 불가"));
      break;
    case DIAG_CRITICAL_FAIL:
      Serial.println(F("❌ 네트워크 진단 실패 - 네트워크 문제"));
      break;
  }
}

// ================== 등록/HTTP/초기화 구현 ==================
bool checkRegistration() {
  EthernetClient client;
  
  // 서버 연결 시도 (1회만)
  if (!client.connect(serverHost, serverPort)) {
    Serial.println(F("❌ 서버 연결 실패"));
    return false;
  }

  client.print(F("GET /api/devices/check/"));
  client.print(DEVICE_ID);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: ")); client.println(serverHost);
  client.println(F("Connection: close\r\n"));
  client.flush(); // 데이터 전송 완료 대기

  // 응답 대기 (초기 딜레이)
  delay(500);
  
  String response = "";
  bool inBody = false;
  String httpStatus = "";
  unsigned long lastDataTime = millis();
  bool gotResponse = false;

  // ENC28J60 UIPEthernet을 위한 응답 처리 개선
  unsigned long timeout = millis() + 10000; // 10초 타임아웃 (공유기 지연 고려)
  
  Serial.println(F("⏳ 서버 응답 대기 중..."));
  
  while (millis() < timeout) {
    // 연결 상태 확인
    if (!client.connected() && !client.available()) {
      // 연결이 끊어졌고 더 이상 데이터가 없으면 종료
      if (gotResponse || httpStatus.length() > 0) {
        break; // 응답을 받았으면 종료
      }
      // 응답 없이 연결이 끊어졌으면 타임아웃까지 대기
      if (millis() - lastDataTime > 3000) {
        Serial.println(F("⚠️ 연결이 끊어졌지만 응답을 받지 못함"));
        break;
      }
    }
    
    if (client.available()) {
      gotResponse = true;
      lastDataTime = millis();
      
      String line = client.readStringUntil('\n');
      line.trim(); // 공백 제거
      
      if (line.startsWith("HTTP/")) {
        httpStatus = line;
        Serial.print(F("🔍 확인 HTTP 상태: "));
        Serial.println(httpStatus);
      }
      
      if (line.length() <= 1) {
        if (!inBody) {
          inBody = true;
          Serial.println(F("🔍 확인 헤더 끝, 본문 시작"));
        }
      } else if (inBody) {
        response += line;
        Serial.print(F("🔍 확인 응답 본문: "));
        Serial.println(line);
      } else {
        Serial.print(F("🔍 확인 헤더: "));
        Serial.println(line);
      }
    } else {
      // 데이터가 없을 때 짧은 딜레이
      delay(10);
    }
  }
  
  // 타임아웃 체크
  if (millis() >= timeout) {
    Serial.println(F("⏱️ HTTP 응답 타임아웃"));
  }
  
  // 연결이 끊어지지 않았다면 강제 종료
  if (client.connected()) {
    client.stop();
  }

  // 디버깅 정보 출력
  Serial.print(F("📡 서버 응답 상태: "));
  if (httpStatus.length() > 0) {
    Serial.println(httpStatus);
  } else {
    Serial.println(F("(없음)"));
  }
  Serial.print(F("📡 서버 응답 내용: "));
  if (response.length() > 0) {
    Serial.println(response);
  } else {
    Serial.println(F("(없음)"));
  }

  // 응답이 없으면 실패
  if (httpStatus.length() == 0) {
    Serial.println(F("❌ 서버로부터 응답을 받지 못함"));
    Serial.println(F("💡 공유기 설정 또는 네트워크 연결 상태를 확인하세요"));
    return false;
  }

  // HTTP 상태 코드 확인
  if (httpStatus.indexOf("200") == -1) {
    Serial.print(F("❌ HTTP 오류 - 등록 확인 실패: "));
    Serial.println(httpStatus);
    return false;
  }

  // JSON 응답 파싱 개선
  bool registered = (response.indexOf("\"registered\":true") > 0);
  bool ipMatches = (response.indexOf("\"ipMatches\":true") > 0);
  
  Serial.print(F("📊 등록 상태: "));
  Serial.println(registered ? F("등록됨") : F("미등록"));
  Serial.print(F("📊 IP 일치: "));
  Serial.println(ipMatches ? F("일치") : F("불일치"));

  return (registered && ipMatches);
}

bool registerDevice() {
  EthernetClient client;
  
  Serial.print(F("🔗 서버 연결 시도: "));
  Serial.print(serverHost);
  Serial.print(F(":"));
  Serial.println(serverPort);
  
  if (!client.connect(serverHost, serverPort)) {
    Serial.println(F("❌ 등록 서버 연결 실패"));
    return false;
  }
  
  Serial.println(F("✅ 서버 연결 성공"));

  // IP 주소를 문자열로 변환
  char ipStr[16];
  ipToStr(Ethernet.localIP(), ipStr, sizeof(ipStr));

  String payload = "{\"deviceId\":\"";
  payload += DEVICE_ID;
  payload += "\",\"deviceName\":\"";
  payload += DEVICE_NAME;
  payload += "\",\"localIP\":\"";
  payload += ipStr;
  payload += "\"}";

  Serial.print(F("📤 등록 요청 전송: "));
  Serial.println(payload);

  client.println(F("POST /api/devices/register HTTP/1.1"));
  client.print(F("Host: ")); client.println(serverHost);
  client.println(F("Content-Type: application/json"));
  client.print(F("Content-Length: ")); client.println(payload.length());
  client.println(F("Connection: close\r\n"));
  client.print(payload);
  client.flush(); // 데이터 전송 완료 대기

  // 응답 대기 (초기 딜레이)
  delay(500);
  
  String response = "";
  bool inBody = false;
  String httpStatus = "";
  unsigned long lastDataTime = millis();
  bool gotResponse = false;

  // ENC28J60 UIPEthernet을 위한 응답 처리 개선
  unsigned long timeout = millis() + 10000; // 10초 타임아웃 (공유기 지연 고려)
  
  Serial.println(F("⏳ 서버 응답 대기 중..."));
  
  while (millis() < timeout) {
    // 연결 상태 확인
    if (!client.connected() && !client.available()) {
      // 연결이 끊어졌고 더 이상 데이터가 없으면 종료
      if (gotResponse || httpStatus.length() > 0) {
        break; // 응답을 받았으면 종료
      }
      // 응답 없이 연결이 끊어졌으면 타임아웃까지 대기
      if (millis() - lastDataTime > 3000) {
        Serial.println(F("⚠️ 연결이 끊어졌지만 응답을 받지 못함"));
        break;
      }
    }
    
    if (client.available()) {
      gotResponse = true;
      lastDataTime = millis();
      
      String line = client.readStringUntil('\n');
      line.trim(); // 공백 제거
      
      if (line.startsWith("HTTP/")) {
        httpStatus = line;
        Serial.print(F("🔍 HTTP 상태: "));
        Serial.println(httpStatus);
      }
      
      if (line.length() <= 1) {
        if (!inBody) {
          inBody = true;
          Serial.println(F("🔍 헤더 끝, 본문 시작"));
        }
      } else if (inBody) {
        response += line;
        Serial.print(F("🔍 응답 본문: "));
        Serial.println(line);
      } else {
        Serial.print(F("🔍 헤더: "));
        Serial.println(line);
      }
    } else {
      // 데이터가 없을 때 짧은 딜레이
      delay(10);
    }
  }
  
  // 타임아웃 체크
  if (millis() >= timeout) {
    Serial.println(F("⏱️ HTTP 응답 타임아웃"));
  }
  
  // 연결이 끊어지지 않았다면 강제 종료
  if (client.connected()) {
    client.stop();
  }

  // 디버깅 정보 출력
  Serial.print(F("📡 등록 응답 상태: "));
  if (httpStatus.length() > 0) {
    Serial.println(httpStatus);
  } else {
    Serial.println(F("(없음)"));
  }
  Serial.print(F("📡 등록 응답 내용: "));
  if (response.length() > 0) {
    Serial.println(response);
  } else {
    Serial.println(F("(없음)"));
  }

  // 응답이 없으면 실패
  if (httpStatus.length() == 0) {
    Serial.println(F("❌ 서버로부터 응답을 받지 못함"));
    Serial.println(F("💡 공유기 설정 또는 네트워크 연결 상태를 확인하세요"));
    return false;
  }

  // HTTP 상태 코드 확인
  if (httpStatus.indexOf("200") == -1) {
    Serial.print(F("❌ 등록 HTTP 오류: "));
    Serial.println(httpStatus);
    return false;
  }

  if (response.indexOf("\"success\":true") > 0) {
    int urlStart = response.indexOf("\"registrationUrl\":\"") + 19;
    if (urlStart > 18) {
      int urlEnd = response.indexOf("\"", urlStart);
      registrationUrl = response.substring(urlStart, urlEnd);
      Serial.print(F("🔗 등록 URL: "));
      Serial.println(registrationUrl);
    }
    registrationAttempted = true;
    Serial.println(F("✅ 디바이스 등록 성공"));
    return true;
  }
  
  Serial.println(F("❌ 디바이스 등록 실패"));
  return false;
}

void handleDeviceRegistration() {
  // 네트워크 연결 상태 확인 - 연결되지 않으면 복구 모드로 전환
  if (!isNetworkConnected()) {
    static unsigned long lastNetworkWarning = 0;
    unsigned long currentTime = millis();
    
    // 10초마다 네트워크 연결 필요 메시지 출력
    if (currentTime - lastNetworkWarning >= 10000) {
      Serial.println(F("⚠ 네트워크 연결 필요 - LAN 케이블을 연결해주세요"));
      Serial.println(F("💡 네트워크 연결 시 자동으로 다음 단계로 진행됩니다"));
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
  
  // ✅ 임시: HTTP 장치 등록 건너뛰기 (80 포트 닫혀있음)
  Serial.println(F("⚠ 임시: HTTP 장치 등록 건너뛰기 (80 포트 닫혀있음)"));
  Serial.println(F("→ MQTT 초기화 단계로 바로 이동"));
  
  isRegistered = true;  // 등록된 것으로 간주
  httpActive = false;
  registrationAttempted = true;
  currentState = STATE_I2C_SENSOR_INIT;   // 다음 단계로 이동
  stateChangeTime = millis();
  
  // 기존 HTTP 등록 코드는 주석 처리
  /*
  if (!registrationAttempted) {
    Serial.println(F("check registration device..."));

    if (checkRegistration()) {
      isRegistered = true;
      httpActive = false;
      Serial.println(F("already registration device"));
      currentState = STATE_I2C_SENSOR_INIT;   // 네트워크 연결 후에만 I2C 스캔 진행
      stateChangeTime = millis();
    } else {
      Serial.println(F("not registered device, enable HTTP !"));
      httpServer.begin();
      httpActive = true;
      registerDevice();
      currentState = STATE_DEVICE_REGISTRATION;
      httpActive = true;
      registrationAttempted = true;
    }
  }

  if (httpActive) {
    handleWeb();

    if (millis() - lastRegCheck > REG_CHECK_INTERVAL) {
      lastRegCheck = millis();
      if (checkRegistration()) {
        isRegistered = true;
        httpActive = false;
        currentState = STATE_MODBUS_INIT;     // 등록 완료 후 다음 스테이트
        stateChangeTime = millis();
        lastRegCheck = millis();
        Serial.println(F("registration complete"));
      }
    }
  }
  */
}

void handleWeb() {
  if (!httpActive) return;

  EthernetClient client = httpServer.available();
  if (!client) return;

  String request = client.readStringUntil('\n');
  while (client.available()) client.read();

  if (request.indexOf("GET / ") >= 0) {
    String html = F("<!DOCTYPE html><html><head><title>Registration</title></head><body>");
    html += F("<h1>Arduino Device</h1>");
    html += F("<p>ID: ");  html += DEVICE_ID;   html += F("</p>");
    html += F("<p>IP: ");  html += Ethernet.localIP(); html += F("</p>");
    // html += F("<p>I2C Sensors: "); html += i2cSensorCount; html += F("</p>"); // I2C 센서는 Modbus로 통합됨
    html += F("<p>Modbus Slaves: "); html += modbusSlaveCount; html += F("</p>");

    if (registrationUrl.length() > 0) {
      html += F("<p><a href='"); html += registrationUrl; html += F("' target='_blank'>Register Device</a></p>");
    } else {
      html += F("<p>Connecting to server...</p>");
    }
    html += F("</body></html>");

    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: text/html"));
    client.println(F("Connection: close"));
    client.print  (F("Content-Length: ")); client.println(html.length());
    client.println();
    client.print(html);
  }

  client.stop();
}

// ================== 네트워크 모니터링 함수들 ==================

// 네트워크 연결 상태 확인 (논블로킹)
bool isNetworkConnected() {
  // IP 주소 확인
  IPAddress localIP = Ethernet.localIP();
  if (localIP == IPAddress(0, 0, 0, 0)) {
    return false;
  }
  
  // 서브넷 마스크 확인
  IPAddress subnetMask = Ethernet.subnetMask();
  if (subnetMask == IPAddress(0, 0, 0, 0)) {
    return false;
  }
  
  // 진단 결과 확인 (최근 진단이 성공이면 연결된 것으로 간주)
  if (g_lastDiagResult == DIAG_SUCCESS) {
    return true;
  }
  
  // 게이트웨이 확인 (있으면 연결 테스트)
  IPAddress gateway = Ethernet.gatewayIP();
  if (gateway != IPAddress(0, 0, 0, 0)) {
    EthernetClient testClient;
    testClient.setTimeout(500); // 0.5초 타임아웃 (더 빠르게)
    if (testClient.connect(gateway, 80)) {
      testClient.stop();
      return true;
    }
    // 게이트웨이 연결 실패해도 IP가 있으면 연결된 것으로 간주
    return true;
  }
  
  // 게이트웨이가 없어도 IP가 있으면 연결된 것으로 간주 (직결 연결)
  return true;
}

// 네트워크 상태 체크 및 복구 처리
void checkNetworkStatus() {
  unsigned long currentTime = millis();
  
  // 5초마다 네트워크 상태 체크
  if (currentTime - lastNetworkCheck >= NETWORK_CHECK_INTERVAL) {
    lastNetworkCheck = currentTime;
    
    bool networkOk = isNetworkConnected();
    static bool lastNetworkState = true;
    
    if (!networkOk) {
      // 네트워크 연결 끊어짐 감지
      if (currentState != STATE_NETWORK_RECOVERY) {
        Serial.println(F("⚠ 네트워크 연결 끊어짐 감지 - 복구 모드 진입"));
        currentState = STATE_NETWORK_RECOVERY;
        networkRecoveryStartTime = currentTime;
        mqttConnected = false;
        isRegistered = false;
        registrationAttempted = false;
      }
      lastNetworkState = false;
    } else {
      // 네트워크 연결 복구됨 (이전에 끊어졌다가 복구된 경우)
      if (!lastNetworkState) {
        if (currentState == STATE_NETWORK_RECOVERY) {
          Serial.println(F("✅ 네트워크 연결 복구됨 - 시스템 재초기화"));
          currentState = STATE_DEVICE_REGISTRATION;
          stateChangeTime = currentTime;
          networkRecoveryStartTime = 0;
          mqttConnected = false;
          isRegistered = false;
          registrationAttempted = false;
        } else if (currentState == STATE_NORMAL_OPERATION) {
          // 노멀 모드에서도 네트워크 복구 감지 (이중 안전장치)
          Serial.println(F("✅ 노멀 모드에서 네트워크 복구 감지 - 시스템 재초기화"));
          currentState = STATE_DEVICE_REGISTRATION;
          stateChangeTime = currentTime;
          networkRecoveryStartTime = 0;
          mqttConnected = false;
          isRegistered = false;
          registrationAttempted = false;
        }
      }
      lastNetworkState = true;
    }
  }
  
  // 60초마다 네트워크 진단 재실행 (실패 시에만)
  static unsigned long lastDiagnosis = 0;
  if (currentTime - lastDiagnosis >= 60000) {
    lastDiagnosis = currentTime;
    if (g_lastDiagResult != DIAG_SUCCESS) {
      Serial.println(F("🔄 네트워크 재진단 실행"));
      g_lastDiagResult = runSmartDiagnosis(nullptr);
    }
  }
  
  // DHCP 유지
  maintainDHCP();
  

}

// 네트워크 복구 대기 상태 처리
void handleNetworkRecovery() {
  unsigned long currentTime = millis();
  
  // 복구 타임아웃 체크 (30초)
  if (currentTime - networkRecoveryStartTime >= NETWORK_RECOVERY_TIMEOUT) {
    static bool timeoutMessageShown = false;
    if (!timeoutMessageShown) {
      Serial.println(F("⏰ 네트워크 복구 타임아웃 (30초) - 계속 대기 중"));
      Serial.println(F("💡 LAN 케이블을 연결하면 자동으로 복구됩니다"));
      timeoutMessageShown = true;
    }
    
    // 5분마다 타임아웃 메시지 반복
    static unsigned long lastTimeoutMessage = 0;
    if (currentTime - lastTimeoutMessage >= 300000) { // 5분
      Serial.println(F("⏰ 네트워크 복구 대기 중... (LAN 케이블 연결 확인)"));
      lastTimeoutMessage = currentTime;
    }
  }
  
  // 네트워크 상태 재확인 및 재초기화 시도 (2초마다)
  static unsigned long lastRecoveryCheck = 0;
  if (currentTime - lastRecoveryCheck >= 2000) {
    lastRecoveryCheck = currentTime;
    
    // IP 주소 확인
    IPAddress localIP = Ethernet.localIP();
    static IPAddress lastIP = IPAddress(0, 0, 0, 0);
    
    if (localIP != lastIP) {
      Serial.print(F("🔗 IP 상태 변화: "));
      Serial.print(lastIP);
      Serial.print(F(" → "));
      Serial.println(localIP);
      lastIP = localIP;
    }
    
    if (localIP != IPAddress(0, 0, 0, 0)) {
      // 🔥 IP가 할당되었으면 DHCP부터 다시 시작 (부팅 시와 동일한 프로세스)
      static unsigned long lastReinitAttempt = 0;
      const unsigned long REINIT_RETRY_INTERVAL = 5000; // 5초마다 재시도
      
      if (currentTime - lastReinitAttempt >= REINIT_RETRY_INTERVAL) {
        lastReinitAttempt = currentTime;
        Serial.println(F("🔗 IP 할당 감지됨 - 네트워크 재초기화 (DHCP부터)"));
        
        // DHCP부터 다시 시작 (부팅 시와 동일)
        initNetworkWithDiagnosis();
        
        if (g_lastDiagResult == DIAG_SUCCESS) {
          Serial.println(F("✅ 네트워크 재초기화 성공 - 시스템 재초기화"));
          Serial.println(F("  💡 공유기 완전 부팅 확인 - 정상 IP 할당됨"));
          
          // 네트워크 안정화를 위한 잠시 대기
          Serial.println(F("⏳ 네트워크 안정화 대기 (3초)..."));
          delay(3000);
          
          currentState = STATE_DEVICE_REGISTRATION;
          stateChangeTime = currentTime;
          networkRecoveryStartTime = 0;
          
          // 상태 리셋
          mqttConnected = false;
          isRegistered = false;
          registrationAttempted = false;
          // i2cSensorsReady = false; // I2C 센서는 Modbus로 통합됨
          modbusSensorsReady = false;
          mqttFailureStartTime = 0;  // MQTT 실패 시간도 리셋
          
          // 부팅 타임아웃 리셋 (네트워크 복구 시 새로운 시작)
          bootTime = millis();
          Serial.println(F("🔄 부팅 타임아웃 리셋 - 새로운 60초 카운트 시작"));
        } else {
          Serial.println(F("❌ 네트워크 재초기화 실패 - 가짜 IP 가능성"));
          Serial.println(F("  ⏳ 공유기 완전 부팅 대기 중... (5초 후 재시도)"));
        }
      }
    } else {
      // IP가 여전히 없으면 간단한 상태만 출력
      static unsigned long lastIPCheck = 0;
      if (currentTime - lastIPCheck >= 10000) { // 10초마다
        Serial.println(F("🔍 IP 할당 확인 중... (LAN 케이블 연결 대기)"));
        lastIPCheck = currentTime;
      }
    }
  }
  
  // DHCP 유지
  maintainDHCP();
  

}


// ================== 초기화(네트워크 + RS485) ==================
void initSetup() {
  Serial.begin(115200);
  while (!Serial) { ; }
  Serial.println(F("Start Serial"));
  
  // 부팅 시간 기록
  bootTime = millis();
  Serial.println(F("🚀 시스템 부팅 시작 - 60초 후 자동 재시작 안전장치 활성화"));

  // 네오픽셀 초기화
  initNeoPixel();
  
  // 부저 초기화
  initBuzzer();

  // ✅ 네트워크 초기화 전 복구 모드 상태로 시작
  currentState = STATE_NETWORK_RECOVERY;
  networkRecoveryStartTime = millis();
  Serial.println(F("🔄 네트워크 초기화 시작 - 복구 모드"));

  // ENC28J60 네트워크 초기화 및 진단
  initNetworkWithDiagnosis();

  // 네트워크 진단 결과에 따른 처리
  if (g_lastDiagResult == DIAG_SUCCESS) {
    Serial.println(F("✅ 네트워크 초기화 성공 - 정상 운영 모드"));
    currentState = STATE_DEVICE_REGISTRATION;  // ✅ 성공 시에만 다음 단계로
    stateChangeTime = millis();
    networkRecoveryStartTime = 0;
    bootTime = 0;  // ✅ 부팅 타임아웃 비활성화
  } else {
    Serial.println(F("⚠ 네트워크 초기화 불완전(링크/전원/배선 확인 권장)"));
    Serial.println(F("💡 LAN 케이블을 연결하면 자동으로 복구됩니다"));
    Serial.println(F("🔄 네트워크 복구 대기 모드 유지"));
    
    // ✅ 네트워크 복구 모드 유지
    currentState = STATE_NETWORK_RECOVERY;
    networkRecoveryStartTime = millis();
    // bootTime은 유지 (60초 후 재시작)
  }

  // RS485 초기화 (기존 프로젝트 심볼 사용)
  pinMode(RS485_CONTROL_DE_RE_PIN, OUTPUT);
  digitalWrite(RS485_CONTROL_DE_RE_PIN, HIGH);
  RS485_CONTROL_SERIAL.begin(RS485_CONTROL);
}

// ================== 시스템 재시작 관리 ==================

// 부팅 타임아웃 체크
void checkBootTimeout() {
  // 부팅 타임아웃이 비활성화된 경우 (정상 시작됨)
  if (bootTime == 0) {
    return;
  }
  
  unsigned long currentTime = millis();
  
  // 20초 경과 확인
  if (currentTime - bootTime >= BOOT_TIMEOUT) {
    Serial.println(F("⏰ 부팅 타임아웃 (20초) - 시스템 재시작"));
    Serial.println(F("🔄 안전장치 작동: 소프트웨어 재시작 실행"));
    Serial.print(F("📊 현재 상태: "));
    switch (currentState) {
      case STATE_DEVICE_REGISTRATION: Serial.println(F("디바이스 등록")); break;
      case STATE_I2C_SENSOR_INIT: Serial.println(F("I2C 센서 초기화")); break;
      case STATE_MODBUS_INIT: Serial.println(F("Modbus 초기화")); break;
      case STATE_MQTT_INIT: Serial.println(F("MQTT 초기화")); break;
      case STATE_NORMAL_OPERATION: Serial.println(F("정상 운영")); break;
      case STATE_NETWORK_RECOVERY: Serial.println(F("네트워크 복구")); break;
      default: Serial.println(F("알 수 없음")); break;
    }
    
    // 재시작 전 잠시 대기 (로그 출력 완료)
    delay(2000);
    
    performSoftRestart();
  }
  
  // 15초 경과 시 경고 메시지
  static bool warningShown = false;
  if (!warningShown && currentTime - bootTime >= 15000) {
    Serial.println(F("⚠️ 5초 후 자동 재시작 (부팅 타임아웃)"));
    Serial.print(F("📊 현재 상태: "));
    switch (currentState) {
      case STATE_DEVICE_REGISTRATION: Serial.println(F("디바이스 등록")); break;
      case STATE_I2C_SENSOR_INIT: Serial.println(F("I2C 센서 초기화")); break;
      case STATE_MODBUS_INIT: Serial.println(F("Modbus 초기화")); break;
      case STATE_MQTT_INIT: Serial.println(F("MQTT 초기화")); break;
      case STATE_NORMAL_OPERATION: Serial.println(F("정상 운영")); break;
      case STATE_NETWORK_RECOVERY: Serial.println(F("네트워크 복구")); break;
      default: Serial.println(F("알 수 없음")); break;
    }
    warningShown = true;
  }
}

// 소프트웨어 재시작 실행
void performSoftRestart() {
  Serial.println(F("🔄 소프트웨어 재시작 실행 중..."));
  Serial.flush(); // 시리얼 출력 완료 대기
  
  // Arduino Mega의 경우 소프트웨어 재시작 방법
  #if defined(__AVR__)
    // Watchdog Timer를 사용한 재시작 (가장 안전한 방법)
    wdt_disable(); // 기존 watchdog 비활성화
    wdt_enable(WDTO_15MS); // 15ms 후 재시작
    while(1) {} // 무한 루프로 재시작 대기
  #else
    // AVR이 아닌 경우 포인터를 NULL로 설정하여 크래시 유도
    void (*resetFunc)(void) = 0;
    resetFunc();
  #endif
}

// ================== 네오픽셀 상태 표시 함수들 ==================

// 네오픽셀 초기화
void initNeoPixel() {
  neopixel.begin();
  neopixel.setBrightness(NEOPIXEL_BRIGHTNESS);
  neopixel.clear();
  neopixel.show();
  Serial.println(F("🌈 네오픽셀 초기화 완료"));
}

// 네오픽셀 상태 업데이트 (상태 머신에 따른 색상 표시)
void updateNeoPixelStatus() {
  unsigned long currentTime = millis();
  
  // 상태 변경 감지: 상태 변경 직후에는 딜레이 적용 (다음 상태 처리와 겹침 방지)
  const unsigned long STATE_CHANGE_DELAY_MS = 50; // 상태 변경 후 50ms 지연
  bool stateChanged = (currentState != lastNeoPixelState);
  
  if (stateChanged) {
    // 상태 변경 직후라면 딜레이 적용
    unsigned long timeSinceStateChange = currentTime - stateChangeTime;
    if (timeSinceStateChange < STATE_CHANGE_DELAY_MS) {
      return; // 상태 변경 직후에는 업데이트 지연
    }
    lastNeoPixelState = currentState;
  }
  
  // 깜빡임 처리
  if (neoPixelBlinkState && (currentTime - lastNeoPixelUpdate >= neoPixelBlinkInterval)) {
    lastNeoPixelUpdate = currentTime;
    static bool blinkToggle = false;
    blinkToggle = !blinkToggle;
    
    if (blinkToggle) {
      neopixel.setPixelColor(0, neopixel.Color(neoPixelBlinkR, neoPixelBlinkG, neoPixelBlinkB));
    } else {
      neopixel.setPixelColor(0, neopixel.Color(0, 0, 0));
    }
    neopixel.show();
  }
  
  // 상태 머신에 따른 색상 설정
  switch (currentState) {
    case STATE_DEVICE_REGISTRATION:
      // ✅ 네트워크 진단 성공 여부 확인
      if (g_lastDiagResult == DIAG_SUCCESS) {
        // 네트워크 연결됨 - 주황색 깜빡임 (장치 등록 대기)
        setNeoPixelBlink(255, 165, 0, 1000); // 주황색 1초 간격
      } else {
        // 네트워크 연결 불완전 - 빨간색 깜빡임
        setNeoPixelBlink(255, 0, 0, 500); // 빨간색 0.5초 간격
      }
      break;
      
    case STATE_I2C_SENSOR_INIT:
    case STATE_MODBUS_INIT:
      // 센서 스캔 중 - 파란색 깜빡임
      setNeoPixelBlink(0, 0, 255, 300); // 파란색 0.3초 간격
      break;
      
    case STATE_MQTT_INIT:
      // MQTT 연결 시도 - 보라색 깜빡임
      setNeoPixelBlink(128, 0, 128, 800); // 보라색 0.8초 간격
      break;
      
    case STATE_NORMAL_OPERATION:
      // ✅ MQTT 연결 성공 시에만 초록색
      if (mqttConnected && g_lastDiagResult == DIAG_SUCCESS) {
        // 정상 운영 - 초록색 고정
        setNeoPixelColor(0, 255, 0); // 초록색
      } else {
        // MQTT 연결 끊어짐 - 노란색 깜빡임
        setNeoPixelBlink(255, 255, 0, 1000); // 노란색 1초 간격
      }
      break;
      
    case STATE_NETWORK_RECOVERY:
      // 네트워크 복구 대기 - 빨간색 빠른 깜빡임
      setNeoPixelBlink(255, 0, 0, 200); // 빨간색 0.2초 간격
      break;
  }
}


// 네오픽셀 색상 설정 (고정)
void setNeoPixelColor(uint8_t r, uint8_t g, uint8_t b) {
  neoPixelBlinkState = false; // 깜빡임 비활성화
  neopixel.setPixelColor(0, neopixel.Color(r, g, b));
  neopixel.show();
}

// 네오픽셀 깜빡임 설정
void setNeoPixelBlink(uint8_t r, uint8_t g, uint8_t b, uint16_t interval) {
  neoPixelBlinkState = true;
  neoPixelBlinkR = r;
  neoPixelBlinkG = g;
  neoPixelBlinkB = b;
  neoPixelBlinkInterval = interval;
}

// 네오픽셀 끄기
void setNeoPixelOff() {
  neoPixelBlinkState = false;
  neopixel.setPixelColor(0, neopixel.Color(0, 0, 0));
  neopixel.show();
}

// ================== 부저 상태 표시 함수들 ==================

// 부저 초기화
void initBuzzer() {
  pinMode(BUZZER_PIN, OUTPUT);
  setBuzzerOff();
  Serial.println(F("🔊 부저 초기화 완료"));
}

// 부저 상태 업데이트 (상태 머신에 따른 사운드)
void updateBuzzerStatus() {
  unsigned long currentTime = millis();
  
  // 상태 변경 감지: 상태 변경 직후에는 딜레이 적용 (다음 상태 처리와 겹침 방지)
  const unsigned long STATE_CHANGE_DELAY_MS = 50; // 상태 변경 후 50ms 지연
  static SystemState lastBuzzerState = STATE_NETWORK_RECOVERY;
  bool stateChanged = (currentState != lastBuzzerState);
  
  if (stateChanged) {
    // 상태 변경 직후라면 딜레이 적용
    unsigned long timeSinceStateChange = currentTime - stateChangeTime;
    if (timeSinceStateChange < STATE_CHANGE_DELAY_MS) {
      return; // 상태 변경 직후에는 업데이트 지연
    }
    lastBuzzerState = currentState;
  }
  
  // 패턴 재생 중 처리
  if (buzzerPatternActive) {
    if (buzzerPatternCurrentCount < buzzerPatternCount) {
      // On 시간 체크
      if (currentTime - lastBuzzerUpdate >= buzzerPatternOnTime && !buzzerActive) {
        // 부저 켜기
        tone(BUZZER_PIN, buzzerFrequency);
        buzzerActive = true;
        lastBuzzerUpdate = currentTime;
      }
      // Off 시간 체크 (On 시간 이후)
      else if (currentTime - lastBuzzerUpdate >= buzzerPatternOnTime + buzzerPatternOffTime && buzzerActive) {
        // 부저 끄기
        noTone(BUZZER_PIN);
        buzzerActive = false;
        buzzerPatternCurrentCount++;
        lastBuzzerUpdate = currentTime;
      }
    } else {
      // 패턴 완료
      buzzerPatternActive = false;
      setBuzzerOff();
    }
  }
  
  // 상태 머신에 따른 사운드 설정 (상태 변경 시 한 번만 재생)
  static SystemState lastState = STATE_NETWORK_RECOVERY;
  static bool lastMqttConnected = false;
  
  if (currentState != lastState) {
    lastState = currentState;
    
    switch (currentState) {
      case STATE_DEVICE_REGISTRATION:
        if (isNetworkConnected()) {
          // 네트워크 연결됨 - 주황색 깜빡임과 짧은 비프 1개
          playBuzzerBeep(BUZZER_FREQ_MID, 100);
        } else {
          // 네트워크 연결 시도 중 - 빨간색 깜빡임과 긴 비프 1개
          playBuzzerBeep(BUZZER_FREQ_LOW, 300);
        }
        break;
        
      case STATE_I2C_SENSOR_INIT:
      case STATE_MODBUS_INIT:
        // 센서 스캔 중 - 파란색 깜빡임과 빠른 비프 2개
        playBuzzerPattern(BUZZER_FREQ_MID, 100, 100, 2);
        break;
        
      case STATE_MQTT_INIT:
        // MQTT 연결 시도 - 보라색 깜빡임과 중간 비프 2개
        playBuzzerPattern(BUZZER_FREQ_HIGH, 150, 150, 2);
        break;
        
      case STATE_NORMAL_OPERATION:
        // 첫 진입 시 성공 음 재생
        if (mqttConnected) {
          playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 3);
        }
        lastMqttConnected = mqttConnected;
        break;
        
      case STATE_NETWORK_RECOVERY:
        // 네트워크 복구 대기 - 빨간색 빠른 깜빡임과 긴급 경고 음
        playBuzzerPattern(BUZZER_FREQ_LOW, 300, 100, 3);
        break;
    }
  }
  
  // 정상 운영 중 MQTT 연결 상태 변경 시에만 부저 재생 (첫 진입 제외)
  if (currentState == STATE_NORMAL_OPERATION && mqttConnected != lastMqttConnected) {
    lastMqttConnected = mqttConnected;
    
    if (!mqttConnected) {
      // MQTT 연결 끊어짐 - 노란색 깜빡임과 경고 음
      playBuzzerPattern(BUZZER_FREQ_LOW, 200, 200, 2);
    }
  }
}

// 부저 비프 재생 (단일)
void playBuzzerBeep(uint16_t frequency, uint16_t duration) {
  buzzerPatternActive = false; // 패턴 비활성화
  setBuzzerOff();
  tone(BUZZER_PIN, frequency, duration);
  lastBuzzerUpdate = millis();
}

// 부저 패턴 재생 (여러 번)
void playBuzzerPattern(uint16_t frequency, uint16_t onTime, uint16_t offTime, uint8_t count) {
  buzzerPatternActive = true;
  buzzerFrequency = frequency;
  buzzerPatternOnTime = onTime;
  buzzerPatternOffTime = offTime;
  buzzerPatternCount = count;
  buzzerPatternCurrentCount = 0;
  buzzerActive = false;
  lastBuzzerUpdate = millis();
}

// 부저 끄기
void setBuzzerOff() {
  buzzerPatternActive = false;
  buzzerActive = false;
  noTone(BUZZER_PIN);
}
