// contexts/NotificationContext.tsx - 실시간 센서 알림 기능 강화
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';

// 알림 타입 정의
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'error' | 'info' | 'success' | 'sensor_alert' | 'sensor_recovery' | 'system_error';
  timestamp: Date;
  isRead: boolean;
  severity?: 'critical' | 'warning' | 'info' | 'low' | 'medium' | 'high';
  deviceName?: string;
  sensorName?: string;
  sensorChannel?: number;
  // 센서 알림 전용 필드 추가
  currentValue?: number;
  thresholdValue?: number;
  condition?: 'above' | 'below';
  alertSettingId?: number;
  isRealtime?: boolean; // 실시간 알림인지 구분
  autoHide?: boolean;   // 자동 숨김 여부
  sound?: boolean;      // 소리 알림 여부
}

// 실시간 토스트 알림 인터페이스
export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: 'sensor_alert' | 'sensor_recovery' | 'system_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  autoHide: boolean;
  duration: number;
  deviceName?: string;
  sensorName?: string;
  currentValue?: number;
  thresholdValue?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  connectionStatus: 'connected' | 'offline' | 'unknown';
  currentDeviceId: string | null;
  isSystemHealthy: boolean;
  
  // 실시간 토스트 알림
  toastNotifications: ToastNotification[];
  addToastNotification: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
  removeToastNotification: (toastId: string) => void;
  
  // 알림 설정
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  autoHideEnabled: boolean;
  setAutoHideEnabled: (enabled: boolean) => void;
  
  // 알림 관리 함수들
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  
  // 디바이스 관리
  setCurrentDevice: (deviceId: string | null, deviceName?: string) => void;
  
  // 수동 새로고침
  refreshNotifications: () => Promise<void>;
  
  // 센서 알림 시스템
  checkSensorAlerts: (deviceId: string, sensorData: any) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  // 상태 관리
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline' | 'unknown'>('unknown');
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [currentDeviceName, setCurrentDeviceName] = useState<string>('');
  
  // 알림 설정
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_sound_enabled');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [autoHideEnabled, setAutoHideEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_auto_hide_enabled');
    return saved ? JSON.parse(saved) : true;
  });

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastAlertCheckRef = useRef<{ [key: string]: number }>({});
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 읽지 않은 알림 개수
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // 시스템 상태 확인
  const isSystemHealthy = notifications.filter(n => n.type === 'warning' || n.type === 'error').length === 0 && 
                         connectionStatus === 'connected' && 
                         currentDeviceId !== null;

  // 알림음 재생 함수
  const playAlertSound = useCallback((severity: string) => {
    if (!soundEnabled) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 심각도별 다른 주파수
      const frequencies = {
        low: 440,      // A4
        medium: 554,   // C#5
        high: 659,     // E5
        critical: 880  // A5
      };

      oscillator.frequency.setValueAtTime(
        frequencies[severity as keyof typeof frequencies] || 440,
        audioContext.currentTime
      );
      oscillator.type = 'sine';

      // 볼륨 설정
      const volumes = {
        low: 0.1,
        medium: 0.2,
        high: 0.3,
        critical: 0.4
      };
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        volumes[severity as keyof typeof volumes] || 0.2,
        audioContext.currentTime + 0.1
      );
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      // 중요한 알림은 2번 재생
      if (severity === 'critical') {
        setTimeout(() => {
          const oscillator2 = audioContext.createOscillator();
          const gainNode2 = audioContext.createGain();
          
          oscillator2.connect(gainNode2);
          gainNode2.connect(audioContext.destination);
          
          oscillator2.frequency.setValueAtTime(880, audioContext.currentTime);
          oscillator2.type = 'sine';
          
          gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
          gainNode2.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1);
          gainNode2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
          
          oscillator2.start(audioContext.currentTime);
          oscillator2.stop(audioContext.currentTime + 0.5);
        }, 700);
      }
    } catch (error) {
      console.error('알림음 재생 실패:', error);
    }
  }, [soundEnabled]);

  // 브라우저 알림 표시
  const showBrowserNotification = useCallback((notification: Notification | ToastNotification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/logo.png',
        tag: notification.id,
        badge: '/logo.png',
        requireInteraction: notification.severity === 'critical'
      });

      browserNotification.onclick = () => {
        window.focus();
        browserNotification.close();
      };

      // 자동 닫기
      if (notification.severity !== 'critical') {
        setTimeout(() => browserNotification.close(), 5000);
      }
    }
  }, []);

  // 토스트 알림 추가
  const addToastNotification = useCallback((toastData: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newToast: ToastNotification = {
      ...toastData,
      id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    setToastNotifications(prev => [newToast, ...prev]);

    // 소리 재생
    if (toastData.type === 'sensor_alert') {
      playAlertSound(toastData.severity);
    }

    // 브라우저 알림 표시
    showBrowserNotification(newToast);

    // 자동 숨김
    if (newToast.autoHide && newToast.duration > 0) {
      setTimeout(() => {
        removeToastNotification(newToast.id);
      }, newToast.duration);
    }

    // 영구 알림으로도 추가
    const persistentNotification: Omit<Notification, 'id' | 'timestamp' | 'isRead'> = {
      title: newToast.title,
      message: newToast.message,
      type: newToast.type as Notification['type'], // 명시적 타입 변환
      severity: newToast.severity,
      deviceName: newToast.deviceName,
      sensorName: newToast.sensorName,
      currentValue: newToast.currentValue,
      thresholdValue: newToast.thresholdValue,
      isRealtime: true,
      autoHide: false,
      sound: true
    };

    addNotification(persistentNotification);
  }, [playAlertSound, showBrowserNotification]);

  // 토스트 알림 제거
  const removeToastNotification = useCallback((toastId: string) => {
    setToastNotifications(prev => prev.filter(toast => toast.id !== toastId));
  }, []);

  // 센서 알림 확인 함수
  const checkSensorAlerts = useCallback(async (deviceId: string, sensorData: any) => {
    try {
      // 알림 설정 가져오기
      const response = await fetch(`/api/mqtt/alerts/${deviceId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.warn('알림 설정을 가져올 수 없습니다.');
        return;
      }

      const result = await response.json();
      if (!result.success || !result.data || !Array.isArray(result.data)) {
        return;
      }

      const alertSettings = result.data;
      const deviceName = currentDeviceName || deviceId;

      // 각 센서의 값을 알림 설정과 비교
      if (sensorData?.sensors && Array.isArray(sensorData.sensors)) {
        for (const sensor of sensorData.sensors) {
          if (!sensor.active || !sensor.values || !Array.isArray(sensor.values)) {
            continue;
          }

          // 해당 센서의 알림 설정 찾기
          const relevantAlerts = alertSettings.filter((alert: any) => 
            alert.is_active && 
            ((alert.sensor_name && alert.sensor_name === sensor.name) ||
             (!alert.sensor_name && alert.sensor_type === sensor.type.toString()))
          );

          for (const alert of relevantAlerts) {
            let valueToCheck: number;
            let valueLabel: string;

            // 값 선택 (유연한 센서 vs 레거시 센서)
            if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
              // 유연한 센서
              valueToCheck = sensor.values[alert.value_index];
              valueLabel = `${sensor.name} 값 ${alert.value_index + 1}`;
            } else {
              // 레거시 센서 - 첫 번째 값 사용
              valueToCheck = sensor.values[0];
              valueLabel = sensor.name;
            }

            // 숫자 값인지 확인
            if (typeof valueToCheck !== 'number' || isNaN(valueToCheck)) {
              continue;
            }

            // 알림 조건 확인
            let isAlertTriggered = false;
            if (alert.condition_type === 'above' && valueToCheck > alert.threshold_value) {
              isAlertTriggered = true;
            } else if (alert.condition_type === 'below' && valueToCheck < alert.threshold_value) {
              isAlertTriggered = true;
            }

            // 중복 알림 방지 (5분 쿨다운)
            const alertKey = `${deviceId}_${alert.id || alert.sensor_type}_${alert.condition_type}`;
            const lastAlertTime = lastAlertCheckRef.current[alertKey] || 0;
            const now = Date.now();
            const cooldownPeriod = 5 * 60 * 1000; // 5분

            if (isAlertTriggered && (now - lastAlertTime) > cooldownPeriod) {
              // 알림 발생
              lastAlertCheckRef.current[alertKey] = now;

              const severity = valueToCheck > alert.threshold_value * 1.5 || valueToCheck < alert.threshold_value * 0.5 
                ? 'critical' : 'high';

              const alertTitle = alert.condition_type === 'above' 
                ? '센서 임계값 초과' 
                : '센서 임계값 미달';

              const alertMessage = `${valueLabel}이 ${valueToCheck.toFixed(2)}로 기준값 ${alert.threshold_value}를 ${alert.condition_type === 'above' ? '초과' : '미달'}했습니다.`;

              // 토스트 알림 표시
              addToastNotification({
                title: alertTitle,
                message: alertMessage,
                type: 'sensor_alert',
                severity: severity as 'low' | 'medium' | 'high' | 'critical',
                autoHide: autoHideEnabled && severity !== 'critical',
                duration: severity === 'critical' ? 0 : 8000,
                deviceName: deviceName,
                sensorName: sensor.name,
                currentValue: valueToCheck,
                thresholdValue: alert.threshold_value
              });

              console.log(`센서 알림 발생: ${alertMessage}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('센서 알림 확인 실패:', error);
    }
  }, [currentDeviceName, autoHideEnabled, addToastNotification]);

  // 실시간 알림 API 호출
  const fetchRealTimeAlerts = useCallback(async (deviceId: string): Promise<Notification[]> => {
    try {
      console.log('실시간 알림 가져오기:', deviceId);
      
      if (typeof window !== 'undefined' && (window as any).mqttService) {
        const mqttService = (window as any).mqttService;
        
        if (typeof mqttService.fetchRealTimeAlerts === 'function') {
          const alerts = await mqttService.fetchRealTimeAlerts(deviceId);
          return alerts || [];
        }
      }
      
      console.warn('MqttService를 사용할 수 없습니다.');
      return [];
      
    } catch (error) {
      console.error('실시간 알림 가져오기 실패:', error);
      setConnectionStatus('offline');
      return [];
    }
  }, []);

  // 센서 데이터 기반 알림 생성
  const generateSensorNotifications = useCallback((sensorData: any, deviceName: string): Notification[] => {
    const notifications: Notification[] = [];
    
    if (!sensorData || !Array.isArray(sensorData)) {
      return notifications;
    }

    sensorData.forEach((sensor: any, index: number) => {
      // 온도 센서 체크
      if (sensor.temperature !== undefined && sensor.temperature !== null) {
        if (sensor.temperature > 35) {
          notifications.push({
            id: `sensor-temp-${deviceName}-${index}-${Date.now()}`,
            title: '온도 경고',
            message: `${deviceName}의 온도가 ${sensor.temperature}°C로 임계값을 초과했습니다.`,
            type: 'warning',
            timestamp: new Date(),
            isRead: false,
            severity: 'warning',
            deviceName,
            sensorName: '온도 센서',
            sensorChannel: index,
            currentValue: sensor.temperature,
            thresholdValue: 35,
            condition: 'above',
            isRealtime: true
          });
        } else if (sensor.temperature < 5) {
          notifications.push({
            id: `sensor-temp-low-${deviceName}-${index}-${Date.now()}`,
            title: '온도 경고',
            message: `${deviceName}의 온도가 ${sensor.temperature}°C로 너무 낮습니다.`,
            type: 'warning',
            timestamp: new Date(),
            isRead: false,
            severity: 'warning',
            deviceName,
            sensorName: '온도 센서',
            sensorChannel: index,
            currentValue: sensor.temperature,
            thresholdValue: 5,
            condition: 'below',
            isRealtime: true
          });
        }
      }

      // 습도 센서 체크
      if (sensor.humidity !== undefined && sensor.humidity !== null) {
        if (sensor.humidity > 80) {
          notifications.push({
            id: `sensor-hum-${deviceName}-${index}-${Date.now()}`,
            title: '습도 경고',
            message: `${deviceName}의 습도가 ${sensor.humidity}%로 너무 높습니다.`,
            type: 'warning',
            timestamp: new Date(),
            isRead: false,
            severity: 'warning',
            deviceName,
            sensorName: '습도 센서',
            sensorChannel: index,
            currentValue: sensor.humidity,
            thresholdValue: 80,
            condition: 'above',
            isRealtime: true
          });
        } else if (sensor.humidity < 20) {
          notifications.push({
            id: `sensor-hum-low-${deviceName}-${index}-${Date.now()}`,
            title: '습도 경고',
            message: `${deviceName}의 습도가 ${sensor.humidity}%로 너무 낮습니다.`,
            type: 'warning',
            timestamp: new Date(),
            isRead: false,
            severity: 'warning',
            deviceName,
            sensorName: '습도 센서',
            sensorChannel: index,
            currentValue: sensor.humidity,
            thresholdValue: 20,
            condition: 'below',
            isRealtime: true
          });
        }
      }
    });

    return notifications;
  }, []);

  // 모든 알림 새로고침
  const refreshNotifications = useCallback(async () => {
    if (!currentDeviceId) {
      console.log('선택된 디바이스가 없습니다.');
      return;
    }

    try {
      setConnectionStatus(prev => prev === 'unknown' ? 'connected' : prev);
      
      const realTimeAlerts = await fetchRealTimeAlerts(currentDeviceId);
      
      setNotifications(prev => {
        const sensorAndStaticNotifications = prev.filter(n => 
          n.id.startsWith('sensor-') || n.id.startsWith('static-')
        );
        
        const existingRealTimeAlerts = prev.filter(n => 
          n.id.startsWith('alert-') || (!n.id.startsWith('sensor-') && !n.id.startsWith('static-'))
        );
        
        const hasChanges = realTimeAlerts.length !== existingRealTimeAlerts.length ||
          realTimeAlerts.some(newAlert => 
            !existingRealTimeAlerts.find(existing => existing.id === newAlert.id)
          );
        
        if (!hasChanges) {
          console.log('알림 변경사항 없음 - 렌더링 스킵');
          return prev;
        }
        
        const allNotifications = [...realTimeAlerts, ...sensorAndStaticNotifications];
        const sortedNotifications = allNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        console.log('알림 새로고침 완료:', realTimeAlerts.length, '개의 실시간 알림');
        return sortedNotifications;
      });
      
    } catch (error) {
      console.error('알림 새로고침 실패:', error);
      setConnectionStatus(prev => prev !== 'offline' ? 'offline' : prev);
    }
  }, [currentDeviceId, fetchRealTimeAlerts]);

  // 센서 데이터 기반 알림 업데이트
  const updateSensorNotifications = useCallback((sensorData: any) => {
    if (!currentDeviceName || !sensorData) {
      return;
    }

    // 센서 알림 확인 호출
    if (currentDeviceId) {
      checkSensorAlerts(currentDeviceId, sensorData);
    }

    const newSensorNotifications = generateSensorNotifications(sensorData.sensors, currentDeviceName);
    
    if (newSensorNotifications.length > 0) {
      setNotifications(prev => {
        const nonSensorNotifications = prev.filter(n => !n.id.startsWith('sensor-'));
        const allNotifications = [...newSensorNotifications, ...nonSensorNotifications];
        return allNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      });
    }
  }, [currentDeviceName, currentDeviceId, generateSensorNotifications, checkSensorAlerts]);

  // 현재 디바이스 설정
  const setCurrentDevice = useCallback((deviceId: string | null, deviceName: string = '') => {
    if (deviceId !== currentDeviceId) {
      setCurrentDeviceId(deviceId);
      setCurrentDeviceName(deviceName);
      
      // 디바이스 변경 시 센서 알림 초기화
      setNotifications(prev => prev.filter(n => !n.id.startsWith('sensor-')));
      setToastNotifications([]);
      
      // 알림 체크 기록 초기화
      lastAlertCheckRef.current = {};
    }
  }, [currentDeviceId]);

  // 알림 관리 함수들
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id ? { ...notification, isRead: true } : notification
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(notification => ({ ...notification, isRead: true }))
    );
  }, []);

  const addNotification = useCallback((notificationData: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => {
    const newNotification: Notification = {
      ...notificationData,
      id: `static-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      isRead: false
    };

    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    setToastNotifications([]);
  }, []);

  // 설정 저장 효과
  useEffect(() => {
    localStorage.setItem('notification_sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('notification_auto_hide_enabled', JSON.stringify(autoHideEnabled));
  }, [autoHideEnabled]);

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        console.log('브라우저 알림 권한:', permission);
      });
    }
  }, []);

  // 주기적 알림 업데이트 및 센서 모니터링
  useEffect(() => {
    if (currentDeviceId) {
      console.log('실시간 알림 연동 시작:', currentDeviceId);
      
      refreshNotifications();
      
      // 센서 데이터 기반 알림 확인을 위한 폴링 간격 단축 (30초)
      pollingIntervalRef.current = setInterval(() => {
        console.log('주기적 알림 업데이트');
        refreshNotifications();
      }, 30000);
      
      return () => {
        console.log('실시간 알림 정리');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    }
  }, [currentDeviceId, refreshNotifications]);

  // 전역 센서 데이터 업데이트 감지
  useEffect(() => {
    const handleSensorDataUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.deviceId === currentDeviceId) {
        updateSensorNotifications(event.detail.sensorData);
      }
    };

    window.addEventListener('sensorDataUpdate', handleSensorDataUpdate as EventListener);
    
    return () => {
      window.removeEventListener('sensorDataUpdate', handleSensorDataUpdate as EventListener);
    };
  }, [currentDeviceId, updateSensorNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        connectionStatus,
        currentDeviceId,
        isSystemHealthy,
        
        // 토스트 알림
        toastNotifications,
        addToastNotification,
        removeToastNotification,
        
        // 알림 설정
        soundEnabled,
        setSoundEnabled,
        autoHideEnabled,
        setAutoHideEnabled,
        
        markAsRead,
        markAllAsRead,
        addNotification,
        removeNotification,
        clearAllNotifications,
        setCurrentDevice,
        refreshNotifications,
        
        // 센서 알림 시스템
        checkSensorAlerts
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};