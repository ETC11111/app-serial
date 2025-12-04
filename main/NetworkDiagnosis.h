#ifndef NETWORK_DIAGNOSIS_H
#define NETWORK_DIAGNOSIS_H

#include <Arduino.h>
#include <UIPEthernet.h>
#include <Dns.h>

// =====================================================
// ========== Network Diagnosis Module =================
// =====================================================

// 네트워크 타겟 구조체
struct NetTarget {
  const char* label;
  const char* host;             // optional (DNS name)
  IPAddress   host_ip_fallback; // optional (fallback IP)
  uint16_t    port;
  const char* path;             // HTTP path
  bool        isPrimary;        // 주요 테스트 대상 (빠른 경로)
};

// 진단 결과
enum DiagnosisResult {
  DIAG_SUCCESS = 0,      // 정상
  DIAG_PARTIAL_FAIL,     // 일부 실패
  DIAG_CRITICAL_FAIL     // 중요 테스트 실패
};

// 설정 상수
extern const uint8_t  ENC28J60_CS;
extern const uint8_t  MAX_RETRIES;
extern const unsigned CONNECT_READ_TIMEOUT;
extern const unsigned BETWEEN_RETRY_MS;
extern const unsigned SUMMARY_INTERVAL_MS;

extern bool USE_STATIC_ON_DHCP_FAIL;
extern IPAddress STATIC_IP;
extern IPAddress STATIC_GATEWAY;
extern IPAddress STATIC_MASK;
extern IPAddress STATIC_DNS;

// 타겟 배열
extern NetTarget targets[];
extern const size_t TARGET_COUNT;

// 공개 함수
void initNetworkModule(byte* macAddress);
void printNetInfoToSerial();
void printNetInfoToNextion(void (*setTextFunc)(const char*, const char*));

// 스마트 진단: 주요 테스트 성공 시 조기 종료
DiagnosisResult runSmartDiagnosis(void (*setTextFunc)(const char*, const char*));

// 전체 진단: 모든 테스트 수행
void runFullDiagnosis(void (*setTextFunc)(const char*, const char*));
void updateGatewayTarget(IPAddress gateway);
bool maintainDHCP();

// 유틸리티
void ipToStr(const IPAddress& ip, char* out, size_t n);

#endif // NETWORK_DIAGNOSIS_H
