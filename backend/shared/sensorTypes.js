// shared/sensorTypes.js - 🔥 모든 곳에서 사용할 통일된 센서 타입
const SENSOR_TYPES = {
  // === I2C 센서들 (1-10) ===
  NONE: 0,
  SHT20: 1,           // 온도/습도
  TSL2591: 2,        // 조도 (TSL2591)
  ADS1115: 3,         // pH/EC/수온 (아날로그)
  SCD30: 4,           // CO2/온도/습도
  DS18B20: 5,         // 온도
  // 6-10: I2C 센서 확장용

  // === Modbus 센서들 (11-20) ===
  MODBUS_TEMP_HUMID: 11,    // Modbus 온습도
  MODBUS_PRESSURE: 12,      // Modbus 압력
  MODBUS_FLOW: 13,          // Modbus 유량
  MODBUS_RELAY: 14,         // Modbus 릴레이
  MODBUS_ENERGY: 15,        // Modbus 전력계
  MODBUS_WIND_DIRECTION: 16, // 🔥 Modbus 풍향센서
  MODBUS_WIND_SPEED: 17,     // 🔥 Modbus 풍속센서
  MODBUS_RAIN_SNOW: 18,      // 🔥 Modbus 강우/강설센서 (새로 추가)
  MODBUS_SOIL_SENSOR: 19,    // 🔥 Modbus 토양센서(H,T,EC,PH,NPK) - 새로 추가
};

const SENSOR_METADATA = {
  [SENSOR_TYPES.NONE]: { 
    name: 'UNKNOWN', 
    protocol: 'unknown', 
    values: [],
    valueLabels: [],
    unit: ''
  },
  
  // I2C 센서들
  [SENSOR_TYPES.SHT20]: { 
    name: 'SHT20', 
    protocol: 'i2c', 
    values: ['temperature', 'humidity'],
    valueLabels: ['온도 (°C)', '습도 (%)'],
    unit: '°C, %'
  },
  [SENSOR_TYPES.TSL2591]: { 
    name: 'TSL2591', 
    protocol: 'i2c', 
    values: ['light_level'],
    valueLabels: ['조도 (lux)'],
    unit: 'lux'
  },
  [SENSOR_TYPES.ADS1115]: { 
    name: 'ADS1115', 
    protocol: 'i2c', 
    values: ['ph', 'ec', 'water_temp'],
    valueLabels: ['pH', 'EC (dS/m)', '수온 (°C)'],
    unit: 'pH, dS/m, °C'
  },
  [SENSOR_TYPES.SCD30]: { 
    name: 'SCD30', 
    protocol: 'i2c', 
    values: ['co2_ppm'],  // 🔥 temperature, humidity 제거
    valueLabels: ['CO2 (ppm)'],  // 🔥 온습도 라벨 제거
    unit: 'ppm'  // 🔥 °C, % 제거
  },
  [SENSOR_TYPES.DS18B20]: { 
    name: 'DS18B20', 
    protocol: 'i2c', 
    values: ['temperature'],
    valueLabels: ['온도 (°C)'],
    unit: '°C'
  },

  // Modbus 센서들 (백엔드와 이름 일치)
  [SENSOR_TYPES.MODBUS_TEMP_HUMID]: { 
    name: '온습도센서', 
    protocol: 'modbus', 
    values: ['temperature', 'humidity'],
    valueLabels: ['온도 (°C)', '습도 (%)'],
    unit: '°C, %'
  },
  [SENSOR_TYPES.MODBUS_PRESSURE]: { 
    name: '압력센서', 
    protocol: 'modbus', 
    values: ['pressure'],
    valueLabels: ['압력 (bar)'],
    unit: 'bar'
  },
  [SENSOR_TYPES.MODBUS_FLOW]: { 
    name: '유량센서', 
    protocol: 'modbus', 
    values: ['flow_rate'],
    valueLabels: ['유량 (L/min)'],
    unit: 'L/min'
  },
  [SENSOR_TYPES.MODBUS_RELAY]: { 
    name: '릴레이모듈', 
    protocol: 'modbus', 
    values: ['status'],
    valueLabels: ['상태'],
    unit: ''
  },
  [SENSOR_TYPES.MODBUS_ENERGY]: { 
    name: '전력계', 
    protocol: 'modbus', 
    values: ['voltage', 'current'],
    valueLabels: ['전압 (V)', '전류 (A)'],
    unit: 'V, A'
  },
  
  // 🔥 새로 추가: 기상 센서들 (백엔드와 이름 일치)
  [SENSOR_TYPES.MODBUS_WIND_DIRECTION]: { 
    name: '풍향센서', 
    protocol: 'modbus', 
    values: ['gear_direction', 'degree_direction', 'direction_text'],
    valueLabels: ['기어 방향 (0-7)', '정확한 각도 (°)', '방향'],
    unit: 'level, °, text'
  },
  [SENSOR_TYPES.MODBUS_WIND_SPEED]: { 
    name: '풍속센서', 
    protocol: 'modbus', 
    values: ['wind_speed_ms', 'wind_scale', 'wind_condition'],
    valueLabels: ['풍속 (m/s)', '풍력등급', '기상상태'],
    unit: 'm/s, scale, condition'
  },
  [SENSOR_TYPES.MODBUS_RAIN_SNOW]: { // 🔥 새로 추가
    name: '강우강설센서', 
    protocol: 'modbus', 
    values: [
      'precip_status', 
      'precip_status_text', 
      'moisture_level', 
      'moisture_intensity',
      'temperature', 
      'humidity', 
      'temp_status', 
      'precip_icon'
    ],
    valueLabels: [
      '강수상태코드', 
      '강수상태', 
      '수분레벨', 
      '수분강도',
      '온도 (°C)', 
      '습도 (%)', 
      '온도상태', 
      '날씨아이콘'
    ],
    unit: 'code, text, level, intensity, °C, %, status, icon'
  },
  // 🔥 새로 추가: 토양 센서 (실제 센서 값 4개만)
  [SENSOR_TYPES.MODBUS_SOIL_SENSOR]: { 
    name: '토양센서', 
    protocol: 'modbus', 
    values: [
      'soil_ph', 
      'soil_ec', 
      'soil_temperature',
      'soil_humidity'
    ],
    valueLabels: [
      '토양pH', 
      '토양EC (dS/m)', 
      '토양온도 (°C)',
      '토양습도 (%)'
    ],
    unit: 'pH, dS/m, °C, %'
  }
};

module.exports = {
  SENSOR_TYPES,
  SENSOR_METADATA
};