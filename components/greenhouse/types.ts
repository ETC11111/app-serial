// src/components/greenhouse/types.ts

export type SensorType = string; // 🔥 더 유연한 센서 타입 (실제 센서 이름 사용)

export interface SensorPosition {
  device_id: string;
  device_name: string;
  sensor_type: SensorType;
  sensor_id: string; // device_id + sensor_name + value_index 조합
  x: number; // 가로 위치 (0-100%)
  y: number; // 세로 위치 (0-100%)
  z: number; // 높이 위치 (0-100%)
  // 🔥 추가 센서 정보
  sensorInfo?: {
    type: number; // 실제 센서 타입 (SensorType enum)
    channel: number;
    valueIndex: number; // 센서 값의 인덱스 (온도, 습도 등)
    unit: string;
    color: string;
  };
}

export interface SensorInfo {
  type: SensorType;
  label: string;
  unit: string;
  icon: string;
  color: string;
}

export interface GreenhouseConfig {
  type: 'vinyl' | 'glass'; // 비닐하우스 | 유리온실
  width: number;  // 실제 폭 (미터)
  length: number; // 실제 길이 (미터)
  height: number; // 실제 높이 (미터)
  name: string;   // 온실 이름
}

export interface ViewMode {
  current: 'top' | 'side';
}

export interface GreenhouseData {
  config: GreenhouseConfig;
  sensors: SensorPosition[];
}

// 🔥 동적 센서 정보 생성 함수 (실제 센서 기반)
export const getSensorInfo = (sensor: SensorPosition): SensorInfo => {
  // sensorInfo가 있으면 그것을 사용
  if (sensor.sensorInfo) {
    return {
      type: sensor.sensor_type,
      label: sensor.sensor_type,
      unit: sensor.sensorInfo.unit,
      icon: getSensorIcon(sensor.sensorInfo.type),
      color: sensor.sensorInfo.color
    };
  }
  
  // 기본값 반환
  return {
    type: sensor.sensor_type,
    label: sensor.sensor_type,
    unit: '',
    icon: '📊',
    color: '#6b7280'
  };
};

// 🔥 센서 타입별 아이콘 매핑
export const getSensorIcon = (sensorType: number): string => {
  const iconMap: Record<number, string> = {
    0: '❓', // NONE
    1: '🌡️', // SHT20 (온습도)
    2: '☀️', // BH1750 (조도)
    3: '🔬', // ADS1115 (아날로그)
    4: '🌤️', // BME280 (대기압/온습도)
    5: '🌡️'  // DS18B20 (온도)
  };
  
  return iconMap[sensorType] || '📊';
};

// 🔥 레거시 지원을 위한 기본 센서 타입들 (필요시 사용)
export const LEGACY_SENSOR_TYPES: SensorInfo[] = [
  { type: 'temperature', label: '온도', unit: '°C', icon: '🌡️', color: '#2563eb' },
  { type: 'humidity', label: '습도', unit: '%', icon: '💧', color: '#16a34a' },
  { type: 'waterTemp', label: '수온', unit: '°C', icon: '🌊', color: '#dc2626' },
  { type: 'light', label: '조도', unit: 'lux', icon: '☀️', color: '#d97706' },
  { type: 'ec', label: 'EC', unit: 'dS/m', icon: '⚡', color: '#7c3aed' },
  { type: 'ph', label: 'pH', unit: '', icon: '🧪', color: '#059669' }
];

// 🔥 센서 값 유틸리티 함수들
export const formatSensorValue = (value: number, unit: string, decimals: number = 1): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A';
  }
  
  return `${value.toFixed(decimals)}${unit}`;
};

export const getSensorStatusColor = (value: number, min: number, max: number): string => {
  if (value < min || value > max) {
    return '#ef4444'; // 빨간색 (경고)
  } else if (value < min * 1.1 || value > max * 0.9) {
    return '#f59e0b'; // 노란색 (주의)
  }
  return '#10b981'; // 녹색 (정상)
};

// 🔥 센서 위치 유틸리티
export const calculateDistance = (sensor1: SensorPosition, sensor2: SensorPosition): number => {
  const dx = sensor1.x - sensor2.x;
  const dy = sensor1.y - sensor2.y;
  const dz = sensor1.z - sensor2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const findNearestSensors = (
  targetSensor: SensorPosition, 
  allSensors: SensorPosition[], 
  maxDistance: number = 20
): SensorPosition[] => {
  return allSensors
    .filter(sensor => sensor.sensor_id !== targetSensor.sensor_id)
    .map(sensor => ({
      ...sensor,
      distance: calculateDistance(targetSensor, sensor)
    }))
    .filter(sensor => (sensor as any).distance <= maxDistance)
    .sort((a, b) => (a as any).distance - (b as any).distance);
};

// 🔥 센서 그룹화 함수
export const groupSensorsByDevice = (sensors: SensorPosition[]): Record<string, SensorPosition[]> => {
  return sensors.reduce((groups, sensor) => {
    const deviceId = sensor.device_id;
    if (!groups[deviceId]) {
      groups[deviceId] = [];
    }
    groups[deviceId].push(sensor);
    return groups;
  }, {} as Record<string, SensorPosition[]>);
};

export const groupSensorsByType = (sensors: SensorPosition[]): Record<string, SensorPosition[]> => {
  return sensors.reduce((groups, sensor) => {
    const baseType = sensor.sensorInfo?.type?.toString() || 'unknown';
    if (!groups[baseType]) {
      groups[baseType] = [];
    }
    groups[baseType].push(sensor);
    return groups;
  }, {} as Record<string, SensorPosition[]>);
};

// 🔥 센서 배치 추천 함수
export const getOptimalSensorPositions = (
  config: GreenhouseConfig, 
  sensorCount: number
): Array<{x: number, y: number, z: number}> => {
  const positions: Array<{x: number, y: number, z: number}> = [];
  
  // 온실 크기에 따른 최적 배치 계산
  const cols = Math.ceil(Math.sqrt(sensorCount * config.width / config.length));
  const rows = Math.ceil(sensorCount / cols);
  
  for (let i = 0; i < sensorCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    positions.push({
      x: (col + 1) * (100 / (cols + 1)),
      y: (row + 1) * (100 / (rows + 1)),
      z: 50 + (i % 3) * 20 // 높이는 3단계로 분산
    });
  }
  
  return positions;
};

// 🔥 데이터 검증 함수들
export const validateSensorPosition = (sensor: SensorPosition): boolean => {
  return (
    sensor.x >= 0 && sensor.x <= 100 &&
    sensor.y >= 0 && sensor.y <= 100 &&
    sensor.z >= 0 && sensor.z <= 100 &&
    typeof sensor.device_id === 'string' &&
    typeof sensor.sensor_id === 'string' &&
    sensor.device_id.length > 0 &&
    sensor.sensor_id.length > 0
  );
};

export const validateGreenhouseConfig = (config: GreenhouseConfig): boolean => {
  return (
    config.width > 0 && config.width <= 200 &&
    config.length > 0 && config.length <= 500 &&
    config.height > 0 && config.height <= 20 &&
    typeof config.name === 'string' &&
    config.name.length > 0 &&
    (config.type === 'vinyl' || config.type === 'glass')
  );
};

// 🔥 센서 데이터 변환 함수들
export const convertLegacySensorToFlexible = (
  deviceId: string,
  deviceName: string,
  legacyData: any
): SensorPosition[] => {
  const positions: SensorPosition[] = [];
  
  // 레거시 데이터를 새로운 형식으로 변환
  LEGACY_SENSOR_TYPES.forEach((sensorType, index) => {
    const value = legacyData[sensorType.type];
    if (value !== undefined && value !== null) {
      positions.push({
        device_id: deviceId,
        device_name: deviceName,
        sensor_type: sensorType.type,
        sensor_id: `${deviceId}_${sensorType.type}`,
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        z: Math.random() * 60 + 20,
        sensorInfo: {
          type: index, // 임시 타입 번호
          channel: 0,
          valueIndex: 0,
          unit: sensorType.unit,
          color: sensorType.color
        }
      });
    }
  });
  
  return positions;
};

// 🔥 센서 성능 분석 함수들
export const calculateSensorCoverage = (
  sensors: SensorPosition[],
  config: GreenhouseConfig,
  sensorRange: number = 5 // 미터
): number => {
  if (sensors.length === 0) return 0;
  
  const totalArea = config.width * config.length;
  const sensorRangePercent = (sensorRange / Math.max(config.width, config.length)) * 100;
  
  // 간단한 커버리지 계산 (센서 범위가 겹치는 것은 고려하지 않음)
  const coveredArea = sensors.length * Math.PI * Math.pow(sensorRangePercent, 2);
  
  return Math.min(100, (coveredArea / 10000) * 100); // 백분율로 변환
};

export const findSensorGaps = (
  sensors: SensorPosition[],
  config: GreenhouseConfig,
  minDistance: number = 15 // 퍼센트
): Array<{x: number, y: number, z: number}> => {
  const gaps: Array<{x: number, y: number, z: number}> = [];
  
  // 격자 방식으로 빈 공간 찾기
  for (let x = 10; x <= 90; x += 20) {
    for (let y = 10; y <= 90; y += 20) {
      const hasNearbySensor = sensors.some(sensor => 
        calculateDistance({ x, y, z: 50 } as any, sensor) < minDistance
      );
      
      if (!hasNearbySensor) {
        gaps.push({ x, y, z: 50 });
      }
    }
  }
  
  return gaps;
};

// 🔥 실시간 센서 상태 추적
export interface SensorStatus {
  sensorId: string;
  isOnline: boolean;
  lastUpdate: string;
  batteryLevel?: number;
  signalStrength?: number;
  errorCount: number;
  status: 'good' | 'warning' | 'error' | 'offline';
}

export const getSensorStatus = (
  sensor: SensorPosition,
  lastDataTime?: string,
  maxOfflineMinutes: number = 5
): SensorStatus => {
  const now = new Date();
  const lastUpdate = lastDataTime ? new Date(lastDataTime) : new Date(0);
  const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
  
  let status: SensorStatus['status'] = 'good';
  let isOnline = true;
  
  if (minutesSinceUpdate > maxOfflineMinutes) {
    status = 'offline';
    isOnline = false;
  } else if (minutesSinceUpdate > maxOfflineMinutes / 2) {
    status = 'warning';
  }
  
  return {
    sensorId: sensor.sensor_id,
    isOnline,
    lastUpdate: lastDataTime || '',
    errorCount: 0,
    status
  };
};

// 🔥 센서 네트워크 분석
export interface SensorNetwork {
  nodes: SensorPosition[];
  connections: Array<{
    from: string;
    to: string;
    distance: number;
    signalStrength?: number;
  }>;
  clusters: Array<{
    id: string;
    sensors: SensorPosition[];
    center: {x: number, y: number, z: number};
  }>;
}

export const analyzeSensorNetwork = (
  sensors: SensorPosition[],
  maxConnectionDistance: number = 25
): SensorNetwork => {
  const connections: SensorNetwork['connections'] = [];
  const clusters: SensorNetwork['clusters'] = [];
  
  // 센서 간 연결 분석
  sensors.forEach(sensor1 => {
    sensors.forEach(sensor2 => {
      if (sensor1.sensor_id !== sensor2.sensor_id) {
        const distance = calculateDistance(sensor1, sensor2);
        if (distance <= maxConnectionDistance) {
          connections.push({
            from: sensor1.sensor_id,
            to: sensor2.sensor_id,
            distance
          });
        }
      }
    });
  });
  
  // 간단한 클러스터링 (디바이스별)
  const deviceGroups = groupSensorsByDevice(sensors);
  Object.entries(deviceGroups).forEach(([deviceId, deviceSensors]) => {
    if (deviceSensors.length > 0) {
      const centerX = deviceSensors.reduce((sum, s) => sum + s.x, 0) / deviceSensors.length;
      const centerY = deviceSensors.reduce((sum, s) => sum + s.y, 0) / deviceSensors.length;
      const centerZ = deviceSensors.reduce((sum, s) => sum + s.z, 0) / deviceSensors.length;
      
      clusters.push({
        id: deviceId,
        sensors: deviceSensors,
        center: { x: centerX, y: centerY, z: centerZ }
      });
    }
  });
  
  return {
    nodes: sensors,
    connections,
    clusters
  };
};

// 🔥 센서 배치 최적화 제안
export interface OptimizationSuggestion {
  type: 'move' | 'add' | 'remove' | 'group';
  sensorId?: string;
  suggestion: string;
  newPosition?: {x: number, y: number, z: number};
  priority: 'low' | 'medium' | 'high';
  reason: string;
}

export const getSensorOptimizationSuggestions = (
  sensors: SensorPosition[],
  config: GreenhouseConfig
): OptimizationSuggestion[] => {
  const suggestions: OptimizationSuggestion[] = [];
  
  // 1. 너무 가까운 센서들 찾기
  sensors.forEach(sensor1 => {
    const nearSensors = sensors.filter(sensor2 => 
      sensor1.sensor_id !== sensor2.sensor_id &&
      calculateDistance(sensor1, sensor2) < 10
    );
    
    if (nearSensors.length > 0) {
      suggestions.push({
        type: 'move',
        sensorId: sensor1.sensor_id,
        suggestion: `${sensor1.device_name}의 센서들이 너무 가깝게 배치되어 있습니다`,
        priority: 'medium',
        reason: '센서 간 간섭을 줄이고 더 넓은 영역을 커버하기 위해 거리를 늘려주세요'
      });
    }
  });
  
  // 2. 빈 공간 찾기
  const gaps = findSensorGaps(sensors, config);
  if (gaps.length > 0) {
    suggestions.push({
      type: 'add',
      suggestion: `온실에 센서가 없는 영역이 ${gaps.length}곳 발견되었습니다`,
      newPosition: gaps[0],
      priority: 'low',
      reason: '전체 온실의 환경을 더 정확히 모니터링하기 위해 추가 센서를 고려해보세요'
    });
  }
  
  // 3. 센서 밀도 분석
  const density = sensors.length / (config.width * config.length / 100); // 센서/㎡
  if (density < 0.1) {
    suggestions.push({
      type: 'add',
      suggestion: '센서 밀도가 낮습니다',
      priority: 'medium',
      reason: `현재 밀도: ${density.toFixed(2)}개/㎡. 더 정확한 모니터링을 위해 센서를 추가하는 것을 고려해보세요`
    });
  } else if (density > 0.5) {
    suggestions.push({
      type: 'remove',
      suggestion: '센서 밀도가 높습니다',
      priority: 'low',
      reason: `현재 밀도: ${density.toFixed(2)}개/㎡. 일부 센서를 제거하거나 재배치를 고려해보세요`
    });
  }
  
  return suggestions;
};