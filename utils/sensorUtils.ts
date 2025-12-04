// utils/sensorUtils.ts - 수정된 버전

// 필요한 타입 정의들
export interface DetectedSensor {
  name: string;
  channel: number;
  type: number;
  active: boolean;
  values: number[];
}

export interface FlexibleSensorData {
  timestamp: number | string;
  deviceId?: string;
  sensor_count: number;
  sensors?: DetectedSensor[];
}

export interface SensorData {
  temperature: number;
  humidity: number;
  pressure: number;
  lightLevel: number;
  motionLevel: number;
  gasLevel: number;
  deviceStatus: number;
  timestamp: string;
}

export const SensorType = {
  SHT20: 1,
  TSL2591: 2,  // 조도센서 (TSL2591, BH1750 호환)
  BH1750: 2,   // 호환성을 위해 유지
  ADS1115: 3,
  BME280: 4,
  DS18B20: 5,
  MODBUS_TH: 11,
  MODBUS_PRESSURE: 12,
  MODBUS_FLOW: 13,
  MODBUS_RELAY: 14,
  MODBUS_POWER: 15,
  WIND_DIRECTION: 16,
  WIND_SPEED: 17,
  PRECIPITATION: 18,
  SOIL_SENSOR: 19,
  MOISTURE_COMPLETE: 20,
  WEATHER: 21
} as const;

export type SensorType = typeof SensorType[keyof typeof SensorType];

export interface SensorMetadata {
  label: string;
  unit: string;
  primary: string;
  rgb: string;
  lightBg: string;
  textColor: string;
  iconColor: string;
  chartKey: string;
}

interface ColorPalette {
  primary?: string;
  rgb?: string;
  lightBg?: string;
  textColor?: string;
  iconColor?: string;
}

// 색상 팔레트 정의 (실제 프로젝트에서는 별도 파일에서 import)
const SENSOR_COLOR_PALETTE: Record<number, ColorPalette> = {
  1: { primary: '#ef4444', rgb: '239, 68, 68', lightBg: 'bg-red-50', textColor: 'text-red-700', iconColor: 'text-red-500' },
  2: { primary: '#f59e0b', rgb: '245, 158, 11', lightBg: 'bg-amber-50', textColor: 'text-amber-700', iconColor: 'text-amber-500' },
  4: { primary: '#10b981', rgb: '16, 185, 129', lightBg: 'bg-emerald-50', textColor: 'text-emerald-700', iconColor: 'text-emerald-500' },
  5: { primary: '#3b82f6', rgb: '59, 130, 246', lightBg: 'bg-blue-50', textColor: 'text-blue-700', iconColor: 'text-blue-500' },
  11: { primary: '#8b5cf6', rgb: '139, 92, 246', lightBg: 'bg-violet-50', textColor: 'text-violet-700', iconColor: 'text-violet-500' },
  12: { primary: '#06b6d4', rgb: '6, 182, 212', lightBg: 'bg-cyan-50', textColor: 'text-cyan-700', iconColor: 'text-cyan-500' },
  13: { primary: '#84cc16', rgb: '132, 204, 22', lightBg: 'bg-lime-50', textColor: 'text-lime-700', iconColor: 'text-lime-500' },
  14: { primary: '#f97316', rgb: '249, 115, 22', lightBg: 'bg-orange-50', textColor: 'text-orange-700', iconColor: 'text-orange-500' },
  15: { primary: '#ec4899', rgb: '236, 72, 153', lightBg: 'bg-pink-50', textColor: 'text-pink-700', iconColor: 'text-pink-500' },
  16: { primary: '#6366f1', rgb: '99, 102, 241', lightBg: 'bg-indigo-50', textColor: 'text-indigo-700', iconColor: 'text-indigo-500' },
  17: { primary: '#14b8a6', rgb: '20, 184, 166', lightBg: 'bg-teal-50', textColor: 'text-teal-700', iconColor: 'text-teal-500' },
  18: { primary: '#64748b', rgb: '100, 116, 139', lightBg: 'bg-slate-50', textColor: 'text-slate-700', iconColor: 'text-slate-500' },
  19: { primary: '#a855f7', rgb: '168, 85, 247', lightBg: 'bg-purple-50', textColor: 'text-purple-700', iconColor: 'text-purple-500' },
  31: { primary: '#dc2626', rgb: '220, 38, 38', lightBg: 'bg-red-50', textColor: 'text-red-700', iconColor: 'text-red-500' },
  32: { primary: '#2563eb', rgb: '37, 99, 235', lightBg: 'bg-blue-50', textColor: 'text-blue-700', iconColor: 'text-blue-500' },
  33: { primary: '#059669', rgb: '5, 150, 105', lightBg: 'bg-emerald-50', textColor: 'text-emerald-700', iconColor: 'text-emerald-500' },
  111: { primary: '#7c3aed', rgb: '124, 58, 237', lightBg: 'bg-violet-50', textColor: 'text-violet-700', iconColor: 'text-violet-500' },
  151: { primary: '#be185d', rgb: '190, 24, 93', lightBg: 'bg-pink-50', textColor: 'text-pink-700', iconColor: 'text-pink-500' },
  181: { primary: '#ea580c', rgb: '234, 88, 12', lightBg: 'bg-orange-50', textColor: 'text-orange-700', iconColor: 'text-orange-500' },
  182: { primary: '#0891b2', rgb: '8, 145, 178', lightBg: 'bg-cyan-50', textColor: 'text-cyan-700', iconColor: 'text-cyan-500' },
  191: { primary: '#65a30d', rgb: '101, 163, 13', lightBg: 'bg-lime-50', textColor: 'text-lime-700', iconColor: 'text-lime-500' },
  192: { primary: '#0284c7', rgb: '2, 132, 199', lightBg: 'bg-sky-50', textColor: 'text-sky-700', iconColor: 'text-sky-500' },
  193: { primary: '#c026d3', rgb: '192, 38, 211', lightBg: 'bg-fuchsia-50', textColor: 'text-fuchsia-700', iconColor: 'text-fuchsia-500' },
  194: { primary: '#16a34a', rgb: '22, 163, 74', lightBg: 'bg-green-50', textColor: 'text-green-700', iconColor: 'text-green-500' },
};

export const getSensorValueMetadata = (sensorType: number, valueIndex: number): SensorMetadata => {
  const defaultMeta: SensorMetadata = {
    label: `값${valueIndex + 1}`,
    unit: '',
    primary: '#64748b',
    rgb: '100, 116, 139',
    lightBg: 'bg-gray-50',
    textColor: 'text-gray-700',
    iconColor: 'text-gray-500',
    chartKey: 'unknown'
  };

  const getColorPalette = (colorIndex: number): Omit<SensorMetadata, 'label' | 'unit' | 'chartKey'> => {
    const palette = SENSOR_COLOR_PALETTE[colorIndex];
    if (palette) {
      return {
        primary: palette.primary || '#64748b',
        rgb: palette.rgb || '100, 116, 139',
        lightBg: palette.lightBg || 'bg-gray-50',
        textColor: palette.textColor || 'text-gray-700',
        iconColor: palette.iconColor || 'text-gray-500'
      };
    }
    return {
      primary: '#64748b',
      rgb: '100, 116, 139',
      lightBg: 'bg-gray-50',
      textColor: 'text-gray-700',
      iconColor: 'text-gray-500'
    };
  };

  if (sensorType === SensorType.SHT20) { // 온습도센서
    if (valueIndex === 0) return { label: '온도', unit: '°C', ...getColorPalette(1), chartKey: 'temperature' };
    if (valueIndex === 1) return { label: '습도', unit: '%', ...getColorPalette(11), chartKey: 'humidity' };
  }
  
  if (sensorType === SensorType.BH1750) { // 조도센서
    return { label: '조도', unit: 'lx', ...getColorPalette(2), chartKey: 'light' };
  }
  
  // ADS1115 센서 (양액 센서) 매핑
  if (sensorType === SensorType.ADS1115) { // ADS1115 양액센서
    if (valueIndex === 0) return { label: '양액 pH', unit: 'pH', ...getColorPalette(31), chartKey: 'ph' };
    if (valueIndex === 1) return { label: '양액 EC', unit: 'dS/m', ...getColorPalette(32), chartKey: 'ec' };
    if (valueIndex === 2) return { label: '양액 수온', unit: '°C', ...getColorPalette(31), chartKey: 'ph_alt' };

    return { label: '전압', unit: 'V', chartKey: 'voltage', ...getColorPalette(0) };
  }
  
  if (sensorType === SensorType.BME280) { // CO2센서
    if (valueIndex === 0) return { label: 'CO2', unit: 'ppm', ...getColorPalette(4), chartKey: 'co2' };
    if (valueIndex === 1) return { label: '온도', unit: '°C', ...getColorPalette(1), chartKey: 'temperature' };
    if (valueIndex === 2) return { label: '습도', unit: '%', ...getColorPalette(11), chartKey: 'humidity' };
  }
  
  if (sensorType === SensorType.DS18B20) { // 온도센서
    return { label: '온도', unit: '°C', ...getColorPalette(5), chartKey: 'temperature' };
  }

  // MODBUS 센서들
  if (sensorType === SensorType.MODBUS_TH) { // MODBUS 온습도센서
    if (valueIndex === 0) return { label: '온도', unit: '°C', ...getColorPalette(1), chartKey: 'modbus_temperature' };
    if (valueIndex === 1) return { label: '습도', unit: '%', ...getColorPalette(111), chartKey: 'modbus_humidity' };
  }
  
  if (sensorType === SensorType.MODBUS_PRESSURE) return { label: '압력', unit: 'bar', ...getColorPalette(12), chartKey: 'modbus_pressure' };
  if (sensorType === SensorType.MODBUS_FLOW) return { label: '유량', unit: 'L/min', ...getColorPalette(13), chartKey: 'modbus_flow' };
  if (sensorType === SensorType.MODBUS_RELAY) return { label: '릴레이상태', unit: '', ...getColorPalette(14), chartKey: 'modbus_relay' };
  
  if (sensorType === SensorType.MODBUS_POWER) { // MODBUS 전력센서
    if (valueIndex === 0) return { label: '전압', unit: 'V', ...getColorPalette(15), chartKey: 'modbus_voltage' };
    if (valueIndex === 1) return { label: '전류', unit: 'A', ...getColorPalette(151), chartKey: 'modbus_current' };
  }

  // 기상 센서들
  if (sensorType === SensorType.WIND_DIRECTION) { // 풍향센서
    if (valueIndex === 0) return { label: '기어방향', unit: '', ...getColorPalette(16), chartKey: 'wind_gear' };
    if (valueIndex === 1) return { label: '각도방향', unit: '°', ...getColorPalette(16), chartKey: 'wind_degree' };
    if (valueIndex === 2) return { label: '풍향', unit: '', ...getColorPalette(16), chartKey: 'wind_direction' };
  }
  
  if (sensorType === SensorType.WIND_SPEED) { // 풍속센서
    if (valueIndex === 0) return { label: '풍속', unit: 'm/s', ...getColorPalette(17), chartKey: 'wind_speed' };
    if (valueIndex === 1) return { label: '풍향', unit: '', ...getColorPalette(17), chartKey: 'wind_direction_text' };
    if (valueIndex === 2) return { label: '풍속', unit: 'm/s', ...getColorPalette(17), chartKey: 'wind_speed_alt' };
    if (valueIndex === 3) return { label: '풍력계급', unit: '', ...getColorPalette(17), chartKey: 'wind_scale' };
  }
  
  if (sensorType === SensorType.PRECIPITATION) { // 강우/강설센서
    const precipitationMappings: Array<{label: string; unit: string; chartKey: string}> = [
      { label: '수분상태', unit: '', chartKey: 'moisture_status' },
      { label: '강수상태', unit: '', chartKey: 'precip_status_text' },
      { label: '수분레벨', unit: '', chartKey: 'moisture_level' },
      { label: '강수상태', unit: '', chartKey: 'precip_status_detail' },
      { label: '실외온도', unit: '°C', chartKey: 'precip_temperature' },
      { label: '습도', unit: '%', chartKey: 'precip_humidity' },
      { label: '온도상태', unit: '', chartKey: 'temp_status' },
      { label: '날씨', unit: '', chartKey: 'weather_icon' },
      { label: '온도', unit: '°C', chartKey: 'temp_alt' },
      { label: '습도', unit: '%', chartKey: 'humidity_alt' },
    ];

    if (valueIndex < precipitationMappings.length) {
      const mapping = precipitationMappings[valueIndex];
      const colorIndex = valueIndex === 4 || valueIndex === 8 ? 181 : 
                        valueIndex === 5 || valueIndex === 9 ? 182 : 18;
      return { 
        label: mapping.label, 
        unit: mapping.unit, 
        chartKey: mapping.chartKey, 
        ...getColorPalette(colorIndex) 
      };
    }
  }
  
  if (sensorType === SensorType.SOIL_SENSOR) { // 토양센서 (pH, EC, 온도, 습도만)
    const soilMappings: Array<{label: string; unit: string; colorIndex: number; chartKey: string}> = [
      { label: '토양pH', unit: '', colorIndex: 19, chartKey: 'soil_ph' },
      { label: '토양EC', unit: 'dS/m', colorIndex: 191, chartKey: 'soil_ec' },
      { label: '토양온도', unit: '°C', colorIndex: 192, chartKey: 'soil_temperature' },
      { label: '토양습도', unit: '%', colorIndex: 193, chartKey: 'soil_humidity' },
    ];

    if (valueIndex < soilMappings.length) {
      const mapping = soilMappings[valueIndex];
      return { 
        label: mapping.label, 
        unit: mapping.unit, 
        chartKey: mapping.chartKey, 
        ...getColorPalette(mapping.colorIndex) 
      };
    }
  }

  // 추가 센서들
  if (sensorType === SensorType.MOISTURE_COMPLETE && valueIndex === 0) {
    return { label: '수분검조', unit: '', ...getColorPalette(18), chartKey: 'moisture_complete' };
  }
  if (sensorType === SensorType.WEATHER && valueIndex === 0) {
    return { label: '날씨', unit: '', ...getColorPalette(2), chartKey: 'weather' };
  }

  return defaultMeta;
};

export const formatValue = (value: number | string, unit: string): string => {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number' || isNaN(value)) return '--';

  if (unit === '°C' || unit === '%') return value.toFixed(1);
  if (unit === 'ppm' || unit === 'lx') return Math.round(value).toString();
  if (unit === 'm/s') return value.toFixed(1);
  if (unit === 'μS/cm' || unit === 'mg/kg') return Math.round(value).toString();
  if (unit === 'pH') return value.toFixed(2);
  return value.toFixed(2);
};

export const convertSensorName = (originalName: string): string => {
  if (!originalName) return '알 수 없는 센서';

  const nameMapping: Record<string, string> = {
    'SCD30_CH0': 'CO2센서_CH0',
    'BH1750_CH0': '조도센서_CH0',
    'SHT20_CH0': '온습도센서_CH0',
    'ADS1115_CH0': '양액센서_CH0',
    'DS18B20_CH0': '수온센서_CH0',
    'WIND_DIRECTION_CH0': '풍향센서_CH0',
    'WIND_SPEED_CH0': '풍속센서_CH0',
    'PRECIPITATION_CH0': '강우강설센서_CH0',
    'SOIL_SENSOR_CH0': '토양센서_CH0',
    'MODBUS_TH_CH0': 'MODBUS온습도센서_CH0',
  };

  return nameMapping[originalName] || originalName;
};

// 센서 타입별 값 포맷팅
export const formatSensorValue = (value: number, sensorType: number, valueIndex: number): string => {
  switch (sensorType) {
    case SensorType.SHT20: // SHT20
      return valueIndex === 0 
        ? `${value.toFixed(1)}` // 온도
        : `${value.toFixed(1)}`;  // 습도
    
    case SensorType.BH1750: // BH1750
      return `${Math.round(value)} lux`;
    
    case SensorType.ADS1115: // ADS1115
      switch (valueIndex) {
        case 0: return `${value.toFixed(2)}`; // pH (양액 산도)
        case 1: return `${Math.round(value)}`; // EC (양액 전도도)
        case 2: return `${value.toFixed(2)}`; // 호환성을 위한 추가 pH
        case 3: return `${Math.round(value)}`; // 호환성을 위한 추가 EC
        case 4: return `${value.toFixed(1)}`; // 수온
        default: return value.toFixed(2);
      }
    
    case SensorType.BME280: // BME280
      switch (valueIndex) {
        case 0: return `${value.toFixed(1)}`; // 온도
        case 1: return `${value.toFixed(1)}`;  // 습도
        case 2: return `${value.toFixed(1)}`; // 기압
        default: return value.toFixed(2);
      }
    
    case SensorType.DS18B20: // DS18B20
      return `${value.toFixed(1)}`;
    
    default:
      return value.toFixed(2);
  }
};

// 센서 상태 확인
export const getSensorStatus = (sensor: DetectedSensor): 'good' | 'warning' | 'error' => {
  if (!sensor.active) return 'error';
  
  // 센서 타입별 임계값 확인
  switch (sensor.type) {
    case SensorType.SHT20: // SHT20
      const temp = sensor.values[0];
      const humidity = sensor.values[1];
      if (temp && (temp > 35 || temp < 5) || humidity && (humidity > 85 || humidity < 10)) {
        return 'warning';
      }
      break;
    
    case SensorType.ADS1115: // ADS1115
      const ph = sensor.values[0]; // valueIndex 0이 pH
      if (ph && (ph < 6.0 || ph > 8.5)) {
        return 'warning';
      }
      break;
  }
  
  return 'good';
};

// 레거시 데이터를 새 형식으로 변환
export const convertLegacyToFlexible = (legacy: SensorData): FlexibleSensorData => {
  return {
    timestamp: legacy.timestamp,
    sensor_count: 3,
    sensors: [
      {
        name: 'LEGACY_TEMP_HUM',
        channel: 0,
        type: SensorType.SHT20,
        active: true,
        values: [legacy.temperature / 100, legacy.humidity / 100]
      },
      {
        name: 'LEGACY_LIGHT',
        channel: 1,
        type: SensorType.BH1750,
        active: true,
        values: [legacy.lightLevel]
      },
      {
        name: 'LEGACY_ANALOG',
        channel: 2,
        type: SensorType.ADS1115,
        active: true,
        values: [
          legacy.gasLevel / 100,     // pH (valueIndex 0)
          legacy.motionLevel / 1000, // EC (valueIndex 1)
          legacy.pressure / 100,     // 수온 (valueIndex 2)
          0 // 예비
        ]
      }
    ]
  };
};

// 센서 데이터 유효성 검사
export const validateSensorData = (data: FlexibleSensorData): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data.sensors || !Array.isArray(data.sensors)) {
    errors.push('센서 배열이 유효하지 않습니다.');
    return { valid: false, errors };
  }
  
  data.sensors.forEach((sensor, index) => {
    if (!sensor.name) {
      errors.push(`센서 ${index}: 이름이 없습니다.`);
    }
    
    if (typeof sensor.channel !== 'number' || sensor.channel < 0) {
      errors.push(`센서 ${index}: 유효하지 않은 채널입니다.`);
    }
    
    if (typeof sensor.type !== 'number' || sensor.type < 0 || sensor.type > 21) {
      errors.push(`센서 ${index}: 유효하지 않은 센서 타입입니다. (${sensor.type})`);
    }
    
    if (!Array.isArray(sensor.values)) {
      errors.push(`센서 ${index}: 값 배열이 유효하지 않습니다.`);
    }
  });
  
  return { valid: errors.length === 0, errors };
};

type AlertSeverity = 'info' | 'warning' | 'critical';

interface SensorAlert {
  alerts: string[];
  severity: AlertSeverity;
}

// 센서별 알림 임계값 확인
export const checkSensorAlerts = (sensor: DetectedSensor): SensorAlert => {
  const alerts: string[] = [];
  let severity: AlertSeverity = 'info';
  
  if (!sensor.active) {
    alerts.push('센서가 비활성 상태입니다.');
    severity = 'critical';
    return { alerts, severity };
  }
  
  switch (sensor.type) {
    case SensorType.SHT20: // SHT20
      const [temp, humidity] = sensor.values;
      if (temp !== undefined) {
        if (temp > 35) {
          alerts.push(`고온 경고: ${temp.toFixed(1)}°C`);
          severity = 'warning';
        }
        if (temp < 5) {
          alerts.push(`저온 경고: ${temp.toFixed(1)}°C`);
          severity = 'warning';
        }
      }
      if (humidity !== undefined) {
        if (humidity > 85) {
          alerts.push(`고습도 경고: ${humidity.toFixed(1)}%`);
          severity = 'warning';
        }
        if (humidity < 20) {
          alerts.push(`저습도 경고: ${humidity.toFixed(1)}%`);
          severity = 'warning';
        }
      }
      break;
    
    case SensorType.BH1750: // BH1750
      const [lux] = sensor.values;
      if (lux !== undefined && lux < 100) {
        alerts.push(`저조도 경고: ${lux} lux`);
        severity = 'info';
      }
      break;
    
    case SensorType.ADS1115: // ADS1115
      const [ph, ec] = sensor.values;
      if (ph !== undefined && (ph < 6.0 || ph > 8.5)) {
        alerts.push(`pH 범위 벗어남: ${ph.toFixed(2)}`);
        severity = ph < 5.5 || ph > 9.0 ? 'critical' : 'warning';
      }
      // EC 값 제한 제거 - 백엔드와 디바이스에서 dS/m 단위로 처리됨
      break;
  }
  
  return { alerts, severity };
};

// 센서 데이터를 CSV로 내보내기
export const exportSensorDataToCSV = (data: FlexibleSensorData[]): string => {
  if (!data.length) return '';
  
  // 헤더 생성
  const headers = ['timestamp', 'device_id', 'sensor_count'];
  const maxSensors = Math.max(...data.map(d => d.sensors?.length || 0));
  
  for (let i = 0; i < maxSensors; i++) {
    headers.push(`sensor_${i}_name`, `sensor_${i}_type`, `sensor_${i}_channel`, `sensor_${i}_active`);
    // 최대 4개 값까지 지원
    for (let j = 0; j < 4; j++) {
      headers.push(`sensor_${i}_value_${j}`);
    }
  }
  
  // 데이터 행 생성
  const rows = data.map(item => {
    const row = [
      new Date(item.timestamp).toISOString(),
      item.deviceId || '',
      item.sensor_count.toString()
    ];
    
    for (let i = 0; i < maxSensors; i++) {
      const sensor = item.sensors?.[i];
      if (sensor) {
        row.push(sensor.name, sensor.type.toString(), sensor.channel.toString(), sensor.active.toString());
        for (let j = 0; j < 4; j++) {
          row.push(sensor.values[j]?.toString() || '');
        }
      } else {
        row.push(...new Array(8).fill(''));
      }
    }
    
    return row;
  });
  
  // CSV 형식으로 결합
  return [headers, ...rows].map(row => row.join(',')).join('\n');
};

interface SensorStats {
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
  standardDeviation: number;
}

// 센서 데이터 통계 계산
export const calculateSensorStats = (
  data: FlexibleSensorData[], 
  sensorName: string, 
  valueIndex: number = 0
): SensorStats | null => {
  const values: number[] = [];
  
  data.forEach(item => {
    const sensor = item.sensors?.find(s => s.name === sensorName);
    if (sensor && sensor.values[valueIndex] !== undefined) {
      values.push(sensor.values[valueIndex]);
    }
  });
  
  if (values.length === 0) {
    return null;
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const average = sum / values.length;
  
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    average,
    median: sorted[Math.floor(sorted.length / 2)],
    standardDeviation: Math.sqrt(
      values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / values.length
    )
  };
};

// SensorDataConverter 클래스
export class SensorDataConverter {
  static fromLegacy(legacy: SensorData): FlexibleSensorData {
    return convertLegacyToFlexible(legacy);
  }

  static toLegacy(flexible: FlexibleSensorData): SensorData | null {
    try {
      let temperature = 0, humidity = 0, pressure = 0;
      let lightLevel = 0, motionLevel = 0, gasLevel = 0;
      const deviceStatus = 0;

      flexible.sensors?.forEach(sensor => {
        if (!sensor.active) return;

        switch (sensor.type) {
          case SensorType.SHT20: // SHT20
            if (sensor.values.length >= 2) {
              temperature = Math.round(sensor.values[0] * 100);
              humidity = Math.round(sensor.values[1] * 100);
            }
            break;
          case SensorType.BH1750: // BH1750
            if (sensor.values.length >= 1) {
              lightLevel = Math.round(sensor.values[0]);
            }
            break;
          case SensorType.ADS1115: // ADS1115
            if (sensor.values.length >= 2) {
              gasLevel = Math.round(sensor.values[0] * 100);     // pH (valueIndex 0)
              motionLevel = Math.round(sensor.values[1] / 10);   // EC (valueIndex 1) - 스케일 조정
              if (sensor.values.length >= 3) {
                pressure = Math.round(sensor.values[2] * 100);   // 수온 (valueIndex 2)
              }
            }
            break;
        }
      });

      return {
        temperature,
        humidity,
        pressure,
        lightLevel,
        motionLevel,
        gasLevel,
        deviceStatus,
        timestamp: flexible.timestamp.toString()
      };
    } catch (error) {
      console.error('레거시 변환 실패:', error);
      return null;
    }
  }

  static isLegacy(data: any): data is SensorData {
    return data && 
           typeof data.temperature === 'number' &&
           typeof data.humidity === 'number' &&
           typeof data.pressure === 'number' &&
           typeof data.lightLevel === 'number' &&
           !data.sensors;
  }

  static isFlexible(data: any): data is FlexibleSensorData {
    return data && 
           Array.isArray(data.sensors) &&
           typeof data.sensor_count === 'number';
  }

  static normalize(data: SensorData | FlexibleSensorData): FlexibleSensorData {
    if (this.isFlexible(data)) {
      return data;
    } else if (this.isLegacy(data)) {
      return this.fromLegacy(data);
    } else {
      throw new Error('지원하지 않는 센서 데이터 형식입니다.');
    }
  }
}