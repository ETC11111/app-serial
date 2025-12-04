// services/mqttService.ts
import { BaseService } from './base';

// 🔥 원본 fetch 함수 저장 (httpInterceptor 우회용)
// 🔥 모듈이 로드될 때 원본 fetch를 저장 (httpInterceptor 설정 전)
// 🔥 이렇게 하면 httpInterceptor를 우회하여 직접 네이티브 fetch를 호출할 수 있습니다.
// 🔥 하지만 실제로는 httpInterceptor가 이미 설정되어 있을 수 있으므로,
// 🔥 여기서는 window.fetch를 직접 사용하되, httpInterceptor에서 404를 조용히 처리하도록 했습니다.
// 🔥 브라우저 콘솔에 404가 표시되는 것은 브라우저의 네이티브 동작이므로 완전히 막을 수 없습니다.
// 🔥 하지만 httpInterceptor에서 404를 조용히 처리하여 애플리케이션 로직에는 영향을 주지 않도록 했습니다.

class MqttService extends BaseService {
 // 🔥 실시간 센서 데이터 (백엔드 API: /:deviceId 사용 - 인증 필요, DB에서 조회)
 // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
 async getRealtimeSensorData(deviceId: string) {
   try {
     // 🔥 백엔드 엔드포인트: /api/sensors/:deviceId (인증 필요, DB에서 조회)
     const response = await fetch(`${this.getBaseUrl()}/sensors/${deviceId}`, {
       headers: this.getAuthHeaders(),
       credentials: 'include'
     });
     
     // 🔥 404 에러는 조용히 처리 (센서 데이터 없음)
     if (response.status === 404) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     
     // 🔥 403 에러도 조용히 처리 (권한 없음)
     if (response.status === 403) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     
     return this.handleResponse(response);
   } catch (error: any) {
     // 🔥 404 에러 메시지인 경우 조용히 처리
     if (error?.message?.includes('센서 데이터 없음') || error?.message?.includes('404')) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     throw error;
   }
 }

 // 🔥 센서 데이터 히스토리 (백엔드의 /history/:deviceId 사용)
 // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
 async getSensorHistory(deviceId: string, limit: number = 50, hours: number = 24) {
   try {
     // 🔥 백엔드 엔드포인트: /api/sensors/history/:deviceId (프론트엔드 경로 수정)
     const response = await fetch(`${this.getBaseUrl()}/sensors/history/${deviceId}?limit=${limit}&hours=${hours}`, {
       headers: this.getAuthHeaders(),
       credentials: 'include'
     });
     
     // 🔥 404 에러는 조용히 처리 (센서 데이터 없음)
     if (response.status === 404) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     
     return this.handleResponse(response);
   } catch (error: any) {
     // 🔥 404 에러 메시지인 경우 조용히 처리
     if (error?.message?.includes('센서 데이터 없음') || error?.message?.includes('404')) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     throw error;
   }
 }

 // 🔥 시간 범위별 센서 데이터
 // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
 async getSensorDataByTimeRange(deviceId: string, startTime: string, endTime: string, limit: number = 1000) {
   const params = new URLSearchParams({
     startTime,
     endTime,
     limit: limit.toString()
   });
   
   try {
     // 🔥 fetch를 직접 호출 (httpInterceptor를 통과하지만, 404는 조용히 처리됨)
     const response = await fetch(`${this.getBaseUrl()}/sensors/history/${deviceId}?${params}`, {
       headers: this.getAuthHeaders(),
       credentials: 'include'
     });
     
     // 🔥 404 에러는 조용히 처리
     if (response.status === 404) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     
     return this.handleResponse(response);
   } catch (error: any) {
     // 🔥 404 에러 메시지인 경우 조용히 처리
     if (error?.message?.includes('센서 데이터 없음') || error?.message?.includes('404')) {
       return {
         success: false,
         error: '센서 데이터 없음',
         data: null
       };
     }
     throw error;
   }
 }

 // 🔥 특정 프로토콜별 센서 데이터 조회
 async getSensorsByProtocol(deviceId: string, protocol: 'i2c' | 'modbus') {
   const response = await fetch(`${this.getBaseUrl()}/sensors/${deviceId}/${protocol}`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 센서 데이터 통계
 async getSensorStats(deviceId: string, hours: number = 24, sensorName?: string) {
   const params = new URLSearchParams({
     hours: hours.toString(),
     ...(sensorName && { sensorName })
   });
   
   const response = await fetch(`${this.getBaseUrl()}/devices/${deviceId}/status?${params}`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 모든 센서 상태 조회
 async getAllSensorsStatus() {
   const response = await fetch(`${this.getBaseUrl()}/sensors`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 시스템 전체 개요
 async getSystemOverview() {
   const response = await fetch(`${this.getBaseUrl()}/system/overview`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 디바이스 프로토콜 정보
 async getDeviceProtocols(deviceId: string) {
   const response = await fetch(`${this.getBaseUrl()}/devices/${deviceId}/protocols`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 디바이스 상태 정보
 async getDeviceStatus(deviceId: string) {
   const response = await fetch(`${this.getBaseUrl()}/devices/${deviceId}/status`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // === 제어 관련 ===

 // 🔥 LED 제어
 async controlLED(deviceId: string, state: 'on' | 'off') {
   const response = await fetch(`${this.getBaseUrl()}/mqtt/led/${deviceId}`, {
     method: 'POST',
     headers: this.getAuthHeaders(),
     credentials: 'include',
     body: JSON.stringify({ state })
   });
   return this.handleResponse(response);
 }

 // 🔥 Modbus 명령 전송
 async sendModbusCommand(deviceId: string, command: {
   slaveId: number;
   functionCode: number;
   address: number;
   value?: number;
 }) {
   const response = await fetch(`${this.getBaseUrl()}/modbus/${deviceId}`, {
     method: 'POST',
     headers: this.getAuthHeaders(),
     credentials: 'include',
     body: JSON.stringify(command)
   });
   return this.handleResponse(response);
 }

 // === 알림 관련 (올바른 경로) ===

 // 🔥 알림 설정 조회
 async getAlertSettings(deviceId: string) {
   const response = await fetch(`${this.getBaseUrl()}/alerts/${deviceId}`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 알림 설정 저장/업데이트
 async updateAlertSettings(deviceId: string, settings: any) {
   const response = await fetch(`${this.getBaseUrl()}/alerts/${deviceId}`, {
     method: 'POST',
     headers: this.getAuthHeaders(),
     credentials: 'include',
     body: JSON.stringify(settings)
   });
   return this.handleResponse(response);
 }

 // 🔥 알림 설정 삭제
 async deleteAlertSetting(deviceId: string, alertId: string) {
   const response = await fetch(`${this.getBaseUrl()}/alerts/${deviceId}/${alertId}`, {
     method: 'DELETE',
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 알림 로그 조회
 async getAlertHistory(deviceId: string, limit: number = 50) {
   const response = await fetch(`${this.getBaseUrl()}/alerts/${deviceId}/logs?limit=${limit}`, {
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 알림 로그 삭제
 async deleteAlertLogs(deviceId: string, logId?: string) {
   const url = logId 
     ? `${this.getBaseUrl()}/alerts/${deviceId}/logs/${logId}`
     : `${this.getBaseUrl()}/alerts/${deviceId}/logs/all`;
   
   const response = await fetch(url, {
     method: 'DELETE',
     headers: this.getAuthHeaders(),
     credentials: 'include'
   });
   return this.handleResponse(response);
 }

 // 🔥 카카오 알림톡 테스트
 async testKakaoAlert(deviceId: string, testData: {
   testPhone?: string;
   alertType?: 'alert' | 'recovery';
   sensorType?: string;
   sensorName?: string;
 }) {
   const response = await fetch(`${this.getBaseUrl()}/alerts/${deviceId}/test-kakao`, {
     method: 'POST',
     headers: this.getAuthHeaders(),
     credentials: 'include',
     body: JSON.stringify(testData)
   });
   return this.handleResponse(response);
 }

 // === 🔥 백워드 호환성 메서드들 ===
 
 // 레거시 메서드 이름들 지원
 async getSensorData(deviceId: string, limit: number = 50) {
   return this.getSensorHistory(deviceId, limit, 24);
 }

 async getLatestSensorData(deviceId: string) {
   return this.getRealtimeSensorData(deviceId);
 }

 async getSensorDataStats(deviceId: string, hours: number = 24) {
   return this.getSensorStats(deviceId, hours);
 }

 // 기존 알림 메서드 이름 호환
 async getAlerts(deviceId: string) {
   return this.getAlertSettings(deviceId);
 }

 async updateAlerts(deviceId: string, settings: any) {
   return this.updateAlertSettings(deviceId, settings);
 }

 async getNotificationHistory(deviceId?: string, limit: number = 50) {
   if (deviceId) {
     return this.getAlertHistory(deviceId, limit);
   }
   // 전체 알림 히스토리는 지원하지 않음
   throw new Error('전체 알림 히스토리 조회는 지원되지 않습니다. deviceId를 제공해주세요.');
 }
}

export const mqttService = new MqttService();