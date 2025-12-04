// components/alert/AlertSettings.tsx - 🔥 통합 완성 버전 (NotificationContext + 기상센서 처리)
import React, { useState, useEffect } from 'react';
import { SENSOR_METADATA, FlexibleSensorData, getSensorIcon, isSensorIconPng } from '../../types/sensor.types';
import { useNotifications } from '../../contexts/NotificationContext'; // 🔥 NotificationContext 연동

// 🔥 센서 아이콘 컴포넌트
const SensorIcon: React.FC<{ 
  sensorType: number; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ sensorType, size = 'md', className = '' }) => {
  const [imageError, setImageError] = useState(false);
  const icon = getSensorIcon(sensorType);
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  if (isSensorIconPng(sensorType) && !imageError) {
    return (
      <img 
        src={icon} 
        alt={`센서 ${sensorType}`}
        className={`${sizeClasses[size]} ${className} object-contain`}
        onError={() => {
          console.error(`❌ 이미지 로드 실패: ${icon}`);
          setImageError(true);
        }}
        onLoad={() => {
          console.log(`✅ 이미지 로드 성공: ${icon}`);
        }}
      />
    );
  }

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className} bg-gray-200 rounded text-xs font-bold text-gray-600`}>
      {sensorType}
    </span>
  );
};

// 🔥 UI 아이콘 컴포넌트
const UIIcon: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ 
  name, 
  size = 'md', 
  className = '' 
}) => {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  if (!imageError) {
    return (
      <img 
        src={`/${name}.png`} 
        alt={name}
        className={`${sizeClasses[size]} ${className} object-contain`}
        onError={() => setImageError(true)}
      />
    );
  }

  const fallbackText = {
    'chart': 'CHART', 'bell': 'BELL', 'settings': 'SET', 'add': 'ADD', 'delete': 'DEL',
    'refresh': 'REF', 'save': 'SAVE', 'cancel': 'CAN', 'active': 'ON', 'inactive': 'OFF',
    'warning': 'WARN', 'info': 'INFO', 'success': 'OK', 'error': 'ERR', 'sensor': 'SNR',
    'alert': 'ALT', 'log': 'LOG', 'test': 'TEST', 'power': 'PWR', 'network': 'NET'
  }[name] || name.toUpperCase().slice(0, 3);

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className} bg-gray-200 rounded text-xs font-bold text-gray-600`}>
      {fallbackText}
    </span>
  );
};

interface FlexibleAlertSetting {
  id?: number;
  sensor_type: string;
  sensor_name?: string | null;
  value_index?: number | null;
  condition_type: 'above' | 'below';
  threshold_value: number;
  is_active: boolean;
}

interface AlertLog {
  id: number;
  sensor_type: string;
  sensor_name?: string;
  value_index?: number;
  condition_type: string;
  sensor_value: number;
  threshold_value: number;
  message: string;
  created_at: string;
}

interface AlertSettingsProps {
  deviceId: string;
  latestSensorData?: FlexibleSensorData | null;
}

// 🔥 기상센서 타입들 (알림 설정에서 제외)
const WEATHER_SENSOR_TYPES = [16, 17, 18];

// 🔥 숫자 값 확인 함수
const isNumericValue = (value: any): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

// 🔥 값 포맷팅 함수
const formatValue = (value: any): string => {
  if (isNumericValue(value)) {
    return value.toFixed(2);
  }
  return String(value);
};

const AlertSettings: React.FC<AlertSettingsProps> = ({
  deviceId,
  latestSensorData
}) => {
  const [alerts, setAlerts] = useState<FlexibleAlertSetting[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({
    selectedSensorName: '',
    selectedValueIndex: 0,
    conditionType: 'above' as 'above' | 'below',
    thresholdValue: ''
  });

  const [showKakaoTest, setShowKakaoTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testAlertType, setTestAlertType] = useState<'alert' | 'recovery'>('alert');
  const [kakaoLoading, setKakaoLoading] = useState(false);

  // 🔥 NotificationContext 훅 사용
  const { 
    setCurrentDevice, 
    checkSensorAlerts, 
    addNotification,
    addToastNotification 
  } = useNotifications();

  // 🔥 컴포넌트 마운트 시 현재 디바이스 설정
  useEffect(() => {
    if (deviceId) {
      const deviceName = `Device_${deviceId}`;
      setCurrentDevice(deviceId, deviceName);
    }
  }, [deviceId, setCurrentDevice]);

  // 🔥 센서 데이터 변경 시 알림 체크
  useEffect(() => {
    if (deviceId && latestSensorData && alerts.length > 0) {
      checkSensorAlerts(deviceId, latestSensorData);
    }
  }, [deviceId, latestSensorData, alerts, checkSensorAlerts]);

  const showMessage = (message: string) => {
    window.alert(message);
  };

  // 센서 이름에서 채널 정보 추출
  const getChannelFromSensorName = (sensorName: string): string => {
    const match = sensorName.match(/_CH(\d+)$/);
    return match ? `CH${match[1]}` : 'CH?';
  };

  // 🔥 개선된 센서 옵션 생성 (기상센서 제외 + 숫자값만 필터링)
  const getAvailableSensorOptions = () => {
    if (!latestSensorData?.sensors || !Array.isArray(latestSensorData.sensors)) {
      return [];
    }

    const options: Array<{
      sensorName: string;
      valueIndex: number;
      label: string;
      unit: string;
      currentValue?: number;
    }> = [];

    latestSensorData.sensors.forEach((sensor) => {
      if (!sensor.active || WEATHER_SENSOR_TYPES.includes(sensor.type)) {
        return;
      }

      if (!sensor.values || !Array.isArray(sensor.values)) {
        return;
      }

      const metadata = SENSOR_METADATA[sensor.type] || SENSOR_METADATA[0];
      const channel = getChannelFromSensorName(sensor.name);

      sensor.values.forEach((value, index) => {
        if (!isNumericValue(value)) {
          return;
        }

        const valueLabel = metadata.valueLabels[index] || `값 ${index + 1}`;
        const unitArray = metadata.unit.split(',');
        const unit = unitArray[index]?.trim() || '';

        const option = {
          sensorName: sensor.name,
          valueIndex: index,
          label: `${channel} - ${valueLabel}${unit ? ` (${unit})` : ''} (${formatValue(value)})`,
          unit: unit,
          currentValue: value
        };

        options.push(option);
      });
    });

    return options;
  };

  const getSensorLabel = (alert: FlexibleAlertSetting) => {
    if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
      const sensor = latestSensorData?.sensors?.find(s => s.name === alert.sensor_name);
      if (sensor && sensor.type !== undefined) {
        const metadata = SENSOR_METADATA[sensor.type] || SENSOR_METADATA[0];
        const valueLabel = metadata.valueLabels[alert.value_index] || `값 ${alert.value_index + 1}`;
        const unitArray = metadata.unit.split(',');
        const unit = unitArray[alert.value_index]?.trim() || '';
        const channel = getChannelFromSensorName(alert.sensor_name);
        
        return `${channel} - ${valueLabel}${unit ? ` (${unit})` : ''}`;
      }
      const channel = getChannelFromSensorName(alert.sensor_name);
      return `${channel} (값 ${alert.value_index + 1})`;
    }

    return `센서 ${alert.sensor_type}`;
  };

  // 알림 설정 불러오기
  const fetchAlerts = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/mqtt/alerts/${deviceId}`, {
        credentials: 'include'
      });
      const result = await response.json();

      if (result.success) {
        setAlerts(result.data);
      } else {
        setError(result.message || '알림 설정을 불러올 수 없습니다.');
      }
    } catch (error) {
      setError('서버 연결 오류가 발생했습니다.');
    }
  };

  // 알림 로그 불러오기
  const fetchLogs = async () => {
    try {
      const response = await fetch(`/api/mqtt/alerts/${deviceId}/logs`, {
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
      }
    } catch (error) {
      console.error('알림 로그 불러오기 실패:', error);
    }
  };

  const deleteLog = async (logId: number) => {
    if (!window.confirm('이 알림 로그를 삭제하시겠습니까?')) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/mqtt/alerts/${deviceId}/logs/${logId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      if (result.success) {
        await fetchLogs();
        showMessage('알림 로그가 삭제되었습니다.');
      } else {
        showMessage('삭제 실패: ' + result.message);
      }
    } catch (error) {
      showMessage('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const deleteAllLogs = async () => {
    if (!window.confirm('모든 알림 로그를 삭제하시겠습니까?')) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/mqtt/alerts/${deviceId}/logs/all`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      if (result.success) {
        await fetchLogs();
        showMessage('모든 알림 로그가 삭제되었습니다.');
      } else {
        showMessage('삭제 실패: ' + result.message);
      }
    } catch (error) {
      showMessage('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 새로운 알림 저장 (토스트 알림 추가)
  const saveNewAlert = async () => {
    if (!newAlert.selectedSensorName || !newAlert.thresholdValue) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      const selectedSensor = latestSensorData?.sensors?.find(s => s.name === newAlert.selectedSensorName);

      if (!selectedSensor) {
        alert('선택된 센서를 찾을 수 없습니다. 다시 선택해주세요.');
        return;
      }

      const alertData: FlexibleAlertSetting = {
        sensor_type: selectedSensor.type.toString(),
        sensor_name: newAlert.selectedSensorName,
        value_index: newAlert.selectedValueIndex,
        condition_type: newAlert.conditionType,
        threshold_value: parseFloat(newAlert.thresholdValue),
        is_active: true
      };

      const response = await fetch(`/api/mqtt/alerts/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(alertData)
      });

      const result = await response.json();
      
      if (result.success) {
        await fetchAlerts();
        setShowAddAlert(false);
        setNewAlert({
          selectedSensorName: '',
          selectedValueIndex: 0,
          conditionType: 'above',
          thresholdValue: ''
        });

        // 🔥 성공 알림 추가
        addNotification({
          title: '✅ 알림 설정 완료',
          message: `${newAlert.selectedSensorName}에 대한 새로운 알림이 설정되었습니다.`,
          type: 'success',
          severity: 'info',
          deviceName: `Device_${deviceId}`,
          sensorName: newAlert.selectedSensorName
        });

        // 🔥 토스트 알림도 표시
        addToastNotification({
          title: '✅ 알림 설정 완료',
          message: `${newAlert.selectedSensorName} - ${newAlert.conditionType === 'above' ? '초과' : '미달'} ${newAlert.thresholdValue} 알림이 활성화되었습니다.`,
          type: 'sensor_recovery',
          severity: 'low',
          autoHide: true,
          duration: 5000,
          deviceName: `Device_${deviceId}`,
          sensorName: newAlert.selectedSensorName,
          thresholdValue: parseFloat(newAlert.thresholdValue)
        });

        alert('알림 설정이 저장되었습니다.');
      } else {
        alert('저장 실패: ' + result.message);
      }
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 알림 설정 삭제 함수 (토스트 알림 추가)
  const deleteAlert = async (alertId: number) => {
    if (!window.confirm('정말 이 알림 설정을 삭제하시겠습니까?')) {
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/mqtt/alerts/${deviceId}/${alertId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        await fetchAlerts();

        // 🔥 삭제 알림 추가
        addNotification({
          title: '🗑️ 알림 설정 삭제',
          message: '선택한 알림 설정이 삭제되었습니다.',
          type: 'info',
          severity: 'info',
          deviceName: `Device_${deviceId}`
        });

        alert('알림 설정이 삭제되었습니다.');
      } else {
        alert('삭제 실패: ' + result.message);
      }
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 알림 활성화/비활성화 토글 함수 (토스트 알림 추가)
  const toggleAlert = async (alert: FlexibleAlertSetting) => {
    const updatedAlert = { ...alert, is_active: !alert.is_active };

    try {
      setLoading(true);

      const response = await fetch(`/api/mqtt/alerts/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatedAlert)
      });

      const result = await response.json();

      if (result.success) {
        await fetchAlerts();

        const statusText = updatedAlert.is_active ? '활성화' : '비활성화';
        const sensorLabel = getSensorLabel(alert);

        // 🔥 상태 변경 알림 추가
        addNotification({
          title: `🔄 알림 ${statusText}`,
          message: `${sensorLabel} 알림이 ${statusText}되었습니다.`,
          type: updatedAlert.is_active ? 'success' : 'warning',
          severity: 'info',
          deviceName: `Device_${deviceId}`,
          sensorName: alert.sensor_name || undefined
        });

        // 🔥 토스트 알림도 표시
        addToastNotification({
          title: `🔄 알림 ${statusText}`,
          message: `${sensorLabel} 모니터링이 ${statusText}되었습니다.`,
          type: updatedAlert.is_active ? 'sensor_recovery' : 'system_error',
          severity: updatedAlert.is_active ? 'low' : 'medium',
          autoHide: true,
          duration: 4000,
          deviceName: `Device_${deviceId}`,
          sensorName: alert.sensor_name || undefined
        });

        window.alert(`알림이 ${statusText}되었습니다.`);
      } else {
        window.alert('토글 실패: ' + result.message);
      }
    } catch (error) {
      window.alert('토글 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 카카오 알림톡 테스트 발송 (토스트 알림 추가)
  const handleTestKakao = async () => {
    if (!testPhone.trim()) {
      alert('테스트 수신 번호를 입력해주세요.');
      return;
    }

    try {
      setKakaoLoading(true);
      const response = await fetch(`/api/mqtt/alerts/${deviceId}/test-kakao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          testPhone: testPhone.replace(/-/g, ''),
          alertType: testAlertType,
          sensorType: 'temperature',
          sensorName: newAlert.selectedSensorName
        })
      });

      const result = await response.json();

      if (result.success) {
        // 🔥 테스트 성공 알림
        addNotification({
          title: '📱 테스트 알림톡 발송 완료',
          message: `${testPhone}로 테스트 ${testAlertType === 'alert' ? '경고' : '복구'} 알림톡이 발송되었습니다.`,
          type: 'success',
          severity: 'info',
          deviceName: `Device_${deviceId}`
        });

        addToastNotification({
          title: '📱 테스트 발송 완료',
          message: `${testPhone}로 알림톡이 정상 발송되었습니다.`,
          type: 'sensor_recovery',
          severity: 'low',
          autoHide: true,
          duration: 5000,
          deviceName: `Device_${deviceId}`
        });

        alert(`테스트 알림톡이 ${testPhone}로 발송되었습니다!`);
        setShowKakaoTest(false);
      } else {
        alert('알림톡 발송에 실패했습니다: ' + result.message);
      }
    } catch (error) {
      alert('테스트 발송 중 오류가 발생했습니다.');
    } finally {
      setKakaoLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      fetchAlerts();
      fetchLogs();
    }
  }, [deviceId]);

  const sensorOptions = getAvailableSensorOptions();

  return (
    <div className="space-y-6">


      {/* 현재 센서 상태 표시 (간소화) */}
      {latestSensorData?.sensors && latestSensorData.sensors.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <UIIcon name="chart" size="sm" />
            <h4 className="text-sm font-medium text-gray-700">연결된 센서</h4>
            <span className="text-xs text-gray-500">
              ({latestSensorData.sensors.filter(s => s.active && !WEATHER_SENSOR_TYPES.includes(s.type)).length}개)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {latestSensorData.sensors
              .filter(s => s.active && !WEATHER_SENSOR_TYPES.includes(s.type))
              .map(sensor => {
                const channel = getChannelFromSensorName(sensor.name);
                return (
                  <div key={sensor.name} className="flex items-center space-x-1 bg-white px-2 py-1 rounded text-xs border">
                    <SensorIcon sensorType={sensor.type} size="sm" />
                    <span className="text-gray-700">{channel}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 메인 설정 패널 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-4 sm:space-y-0">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <UIIcon name="bell" size="lg" />
                <h3 className="text-lg font-semibold">센서 알림 설정</h3>
              </div>
              <p className="text-sm text-gray-500">
                센서별 알림 설정 (기상센서 제외)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddAlert(!showAddAlert)}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors flex items-center space-x-2"
                disabled={sensorOptions.length === 0}
              >
                <UIIcon name="add" size="sm" />
                <span>{showAddAlert ? '취소' : '알림 추가'}</span>
                {sensorOptions.length > 0 && <span>({sensorOptions.length})</span>}
              </button>
            </div>
          </div>
        </div>

        {/* 센서가 없는 경우 안내 */}
        {sensorOptions.length === 0 && (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <UIIcon name="power" size="lg" className="opacity-50" />
            </div>
            <h4 className="text-lg font-medium text-gray-700 mb-2">알림 설정 가능한 센서가 없습니다</h4>
            <p className="text-gray-500 mb-4">
              숫자 값을 전송하는 센서가 활성화되어야 합니다.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors flex items-center space-x-2 mx-auto"
            >
              <UIIcon name="refresh" size="sm" />
              <span>페이지 새로고침</span>
            </button>
          </div>
        )}

        {/* 새로운 알림 추가 폼 */}
        {showAddAlert && sensorOptions.length > 0 && (
          <div className="p-6 border-b bg-green-50">
            <div className="flex items-center space-x-2 mb-4">
              <UIIcon name="add" size="md" />
              <h4 className="font-semibold text-green-800">새로운 정밀 알림 설정</h4>
            </div>

            <div className="space-y-6">
              {/* 1단계: 센서 및 값 선택 */}
              <div>
                <label className="block text-sm font-medium mb-3 text-green-800">
                  1단계: 모니터링할 센서 값 선택 (숫자 값만)
                </label>
                <select
                  value={`${newAlert.selectedSensorName}_${newAlert.selectedValueIndex}`}
                  onChange={(e) => {
                    if (e.target.value) {
                      const lastUnderscoreIndex = e.target.value.lastIndexOf('_');
                      const sensorName = e.target.value.substring(0, lastUnderscoreIndex);
                      const valueIndex = e.target.value.substring(lastUnderscoreIndex + 1);
                      
                      setNewAlert({
                        ...newAlert,
                        selectedSensorName: sensorName,
                        selectedValueIndex: parseInt(valueIndex)
                      });
                    }
                  }}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">알림을 받을 센서 값을 선택하세요</option>
                  {sensorOptions.map((option, index) => (
                    <option 
                      key={index} 
                      value={`${option.sensorName}_${option.valueIndex}`}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2단계: 조건 및 임계값 설정 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-green-800">
                    2단계: 알림 조건
                  </label>
                  <select
                    value={newAlert.conditionType}
                    onChange={(e) => setNewAlert({
                      ...newAlert,
                      conditionType: e.target.value as 'above' | 'below'
                    })}
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="above">초과 (값이 임계값을 초과하면 알림)</option>
                    <option value="below">미만 (값이 임계값 미만이면 알림)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-green-800">
                    3단계: 임계값
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newAlert.thresholdValue}
                    onChange={(e) => setNewAlert({
                      ...newAlert,
                      thresholdValue: e.target.value
                    })}
                    placeholder="예: 25.5"
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* 설정 미리보기 */}
              {newAlert.selectedSensorName && newAlert.thresholdValue && (
                <div className="p-4 bg-white rounded-lg border border-green-300">
                  <div className="text-sm text-green-800">
                    <div className="flex items-start space-x-2">
                      <UIIcon name="info" size="md" />
                      <div>
                        <strong>알림 설정 미리보기:</strong><br />
                        <div className="mt-1 text-green-700">
                          "{sensorOptions.find(opt =>
                            opt.sensorName === newAlert.selectedSensorName &&
                            opt.valueIndex === newAlert.selectedValueIndex
                          )?.label?.split(' (')[0] || '선택된 센서'}"가 
                          <strong className="mx-1">{newAlert.thresholdValue}</strong>
                          {newAlert.conditionType === 'above' ? '를 초과하면' : ' 미만이 되면'} 
                          <strong> 카카오 알림톡</strong>을 발송합니다.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowAddAlert(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
                  disabled={loading}
                >
                  <UIIcon name="cancel" size="sm" />
                  <span>취소</span>
                </button>
                <button
                  onClick={saveNewAlert}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  disabled={loading || !newAlert.selectedSensorName || !newAlert.thresholdValue}
                >
                  <UIIcon name="save" size="sm" />
                  <span>{loading ? '저장 중...' : '알림 저장'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 현재 알림 설정 목록 - 반응형 버전 */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <UIIcon name="alert" size="md" />
              <h4 className="font-semibold">활성 알림 설정 ({alerts.length}개)</h4>
            </div>
            <button
              onClick={fetchAlerts}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors flex items-center space-x-1"
              disabled={loading}
            >
              <UIIcon name="refresh" size="sm" />
              <span>새로고침</span>
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex justify-center mb-4">
                <UIIcon name="bell" size="lg" className="opacity-50" />
              </div>
              <p className="text-gray-500 mb-2">설정된 알림이 없습니다.</p>
              <p className="text-sm text-gray-400">
                위의 '알림 추가' 버튼으로 첫 번째 정밀 알림을 설정해보세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={alert.id || index} className="border rounded-lg hover:bg-gray-50 transition-colors">
                  
                  {/* 데스크톱 레이아웃 (md 이상) */}
                  <div className="hidden md:flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-800">{getSensorLabel(alert)}</span>
                        <span className="text-gray-600 font-mono">
                          {alert.condition_type === 'above' ? '>' : '<'} {alert.threshold_value}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${
                          alert.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          <UIIcon name={alert.is_active ? 'active' : 'inactive'} size="sm" />
                          <span>{alert.is_active ? '활성' : '비활성'}</span>
                        </span>
                        {alert.sensor_name && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs flex items-center space-x-1">
                            <UIIcon name="sensor" size="sm" />
                            <span>정밀센서</span>
                          </span>
                        )}
                        {/* 현재값 표시 */}
                        {(() => {
                          if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
                            const sensor = latestSensorData?.sensors?.find(s => s.name === alert.sensor_name);
                            if (sensor && sensor.values && sensor.values[alert.value_index] !== undefined) {
                              const currentValue = sensor.values[alert.value_index];
                              if (isNumericValue(currentValue)) {
                                const metadata = SENSOR_METADATA[sensor.type] || SENSOR_METADATA[0];
                                const unitArray = metadata.unit.split(',');
                                const unit = unitArray[alert.value_index]?.trim() || '';
                                return (
                                  <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded-full text-xs">
                                    현재: {formatValue(currentValue)}{unit}
                                  </span>
                                );
                              }
                            }
                          }
                          return null;
                        })()}
                      </div>
                      <p className="text-sm text-gray-500">
                        {getSensorLabel(alert)}가 {alert.threshold_value}
                        {alert.condition_type === 'above' ? '를 초과하면' : ' 미만이 되면'} 
                        <strong> 카카오 알림톡</strong> 발송
                      </p>
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleAlert(alert)}
                        className={`px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1 ${
                          alert.is_active
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                        disabled={loading}
                      >
                        <UIIcon name={alert.is_active ? 'inactive' : 'active'} size="sm" />
                        <span>{alert.is_active ? '일시중지' : '활성화'}</span>
                      </button>
                      {alert.id && (
                        <button
                          onClick={() => deleteAlert(alert.id!)}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center space-x-1"
                          disabled={loading}
                        >
                          <UIIcon name="delete" size="sm" />
                          <span>삭제</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 모바일 레이아웃 (md 미만) */}
                  <div className="md:hidden p-4">
                    {/* 센서 정보 */}
                    <div className="mb-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-medium text-gray-800">{getSensorLabel(alert)}</span>
                        {alert.sensor_name && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs flex items-center space-x-1">
                            <UIIcon name="sensor" size="sm" />
                            <span>정밀센서</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-gray-600 font-mono text-sm">
                          {alert.condition_type === 'above' ? '>' : '<'} {alert.threshold_value}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {getSensorLabel(alert)}가 {alert.threshold_value}
                        {alert.condition_type === 'above' ? '를 초과하면' : ' 미만이 되면'} 
                        <strong> 카카오 알림톡</strong> 발송
                      </p>
                    </div>
                    
                    {/* 2x2 그리드: 상태 + 버튼들 */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* 활성 상태 */}
                      <div className="flex items-center justify-center">
                        <span className={`px-3 py-2 rounded-lg text-sm font-medium w-full text-center flex items-center justify-center space-x-1 ${
                          alert.is_active 
                            ? 'bg-green-100 text-green-800 border border-green-200' 
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          <UIIcon name={alert.is_active ? 'active' : 'inactive'} size="sm" />
                          <span>{alert.is_active ? '활성' : '비활성'}</span>
                        </span>
                      </div>
                      
                      {/* 현재값 표시 */}
                      <div className="flex items-center justify-center">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 w-full text-center">
                          <div className="text-xs text-blue-600 font-medium">현재값</div>
                          <div className="text-sm font-mono text-blue-800">
                            {(() => {
                              if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
                                const sensor = latestSensorData?.sensors?.find(s => s.name === alert.sensor_name);
                                if (sensor && sensor.values && sensor.values[alert.value_index] !== undefined) {
                                  const currentValue = sensor.values[alert.value_index];
                                  if (isNumericValue(currentValue)) {
                                    const metadata = SENSOR_METADATA[sensor.type] || SENSOR_METADATA[0];
                                    const unitArray = metadata.unit.split(',');
                                    const unit = unitArray[alert.value_index]?.trim() || '';
                                    return `${formatValue(currentValue)}${unit}`;
                                  }
                                }
                              }
                              return '--';
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* 토글 버튼 */}
                      <button
                        onClick={() => toggleAlert(alert)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center justify-center space-x-1 ${
                          alert.is_active
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600 active:bg-yellow-700'
                            : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
                        }`}
                        disabled={loading}
                      >
                        <UIIcon name={loading ? 'refresh' : (alert.is_active ? 'inactive' : 'active')} size="sm" />
                        <span>{loading ? '처리중' : (alert.is_active ? '일시중지' : '활성화')}</span>
                      </button>
                      
                      {/* 삭제 버튼 */}
                      {alert.id && (
                        <button
                          onClick={() => deleteAlert(alert.id!)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-50 w-full flex items-center justify-center space-x-1"
                          disabled={loading}
                        >
                          <UIIcon name={loading ? 'refresh' : 'delete'} size="sm" />
                          <span>{loading ? '처리중' : '삭제'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 최근 알림 로그 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <UIIcon name="log" size="md" />
                <h4 className="font-semibold">최근 알림 로그 ({logs.length}개)</h4>
              </div>
              <p className="text-sm text-gray-500">알림이 발생하면 여기에 기록됩니다.</p>
            </div>
            {logs.length > 0 && (
              <button
                onClick={deleteAllLogs}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center space-x-1"
                disabled={loading}
              >
                <UIIcon name="delete" size="sm" />
                <span>전체 삭제</span>
              </button>
            )}
          </div>
        </div>
        <div className="p-6">
          {logs.length === 0 ? (
           <div className="text-center py-6">
             <div className="flex justify-center mb-4">
               <UIIcon name="log" size="lg" className="opacity-50" />
             </div>
             <p className="text-gray-500">알림 로그가 없습니다.</p>
             <p className="text-sm text-gray-400 mt-1">알림이 발생하면 여기에 기록됩니다.</p>
           </div>
         ) : (
           <div className="space-y-3 max-h-80 overflow-y-auto">
             {logs.map((log) => (
               <div key={log.id} className="p-4 border-l-4 border-red-400 bg-red-50 rounded-r shadow-sm">
                 <div className="flex justify-between items-start">
                   <div className="flex-1">
                     <div className="flex items-start space-x-2 mb-2">
                       <UIIcon name="warning" size="sm" className="mt-0.5 text-red-600" />
                       <p className="text-sm font-medium text-red-800">{log.message}</p>
                     </div>
                     <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-600">
                       <span>센서: {log.sensor_name ? getChannelFromSensorName(log.sensor_name) : `센서 ${log.sensor_type}`}</span>
                       <span>현재값: {log.sensor_value}</span>
                       <span>기준값: {log.threshold_value}</span>
                       {log.sensor_name && (
                         <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded flex items-center space-x-1">
                           <UIIcon name="sensor" size="sm" />
                           <span>정밀센서</span>
                         </span>
                       )}
                     </div>
                   </div>
                   <div className="flex items-center space-x-2 ml-4">
                     <p className="text-xs text-gray-500 whitespace-nowrap">
                       {new Date(log.created_at).toLocaleString()}
                     </p>
                     <button
                       onClick={() => deleteLog(log.id)}
                       className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-colors flex items-center"
                       disabled={loading}
                       title="로그 삭제"
                     >
                       <UIIcon name="delete" size="sm" />
                     </button>
                   </div>
                 </div>
               </div>
             ))}
           </div>
         )}
       </div>
     </div>
   </div>
 );
};

export default AlertSettings;