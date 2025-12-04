import React, { useState, useEffect } from 'react';
import { useDevices } from '../contexts/DeviceContext';
import { mqttService } from '../services/mqttService';
import Layout from './Layout';

// 타입 정의들
interface Sensor {
  name: string;
  type: number;
  active: boolean;
  values: unknown[];
}

interface SensorData {
  sensors: Sensor[];
}

interface Alert {
  id?: string;
  sensor_type: string;
  sensor_name?: string;
  value_index?: number;
  condition_type: 'above' | 'below';
  threshold_value: number;
  is_active: boolean;
}

interface AlertLog {
  id: string;
  message: string;
  sensor_name?: string;
  sensor_type?: string;
  sensor_value: number;
  threshold_value: number;
  value_index?: number;
  created_at: string;
}

interface SensorOption {
  sensorName: string;
  valueIndex: number;
  label: string;
  unit: string;
  currentValue: unknown;
}

interface NewAlert {
  selectedSensorName: string;
  selectedValueIndex: number;
  conditionType: 'above' | 'below';
  thresholdValue: string;
}

// 센서 타입 정의
const SensorType = {
  NONE: 0,
  SHT20: 1,
  TSL2591: 2,  // 조도센서 (TSL2591)
  BH1750: 2,   // 호환성을 위해 유지
  ADS1115: 3,
  BME280: 4,
  DS18B20: 5,
  SCD30: 6,
  WIND_DIRECTION: 16,
  WIND_SPEED: 17,
  PRECIPITATION: 18,
  SOIL_SENSOR: 19
};

// 센서 메타데이터 (간소한 이미지 이름)
const SENSOR_METADATA = {
  0: { name: '알 수 없음', icon: '/unknown.png', valueLabels: ['값'], unit: '' },
  1: { name: 'SHT20', icon: '/thermometer.png', valueLabels: ['온도', '습도'], unit: '°C, %' },
  2: { name: 'TSL2591', icon: '/sun.png', valueLabels: ['조도'], unit: 'lux' },
  3: { name: 'ADS1115', icon: '/water.png', valueLabels: ['수온', 'EC', 'pH'], unit: '°C, dS/m, ' },
  4: { name: 'SCD30', icon: '/air.png', valueLabels: ['CO2', '온도', '습도'], unit: 'ppm, °C, %' },
  5: { name: 'DS18B20', icon: '/thermometer.png', valueLabels: ['온도'], unit: '°C' },
  6: { name: 'BME280', icon: '/cloud.png', valueLabels: ['온도', '습도', '기압'], unit: '°C, %, hPa' },
  16: { name: '풍향', icon: '/direction.png', valueLabels: ['기어방향', '각도방향 (°)', '방향'], unit: '도, 방향' },
  17: { name: '풍속', icon: '/direction.png', valueLabels: ['풍속 (m/s)', '풍력계급', '상태'], unit: 'm/s' },
  18: { name: '강우/강설', icon: '/rain.png', valueLabels: ['강수상태', '강수상태텍스트', '수분레벨', '수분강도', '온도 (°C)', '습도 (%)', '온도상태', '아이콘'], unit: '°C, %, 레벨' },
  19: { name: '토양센서', icon: '/soil.png', valueLabels: ['토양pH', '토양EC (dS/m)', '토양온도 (°C)', '토양습도 (%)', '수분상태', 'pH상태', 'EC상태'], unit: ', dS/m, °C, %' }
};

// 기상센서 타입들 (알림 설정에서 제외)
const WEATHER_SENSOR_TYPES = [16, 17, 18];

// 토양센서에서 제외할 값 인덱스들 (질소, 인, 칼륨 + 토양습도, 수분상태, pH상태, EC상태)
const EXCLUDED_SOIL_VALUE_INDICES = [4, 5, 6, 7, 8, 9];

// 유틸리티 함수들
const isNumericValue = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

const formatValue = (value: unknown): string => {
  if (isNumericValue(value)) {
    return value.toFixed(2);
  }
  return String(value);
};

// UI 아이콘 컴포넌트
interface UIIconProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const UIIcon: React.FC<UIIconProps> = ({ name, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const iconMap: Record<string, string> = {
    'chart': '/chart.png',
    'bell': '/bell.png',
    'settings': '/settings.png',
    'add': '/add.png',
    'delete': '/delete.png',
    'refresh': '/refresh.png',
    'save': '/save.png',
    'cancel': '/cancel.png',
    'active': '/active.png',
    'inactive': '/inactive.png',
    'warning': '/warning.png',
    'info': '/info.png',
    'success': '/success.png',
    'error': '/error.png',
    'sensor': '/sensor.png',
    'alert': '/alert.png',
    'log': '/log.png',
    'test': '/test.png',
    'power': '/power.png',
    'network': '/network.png',
    'device': '/device.png'
  };

  const iconPath = iconMap[name] || '/unknown.png';

  return (
    <img
      src={iconPath}
      alt={name}
      className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src = '/unknown.png';
      }}
    />
  );
};

// 센서 아이콘 컴포넌트
interface SensorIconProps {
  sensorType: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SensorIcon: React.FC<SensorIconProps> = ({ sensorType, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const metadata = SENSOR_METADATA[sensorType as keyof typeof SENSOR_METADATA] || SENSOR_METADATA[0];

  return (
    <img
      src={metadata.icon}
      alt={metadata.name}
      className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src = '/unknown.png';
      }}
    />
  );
};

// 장치 타입 정의
interface Device {
  device_id: string;
  device_name: string;
  last_seen_at?: string;
  is_favorite?: boolean;
}

// 장치 선택 컴포넌트
interface DeviceSelectorProps {
  currentDeviceId: string;
  onDeviceSelect: (deviceId: string) => void;
  devices: Device[];
  loading: boolean;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({ currentDeviceId, onDeviceSelect, devices, loading }) => {
  const getDeviceStatus = (device: Device) => {
    if (!device.last_seen_at) return { color: 'bg-gray-400', text: '상태 불명' };

    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

    if (diffMinutes < 5) return { color: 'bg-green-400', text: '온라인' };
    if (diffMinutes < 30) return { color: 'bg-yellow-400', text: '최근 활동' };
    return { color: 'bg-red-400', text: '오프라인' };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-5 h-5 bg-gray-300 rounded animate-pulse"></div>
          <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
        </div>
        <div className="flex space-x-3 overflow-x-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-48 h-20 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center space-x-2 mb-3">
          <UIIcon name="device" size="md" />
          <h2 className="text-lg font-semibold text-gray-800">장치 선택</h2>
        </div>
        <div className="text-center py-8 text-gray-500">
          <p>등록된 장치가 없습니다.</p>
          <p className="text-sm mt-2">먼저 장치를 등록해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
      <div className="flex items-center space-x-2 mb-3">
        <UIIcon name="device" size="md" />
        <h2 className="text-lg font-semibold text-gray-800">알림 설정할 장치 선택</h2>
        <span className="text-sm text-gray-500">({devices.length}개)</span>
      </div>

      <div className="flex space-x-3 overflow-x-auto pb-2">
        {devices.map((device) => {
          const isActive = currentDeviceId === device.device_id;
          const status = getDeviceStatus(device);

          return (
            <button
              key={device.device_id}
              onClick={() => onDeviceSelect(device.device_id)}
              className={`
                flex-shrink-0 w-48 p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md text-left
                ${isActive
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium text-sm truncate ${isActive ? 'text-blue-700' : 'text-gray-800'
                    }`}>
                    {device.device_name}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">
                    ID: {device.device_id}
                  </p>
                </div>

                {device.is_favorite && (
                  <span className="text-yellow-500 text-sm ml-1">★</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                <span className={`text-xs font-medium ${status.text === '온라인'
                  ? 'text-green-600'
                  : status.text === '최근 활동'
                    ? 'text-yellow-600'
                    : 'text-red-600'
                  }`}>
                  {status.text}
                </span>
              </div>

              {device.last_seen_at && (
                <div className="mt-1 text-xs text-gray-400">
                  {new Date(device.last_seen_at).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}

              {isActive && (
                <div className="mt-2 text-xs text-blue-600 font-medium">
                  ▶ 선택됨
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// 현재 센서 상태 표시 컴포넌트 (간소화)
interface SensorStatusDisplayProps {
  sensorData: SensorData;
}

const SensorStatusDisplay: React.FC<SensorStatusDisplayProps> = ({ sensorData }) => {
  if (!sensorData?.sensors || sensorData.sensors.length === 0) {
    return null;
  }

  const alertableSensors = sensorData.sensors.filter(s => s.active && !WEATHER_SENSOR_TYPES.includes(s.type));

  const getChannelFromSensorName = (sensorName: string): string => {
    const match = sensorName.match(/_CH(\d+)$/);
    return match ? `CH${match[1]}` : 'CH?';
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center space-x-2 mb-2">
        <UIIcon name="chart" size="sm" />
        <h4 className="text-sm font-medium text-gray-700">연결된 센서</h4>
        <span className="text-xs text-gray-500">
          ({alertableSensors.length}개)
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {alertableSensors.map(sensor => {
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
  );
};

// 새 알림 추가 폼 컴포넌트
interface AddAlertFormProps {
  sensorOptions: SensorOption[];
  newAlert: NewAlert;
  setNewAlert: (alert: NewAlert) => void;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}

const AddAlertForm: React.FC<AddAlertFormProps> = ({
  sensorOptions,
  newAlert,
  setNewAlert,
  onSave,
  onCancel,
  loading
}) => {
  return (
    <div className="p-6 border-b bg-green-50">
      <div className="flex items-center space-x-2 mb-4">
        <UIIcon name="add" size="md" />
        <h4 className="font-semibold text-green-800">새로운 정밀 알림 설정</h4>
      </div>

      <div className="space-y-6">
        {/* 센서 및 값 선택 */}
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

        {/* 조건 및 임계값 설정 */}
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
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
            disabled={loading}
          >
            <img src="/cancle.png" alt="취소" className="w-4 h-4" />
            <span>취소</span>
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            disabled={loading || !newAlert.selectedSensorName || !newAlert.thresholdValue}
          >
            <UIIcon name="save" size="sm" />
            <span>{loading ? '저장 중...' : '알림 저장'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// 알림 리스트 아이템 컴포넌트
interface AlertListItemProps {
  alert: Alert;
  latestSensorData: SensorData | null;
  onToggle: (alert: Alert) => void;
  onDelete: (alertId: string) => void;
  loading: boolean;
}

const AlertListItem: React.FC<AlertListItemProps> = ({ alert, latestSensorData, onToggle, onDelete, loading }) => {
  const getChannelFromSensorName = (sensorName: string): string => {
    const match = sensorName.match(/_CH(\d+)$/);
    return match ? `CH${match[1]}` : 'CH?';
  };

  const getSensorLabel = (alert: Alert) => {
    if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
      const sensor = latestSensorData?.sensors?.find(s => s.name === alert.sensor_name);
      if (sensor && sensor.type !== undefined) {
        const metadata = SENSOR_METADATA[sensor.type as keyof typeof SENSOR_METADATA] || SENSOR_METADATA[0];
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

  const getCurrentValue = () => {
    if (alert.sensor_name && alert.value_index !== undefined && alert.value_index !== null) {
      const sensor = latestSensorData?.sensors?.find(s => s.name === alert.sensor_name);
      if (sensor && sensor.values && sensor.values[alert.value_index] !== undefined) {
        const currentValue = sensor.values[alert.value_index];
        if (isNumericValue(currentValue)) {
          const metadata = SENSOR_METADATA[sensor.type as keyof typeof SENSOR_METADATA] || SENSOR_METADATA[0];
          const unitArray = metadata.unit.split(',');
          const unit = unitArray[alert.value_index]?.trim() || '';
          return `${formatValue(currentValue)}${unit}`;
        }
      }
    }
    return '--';
  };

  return (
    <div className={`border rounded-lg transition-colors ${alert.is_active ? 'hover:bg-gray-50' : 'bg-gray-50 border-gray-300 opacity-75'
      }`}>

      {/* 데스크톱 레이아웃 */}
      <div className="hidden md:flex items-center justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className={`font-medium ${alert.is_active ? 'text-gray-800' : 'text-gray-500'}`}>
              {getSensorLabel(alert)}
            </span>
            <span className={`font-mono ${alert.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
              {alert.condition_type === 'above' ? '>' : '<'} {alert.threshold_value}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${alert.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-600 border border-gray-300'
              }`}>
              <UIIcon name={alert.is_active ? 'active' : 'inactive'} size="sm" />
              <span>{alert.is_active ? '활성' : '비활성'}</span>
            </span>
            {alert.sensor_name && (
              <span className={`px-2 py-1 rounded-full text-xs flex items-center space-x-1 ${alert.is_active
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-500'
                }`}>
                <UIIcon name="sensor" size="sm" />
                <span>정밀센서</span>
              </span>
            )}
            <span className={`px-2 py-1 rounded-full text-xs ${alert.is_active
              ? 'bg-blue-50 text-blue-800'
              : 'bg-gray-100 text-gray-500'
              }`}>
              현재: {getCurrentValue()}
            </span>
          </div>
          <p className={`text-sm ${alert.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
            {getSensorLabel(alert)}가 {alert.threshold_value}
            {alert.condition_type === 'above' ? '를 초과하면' : ' 미만이 되면'}
            <strong> 카카오 알림톡</strong> 발송
            {!alert.is_active && <span className="ml-2 text-orange-600">(현재 비활성화됨)</span>}
          </p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => onToggle(alert)}
            className={`px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1 ${alert.is_active
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
              onClick={() => onDelete(alert.id!)}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center space-x-1"
              disabled={loading}
            >
              <UIIcon name="delete" size="sm" />
              <span>삭제</span>
            </button>
          )}
        </div>
      </div>

      {/* 모바일 레이아웃 */}
      <div className="md:hidden p-4">
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className={`font-medium ${alert.is_active ? 'text-gray-800' : 'text-gray-500'}`}>
              {getSensorLabel(alert)}
            </span>
            {alert.sensor_name && (
              <span className={`px-2 py-1 rounded-full text-xs flex items-center space-x-1 ${alert.is_active
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-500'
                }`}>
                <UIIcon name="sensor" size="sm" />
                <span>정밀센서</span>
              </span>
            )}
            {!alert.is_active && (
              <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-full text-xs">
                비활성화
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 mb-2">
            <span className={`font-mono text-sm ${alert.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
              {alert.condition_type === 'above' ? '>' : '<'} {alert.threshold_value}
            </span>
          </div>
          <p className={`text-sm ${alert.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
            {getSensorLabel(alert)}가 {alert.threshold_value}
            {alert.condition_type === 'above' ? '를 초과하면' : ' 미만이 되면'}
            <strong> 카카오 알림톡</strong> 발송
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-center">
            <span className={`px-3 py-2 rounded-lg text-sm font-medium w-full text-center flex items-center justify-center space-x-1 ${alert.is_active
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-gray-100 text-gray-600 border border-gray-300'
              }`}>
              <UIIcon name={alert.is_active ? 'active' : 'inactive'} size="sm" />
              <span>{alert.is_active ? '활성' : '비활성'}</span>
            </span>
          </div>

          <div className="flex items-center justify-center">
            <div className={`rounded-lg px-3 py-2 w-full text-center border ${alert.is_active
              ? 'bg-blue-50 border-blue-200'
              : 'bg-gray-50 border-gray-200'
              }`}>
              <div className={`text-xs font-medium ${alert.is_active ? 'text-blue-600' : 'text-gray-500'
                }`}>현재값</div>
              <div className={`text-sm font-mono ${alert.is_active ? 'text-blue-800' : 'text-gray-600'
                }`}>
                {getCurrentValue()}
              </div>
            </div>
          </div>

          <button
            onClick={() => onToggle(alert)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center justify-center space-x-1 ${alert.is_active
              ? 'bg-yellow-500 text-white hover:bg-yellow-600 active:bg-yellow-700'
              : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
              }`}
            disabled={loading}
          >
            <UIIcon name={loading ? 'refresh' : (alert.is_active ? 'inactive' : 'active')} size="sm" />
            <span>{loading ? '처리중' : (alert.is_active ? '일시중지' : '활성화')}</span>
          </button>

          {alert.id && (
            <button
              onClick={() => onDelete(alert.id!)}
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
  );
};

// 알림 로그 컴포넌트
interface AlertLogsProps {
  logs: AlertLog[];
  onDeleteLog: (logId: string) => void;
  onDeleteAllLogs: () => void;
  loading: boolean;
}

const AlertLogs: React.FC<AlertLogsProps> = ({ logs, onDeleteLog, loading }) => {
  const getChannelFromSensorName = (sensorName: string): string => {
    const match = sensorName.match(/_CH(\d+)$/);
    return match ? `CH${match[1]}` : 'CH?';
  };

  if (logs.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="flex justify-center mb-4">
          <UIIcon name="log" size="lg" className="opacity-50" />
        </div>
        <p className="text-gray-500">알림 로그가 없습니다.</p>
        <p className="text-sm text-gray-400 mt-1">알림이 발생하면 여기에 기록됩니다.</p>
      </div>
    );
  }

  return (
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
                <span>센서: {log.sensor_name ? getChannelFromSensorName(log.sensor_name) : `센서 ${log.sensor_type || '알 수 없음'}`}</span>
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
                onClick={() => onDeleteLog(log.id)}
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
  );
};

// 메인 알림 설정 페이지 컴포넌트
const AlternativeAlertsPage: React.FC = () => {
  // Context 및 State
  const { devices, loading: devicesLoading } = useDevices();

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [latestSensorData, setLatestSensorData] = useState<SensorData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState<NewAlert>({
    selectedSensorName: '',
    selectedValueIndex: 0,
    conditionType: 'above',
    thresholdValue: ''
  });

  // 유틸리티 함수들
  const showMessage = (message: string) => {
    window.alert(message);
  };

  // 센서 이름에서 채널 정보 추출
  const getChannelFromSensorName = (sensorName: string): string => {
    const match = sensorName.match(/_CH(\d+)$/);
    return match ? `CH${match[1]}` : 'CH?';
  };

  const getAvailableSensorOptions = (): SensorOption[] => {
    if (!latestSensorData?.sensors || !Array.isArray(latestSensorData.sensors)) {
      return [];
    }

    const options: SensorOption[] = [];
    latestSensorData.sensors.forEach((sensor) => {
      if (!sensor.active || WEATHER_SENSOR_TYPES.includes(sensor.type)) {
        return;
      }

      if (!sensor.values || !Array.isArray(sensor.values)) {
        return;
      }

      const metadata = SENSOR_METADATA[sensor.type as keyof typeof SENSOR_METADATA] || SENSOR_METADATA[0];
      const channel = getChannelFromSensorName(sensor.name);

      sensor.values.forEach((value, index) => {
        if (!isNumericValue(value)) {
          return;
        }

        // 토양센서의 질소, 인, 칼륨 값은 제외
        if (sensor.type === SensorType.SOIL_SENSOR && EXCLUDED_SOIL_VALUE_INDICES.includes(index)) {
          return;
        }

        const valueLabel = metadata.valueLabels[index] || `값 ${index + 1}`;
        const unitArray = metadata.unit.split(',');
        const unit = unitArray[index]?.trim() || '';

        const option: SensorOption = {
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

  // API 호출 함수들
  const fetchSensorData = async (deviceId: string) => {
    if (!deviceId) return;

    try {
      const result = await mqttService.getRealtimeSensorData(deviceId);

      if (result.success) {
        setLatestSensorData(result.data);
      } else {
        console.error('센서 데이터 불러오기 실패:', result.message);
        setLatestSensorData(null);
      }
    } catch (error) {
      console.error('센서 데이터 불러오기 실패:', error);
      setLatestSensorData(null);
    }
  };

  const fetchAlerts = async () => {
    if (!selectedDeviceId) return;

    try {
      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}`, { credentials: 'include' });
      const result = await response.json();

      if (result.success) {
        setAlerts(result.data || []);
      } else {
        console.error('알림 설정을 불러올 수 없습니다:', result.message);
      }
    } catch (error) {
      console.error('알림 설정 불러오기 실패:', error);
    }
  };

  const fetchLogs = async () => {
    if (!selectedDeviceId) return;

    try {
      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}/logs`, { credentials: 'include' });
      const result = await response.json();

      if (result.success) {
        setLogs(result.data || []);
      } else {
        console.error('알림 로그 불러오기 실패:', result.message);
      }
    } catch (error) {
      console.error('알림 로그 불러오기 실패:', error);
    }
  };

  // 이벤트 핸들러들
  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setAlerts([]);
    setLogs([]);
    setLatestSensorData(null);
  };

  const handleSaveNewAlert = async () => {
    if (!newAlert.selectedSensorName || !newAlert.thresholdValue) {
      window.alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      const selectedSensor = latestSensorData?.sensors?.find(s => s.name === newAlert.selectedSensorName);

      if (!selectedSensor) {
        window.alert('선택된 센서를 찾을 수 없습니다. 다시 선택해주세요.');
        return;
      }

      const alertData = {
        sensor_type: selectedSensor.type.toString(),
        sensor_name: newAlert.selectedSensorName,
        value_index: newAlert.selectedValueIndex,
        condition_type: newAlert.conditionType,
        threshold_value: parseFloat(newAlert.thresholdValue),
        is_active: true
      };

      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}`, {
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
        window.alert('알림 설정이 저장되었습니다.');
      } else {
        window.alert('저장 실패: ' + result.message);
      }
    } catch (error) {
      window.alert('저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!window.confirm('정말 이 알림 설정을 삭제하시겠습니까?')) {
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}/${alertId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        await fetchAlerts();
        window.alert('알림 설정이 삭제되었습니다.');
      } else {
        window.alert('삭제 실패: ' + result.message);
      }
    } catch (error) {
      window.alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAlert = async (alert: Alert) => {
    const updatedAlert = { ...alert, is_active: !alert.is_active };

    try {
      setLoading(true);

      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatedAlert)
      });

      const result = await response.json();

      if (result.success) {
        await fetchAlerts();
        window.alert(`알림이 ${updatedAlert.is_active ? '활성화' : '비활성화'}되었습니다.`);
      } else {
        window.alert('토글 실패: ' + result.message);
      }
    } catch (error) {
      window.alert('토글 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm('이 알림 로그를 삭제하시겠습니까?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}/logs/${logId}`, {
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

  const handleDeleteAllLogs = async () => {
    if (!window.confirm('모든 알림 로그를 삭제하시겠습니까?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/mqtt/alerts/${selectedDeviceId}/logs/all`, {
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

  // Effects
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].device_id);
    }
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    if (selectedDeviceId) {
      fetchSensorData(selectedDeviceId);
      fetchAlerts();
      fetchLogs();
    }
  }, [selectedDeviceId]);

  const sensorOptions = getAvailableSensorOptions();

  return (
    <Layout maxWidth="wide" padding="md" background="gray">
      {/* 페이지 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <UIIcon name="bell" size="lg" />
          <h1 className="text-2xl font-bold text-gray-800">알람 설정</h1>
        </div>
        <p className="text-gray-600">
          센서별 알림 설정을 관리하세요.
        </p>
      </div>

      {/* 장치 선택 */}
      <DeviceSelector
        currentDeviceId={selectedDeviceId}
        onDeviceSelect={handleDeviceSelect}
        devices={devices}
        loading={devicesLoading}
      />

      {/* 선택된 장치가 없는 경우 */}
      {!selectedDeviceId && !devicesLoading && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <UIIcon name="device" size="lg" className="mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">장치를 선택해주세요</h3>
          <p className="text-gray-500">
            알림을 설정할 장치를 위에서 선택하면 해당 장치의 센서 설정을 관리할 수 있습니다.
          </p>
        </div>
      )}

      {/* 선택된 장치가 있는 경우 알림 설정 표시 */}
      {selectedDeviceId && (
        <div className="space-y-6">
          {/* 현재 센서 상태 표시 */}
          {latestSensorData?.sensors && latestSensorData.sensors.length > 0 && (
            <SensorStatusDisplay sensorData={latestSensorData} />
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
                    className={`text-white px-4 py-2 rounded transition-colors flex items-center space-x-2 ${showAddAlert
                      ? 'bg-black hover:bg-black'
                      : 'bg-green-500 hover:bg-green-600'
                      }`}
                    disabled={sensorOptions.length === 0}
                  >
                    {showAddAlert ? (
                      <img src="/cancle.png" alt="취소" className="w-4 h-4" />
                    ) : (
                      <UIIcon name="add" size="sm" />
                    )}
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
                  onClick={() => {
                    fetchSensorData(selectedDeviceId);
                    fetchAlerts();
                    fetchLogs();
                  }}
                  className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors flex items-center space-x-2 mx-auto"
                >
                  <UIIcon name="refresh" size="sm" />
                  <span>센서 상태 새로고침</span>
                </button>
              </div>
            )}

            {/* 새로운 알림 추가 폼 */}
            {showAddAlert && sensorOptions.length > 0 && (
              <AddAlertForm
                sensorOptions={sensorOptions}
                newAlert={newAlert}
                setNewAlert={setNewAlert}
                onSave={handleSaveNewAlert}
                onCancel={() => setShowAddAlert(false)}
                loading={loading}
              />
            )}

            {/* 현재 알림 설정 목록 */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-2">
                  <UIIcon name="alert" size="md" />
                  <h4 className="font-semibold">활성 알림 설정 ({alerts.length}개)</h4>
                </div>
                <button
                  onClick={() => {
                    fetchSensorData(selectedDeviceId);
                    fetchAlerts();
                    fetchLogs();
                  }}
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
                    <AlertListItem
                      key={alert.id || index}
                      alert={alert}
                      latestSensorData={latestSensorData}
                      onToggle={handleToggleAlert}
                      onDelete={handleDeleteAlert}
                      loading={loading}
                    />
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
                    onClick={handleDeleteAllLogs}
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
              <AlertLogs
                logs={logs}
                onDeleteLog={handleDeleteLog}
                onDeleteAllLogs={handleDeleteAllLogs}
                loading={loading}
              />
            </div>
          </div>

        </div>
      )}
    </Layout>
  );
};

export default AlternativeAlertsPage;