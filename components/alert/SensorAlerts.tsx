// components/alert/SensorAlerts.tsx
import React from 'react';
import { DetectedSensor, SENSOR_METADATA } from '../../types/sensor.types';

// 🔥 UI 아이콘 컴포넌트
const UIIcon: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ 
  name, 
  size = 'md', 
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  // 폴백 텍스트
  const fallbackText = {
    'warning': '⚠️',
    'error': '❌',
    'success': '✅',
    'info': 'ℹ️',
    'offline': '📡',
    'sensor': '🔧',
    'alert': '🚨'
  }[name] || '❓';

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {fallbackText}
    </span>
  );
};

interface SensorAlertsProps {
  sensors: DetectedSensor[];
}

const SensorAlerts: React.FC<SensorAlertsProps> = ({ sensors }) => {
  // 센서 상태 분석
  const analyzeSensorStatus = () => {
    const alerts: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      sensorName?: string;
      details?: string;
    }> = [];

    const activeSensors = sensors.filter(s => s.active);
    const inactiveSensors = sensors.filter(s => !s.active);

    // 비활성 센서 경고
    if (inactiveSensors.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${inactiveSensors.length}개의 센서가 비활성 상태입니다`,
        details: inactiveSensors.map(s => s.name).join(', ')
      });
    }

    // 활성 센서 중 값이 없는 센서 체크
    activeSensors.forEach(sensor => {
      if (!sensor.values || sensor.values.length === 0) {
        alerts.push({
          type: 'error',
          message: '센서 데이터 없음',
          sensorName: sensor.name,
          details: '센서가 활성화되어 있지만 데이터를 전송하지 않습니다'
        });
      } else {
        // 값이 유효하지 않은 경우 체크
        const invalidValues = sensor.values.filter(v => 
          (typeof v === 'number' && (isNaN(v) || !isFinite(v))) ||
          (v === null || v === undefined)
        );
        
        if (invalidValues.length > 0) {
          alerts.push({
            type: 'warning',
            message: '센서 값 이상',
            sensorName: sensor.name,
            details: `${invalidValues.length}개의 값이 유효하지 않습니다`
          });
        }
      }
    });

    // 센서 타입별 특수 체크
    activeSensors.forEach(sensor => {
      const metadata = SENSOR_METADATA[sensor.type];
      if (!metadata) {
        alerts.push({
          type: 'info',
          message: '알 수 없는 센서 타입',
          sensorName: sensor.name,
          details: `센서 타입 ${sensor.type}은 등록되지 않은 타입입니다`
        });
      }
    });

    return alerts;
  };

  const alerts = analyzeSensorStatus();

  // 알림이 없는 경우
  if (alerts.length === 0) {
    return (
      <div className="flex items-center space-x-2 text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
        <UIIcon name="success" size="sm" />
        <span className="text-sm font-medium">모든 센서가 정상적으로 작동 중입니다</span>
      </div>
    );
  }

  // 알림 타입별 스타일
  const getAlertStyle = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: 'error'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: 'warning'
        };
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-700',
          icon: 'info'
        };
    }
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => {
        const style = getAlertStyle(alert.type);
        return (
          <div 
            key={index}
            className={`flex items-start space-x-3 p-3 rounded-lg border ${style.bg} ${style.border}`}
          >
            <UIIcon name={style.icon} size="sm" className={`mt-0.5 ${style.text}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${style.text}`}>
                {alert.sensorName ? `${alert.sensorName}: ${alert.message}` : alert.message}
              </div>
              {alert.details && (
                <div className={`text-xs mt-1 ${style.text} opacity-80`}>
                  {alert.details}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Named export와 default export 모두 제공
export { SensorAlerts };
export default SensorAlerts;