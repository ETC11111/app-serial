// routes/api.js - 통합 REST API (리팩터링된 버전)
const express = require('express');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

let getLatestSensorData = null;

function getSensorDataFunction() {
  if (!getLatestSensorData) {
    try {
      const sensorModule = require('./sensors');
      getLatestSensorData = sensorModule.getLatestSensorData;
    } catch (error) {
      console.error('❌ sensors 모듈 로드 실패:', error);
      return () => ({});
    }
  }
  return getLatestSensorData;
}

// 🔥 최신 센서 타입 (BH1750 제거, SCD41 적용)
const UNIFIED_SENSOR_TYPES = {
  1: { name: 'SHT20', protocol: 'i2c', values: ['temperature', 'humidity'] },
  2: { name: 'TSL2591', protocol: 'i2c', values: ['light_level'] },
  3: { name: 'ADS1115', protocol: 'i2c', values: ['ph', 'ec'] },
  4: { name: 'SCD41', protocol: 'i2c', values: ['co2_ppm'] },
  5: { name: 'DS18B20', protocol: 'i2c', values: ['temperature'] },
  
  11: { name: 'MODBUS_TEMP_HUMID', protocol: 'modbus', values: ['temperature', 'humidity'] },
  12: { name: 'MODBUS_PRESSURE', protocol: 'modbus', values: ['pressure'] },
  13: { name: 'MODBUS_FLOW', protocol: 'modbus', values: ['flow_rate'] },
  14: { name: 'MODBUS_RELAY', protocol: 'modbus', values: ['status'] },
  15: { name: 'MODBUS_ENERGY', protocol: 'modbus', values: ['voltage', 'current'] },
  16: { name: 'WIND_DIRECTION', protocol: 'modbus', values: ['gear_direction', 'degree_direction', 'direction_text'] },
  17: { name: 'WIND_SPEED', protocol: 'modbus', values: ['wind_speed_ms', 'wind_scale', 'wind_condition'] },
  18: { name: 'RAIN_SNOW', protocol: 'modbus', values: ['precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity', 'temperature', 'humidity', 'temp_status', 'precip_icon'] },
  19: { name: 'SOIL_SENSOR', protocol: 'modbus', values: ['soil_humidity', 'soil_temperature', 'soil_ec', 'soil_ph', 'moisture_status', 'ph_status', 'ec_status', 'nitrogen', 'phosphorus', 'potassium'] }
};

// 압축 해제 함수
function decompressUnifiedData(compressed) {
  return {
    device_id: compressed.d,
    timestamp: compressed.t,
    sensor_count: compressed.c,
    protocols: compressed.p,
    sensors: compressed.s.map(s => {
      const typeInfo = UNIFIED_SENSOR_TYPES[s[1]] || { 
        name: 'UNKNOWN', 
        protocol: 'unknown', 
        values: [] 
      };
      
      // 🔥 센서 타입별 값 변환 (최신 센서 반영)
      let values = [];
      let valueNames = [];
      const sensorType = s[1];
      const rawValues = s.slice(4);
      
      switch (sensorType) {
        case 1: // SHT20
          values = [rawValues[0] / 100, rawValues[1] / 100];
          valueNames = ['temperature', 'humidity'];
          break;
        case 2: // TSL2591 (BH1750 제거됨)
          values = [rawValues[0] / 10];
          valueNames = ['light_level'];
          break;
        case 3: // ADS1115 - pH/EC/WaterTemp
          values = [rawValues[0] / 100, rawValues[1] / 100, rawValues[2] / 100];
          valueNames = ['ph', 'ec', 'water_temp'];
          break;
        case 4: // SCD41 (SCD30에서 변경)
          values = [rawValues[0]];
          valueNames = ['co2_ppm'];
          break;
        case 5: // DS18B20
          values = [rawValues[0] / 100];
          valueNames = ['temperature'];
          break;
        
        case 16: // 풍향센서
          const gearDirection = rawValues[0];
          const degreeDirection = rawValues[1];
          
          const directions = ['북풍(N)', '북동풍(NE)', '동풍(E)', '남동풍(SE)', 
                            '남풍(S)', '남서풍(SW)', '서풍(W)', '북서풍(NW)'];
          
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
          
          values = [gearDirection, degreeDirection, windDirectionStr];
          valueNames = ['gear_direction', 'degree_direction', 'direction_text'];
          break;
          
        case 17: // 풍속센서
          const windSpeedMs = rawValues[0] / 10.0;
          
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
          
          values = [windSpeedMs, windScale, windCondition];
          valueNames = ['wind_speed_ms', 'wind_scale', 'wind_condition'];
          break;
          
        case 18: // 강우/강설센서
          const precipStatusCode = rawValues[0];
          const moistureLvl = rawValues[1];
          const temp2 = rawValues[2] / 100;
          const humidity2 = rawValues[3];
          
          let precipText = '';
          let precipEmoji = '';
          switch (precipStatusCode) {
            case 0: precipText = '건조'; precipEmoji = '☀️'; break;
            case 1: precipText = '강우'; precipEmoji = '🌧️'; break;
            case 2: precipText = '강설'; precipEmoji = '🌨️'; break;
            default: precipText = '알 수 없음'; precipEmoji = '❓'; break;
          }
          
          let moistureIntens = '';
          if (precipStatusCode > 0) {
            if (moistureLvl > 3000) moistureIntens = '강함';
            else if (moistureLvl > 1500) moistureIntens = '보통';
            else if (moistureLvl > 500) moistureIntens = '약함';
            else moistureIntens = '미약';
          } else {
            if (moistureLvl > 500) moistureIntens = '잔여수분';
            else moistureIntens = '완전건조';
          }
          
          values = [
            precipStatusCode, precipText, moistureLvl, moistureIntens,
            temp2, humidity2, precipEmoji
          ];
          valueNames = [
            'precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity',
            'temperature', 'humidity', 'precip_icon'
          ];
          break;

        case 19: // 토양센서 (습도 포함)
          const savedPH = rawValues[0] / 100;
          const savedEC = rawValues[1] / 100;
          const savedTemp = rawValues[2] / 100;  // 실제 토양 온도값
          const savedHumidity = rawValues[3];    // 토양 습도 (%)
          
          let phStatus = '';
          if (savedPH >= 8.5) phStatus = '🔵강알칼리';
          else if (savedPH >= 7.5) phStatus = '🟦약알칼리';
          else if (savedPH >= 6.5) phStatus = '🟢중성';
          else if (savedPH >= 5.5) phStatus = '🟡약산성';
          else if (savedPH >= 4.5) phStatus = '🟠산성';
          else phStatus = '🔴강산성';
          
          let ecStatus = '';
          if (savedEC >= 3.0) ecStatus = '⚡고농도';
          else if (savedEC >= 2.0) ecStatus = '🧂높음';
          else if (savedEC >= 1.0) ecStatus = '📊보통';
          else if (savedEC >= 0.5) ecStatus = '💎낮음';
          else ecStatus = '🌊매우낮음';
          
          let moistureStatus = '';
          if (savedHumidity >= 80) moistureStatus = '💧과습';
          else if (savedHumidity >= 60) moistureStatus = '💦충분';
          else if (savedHumidity >= 40) moistureStatus = '🌿적정';
          else if (savedHumidity >= 20) moistureStatus = '🌵건조';
          else moistureStatus = '🏜️매우건조';
          
          values = [
            savedPH, savedEC, savedTemp, savedHumidity,
            phStatus, ecStatus, moistureStatus,
            0, 0, 0  // NPK 값들 (추후 확장 대비)
          ];
          
          valueNames = [
            'soil_ph', 'soil_ec', 'soil_temperature', 'soil_humidity',
            'ph_status', 'ec_status', 'moisture_status',
            'nitrogen', 'phosphorus', 'potassium'
          ];
          break;

        default:
          if (sensorType >= 11) {
            values = [rawValues[0] / 100, rawValues[1] / 100];
            valueNames = ['value1', 'value2'];
          } else {
            values = rawValues;
            valueNames = ['value1', 'value2'];
          }
          break;
      }
      
      return {
        sensor_id: s[0],
        name: `${typeInfo.name}_CH${s[2]}`,
        type: s[1],
        protocol: typeInfo.protocol,
        channel: s[2],
        status: s[3],
        active: s[3] === 1,
        values: values,
        value_names: valueNames
      };
    })
  };
}

// 🔥 간소화된 레거시 형식 변환 (기본 센서만)
function convertToLegacyFormat(unifiedData) {
  let temperature = 0, humidity = 0, pressure = 0;
  let lightLevel = 0, motionLevel = 0, gasLevel = 0;
  
  if (unifiedData.sensors) {
    unifiedData.sensors.forEach(sensor => {
      if (!sensor.active) return;
      
      switch (sensor.type) {
        case 1: // SHT20
        case 11: // Modbus Temp/Humid
          if (sensor.values && sensor.values.length >= 2) {
            temperature = Math.round(sensor.values[0] * 100);
            humidity = Math.round(sensor.values[1] * 100);
          }
          break;
          
        case 2: // TSL2591 (BH1750 제거됨)
          if (sensor.values && sensor.values.length >= 1) {
            lightLevel = Math.round(sensor.values[0]);
          }
          break;
          
        case 3: // ADS1115
          if (sensor.values && sensor.values.length >= 2) {
            pressure = Math.round(sensor.values[0] * 100);
            motionLevel = Math.round(sensor.values[1] * 1000);
          }
          break;
          
        case 4: // SCD41 (SCD30에서 변경)
          if (sensor.values && sensor.values.length >= 1) {
            gasLevel = Math.round(sensor.values[0]);
          }
          break;
      }
    });
  }
  
  return {
    temperature,
    humidity,
    pressure,
    lightLevel,
    motionLevel,
    gasLevel,
    deviceStatus: 1,
    timestamp: unifiedData.timestamp ? unifiedData.timestamp.toString() : Date.now().toString()
  };
}

// ============= API 라우트들 =============

// 🔥 전체 센서 데이터
router.get('/sensors', (req, res) => {
  try {
    const getSensorData = getSensorDataFunction();
    const allData = getSensorData();
    
    console.log(`📊 전체 센서 데이터 요청 - ${Object.keys(allData).length}개 디바이스`);
    
    res.json({
      success: true,
      data: allData,
      device_count: Object.keys(allData).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 센서 데이터 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '센서 데이터 조회 실패',
      error: error.message
    });
  }
});

// 🔥 데이터 범위 조회 (프론트엔드 호환)
router.get('/sensors/data-range/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(403).json({
        success: false,
        error: '해당 장치에 대한 권한이 없습니다.'
      });
    }

    const rangeQuery = `
      SELECT 
        MIN(created_at) as first_date,
        MAX(created_at) as last_date,
        COUNT(*) as total_count
      FROM sensor_data 
      WHERE device_id = $1 AND protocol = 'unified'
    `;

    const rangeResult = await Database.query(rangeQuery, [deviceId]);
    
    if (rangeResult.length === 0 || !rangeResult[0].first_date) {
      return res.json({
        success: true,
        firstDate: null,
        lastDate: null,
        totalCount: 0
      });
    }

    res.json({
      success: true,
      firstDate: rangeResult[0].first_date,
      lastDate: rangeResult[0].last_date,
      totalCount: parseInt(rangeResult[0].total_count)
    });

  } catch (error) {
    console.error('데이터 범위 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '데이터 범위 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 배치 export (프론트엔드 호환)
router.post('/sensors/export-batch', authenticateToken, async (req, res) => {
  try {
    const {
      deviceId,
      startDate,
      endDate,
      limit = 100000,
      samplingInterval = 1,
      includeSensors = []
    } = req.body;

    const userId = req.user.id;

    const deviceCheck = await Database.query(
      'SELECT device_id, device_name, device_location FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(403).json({
        success: false,
        error: '해당 장치에 대한 권한이 없습니다.'
      });
    }

    const query = `
      SELECT 
        id,
        device_id,
        timestamp,
        created_at,
        sensor_count,
        sensor_data,
        protocol
      FROM sensor_data 
      WHERE device_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
        AND protocol = 'unified'
      ORDER BY created_at ASC
      LIMIT $4
    `;

    const rawData = await Database.query(query, [
      deviceId,
      new Date(startDate),
      new Date(endDate),
      limit * samplingInterval
    ]);

    if (rawData.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: {
          totalRecords: 0,
          filteredRecords: 0,
          samplingApplied: samplingInterval > 1,
          deviceInfo: deviceCheck[0]
        }
      });
    }

    let processedData = [];
    
    for (let i = 0; i < rawData.length; i += samplingInterval) {
      const row = rawData[i];
      
      try {
        const compressedData = row.sensor_data;
        const decompressed = decompressUnifiedData(compressedData);
        
        if (!decompressed || !decompressed.sensors) {
          continue;
        }

        let filteredSensors = decompressed.sensors;
        
        if (includeSensors && includeSensors.length > 0) {
          filteredSensors = [];
          
          includeSensors.forEach(filter => {
            const sensor = decompressed.sensors.find(s => s.name === filter.sensorName);
            if (sensor && sensor.values && sensor.values[filter.valueIndex] !== undefined) {
              const filteredSensor = {
                ...sensor,
                values: [sensor.values[filter.valueIndex]],
                value_names: sensor.value_names ? [sensor.value_names[filter.valueIndex]] : [`값${filter.valueIndex + 1}`],
                originalValueIndex: filter.valueIndex
              };
              filteredSensors.push(filteredSensor);
            }
          });
        }

        const processedRow = {
          id: row.id,
          device_id: row.device_id,
          created_at: row.created_at.toISOString(),
          timestamp: decompressed.timestamp,
          receivedAt: row.created_at.toISOString(),
          sensor_count: filteredSensors.length,
          sensors: filteredSensors,
          protocols: decompressed.protocols
        };

        processedData.push(processedRow);

      } catch (parseError) {
        console.error(`❌ 데이터 파싱 오류 (ID: ${row.id}):`, parseError);
        continue;
      }
    }

    res.json({
      success: true,
      data: processedData,
      meta: {
        totalRecords: rawData.length,
        filteredRecords: processedData.length,
        samplingApplied: samplingInterval > 1,
        samplingInterval: samplingInterval,
        dateRange: {
          start: startDate,
          end: endDate
        },
        deviceInfo: deviceCheck[0],
        selectedSensors: includeSensors
      }
    });

  } catch (error) {
    console.error('배치 데이터 export 오류:', error);
    res.status(500).json({
      success: false,
      error: '데이터 export 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 🔥 디바이스별 센서 데이터
router.get('/sensors/:deviceId', (req, res) => {
  try {
    const { deviceId } = req.params;
    const { format = 'unified', protocol } = req.query;
    
    const getSensorData = getSensorDataFunction();
    const data = getSensorData()[deviceId];
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: `디바이스 ${deviceId}를 찾을 수 없습니다.`
      });
    }
    
    let responseData = data;
    
    // 프로토콜 필터링
    if (protocol && ['i2c', 'modbus'].includes(protocol)) {
      const filteredSensors = data.sensors ? data.sensors.filter(sensor => sensor.protocol === protocol) : [];
      responseData = {
        ...data,
        sensors: filteredSensors,
        sensor_count: filteredSensors.length
      };
    }
    
    // 레거시 형식 변환
    if (format === 'legacy') {
      const legacyData = convertToLegacyFormat(responseData);
      return res.json({
        success: true,
        deviceId: deviceId,
        format: 'legacy',
        data: legacyData
      });
    }
    
    // 압축된 데이터인지 확인하고 해제
    if (data.d && data.c && data.s) {
      responseData = decompressUnifiedData(data);
    }
    
    res.json({
      success: true,
      deviceId: deviceId,
      format: 'unified',
      data: responseData
    });
  } catch (error) {
    console.error('❌ 디바이스 센서 데이터 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '디바이스 센서 데이터 조회 실패',
      error: error.message
    });
  }
});

// 🔥 센서 히스토리 API (기간별 보기용)
router.get('/sensors/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100, hours = 24, protocol, start, end } = req.query;

    let whereClause = 'device_id = $1';
    let params = [deviceId];
    let paramIndex = 2;

    // 🔥 start/end 파라미터 지원 (기간별 보기용)
    if (start && end) {
      whereClause += ` AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
      params.push(new Date(start), new Date(end));
      paramIndex += 2;
    } else {
      // 기존 hours 파라미터 지원
      whereClause += ` AND created_at > NOW() - INTERVAL $${paramIndex}`;
      params.push(`${parseInt(hours)} hours`);
      paramIndex++;
    }

    whereClause += ` AND protocol = $${paramIndex}`;
    params.push('unified');
    paramIndex++;

    const history = await Database.query(
      `SELECT sensor_data, created_at, timestamp
       FROM sensor_data 
       WHERE ${whereClause}
       ORDER BY created_at DESC 
       LIMIT ${parseInt(limit)}`,
      params
    );

    let processedHistory = history.map(row => {
      const decompressed = decompressUnifiedData(row.sensor_data);
      return {
        ...decompressed,
        stored_at: row.created_at
      };
    });

    if (protocol && ['i2c', 'modbus'].includes(protocol)) {
      processedHistory = processedHistory.map(data => ({
        ...data,
        sensors: data.sensors.filter(s => s.protocol === protocol)
      }));
    }

    res.json({
      success: true,
      deviceId: deviceId,
      protocol: protocol || 'unified',
      history: processedHistory, // 🔥 frontend에서 사용하는 키로 변경
      data: processedHistory, // 🔥 기존 호환성 유지
      count: history.length
    });

  } catch (error) {
    console.error('센서 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '센서 히스토리 조회 실패'
    });
  }
});

// 🔥 명령 관련 라우트들
router.use('/commands', (req, res, next) => {
  try {
    const commandRouter = require('./commands');
    commandRouter(req, res, next);
  } catch (error) {
    console.error('❌ Commands 라우터 로드 실패:', error);
    res.status(500).json({
      success: false,
      message: '명령 처리 모듈을 로드할 수 없습니다.',
      error: error.message
    });
  }
});

console.log('🌐 통합 REST API v2 등록 완료');

module.exports = router;