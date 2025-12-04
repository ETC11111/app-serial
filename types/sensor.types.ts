// src/types/sensor.types.ts

// 기존 레거시 센서 데이터 구조 (호환성 유지)
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

// 센서 타입 정의
export const SensorType = {
  NONE: 0,
  온습도센서: 1,        // SHT20
  조도센서: 2,          // TSL2591
  ADS1115: 3,          // pH/EC 센서
  SCD30: 4,            // CO2 센서
  DS18B20: 5,          // 온도 센서
  // Modbus 센서들 (11-20)
  MODBUS_TEMP_HUMID: 11,
  MODBUS_PRESSURE: 12,
  MODBUS_FLOW: 13,
  MODBUS_RELAY: 14,
  MODBUS_ENERGY: 15,
  // 새로운 기상 센서들
  WIND_DIRECTION: 16,   // 풍향 센서
  WIND_SPEED: 17,       // 풍속 센서
  PRECIPITATION: 18,    // 강우/강설 센서
  // 새로운 토양 센서
  MODBUS_SOIL_SENSOR: 19, // 토양 센서
} as const;

export type SensorType = typeof SensorType[keyof typeof SensorType];

// 통합 센서 타입 정보
export const UNIFIED_SENSOR_TYPES: Record<number, {
  name: string;
  protocol: 'i2c' | 'modbus' | 'analog' | 'digital' | 'unknown';
  values: string[];
}> = {
  0: { name: 'UNKNOWN', protocol: 'unknown', values: [] },
  1: { name: 'SHT20', protocol: 'i2c', values: ['temperature', 'humidity'] },
  2: { name: 'TSL2591', protocol: 'i2c', values: ['light_level'] },
  3: { name: 'ADS1115', protocol: 'i2c', values: ['ph', 'ec'] },
  4: { name: 'SCD30', protocol: 'i2c', values: ['co2_ppm'] },
  5: { name: 'DS18B20', protocol: 'digital', values: ['temperature'] },
  21: { name: 'SHT20', protocol: 'modbus', values: ['temperature', 'humidity'] },
  11: { name: '온습도센서', protocol: 'modbus', values: ['temperature', 'humidity'] },
  12: { name: '압력센서', protocol: 'modbus', values: ['pressure'] },
  13: { name: '유량센서', protocol: 'modbus', values: ['flow_rate'] },
  14: { name: '릴레이모듈', protocol: 'modbus', values: ['status'] },
  15: { name: '전력계', protocol: 'modbus', values: ['voltage', 'current'] },
  16: { name: '풍향센서', protocol: 'modbus', values: ['gear_direction', 'degree_direction', 'direction_text'] },
  17: { name: '풍속센서', protocol: 'modbus', values: ['wind_speed_ms', 'wind_scale', 'wind_condition'] },
  18: { name: '강우강설센서', protocol: 'modbus', values: ['precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity', 'temperature', 'humidity', 'temp_status', 'precip_icon'] },
  19: { name: '토양센서', protocol: 'modbus', values: ['soil_ph', 'soil_ec', 'soil_temperature', 'soil_humidity'] },
};

export interface DetectedSensor {
  sensor_id?: number;
  name: string;
  channel: number;
  type: number;
  protocol?: string;
  address?: number;
  status?: number;
  active: boolean;
  values: (number | string)[];
  value_names?: string[];
  slaveId?: number; // 🔥 Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
}

// 새로운 유연한 센서 데이터 구조
export interface FlexibleSensorData {
  device_id?: string;
  timestamp: number | string;
  sensor_count: number;
  sensors: DetectedSensor[];
  protocols?: {
    i2c: number;
    modbus: number;
  };
  receivedAt?: string;
}

// 차트용 데이터 구조
export interface ChartDataPoint {
  time: string;
  [sensorName: string]: string | number;
}

// 센서 타입별 메타데이터
export interface SensorMetadata {
  name: string;
  unit: string;
  color: string;
  icon: string;
  valueLabels: string[];
  alertKeys?: string[];
  protocol?: string;
}

// 센서 메타데이터 정의
export const SENSOR_METADATA: Record<number, SensorMetadata> = {
  0: { name: '알 수 없음', unit: '', color: '#gray-500', icon: '❓', valueLabels: [], protocol: 'unknown' },
  1: { name: '온습도', unit: '°C, %', color: '#blue-500', icon: '/thermometer.png', valueLabels: ['온도 (°C)', '습도 (%)'], protocol: 'i2c' },
  2: { name: '조도', unit: 'lux', color: '#yellow-500', icon: '/sun.png', valueLabels: ['조도 (lux)'], protocol: 'i2c' },
  3: { name: '양액센서', unit: 'pH, dS/m', color: '#green-500', icon: '/ph.png', valueLabels: ['양액 산도 (pH)', '양액 전도도 (EC)'], protocol: 'i2c' },
  4: { name: 'CO2센서', unit: 'ppm', color: '#purple-500', icon: '/air.png', valueLabels: ['CO2 (ppm)'], protocol: 'i2c' },
  5: { name: '온도', unit: '°C', color: '#red-500', icon: '/thermometer.png', valueLabels: ['온도 (°C)'], protocol: 'digital' },
  21: { name: 'SHT20(Modbus)', unit: '°C, %', color: '#blue-600', icon: '/thermometer.png', valueLabels: ['온도 (°C)', '습도 (%)'], protocol: 'modbus' },
  11: { name: 'Modbus 온습도', unit: '°C, %', color: '#indigo-500', icon: '/thermometer.png', valueLabels: ['온도 (°C)', '습도 (%)'], protocol: 'modbus' },
  12: { name: 'Modbus 압력', unit: 'bar', color: '#pink-500', icon: '/press.png', valueLabels: ['압력 (bar)'], protocol: 'modbus' },
  13: { name: 'Modbus 유량', unit: 'L/min', color: '#cyan-500', icon: '/water.png', valueLabels: ['유량 (L/min)'], protocol: 'modbus' },
  14: { name: 'Modbus 릴레이', unit: '', color: '#orange-500', icon: '/power.png', valueLabels: ['상태'], protocol: 'modbus' },
  15: { name: 'Modbus 전력', unit: 'V, A', color: '#lime-500', icon: '/power.png', valueLabels: ['전압 (V)', '전류 (A)'], protocol: 'modbus' },
  16: { name: '풍향', unit: '도, 방향', color: '#teal-500', icon: '/direction.png', valueLabels: ['기어방향', '각도방향 (°)', '방향'], protocol: 'analog' },
  17: { name: '풍속', unit: 'm/s', color: '#emerald-500', icon: '/air.png', valueLabels: ['풍속 (m/s)', '풍력계급', '상태'], protocol: 'analog' },
  18: { name: '강우/강설', unit: '°C, %, 레벨', color: '#sky-500', icon: '/cloud.png', valueLabels: ['강수상태', '강수상태텍스트', '수분레벨', '수분강도', '온도 (°C)', '습도 (%)', '온도상태', '아이콘'], protocol: 'analog' },
  19: { name: '토양센서', unit: ', dS/m, °C, %', color: '#amber-600', icon: '/soil.png', valueLabels: ['토양pH', '토양EC (dS/m)', '토양온도 (°C)', '토양습도 (%)'], protocol: 'modbus' },
};

// 알림 관련 인터페이스들
export interface Notification {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  sensorType?: string;
  sensorName?: string;
  value?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  deviceId?: string;
}

export interface AlertThreshold {
  min: number;
  max: number;
  enabled: boolean;
  hysteresis?: number;
}

export interface AlertSettings {
  temperature: AlertThreshold;
  humidity: AlertThreshold;
  waterTemp: AlertThreshold;
  lightLevel: AlertThreshold;
  ec: AlertThreshold;
  ph: AlertThreshold;
  pressure?: AlertThreshold;
  cooldownSeconds: number;
}

export interface FlexibleAlertSettings {
  deviceId: string;
  sensorAlerts: {
    [sensorName: string]: {
      [valueIndex: number]: AlertThreshold;
    };
  };
  globalSettings: {
    cooldownSeconds: number;
    enableGlobalNotifications: boolean;
    notificationMethods: ('email' | 'sms' | 'push')[];
  };
}

export interface SensorAlert {
  id: string;
  deviceId: string;
  sensorType: string;
  sensorName?: string;
  valueIndex?: number;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  value?: number;
  threshold?: number;
}

export interface AlertState {
  isTriggered: boolean;
  lastAlertTime: number;
  lastValue: number;
  currentSeverity?: 'low' | 'medium' | 'high' | 'critical';
  sensorName?: string;
  valueIndex?: number;
}

// 기타 타입 정의들
export type TabType = 'sensor' | 'notifications' | 'control';

export interface SensorReading {
  deviceId: string;
  temperature: number;
  humidity: number;
  waterTemp: number;
  lightLevel: number;
  ec: number;
  ph: number;
  deviceTimestamp: number;
  serverTimestamp: string;
  crc32: number;
  flexibleData?: FlexibleSensorData;
  dataType?: 'legacy' | 'flexible';
}

export interface DeviceStatus {
  deviceId: string;
  isOnline: boolean;
  lastSeen: string;
  mqttConnected: boolean;
  batteryLevel?: number;
  signalStrength?: number;
  sensorCount?: number;
  activeSensorCount?: number;
  dataFormat?: 'legacy' | 'flexible' | 'mixed';
}

export interface SensorStats {
  count: number;
  min: number;
  max: number;
  average: number;
  median: number;
  standardDeviation: number;
  lastValue?: number;
  trend?: 'up' | 'down' | 'stable';
}

export type SensorStatus = 'good' | 'warning' | 'error' | 'unknown';

export interface SensorValueFormat {
  decimals: number;
  unit: string;
  prefix?: string;
  suffix?: string;
}

export interface ChartConfig {
  timeRange: number;
  maxDataPoints: number;
  refreshInterval: number;
  selectedSensors: string[];
  chartType: 'line' | 'bar' | 'area';
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  timeRange: {
    start: string;
    end: string;
  };
  includeSensors: string[];
  includeMetadata: boolean;
}

export interface RealtimeConfig {
  enabled: boolean;
  interval: number;
  maxRetries: number;
  reconnectDelay: number;
}

export interface SensorCalibration {
  sensorName: string;
  valueIndex: number;
  offset: number;
  multiplier: number;
  enabled: boolean;
  lastCalibrated?: string;
}

export interface DeviceConfig {
  deviceId: string;
  name: string;
  location?: string;
  description?: string;
  calibrations: SensorCalibration[];
  alertSettings: FlexibleAlertSettings;
  chartConfig: ChartConfig;
  realtimeConfig: RealtimeConfig;
}

// 유니언 타입들
export type AnySensorData = SensorData | FlexibleSensorData;
export type AnyAlertSettings = AlertSettings | FlexibleAlertSettings;

// API 응답 인터페이스들
export interface SensorDataResponse<T = AnySensorData> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp?: string;
  deviceId?: string;
}

export interface SensorHistoryResponse {
  success: boolean;
  data?: FlexibleSensorData[];
  count?: number;
  deviceId?: string;
  timeRange?: string;
  message?: string;
}

export interface SensorStatsResponse {
  success: boolean;
  deviceId?: string;
  sensorName?: string;
  timeRange?: string;
  statistics?: SensorStats;
  message?: string;
}

// CRC 계산 함수
export function calculateCRC(buffer: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x01) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// 바이너리 데이터 압축 해제 함수
export function decompressBinaryData(buffer: Uint8Array): FlexibleSensorData | null {
  try {
    if (buffer.length < 8) {
      console.error('바이너리 데이터 크기 부족:', buffer.length);
      return null;
    }

    let offset = 0;
    const deviceId = buffer[offset++];
    offset++; // functionCode 건너뛰기
    offset += 4; // timestamp 건너뛰기
    const sensorCount = buffer[offset++];
    offset++; // reserved 건너뛰기

    const sensors: DetectedSensor[] = [];

    for (let i = 0; i < sensorCount && offset + 10 <= buffer.length - 2; i++) {
      const sensorId = buffer[offset++];
      const sensorType = buffer[offset++];
      const slaveId = buffer[offset++]; // Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
      const channel = buffer[offset++]; // CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
      // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)

      const value1 = (buffer[offset++] << 8) | buffer[offset++];
      const value2 = (buffer[offset++] << 8) | buffer[offset++];
      offset += 2; // reserved 건너뛰기

      let convertedValues: (number | string)[] = [];
      let valueNames: string[] = [];

      // 센서 타입별 값 변환
      if (sensorType === 1 || sensorType === 21) { // SHT20 (I2C or Modbus 제공)
        convertedValues = [value1 / 100, value2 / 100];
        valueNames = ['temperature', 'humidity'];
      } else if (sensorType === 2) { // TSL2591
        convertedValues = [value1 / 10];
        valueNames = ['light_level'];
      } else if (sensorType === 3) { // ADS1115
        convertedValues = [value1 / 100, (value2 / 100) / 100];
        valueNames = ['ph', 'ec'];
      } else if (sensorType === 4) { // SCD30
        convertedValues = [value1];
        valueNames = ['co2_ppm'];
      } else if (sensorType === 5) { // DS18B20
        convertedValues = [value1 / 100];
        valueNames = ['temperature'];
      } else if (sensorType === 16) { // 풍향 센서
        const directions = ['북풍(N)', '북동풍(NE)', '동풍(E)', '남동풍(SE)',
          '남풍(S)', '남서풍(SW)', '서풍(W)', '북서풍(NW)'];
        const gearDirection = value1;
        const degreeDirection = value2;
        let windDirectionStr = '';
        
        if (gearDirection >= 0 && gearDirection <= 7) {
          windDirectionStr = directions[gearDirection];
        } else {
          if (degreeDirection >= 0 && degreeDirection < 22.5) windDirectionStr = '북풍(N)';
          else if (degreeDirection < 67.5) windDirectionStr = '북동풍(NE)';
          else if (degreeDirection < 112.5) windDirectionStr = '동풍(E)';
          else if (degreeDirection < 157.5) windDirectionStr = '남동풍(SE)';
          else if (degreeDirection < 202.5) windDirectionStr = '남풍(S)';
          else if (degreeDirection < 247.5) windDirectionStr = '남서풍(SW)';
          else if (degreeDirection < 292.5) windDirectionStr = '서풍(W)';
          else if (degreeDirection < 337.5) windDirectionStr = '북서풍(NW)';
          else windDirectionStr = '북풍(N)';
        }
        
        convertedValues = [gearDirection, degreeDirection, windDirectionStr];
        valueNames = ['gear_direction', 'degree_direction', 'direction_text'];
      } else if (sensorType === 17) { // 풍속 센서
        const rawWindSpeed = value1;
        const windSpeedMs = rawWindSpeed / 10.0;
        let windScale = '';
        let windCondition = '';

        if (windSpeedMs === 0) {
          windScale = '무풍';
          windCondition = '고요';
        } else if (windSpeedMs < 0.2) {
          windScale = '감지한계';
          windCondition = '연기 방향 감지 곤란';
        } else if (windSpeedMs < 1.5) {
          windScale = '실바람';
          windCondition = '연기 방향으로 감지';
        } else if (windSpeedMs < 3.3) {
          windScale = '남실바람';
          windCondition = '바람이 얼굴에 느껴짐';
        } else if (windSpeedMs < 5.4) {
          windScale = '산들바람';
          windCondition = '나뭇잎이 흔들림';
        } else if (windSpeedMs < 7.9) {
          windScale = '건들바람';
          windCondition = '작은 가지가 흔들림';
        } else if (windSpeedMs < 10.7) {
          windScale = '흔들바람';
          windCondition = '큰 가지가 흔들림';
        } else if (windSpeedMs < 13.8) {
          windScale = '된바람';
          windCondition = '나무 전체가 흔들림';
        } else if (windSpeedMs < 17.1) {
          windScale = '센바람';
          windCondition = '걷기 곤란';
        } else {
          windScale = '강풍';
          windCondition = '심한 손상 가능';
        }

        convertedValues = [windSpeedMs, windScale, windCondition];
        valueNames = ['wind_speed_ms', 'wind_scale', 'wind_condition'];
      } else if (sensorType === 18) { // 강우/강설 센서
        const precipStatus = (value1 >> 12) & 0x0F;
        const moistureLevel = value1 & 0x0FFF;
        const tempByte = (value2 >> 8) & 0xFF;
        const humidity = value2 & 0xFF;
        const temperature = tempByte - 40;

        let precipStatusText = '';
        let precipIcon = '';
        if (precipStatus === 0) {
          precipStatusText = '건조';
          precipIcon = 'sun.png';
        } else if (precipStatus === 1) {
          precipStatusText = '강우';
          precipIcon = 'rain.png';
        } else if (precipStatus === 2) {
          precipStatusText = '강설';
          precipIcon = 'snow.png';
        } else {
          precipStatusText = '알 수 없음';
          precipIcon = '❓';
        }

        let moistureIntensity = '';
        if (precipStatus > 0) {
          if (moistureLevel > 3000) {
            moistureIntensity = '강함';
          } else if (moistureLevel > 1500) {
            moistureIntensity = '보통';
          } else if (moistureLevel > 500) {
            moistureIntensity = '약함';
          } else {
            moistureIntensity = '미약';
          }
        } else {
          if (moistureLevel > 500) {
            moistureIntensity = '잔여수분';
          } else {
            moistureIntensity = '완전건조';
          }
        }

        let tempStatus = '';
        if (temperature >= 30) {
          tempStatus = '높음';
        } else if (temperature >= 20) {
          tempStatus = '적정';
        } else if (temperature >= 10) {
          tempStatus = '낮음';
        } else if (temperature >= 0) {
          tempStatus = '매우낮음';
        } else {
          tempStatus = '결빙위험';
        }

        convertedValues = [
          precipStatus, precipStatusText, moistureLevel, moistureIntensity,
          temperature, humidity, tempStatus, precipIcon
        ];
        valueNames = [
          'precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity',
          'temperature', 'humidity', 'temp_status', 'precip_icon'
        ];
      } else if (sensorType === 19) { // 토양 센서
        const soilHumidity = (value1 & 0xFF00) >> 8;
        const soilTemp = (value1 & 0x00FF) - 40;
        const soilEC = (value2 & 0xFF00) >> 8;
        const soilPH = (value2 & 0x00FF) / 10.0;

        let moistureText = '';
        if (soilHumidity >= 70) {
          moistureText = '적정';
        } else if (soilHumidity >= 40) {
          moistureText = '보통';
        } else if (soilHumidity >= 20) {
          moistureText = '건조';
        } else {
          moistureText = '매우건조';
        }

        let phText = '';
        if (soilPH >= 6.0 && soilPH <= 7.5) {
          phText = '중성';
        } else if (soilPH < 6.0) {
          phText = '산성';
        } else {
          phText = '알칼리';
        }

        let ecText = '';
        if (soilEC <= 20) {
          ecText = '매우낮음';
        } else if (soilEC <= 50) {
          ecText = '낮음';
        } else if (soilEC <= 150) {
          ecText = '보통';
        } else {
          ecText = '높음';
        }

        convertedValues = [
          soilHumidity, soilTemp, soilEC, soilPH,
          moistureText, phText, ecText
        ];
        valueNames = [
          'soil_humidity', 'soil_temperature', 'soil_ec', 'soil_ph',
          'moisture_status', 'ph_status', 'ec_status'
        ];
      } else {
        // 기타 센서들
        if (sensorType >= 11) {
          convertedValues = [value1 / 100, value2 / 100];
          valueNames = ['value1', 'value2'];
        } else {
          convertedValues = [value1, value2];
          valueNames = ['value1', 'value2'];
        }
      }

      const typeInfo = UNIFIED_SENSOR_TYPES[sensorType] || {
        name: 'UNKNOWN',
        protocol: 'unknown',
        values: valueNames
      };

      sensors.push({
        sensor_id: sensorId,
        name: `${typeInfo.name}_CH${channel}`,
        type: sensorType,
        protocol: typeInfo.protocol,
        channel: channel, // 🔥 UNO_ID를 CH로 직접 사용 (Mega에서 할당한 물리적 순서)
        slaveId: slaveId, // 🔥 Combined ID 저장
        status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
        active: true,
        values: convertedValues,
        value_names: valueNames
      });
    }

    const result: FlexibleSensorData = {
      device_id: `ARDUINO_MEGA_${String(deviceId).padStart(3, '0')}`,
      timestamp: Date.now(),
      sensor_count: sensors.length,
      sensors: sensors,
      protocols: {
        i2c: sensors.filter(s => s.protocol === 'i2c').length,
        modbus: sensors.filter(s => s.protocol === 'modbus').length
      },
      receivedAt: new Date().toISOString()
    };

    return result;

  } catch (error) {
    console.error('바이너리 데이터 파싱 오류:', error);
    return null;
  }
}

// 압축된 데이터 압축 해제 함수
export function decompressUnifiedData(compressed: any): FlexibleSensorData {
  // 🔥 먼저 모든 센서를 파싱하고, 동종 센서에 대해 채널 재계산
  const rawSensors = compressed.s.map((s: any[]) => {
    const typeInfo = UNIFIED_SENSOR_TYPES[s[1]] || { name: 'UNKNOWN', protocol: 'unknown', values: [] };
    
    let values: (number | string)[] = [];
    let valueNames: string[] = [];
    const sensorType = s[1];
    const rawValues = s.slice(4);

    if (sensorType === 1 || sensorType === 21) { // SHT20 (I2C or Modbus 제공)
      values = [rawValues[0] / 100, rawValues[1] / 100];
      valueNames = ['temperature', 'humidity'];
    } else if (sensorType === 2) { // TSL2591
      values = [rawValues[0] / 10];
      valueNames = ['light_level'];
    } else if (sensorType === 3) { // ADS1115
      values = [rawValues[0] / 100, rawValues[1] / 100];
      valueNames = ['ph', 'ec'];
    } else if (sensorType === 4) { // SCD30
      values = [rawValues[0]];
      valueNames = ['co2_ppm'];
    } else if (sensorType === 5) { // DS18B20
      values = [rawValues[0] / 100];
      valueNames = ['temperature'];
    } else {
      if (sensorType >= 11) {
        values = [rawValues[0] / 100, rawValues[1] / 100];
        valueNames = ['value1', 'value2'];
      } else {
        values = rawValues;
        valueNames = ['value1', 'value2'];
      }
    }

    // 🔥 압축 데이터 구조: [sensorId, type, slaveId(Combined ID), channel(UNO_ID), ...values]
    const slaveId = s[2]; // Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
    const channel = s[3]; // CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
    // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)

    return {
      sensor_id: s[0],
      type: sensorType,
      protocol: typeInfo.protocol,
      channel: channel, // 🔥 UNO_ID를 CH로 직접 사용 (Mega에서 할당한 물리적 순서)
      slaveId: slaveId, // 🔥 Combined ID 저장
      status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
      active: true,
      values: values,
      value_names: valueNames
    };
  });

  // 🔥 센서 이름 생성 (UNO_ID를 CH로 사용)
  rawSensors.forEach((sensor: any) => {
    const typeInfo = UNIFIED_SENSOR_TYPES[sensor.type] || { name: 'UNKNOWN', protocol: 'unknown' };
    sensor.name = `${typeInfo.name}_CH${sensor.channel}`;
  });

  return {
    device_id: compressed.d,
    timestamp: compressed.t,
    sensor_count: compressed.c,
    protocols: compressed.p,
    sensors: rawSensors
  };
}

// 유틸리티 함수들
export const getSensorMetadata = (sensorType: number): SensorMetadata => {
  return SENSOR_METADATA[sensorType] || SENSOR_METADATA[0];
};

export const getSensorIcon = (sensorType: number): string => {
  return getSensorMetadata(sensorType).icon;
};

export const getSensorColor = (sensorType: number): string => {
  return getSensorMetadata(sensorType).color;
};

export const getSensorName = (sensorType: number): string => {
  return getSensorMetadata(sensorType).name;
};

export const getSensorUnit = (sensorType: number): string => {
  return getSensorMetadata(sensorType).unit;
};

export const getSensorValueLabels = (sensorType: number): string[] => {
  return getSensorMetadata(sensorType).valueLabels;
};

export const getSensorProtocol = (sensorType: number): string => {
  return getSensorMetadata(sensorType).protocol || 'unknown';
};

export const isSensorIconPng = (sensorType: number): boolean => {
  const icon = getSensorIcon(sensorType);
  return icon.endsWith('.png');
};

// 센서 타입 검증 함수
export const isValidSensorType = (sensorType: number): boolean => {
  return sensorType in SENSOR_METADATA;
};

// 센서 데이터 유효성 검증
export const validateSensorData = (data: FlexibleSensorData): { valid: boolean; errors?: string[] } => {
  const errors: string[] = [];

  if (!data.device_id) errors.push('device_id가 없습니다');
  if (!data.timestamp) errors.push('timestamp가 없습니다');
  if (!Array.isArray(data.sensors)) errors.push('sensors가 배열이 아닙니다');

  if (data.sensors) {
    data.sensors.forEach((sensor, index) => {
      if (typeof sensor.name !== 'string') errors.push(`센서 ${index}: name이 문자열이 아닙니다`);
      if (typeof sensor.type !== 'number') errors.push(`센서 ${index}: type이 숫자가 아닙니다`);
      if (typeof sensor.channel !== 'number') errors.push(`센서 ${index}: channel이 숫자가 아닙니다`);
      if (!Array.isArray(sensor.values)) errors.push(`센서 ${index}: values가 배열이 아닙니다`);
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
};

// 센서 값 포맷팅 함수 - 타입 안전하게 다시 작성
export const formatSensorValue = (
  value: number | string,
  sensorType: number,
  valueIndex: number = 0
): string => {
  // 문자열인 경우 그대로 반환
  if (typeof value === 'string') {
    return value;
  }

  // 숫자인 경우 센서 타입에 따라 포맷팅
  if (typeof value === 'number') {
    if (sensorType === 1 || sensorType === 21) { // 온습도 (SHT20 I2C/Modbus)
      return valueIndex === 0 ? `${value.toFixed(1)}°C` : `${value.toFixed(1)}%`;
    } else if (sensorType === 2) { // 조도
      return `${value.toFixed(0)} lux`;
    } else if (sensorType === 3) { // pH/EC
      return valueIndex === 0 ? `${value.toFixed(2)}` : `${value.toFixed(2)} dS/m`;
    } else if (sensorType === 4) { // CO2
      return `${value.toFixed(0)} ppm`;
    } else if (sensorType === 5) { // 온도
      return `${value.toFixed(1)}°C`;
    } else if (sensorType === 17) { // 풍속
      return valueIndex === 0 ? `${value.toFixed(1)} m/s` : String(value);
    } else if (sensorType === 19) { // 토양 센서
      if (valueIndex === 0) return `${value.toFixed(1)}%`;        // soil_humidity
      if (valueIndex === 1) return `${value.toFixed(1)}°C`;       // soil_temperature
      if (valueIndex === 2) return `${value.toFixed(2)} dS/m`;    // soil_ec
      if (valueIndex === 3) return `${value.toFixed(2)}`;         // soil_ph
      if (valueIndex >= 4 && valueIndex <= 6) return String(value); // status texts
      return String(value);
    } else {
      return value.toFixed(2);
    }
  }

  // 기타 경우
  return String(value);
};

// 디바이스 ID 포맷팅
export const formatDeviceId = (deviceId: string | number): string => {
  return `ARDUINO_MEGA_${String(deviceId).padStart(3, '0')}`;
};

// 센서 상태 평가
export const evaluateSensorStatus = (
  sensor: DetectedSensor,
  alertSettings?: FlexibleAlertSettings
): SensorStatus => {
  if (!sensor.active) {
    return 'error';
  }

  if (!alertSettings) {
    return 'good';
  }

  const sensorAlerts = alertSettings.sensorAlerts[sensor.name];
  if (!sensorAlerts) {
    return 'good';
  }

  for (let i = 0; i < sensor.values.length; i++) {
    const value = sensor.values[i];
    const threshold = sensorAlerts[i];

    if (threshold && threshold.enabled && typeof value === 'number') {
      if (value < threshold.min || value > threshold.max) {
        return 'warning';
      }
    }
  }

  return 'good';
};

// 센서 이름 변환 함수
export const convertSensorName = (sensorName: string): string => {
  const nameMap: Record<string, string> = {
    'SHT20': '온습도 센서',
    'BH1750': '조도 센서',
    'ADS1115': 'pH/EC 센서',
    'SCD30': 'CO2 센서',
    'DS18B20': '온도 센서',
    '온습도센서': '온습도센서',
    '압력센서': '압력센서',
    '유량센서': '유량센서',
    '릴레이모듈': '릴레이모듈',
    '전력계': '전력계',
    '풍향센서': '풍향센서',
    '풍속센서': '풍속센서',
    '강우강설센서': '강우강설센서',
    '토양센서': '토양센서'
  };

  // I2C 센서: _CH숫자 제거, Modbus 센서: _숫자 제거
  const baseName = sensorName.replace(/_CH\d+/, '').replace(/_\d+$/, '');
  return nameMap[baseName] || sensorName;
};

// 레거시 데이터를 FlexibleSensorData로 변환
export const convertLegacyToFlexible = (legacyData: SensorData): FlexibleSensorData => {
  return {
    device_id: 'LEGACY_DEVICE',
    timestamp: new Date(legacyData.timestamp).getTime(),
    sensor_count: 3,
    sensors: [
      {
        sensor_id: 1,
        name: 'SHT20_CH0',
        type: 1,
        protocol: 'i2c',
        channel: 0,
        status: 1,
        active: true,
        values: [legacyData.temperature, legacyData.humidity],
        value_names: ['temperature', 'humidity']
      },
      {
        sensor_id: 2,
        name: 'BH1750_CH0',
        type: 2,
        protocol: 'i2c',
        channel: 0,
        status: 1,
        active: legacyData.lightLevel > 0,
        values: [legacyData.lightLevel],
        value_names: ['light_level']
      },
      {
        sensor_id: 3,
        name: 'PRESSURE_CH0',
        type: 12,
        protocol: 'modbus',
        channel: 0,
        status: 1,
        active: legacyData.pressure > 0,
        values: [legacyData.pressure],
        value_names: ['pressure']
      }
    ],
    protocols: {
      i2c: 2,
      modbus: 1
    },
    receivedAt: new Date().toISOString()
  };
};