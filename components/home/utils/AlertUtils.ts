// components/home/utils/AlertUtils.ts
import { FlexibleSensorData, DetectedSensor } from '../../../types/sensor.types';
import { Notification, AlertSettingItem } from '../types/HomeTypes';
import { mqttService } from '../../../services/mqttService';

// 센서 알림 체크 - 안전한 에러 핸들링
export const checkSensorAlertsAPI = async (deviceId: string, sensorData: FlexibleSensorData): Promise<Notification[]> => {
  try {
    console.log('🔧 센서 알림 체크 시작:', deviceId);
    
    // mqttService 및 메서드 존재 여부 확인
    if (!mqttService) {
      console.warn('⚠️ mqttService가 정의되지 않음');
      return [];
    }
    
    if (typeof mqttService.getAlertSettings !== 'function') {
      console.warn('⚠️ getAlertSettings 메서드가 존재하지 않음');
      return [];
    }
    
    const alertResponse = await mqttService.getAlertSettings(deviceId);
    console.log('⚙️ 알림 설정 응답:', alertResponse);
    
    if (!alertResponse || !alertResponse.success || !alertResponse.data || !Array.isArray(alertResponse.data)) {
      console.log('⚙️ 알림 설정 없음 또는 잘못된 형식');
      return [];
    }

    const activeAlerts: AlertSettingItem[] = alertResponse.data.filter((alert: AlertSettingItem) => {
      return alert && alert.is_active && alert.sensor_name && typeof alert.threshold_value === 'number';
    });
    
    console.log('✅ 활성 알림 설정:', activeAlerts.length, '개');
    
    const notifications: Notification[] = [];

    if (sensorData?.sensors && Array.isArray(sensorData.sensors)) {
      sensorData.sensors.forEach((sensor: DetectedSensor) => {
        if (!sensor.active || !sensor.values || !Array.isArray(sensor.values)) {
          return;
        }

        activeAlerts.forEach((alert: AlertSettingItem) => {
          if (alert.sensor_name === sensor.name && 
              alert.value_index !== undefined && 
              alert.value_index !== null &&
              alert.value_index >= 0 &&
              alert.value_index < sensor.values.length &&
              sensor.values[alert.value_index] !== undefined) {
            
            const currentValue = sensor.values[alert.value_index] as number;
            const threshold = alert.threshold_value;
            const condition = alert.condition_type;
            
            // 값 유효성 검사
            if (typeof currentValue !== 'number' || isNaN(currentValue)) {
              return;
            }
            
            let isTriggered = false;
            if (condition === 'above' && currentValue > threshold) {
              isTriggered = true;
            } else if (condition === 'below' && currentValue < threshold) {
              isTriggered = true;
            }

            if (isTriggered) {
              notifications.push({
                id: `sensor-alert-${sensor.name}-${alert.value_index}-${Date.now()}-${Math.random()}`,
                type: condition === 'above' ? 'warning' : 'error',
                title: `${sensor.name} 센서 경고`,
                message: `현재값 ${currentValue.toFixed(2)}이(가) 임계값 ${threshold}${condition === 'above' ? '를 초과' : ' 미만'}했습니다`,
                timestamp: new Date(),
                deviceName: deviceId,
                sensorName: sensor.name,
                sensorChannel: alert.value_index,
                severity: 'warning',
                isRead: false
              });
            }
          }
        });
      });
    }

    console.log('🔧 생성된 센서 알림:', notifications.length, '개');
    return notifications;
    
  } catch (error) {
    console.error('🔔 센서 알림 체크 실패:', error);
    
    // 에러 타입별 상세 로깅
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      
      // 404 에러 처리
      if (error.message.includes('404') || error.message.includes('찾을 수 없습니다')) {
        console.warn('💡 알림 설정 API 엔드포인트가 구현되지 않았을 수 있습니다');
      }
    }
    
    return [];
  }
};