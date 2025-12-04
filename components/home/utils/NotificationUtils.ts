// components/home/utils/NotificationUtils.ts
import { DetectedSensor } from '../../../types/sensor.types';
import { Notification, AlertLogItem, AlertSettingItem } from '../types/HomeTypes';
import { checkSensorAlerts, getSensorStatus } from '../../../utils/sensorUtils';
import { mqttService } from '../../../services/mqttService';

// 시간 표시 유틸리티
export const timeAgo = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
};

// 알림 아이콘 가져오기
export const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'warning': return '⚠️';
    case 'error': return '❌';
    case 'info': return 'ℹ️';
    case 'success': return '✅';
    default: return '📢';
  }
};

// 센서 기반 알림 생성
export const generateSensorNotifications = (sensors: DetectedSensor[], deviceName: string): Notification[] => {
  const notifications: Notification[] = [];
  
  sensors.forEach(sensor => {
    const alertData = checkSensorAlerts(sensor);
    const status = getSensorStatus(sensor);
    
    if (alertData.alerts.length > 0) {
      alertData.alerts.forEach((alert, index) => {
        notifications.push({
          id: `sensor-${sensor.name}-${sensor.channel}-${index}-${Date.now()}`,
          type: alertData.severity === 'critical' ? 'error' : 
                alertData.severity === 'warning' ? 'warning' : 'info',
          title: `${sensor.name} 센서 ${alertData.severity === 'critical' ? '위험' : '경고'}`,
          message: alert,
          timestamp: new Date(),
          deviceName: deviceName,
          sensorName: sensor.name,
          sensorChannel: sensor.channel,
          severity: alertData.severity,
          isRead: false
        });
      });
    }
    
    if (status === 'error') {
      notifications.push({
        id: `sensor-offline-${sensor.name}-${sensor.channel}-${Date.now()}`,
        type: 'error',
        title: '센서 연결 끊김',
        message: `${sensor.name} 센서(채널 ${sensor.channel})가 오프라인 상태입니다.`,
        timestamp: new Date(),
        deviceName: deviceName,
        sensorName: sensor.name,
        sensorChannel: sensor.channel,
        severity: 'critical',
        isRead: false
      });
    } else if (status === 'warning') {
      notifications.push({
        id: `sensor-unstable-${sensor.name}-${sensor.channel}-${Date.now()}`,
        type: 'warning',
        title: '센서 연결 불안정',
        message: `${sensor.name} 센서(채널 ${sensor.channel})의 연결이 불안정합니다.`,
        timestamp: new Date(),
        deviceName: deviceName,
        sensorName: sensor.name,
        sensorChannel: sensor.channel,
        severity: 'warning',
        isRead: false
      });
    }
  });
  
  return notifications;
};

// MqttService 메서드 존재 여부 확인
export const checkMqttServiceMethods = () => {
  const requiredMethods = ['getAlertHistory', 'getAlertSettings'];
  const availableMethods = requiredMethods.filter(method => 
    mqttService && typeof mqttService[method as keyof typeof mqttService] === 'function'
  );
  
  const missingMethods = requiredMethods.filter(method => 
    !mqttService || typeof mqttService[method as keyof typeof mqttService] !== 'function'
  );
  
  if (missingMethods.length > 0) {
    console.warn('⚠️ MqttService에 누락된 메서드들:', missingMethods);
    console.warn('💡 다음 메서드들을 mqttService에 구현해주세요:');
    missingMethods.forEach(method => {
      console.warn(`  - ${method}`);
    });
  }
  
  return {
    allAvailable: missingMethods.length === 0,
    availableMethods,
    missingMethods
  };
};

// 실시간 알림 로그 가져오기
export const fetchRealTimeAlerts = async (deviceId: string): Promise<Notification[]> => {
  try {
    console.log('🔔 실시간 알림 가져오기 시작:', deviceId);
    
    if (!mqttService) {
      console.warn('⚠️ mqttService가 정의되지 않음');
      return [];
    }
    
    if (typeof mqttService.getAlertHistory !== 'function') {
      console.warn('⚠️ getAlertHistory 메서드가 존재하지 않음');
      return [];
    }
    
    const response = await mqttService.getAlertHistory(deviceId, 50);
    console.log('📋 알림 히스토리 응답:', response);
    
    if (response && response.success && response.data && Array.isArray(response.data)) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      return response.data
        .filter((log: AlertLogItem) => {
          if (!log || !log.created_at) return false;
          
          try {
            const logDate = new Date(log.created_at);
            return logDate > thirtyMinutesAgo && !isNaN(logDate.getTime());
          } catch (error) {
            console.warn('⚠️ 잘못된 날짜 형식:', log.created_at);
            return false;
          }
        })
        .map((log: AlertLogItem) => ({
          id: `alert-${log.id}-${Date.now()}`,
          type: log.condition_type === 'above' ? 'warning' : 'error' as const,
          title: log.sensor_name ? `${log.sensor_name} 센서 알림` : `센서 ${log.sensor_type} 알림`,
          message: log.message || '알림 메시지 없음',
          timestamp: new Date(log.created_at),
          deviceName: deviceId,
          sensorName: log.sensor_name,
          sensorChannel: log.value_index,
          severity: 'warning' as const,
          isRead: false
        }));
    }
    
    console.log('📋 알림 히스토리 데이터 없음 또는 잘못된 형식');
    return [];
    
  } catch (error) {
    console.error('🔔 실시간 알림 가져오기 실패:', error);
    
    if (error instanceof Error) {
      console.error('에러 메시지:', error.message);
      
      if (error.message.includes('404') || error.message.includes('찾을 수 없습니다')) {
        console.warn('💡 알림 히스토리 API 엔드포인트가 구현되지 않았을 수 있습니다');
      }
      
      if (error.message.includes('Network') || error.message.includes('fetch')) {
        console.warn('💡 네트워크 연결 문제일 수 있습니다');
      }
    }
    
    return [];
  }
};