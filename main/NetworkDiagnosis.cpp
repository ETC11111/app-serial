#include "NetworkDiagnosis.h"
#include "Config.h"

// =====================================================
// ========== 전역 변수 및 상수 정의 ===================
// =====================================================

const uint8_t ENC28J60_CS = 53;

bool USE_STATIC_ON_DHCP_FAIL = true;
IPAddress STATIC_IP(192, 168, 0, 233);
IPAddress STATIC_GATEWAY(192, 168, 0, 1);
IPAddress STATIC_MASK(255, 255, 255, 0);
IPAddress STATIC_DNS(8, 8, 8, 8);

// isPrimary: true = 주요 테스트 (빠른 경로), false = 보조 테스트 (상세 진단)
NetTarget targets[] = {
  { "LAN Gateway",              nullptr,          IPAddress(0,0,0,0),        80, "/",            true  },  // ✅ 동적으로 설정됨
  { "seriallog.com",            "seriallog.com",  IPAddress(210,114,18,16),  80, "/api/health/", true  },  // 2순위
  { "neverssl.com",             "neverssl.com",   IPAddress(104,21,8,226),   80, "/",            false },  // 보조
  { "Public IP (1.1.1.1:80)",   nullptr,          IPAddress(1,1,1,1),        80, "/",            false }   // 보조
};
const size_t TARGET_COUNT = sizeof(targets) / sizeof(targets[0]);

const uint8_t  MAX_RETRIES          = 3;
const unsigned CONNECT_READ_TIMEOUT = 5000UL;
const unsigned BETWEEN_RETRY_MS     = 1000UL;
const unsigned SUMMARY_INTERVAL_MS  = 60000UL;

// 내부 전역 객체
static EthernetClient g_client;
static EthernetUDP    g_udp;
static DNSClient      g_myDns;

static IPAddress g_dnsChain[] = {
  IPAddress(0, 0, 0, 0), // DHCP DNS 자리
  IPAddress(8, 8, 8, 8),
  IPAddress(1, 1, 1, 1),
  IPAddress(9, 9, 9, 9)
};
static const size_t DNS_COUNT = sizeof(g_dnsChain) / sizeof(g_dnsChain[0]);

// =====================================================
// ========== 내부 유틸리티 함수 =======================
// =====================================================

static bool ipIsValid(IPAddress ip) {
  return !(ip == INADDR_NONE || ip == IPAddress(0, 0, 0, 0));
}

void ipToStr(const IPAddress& ip, char* out, size_t n) {
  snprintf(out, n, "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
}

static bool resolveOnce(IPAddress dnsServer, const char* host, IPAddress &out, unsigned timeoutMs, unsigned &rttMs) {
  if (!host || !ipIsValid(dnsServer)) return false;
  g_myDns.begin(dnsServer);
  unsigned long t0 = millis();
  int rc = g_myDns.getHostByName(host, out);
  rttMs = (unsigned)(millis() - t0);
  (void)timeoutMs;
  return (rc == 1);
}


// 게이트웨이 연결 테스트 함수 추가
static bool testGatewayConnection(IPAddress gateway, uint16_t timeoutMs = 2000) {
  if (!ipIsValid(gateway)) {
    Serial.println(F("  [GW] 게이트웨이 주소 없음"));
    return false;
  }
  
  Serial.print(F("  [GW] 게이트웨이 연결 테스트: "));
  Serial.println(gateway);
  
  EthernetClient testClient;
  unsigned long startTime = millis();
  
  if (testClient.connect(gateway, 80)) {
    unsigned long rtt = millis() - startTime;
    testClient.stop();
    Serial.print(F("  [GW] 연결 성공 (RTT: "));
    Serial.print(rtt);
    Serial.println(F(" ms)"));
    return true;
  }
  
  Serial.println(F("  [GW] 연결 실패"));
  return false;
}
// Private IP 주소 확인 함수
static bool isPrivateIP(IPAddress ip) {
  // 0.0.0.0
  if (ip[0] == 0) return true;
  
  // 10.0.0.0/8
  if (ip[0] == 10) return true;
  
  // 172.16.0.0/12
  if (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (ip[0] == 192 && ip[1] == 168) return true;
  
  // 127.0.0.0/8 (loopback)
  if (ip[0] == 127) return true;
  
  // 169.254.0.0/16 (link-local)
  if (ip[0] == 169 && ip[1] == 254) return true;
  
  return false;
}




// MQTT 연결 확인 함수 (빠른 연결 테스트)
static bool testMQTTConnectivity(uint16_t timeoutMs = 3000) {
  // Config.h에서 serverHost와 mqttPort 가져오기
  extern const char* serverHost;
  extern const int mqttPort;
  
  Serial.print(F("  [MQTT] 연결 테스트: "));
  Serial.print(serverHost);
  Serial.print(F(":"));
  Serial.println(mqttPort);
  
  // MQTT 테스트 중 - 보라색 깜빡임
  setNeoPixelBlink(128, 0, 128, 300); // 보라색 0.3초 간격
  playBuzzerBeep(BUZZER_FREQ_HIGH, 50); // 짧은 비프
  
  EthernetClient testClient;
  unsigned long startTime = millis();
  
  // MQTT 서버에 TCP 연결 시도 (포트 1883)
  if (testClient.connect(serverHost, mqttPort)) {
    unsigned long rtt = millis() - startTime;
    testClient.stop();
    
    Serial.print(F("  [MQTT] 연결 성공 (RTT: "));
    Serial.print(rtt);
    Serial.println(F(" ms)"));
    
    // 성공 시 짧은 성공 비프
    playBuzzerBeep(BUZZER_FREQ_SUCCESS, 100);
    return true;
  }
  
  Serial.println(F("  [MQTT] 연결 실패"));
  return false;
}

// 인터넷 연결 확인 함수 (Public IP로 직접 연결 테스트)
static bool testInternetConnectivity(uint16_t timeoutMs = 5000) {
  // 1.1.1.1:80으로 직접 연결 테스트 (Cloudflare DNS)
  IPAddress testIP(1, 1, 1, 1);
  Serial.print(F("  [인터넷] 연결 테스트: "));
  Serial.println(testIP);
  
  // 인터넷 테스트 중 - 노란색 깜빡임 + 주기적 비프
  setNeoPixelBlink(255, 255, 0, 400); // 노란색 0.4초 간격
  playBuzzerBeep(BUZZER_FREQ_MID, 50); // 짧은 비프
  
  EthernetClient testClient;
  unsigned long startTime = millis();
  unsigned long lastFeedback = millis();
  const unsigned long FEEDBACK_INTERVAL = 2000; // 2초마다 피드백
  
  // 연결 시도 중 주기적 피드백
  while ((millis() - startTime) < timeoutMs) {
    if (testClient.connect(testIP, 80)) {
      break;
    }
    
    // 2초마다 blink 업데이트 및 짧은 비프
    if (millis() - lastFeedback >= FEEDBACK_INTERVAL) {
      updateNeoPixelStatus(); // blink 업데이트
      playBuzzerBeep(BUZZER_FREQ_MID, 30); // 매우 짧은 비프
      lastFeedback = millis();
    }
    delay(50);
  }
  
  if (!testClient.connected()) {
    Serial.println(F("  [인터넷] 연결 실패 - 인터넷 미연결"));
    return false;
  }
  
  unsigned long rtt = millis() - startTime;
  testClient.stop();
  
  Serial.print(F("  [인터넷] 연결 성공 (RTT: "));
  Serial.print(rtt);
  Serial.println(F(" ms)"));
  
  // 성공 시 짧은 성공 비프
  playBuzzerBeep(BUZZER_FREQ_SUCCESS, 100);
  return true;
}

// 게이트웨이 HTTP 테스트 함수 수정 (인터넷 연결까지 확인)
// ✅ 임시: GW 검증 및 Public IP 검증 건너뛰고 MQTT만 테스트
static bool testGatewayHTTP(IPAddress gateway, uint16_t timeoutMs = 2000) {
  // ✅ 임시: GW HTTP 테스트 건너뛰고 MQTT만 테스트
  Serial.println(F("  [GW] ⚠ 임시: GW HTTP 테스트 건너뛰기 (80 포트 닫혀있음)"));
  Serial.println(F("  [GW] → MQTT 연결만 테스트"));
  
  // MQTT 연결만 테스트
  if (testMQTTConnectivity(3000)) {
    Serial.println(F("  [MQTT] 연결 성공 ✓"));
    return true;
  }
  
  Serial.println(F("  [MQTT] 연결 실패"));
  return false;
  
  // 기존 GW HTTP 테스트 코드는 주석 처리
  /*
  if (!ipIsValid(gateway)) {
    Serial.println(F("  [GW] 게이트웨이 주소 없음"));
    return false;
  }
  
  Serial.print(F("  [GW] 게이트웨이 HTTP 테스트: "));
  Serial.println(gateway);
  
  // 게이트웨이 테스트 중 - 파란색 깜빡임 + 주기적 비프
  setNeoPixelBlink(0, 0, 255, 300); // 파란색 0.3초 간격
  playBuzzerBeep(BUZZER_FREQ_MID, 50); // 짧은 비프
  
  EthernetClient testClient;
  unsigned long startTime = millis();
  unsigned long lastFeedback = millis();
  const unsigned long FEEDBACK_INTERVAL = 1500; // 1.5초마다 피드백
  
  // 연결 시도 중 주기적 피드백
  bool connected = false;
  while ((millis() - startTime) < timeoutMs) {
    if (testClient.connect(gateway, 80)) {
      connected = true;
      break;
    }
    
    // 1.5초마다 blink 업데이트 및 짧은 비프
    if (millis() - lastFeedback >= FEEDBACK_INTERVAL) {
      updateNeoPixelStatus(); // blink 업데이트
      playBuzzerBeep(BUZZER_FREQ_MID, 30); // 매우 짧은 비프
      lastFeedback = millis();
    }
    delay(50);
  }
  
  if (!connected) {
    Serial.println(F("  [GW] 연결 실패 (포트 80 닫힘)"));
    return false;
  }
  
  unsigned long connectTime = millis() - startTime;
  Serial.print(F("  [GW] TCP 연결 성공 ("));
  Serial.print(connectTime);
  Serial.println(F(" ms)"));
  
  // HTTP 요청 전송
  testClient.println(F("GET / HTTP/1.0"));
  testClient.print(F("Host: ")); testClient.println(gateway);
  testClient.println(F("Connection: close"));
  testClient.println();
  
  // HTTP 응답 대기 (피드백 포함)
  unsigned long httpStart = millis();
  bool gotResponse = false;
  lastFeedback = httpStart;
  
  while (millis() - httpStart < timeoutMs) {
    if (testClient.available()) {
      String line = testClient.readStringUntil('\n');
      
      // HTTP 응답 헤더 확인
      if (line.startsWith("HTTP/")) {
        Serial.print(F("  [GW] 응답: "));
        Serial.println(line);
        gotResponse = true;
        testClient.stop();
        unsigned long totalTime = millis() - startTime;
        Serial.print(F("  [GW] HTTP 응답 확인 (총 "));
        Serial.print(totalTime);
        Serial.println(F(" ms)"));
        break;
      }
    }
    
    // HTTP 응답 대기 중에도 주기적 피드백
    if (millis() - lastFeedback >= FEEDBACK_INTERVAL) {
      updateNeoPixelStatus(); // blink 업데이트
      lastFeedback = millis();
    }
    
    if (!testClient.connected()) {
      break;
    }
    delay(10);
  }
  
  testClient.stop();
  
  if (!gotResponse) {
    Serial.println(F("  [GW] HTTP 응답 없음"));
    return false;
  }
  
  // ✅ MQTT 연결 확인 (게이트웨이 OK 후 먼저 시도)
  Serial.println(F("  [GW] 게이트웨이 OK - MQTT 연결 확인 중..."));
  if (testMQTTConnectivity(3000)) {
    // MQTT 연결 성공 → 인터넷 테스트 건너뛰고 성공 반환
    Serial.println(F("  [MQTT] 연결 성공 - 인터넷 테스트 건너뜀 ✓"));
    return true;
  }
  
  // MQTT 연결 실패 → 기존대로 인터넷 연결 확인 진행
  Serial.println(F("  [MQTT] 연결 실패 - 인터넷 연결 확인 진행..."));
  if (!testInternetConnectivity(5000)) {
    Serial.println(F("  [인터넷] 공유기 인터넷 미연결 - 계속 대기"));
    return false;
  }
  
  Serial.println(F("  [인터넷] 공유기 인터넷 연결 확인 ✓"));
  return true;
  */
} 
static bool httpGET(EthernetClient &cli, const char* hostHeader, IPAddress hostIP, uint16_t port, const char* path) {
  if (!path || !*path) return true;
  
  cli.print(F("GET ")); cli.print(path); cli.println(F(" HTTP/1.1"));
  cli.print(F("Host: "));
  if (hostHeader && *hostHeader) cli.println(hostHeader);
  else cli.println(hostIP);
  cli.println(F("Connection: close"));
  cli.println();
  
  unsigned long t0 = millis();
  bool anyData = false;
  
  while ((millis() - t0) < CONNECT_READ_TIMEOUT) {
    while (cli.available()) {
      char c = cli.read();
      Serial.write(c);
      anyData = true;
      t0 = millis();
    }
    if (!cli.connected() && !cli.available()) break;
    delay(1);
  }
  Serial.println();
  return anyData || true;
}
// DNS 응답 검증 함수
static bool resolveOnceValidated(IPAddress dnsServer, const char* host, IPAddress &out, unsigned timeoutMs, unsigned &rttMs) {
  if (!host || !ipIsValid(dnsServer)) return false;
  g_myDns.begin(dnsServer);
  unsigned long t0 = millis();
  int rc = g_myDns.getHostByName(host, out);
  rttMs = (unsigned)(millis() - t0);
  (void)timeoutMs;
  
  if (rc != 1) return false;
  
  // ✅ Private IP 검증
  if (isPrivateIP(out)) {
    Serial.print(F("  [DNS] 경고: Private IP 반환됨 ("));
    Serial.print(out);
    Serial.println(F(") - 무효"));
    return false;
  }
  
  return true;
}

static bool resolveMulti(const char* host, IPAddress &resolved) {
  if (!host) return false;
  g_dnsChain[0] = Ethernet.dnsServerIP();
  
  for (size_t i = 0; i < DNS_COUNT; i++) {
    unsigned rtt = 0;
    if (!ipIsValid(g_dnsChain[i])) continue;
    
    Serial.print(F("  [DNS] ")); Serial.print(g_dnsChain[i]);
    Serial.print(F(" -> ")); Serial.println(host);
    
    if (resolveOnceValidated(g_dnsChain[i], host, resolved, 2500, rtt)) {
      Serial.print(F("  [DNS] OK ")); Serial.print(resolved);
      Serial.print(F(" (RTT ")); Serial.print(rtt); Serial.println(F(" ms)"));
      return true;
    } else {
      Serial.println(F("  [DNS] fail"));
    }
  }
  Serial.println(F("  [DNS] 모든 서버에서 해석 실패"));
  return false;
}

static bool connectWithRetries(const NetTarget &t) {
  for (uint8_t attempt = 0; attempt < MAX_RETRIES; ++attempt) {
    Serial.print(F("[TRY] ")); Serial.print(attempt + 1);
    Serial.print(F("/")); Serial.println(MAX_RETRIES);
    
    bool connected = false;
    IPAddress resolved;
    
    // DNS 기반 연결 시도
    if (t.host) {
      if (resolveMulti(t.host, resolved)) {
        Serial.print(F("  -> 이름기반 연결: ")); Serial.print(t.host);
        Serial.print(F(":")); Serial.println(t.port);
        
        if (g_client.connect(resolved, t.port)) {
          Serial.println(F("  -> 이름기반 connect OK"));
          connected = true;
        } else {
          Serial.println(F("  -> 이름기반 connect 실패"));
        }
      } else {
        Serial.println(F("  -> DNS 해석 실패"));
      }
    }
    
    // Fallback IP 연결 시도
    if (!connected && ipIsValid(t.host_ip_fallback)) {
      Serial.print(F("  -> 고정 IP 연결: ")); Serial.print(t.host_ip_fallback);
      Serial.print(F(":")); Serial.println(t.port);
      
      if (g_client.connect(t.host_ip_fallback, t.port)) {
        Serial.println(F("  -> 고정 IP connect OK"));
        connected = true;
      } else {
        Serial.println(F("  -> 고정 IP connect 실패"));
      }
    }
    
    // IP만 있는 경우
    if (!t.host && ipIsValid(t.host_ip_fallback) && !connected) {
      Serial.print(F("  -> IP 연결: ")); Serial.print(t.host_ip_fallback);
      Serial.print(F(":")); Serial.println(t.port);
      
      if (g_client.connect(t.host_ip_fallback, t.port)) {
        Serial.println(F("  -> IP connect OK"));
        connected = true;
      } else {
        Serial.println(F("  -> IP connect 실패"));
      }
    }
    
    if (connected) {
      bool ok = httpGET(g_client, t.host, ipIsValid(resolved) ? resolved : t.host_ip_fallback, t.port, t.path);
      g_client.stop();
      Serial.println(F("  -> 읽기 완료 / 접속 성공"));
      return ok;
    }
    
    unsigned long waitMs = BETWEEN_RETRY_MS * (1UL << attempt);
    Serial.print(F("  -> 실패, ")); Serial.print(waitMs);
    Serial.println(F(" ms 후 재시도"));
    
    // 재시도 대기 중 주기적 피드백 (긴 대기 시간 동안)
    if (waitMs > 500) {
      unsigned long waitStart = millis();
      unsigned long lastFeedback = waitStart;
      const unsigned long RETRY_FEEDBACK_INTERVAL = 1000; // 1초마다 피드백
      
      while (millis() - waitStart < waitMs) {
        if (millis() - lastFeedback >= RETRY_FEEDBACK_INTERVAL) {
          updateNeoPixelStatus(); // blink 업데이트
          lastFeedback = millis();
        }
        delay(100);
      }
    } else {
      delay(waitMs);
    }
  }
  
  Serial.println(F("  -> 모든 재시도 실패"));
  return false;
}

// =====================================================
// ========== 공개 함수 구현 ===========================
// =====================================================


void initNetworkModule(byte* macAddress) {
  // CS 핀 초기화
  pinMode(ENC28J60_CS, OUTPUT);
  digitalWrite(ENC28J60_CS, HIGH);
  Ethernet.init(ENC28J60_CS);
  
  // DHCP 시도 (최대 15회, 인터넷 연결까지 확인)
  Serial.println(F("[DHCP] 요청 중..."));
  
  // DHCP 시작 - 주황색 깜빡임 + 주기적 비프
  setNeoPixelBlink(255, 165, 0, 500); // 주황색 0.5초 간격
  playBuzzerBeep(BUZZER_FREQ_LOW, 100); // 시작 비프
  
  const uint8_t MAX_DHCP_ATTEMPTS = 15;  // ✅ 15회로 증가
  const unsigned long DHCP_WAIT_MS = 1500; // 1.5초로 단축 (빠른 재시도)
  bool dhcpSuccess = false;
  unsigned long lastDhcpFeedback = millis();
  const unsigned long DHCP_FEEDBACK_INTERVAL = 2000; // 2초마다 피드백
  
  for (uint8_t attempt = 1; attempt <= MAX_DHCP_ATTEMPTS; attempt++) {
    Serial.println();
    Serial.print(F("[DHCP] 시도 "));
    Serial.print(attempt);
    Serial.print(F("/"));
    Serial.println(MAX_DHCP_ATTEMPTS);
    
    // DHCP 시도 중 blink 업데이트
    updateNeoPixelStatus();
    
    if (Ethernet.begin(macAddress) != 0) {
      // DHCP 응답 받음 - 짧은 성공 비프
      playBuzzerBeep(BUZZER_FREQ_MID, 80);
      
      Serial.print(F("  [DHCP] IP 할당됨: "));
      Serial.println(Ethernet.localIP());
      
      IPAddress gateway = Ethernet.gatewayIP();
      Serial.print(F("  [DHCP] 게이트웨이: "));
      Serial.println(gateway);
      
      // ✅ 임시: GW 검증 및 Public IP 검증 건너뛰기 (80 포트 닫혀있음)
      // MQTT 연결만 테스트
      Serial.println(F("⚠ 임시: GW 검증 및 Public IP 검증 건너뛰기 (80 포트 닫혀있음)"));
      Serial.println(F("→ MQTT 연결만 테스트"));
      
      // MQTT 연결 테스트만 수행
      if (testMQTTConnectivity(3000)) {
        Serial.println(F("✓✓✓ DHCP 완료 - MQTT 연결 정상 ✓✓✓"));
        
        // 성공한 게이트웨이를 targets 배열에 동적으로 설정
        if (TARGET_COUNT > 0 && targets[0].label != nullptr) {
          targets[0].host_ip_fallback = gateway;
          Serial.print(F("  [설정] LAN Gateway 업데이트: "));
          Serial.println(gateway);
        }
        
        // 최종 성공 - 초록색 고정 + 성공 음
        setNeoPixelColor(0, 255, 0); // 초록색 고정
        playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 2); // 성공 패턴
        
        dhcpSuccess = true;
        break;
      } else {
        Serial.println(F("✗ MQTT 연결 실패 - 재시도 계속"));
        Serial.println(F("  ⚠️ MQTT 서버 접근 불가 - 재시도 계속"));
        // 실패 시 빨간색 깜빡임으로 변경
        setNeoPixelBlink(255, 0, 0, 400); // 빨간색 0.4초 간격
      }
      
      // 기존 GW 검증 코드는 주석 처리
      /*
      // ✅ 게이트웨이 + 인터넷 연결까지 확인
      if (testGatewayHTTP(gateway, 2000)) {
        Serial.println(F("✓✓✓ DHCP 완료 - 인터넷 연결 정상 ✓✓✓"));
        
        // 성공한 게이트웨이를 targets 배열에 동적으로 설정
        if (TARGET_COUNT > 0 && targets[0].label != nullptr) {
          targets[0].host_ip_fallback = gateway;
          Serial.print(F("  [설정] LAN Gateway 업데이트: "));
          Serial.println(gateway);
        }
        
        // 최종 성공 - 초록색 고정 + 성공 음
        setNeoPixelColor(0, 255, 0); // 초록색 고정
        playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 2); // 성공 패턴
        
        dhcpSuccess = true;
        break;
      } else {
        Serial.println(F("✗ 인터넷 미연결 - 공유기 인터넷 연결 대기"));
        Serial.println(F("  ⚠️ 가짜 IP 할당 가능성 - DHCP 재시도 계속"));
        // 가짜 IP를 받았을 때도 계속 재시도하여 공유기 완전 부팅 대기
        // 실패 시 빨간색 깜빡임으로 변경
        setNeoPixelBlink(255, 0, 0, 400); // 빨간색 0.4초 간격
      }
      */
    } else {
      Serial.println(F("✗ DHCP 응답 없음"));
      // DHCP 실패 시 주황색 유지하되 주기적 비프
      if (millis() - lastDhcpFeedback >= DHCP_FEEDBACK_INTERVAL) {
        updateNeoPixelStatus(); // blink 업데이트
        playBuzzerBeep(BUZZER_FREQ_LOW, 50); // 짧은 비프
        lastDhcpFeedback = millis();
      }
    }
    
    // 마지막 시도가 아니면 대기 (대기 중에도 피드백)
    if (attempt < MAX_DHCP_ATTEMPTS) {
      Serial.print(F("⏳ "));
      Serial.print(DHCP_WAIT_MS / 1000);
      Serial.println(F("초 후 재시도... (공유기 인터넷 연결 대기)"));
      
      // 대기 중 주기적 피드백
      unsigned long waitStart = millis();
      while (millis() - waitStart < DHCP_WAIT_MS) {
        if (millis() - lastDhcpFeedback >= DHCP_FEEDBACK_INTERVAL) {
          updateNeoPixelStatus(); // blink 업데이트
          playBuzzerBeep(BUZZER_FREQ_LOW, 30); // 매우 짧은 비프
          lastDhcpFeedback = millis();
        }
        delay(100);
      }
    }
  }
  
  // DHCP 실패 시 정적 IP 폴백
  if (!dhcpSuccess) {
    Serial.println();
    Serial.println(F("✗✗✗ DHCP 최종 실패 (15회 시도) ✗✗✗"));
    
    // 정적 IP 시도 - 보라색 깜빡임
    setNeoPixelBlink(128, 0, 128, 400); // 보라색 0.4초 간격
    playBuzzerPattern(BUZZER_FREQ_HIGH, 150, 150, 2); // 경고 패턴
    
    if (USE_STATIC_ON_DHCP_FAIL) {
      Serial.println(F("→ 정적 IP 폴백 적용"));
      Ethernet.begin(macAddress, STATIC_IP, STATIC_DNS, STATIC_GATEWAY, STATIC_MASK);
      
      // ✅ 임시: 정적 IP에서도 GW 검증 및 Public IP 검증 건너뛰기
      // MQTT 연결만 테스트
      delay(1000);
      Serial.println(F("⚠ 임시: 정적 IP에서도 GW 검증 및 Public IP 검증 건너뛰기"));
      Serial.println(F("→ MQTT 연결만 테스트"));
      
      if (testMQTTConnectivity(3000)) {
        Serial.println(F("✓ 정적 IP - MQTT 연결 정상"));
        
        // targets 배열 업데이트
        if (TARGET_COUNT > 0 && targets[0].label != nullptr) {
          targets[0].host_ip_fallback = STATIC_GATEWAY;
          Serial.print(F("  [설정] LAN Gateway 업데이트: "));
          Serial.println(STATIC_GATEWAY);
        }
        
        // 정적 IP 성공 - 초록색 고정
        setNeoPixelColor(0, 255, 0); // 초록색 고정
        playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 2); // 성공 패턴
      } else {
        Serial.println(F("⚠ 정적 IP - MQTT 연결 불가"));
        Serial.println(F("💡 MQTT 서버 접근 확인 필요"));
        
        // 정적 IP도 실패 - 빨간색 빠른 깜빡임
        setNeoPixelBlink(255, 0, 0, 200); // 빨간색 0.2초 간격
        playBuzzerPattern(BUZZER_FREQ_LOW, 300, 100, 3); // 긴급 경고 패턴
      }
      
      // 기존 GW 검증 코드는 주석 처리
      /*
      // 정적 IP로도 인터넷 연결 테스트
      delay(1000);
      if (testGatewayHTTP(STATIC_GATEWAY, 2000)) {
        Serial.println(F("✓ 정적 IP - 인터넷 연결 정상"));
        
        // targets 배열 업데이트
        if (TARGET_COUNT > 0 && targets[0].label != nullptr) {
          targets[0].host_ip_fallback = STATIC_GATEWAY;
          Serial.print(F("  [설정] LAN Gateway 업데이트: "));
          Serial.println(STATIC_GATEWAY);
        }
        
        // 정적 IP 성공 - 초록색 고정
        setNeoPixelColor(0, 255, 0); // 초록색 고정
        playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 2); // 성공 패턴
      } else {
        Serial.println(F("⚠ 정적 IP - 인터넷 연결 불가"));
        Serial.println(F("💡 공유기 인터넷 연결 확인 필요"));
        
        // 정적 IP도 실패 - 빨간색 빠른 깜빡임
        setNeoPixelBlink(255, 0, 0, 200); // 빨간색 0.2초 간격
        playBuzzerPattern(BUZZER_FREQ_LOW, 300, 100, 3); // 긴급 경고 패턴
      }
      */
    }
  }
  
  delay(500);
}
// 게이트웨이 동적 업데이트 함수 (공개)
void updateGatewayTarget(IPAddress gateway) {
  if (TARGET_COUNT > 0 && ipIsValid(gateway)) {
    targets[0].host_ip_fallback = gateway;
    Serial.print(F("[설정] LAN Gateway 동적 업데이트: "));
    Serial.println(gateway);
  }
}
void printNetInfoToSerial() {
  char ipbuf[32];
  Serial.println(F("=== 네트워크 정보 ==="));
  
  ipToStr(Ethernet.localIP(), ipbuf, sizeof(ipbuf));
  Serial.print(F("IP   : ")); Serial.println(ipbuf);
  
  ipToStr(Ethernet.subnetMask(), ipbuf, sizeof(ipbuf));
  Serial.print(F("MASK : ")); Serial.println(ipbuf);
  
  ipToStr(Ethernet.gatewayIP(), ipbuf, sizeof(ipbuf));
  Serial.print(F("GW   : ")); Serial.println(ipbuf);
  
  ipToStr(Ethernet.dnsServerIP(), ipbuf, sizeof(ipbuf));
  Serial.print(F("DNS  : ")); Serial.println(ipbuf);
  
  Serial.println(F("====================="));
}

void printNetInfoToNextion(void (*setTextFunc)(const char*, const char*)) {
  if (!setTextFunc) return;
  
  char buf[64], ipbuf[32];
  ipToStr(Ethernet.localIP(), ipbuf, sizeof(ipbuf));
  snprintf(buf, sizeof(buf), "IP:%s", ipbuf);
  setTextFunc("t1", buf);
}

// 스마트 진단: 주요 테스트만 수행, 성공 시 조기 종료
DiagnosisResult runSmartDiagnosis(void (*setTextFunc)(const char*, const char*)) {
  if (setTextFunc) setTextFunc("t0", "TESTING...");
  
  // 진단 시작 - 청록색 깜빡임
  setNeoPixelBlink(0, 255, 255, 400); // 청록색 0.4초 간격
  playBuzzerBeep(BUZZER_FREQ_MID, 80); // 시작 비프
  
  printNetInfoToSerial();
  if (setTextFunc) printNetInfoToNextion(setTextFunc);
  
  bool primarySuccess = true;
  int primaryFailed = 0;
  
  // ✅ 임시: 주요 테스트 건너뛰고 MQTT만 테스트
  Serial.println(F("\n=== ⚠ 임시: 주요 테스트 건너뛰기 (80 포트 닫혀있음) ==="));
  Serial.println(F("=== → MQTT 연결만 테스트 ==="));
  
  // MQTT 연결만 테스트
  Serial.println();
  Serial.println(F("테스트 대상: MQTT 연결"));
  
  playBuzzerBeep(BUZZER_FREQ_MID, 30);
  updateNeoPixelStatus(); // blink 업데이트
  
  bool mqttOk = testMQTTConnectivity(3000);
  
  Serial.print(F("결과: ")); Serial.println(mqttOk ? F("✓ OK") : F("✗ FAIL"));
  
  if (mqttOk) {
    // 성공 시 짧은 성공 비프
    playBuzzerBeep(BUZZER_FREQ_SUCCESS, 50);
    primarySuccess = true;
  } else {
    // 실패 시 경고 비프
    playBuzzerBeep(BUZZER_FREQ_LOW, 100);
    primarySuccess = false;
    primaryFailed++;
  }
  
  // 기존 주요 테스트 코드는 주석 처리
  /*
  // 1단계: 주요 테스트만 수행
  Serial.println(F("\n=== 주요 테스트 시작 ==="));
  for (size_t i = 0; i < TARGET_COUNT; i++) {
    if (!targets[i].isPrimary) continue;
    
    Serial.println();
    Serial.print(F("테스트 대상: ")); Serial.println(targets[i].label);
    
    // 각 테스트 시작 시 짧은 비프
    playBuzzerBeep(BUZZER_FREQ_MID, 30);
    updateNeoPixelStatus(); // blink 업데이트
    
    bool ok = connectWithRetries(targets[i]);
    
    Serial.print(F("결과: ")); Serial.println(ok ? F("✓ OK") : F("✗ FAIL"));
    
    if (ok) {
      // 성공 시 짧은 성공 비프
      playBuzzerBeep(BUZZER_FREQ_SUCCESS, 50);
    } else {
      // 실패 시 경고 비프
      playBuzzerBeep(BUZZER_FREQ_LOW, 100);
      primarySuccess = false;
      primaryFailed++;
    }
  }
  */
  
  // 주요 테스트 성공: 노멀 모드
  if (primarySuccess) {
    Serial.println(F("\n=== ✓ 주요 테스트 성공 - 노멀 모드 진입 ==="));
    // 성공 - 초록색 고정 + 성공 패턴
    setNeoPixelColor(0, 255, 0); // 초록색 고정
    playBuzzerPattern(BUZZER_FREQ_SUCCESS, 100, 100, 2); // 성공 패턴
    if (setTextFunc) {
      setTextFunc("t0", "ONLINE");
      setTextFunc("t1", "NET: OK");
    }
    return DIAG_SUCCESS;
  }
  
  // 주요 테스트 실패: 상세 진단 수행
  Serial.println(F("\n=== ✗ 주요 테스트 실패 - 상세 진단 시작 ==="));
  if (setTextFunc) setTextFunc("t0", "DIAGNOSING...");
  
  // 상세 진단 시작 - 노란색 깜빡임
  setNeoPixelBlink(255, 255, 0, 300); // 노란색 0.3초 간격
  playBuzzerPattern(BUZZER_FREQ_HIGH, 150, 150, 2); // 경고 패턴
  
  int secondaryFailed = 0;
  for (size_t i = 0; i < TARGET_COUNT; i++) {
    if (targets[i].isPrimary) continue; // 보조 테스트만
    
    Serial.println();
    Serial.print(F("테스트 대상: ")); Serial.println(targets[i].label);
    
    // 각 테스트 시작 시 짧은 비프
    playBuzzerBeep(BUZZER_FREQ_MID, 30);
    updateNeoPixelStatus(); // blink 업데이트
    
    bool ok = connectWithRetries(targets[i]);
    
    Serial.print(F("결과: ")); Serial.println(ok ? F("✓ OK") : F("✗ FAIL"));
    
    if (ok) {
      playBuzzerBeep(BUZZER_FREQ_SUCCESS, 50);
    } else {
      playBuzzerBeep(BUZZER_FREQ_LOW, 100);
      secondaryFailed++;
    }
  }
  
  // 결과 분석 및 상태 표시
  char statusBuf[32];
  if (secondaryFailed == 0) {
    // 보조 테스트는 성공, 주요 서버만 문제
    Serial.println(F("\n=== 인터넷 연결 OK, 주요 서버 접근 불가 ==="));
    // 부분 실패 - 노란색 깜빡임
    setNeoPixelBlink(255, 255, 0, 500); // 노란색 0.5초 간격
    playBuzzerPattern(BUZZER_FREQ_MID, 200, 200, 2); // 경고 패턴
    snprintf(statusBuf, sizeof(statusBuf), "SRV FAIL (%d)", primaryFailed);
    if (setTextFunc) {
      setTextFunc("t0", statusBuf);
      setTextFunc("t1", "NET:OK/SRV:NG");
    }
    return DIAG_PARTIAL_FAIL;
  } else {
    // 보조 테스트도 실패, 네트워크 문제
    Serial.println(F("\n=== 네트워크 연결 문제 ==="));
    // 심각한 실패 - 빨간색 빠른 깜빡임
    setNeoPixelBlink(255, 0, 0, 200); // 빨간색 0.2초 간격
    playBuzzerPattern(BUZZER_FREQ_LOW, 300, 100, 3); // 긴급 경고 패턴
    snprintf(statusBuf, sizeof(statusBuf), "NET FAIL (%d)", primaryFailed + secondaryFailed);
    if (setTextFunc) {
      setTextFunc("t0", statusBuf);
      setTextFunc("t1", "NET: ERROR");
    }
    return DIAG_CRITICAL_FAIL;
  }
}

// 전체 진단: 모든 테스트 수행 (주기적 재시도 시 사용)
void runFullDiagnosis(void (*setTextFunc)(const char*, const char*)) {
  if (setTextFunc) setTextFunc("t0", "FULL TEST...");
  
  printNetInfoToSerial();
  if (setTextFunc) printNetInfoToNextion(setTextFunc);
  
  int failCount = 0;
  
  Serial.println(F("\n=== 전체 네트워크 진단 ==="));
  for (size_t i = 0; i < TARGET_COUNT; i++) {
    Serial.println();
    Serial.print(F("테스트 대상: ")); Serial.println(targets[i].label);
    
    bool ok = connectWithRetries(targets[i]);
    
    Serial.print(F("결과: ")); Serial.println(ok ? F("✓ OK") : F("✗ FAIL"));
    
    if (!ok) failCount++;
  }
  
  char statusBuf[32];
  if (failCount == 0) {
    Serial.println(F("\n=== ✓ 모든 테스트 성공 ==="));
    if (setTextFunc) {
      setTextFunc("t0", "ALL OK");
      setTextFunc("t1", "NET: FULL OK");
    }
  } else {
    Serial.print(F("\n=== ✗ ")); Serial.print(failCount);
    Serial.println(F("개 테스트 실패 ==="));
    snprintf(statusBuf, sizeof(statusBuf), "FAIL: %d/%d", failCount, TARGET_COUNT);
    if (setTextFunc) {
      setTextFunc("t0", statusBuf);
    }
  }
}

bool maintainDHCP() {
  return (Ethernet.maintain() != 0);
}
