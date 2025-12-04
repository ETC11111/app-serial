// routes/i2c.js - I2C 센서 데이터 전용
const express = require('express');
const mqtt = require('mqtt');
const Database = require('../lib/database');
const alertRoutes = require('./alerts');
const router = express.Router();

const i2cMqttClient = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'i2c_backend_' + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  keepalive: 60
});

let latestI2CData = {};
let deviceStatus = {};

i2cMqttClient.on('connect', () => {
  console.log('✅ I2C MQTT 클라이언트 연결 완료');
  
  // I2C 전용 토픽만 구독
  i2cMqttClient.subscribe('sensors/i2c/+');
  i2cMqttClient.subscribe('sensors/json/+');  // 레거시 지원
});

i2cMqttClient.on('message', async (topic, message) => {
  console.log(`📨 I2C MQTT: ${topic} (${message.length} bytes)`);
  
  try {
    const deviceId = topic.split('/')[2];
    
    if (topic.startsWith('sensors/i2c/')) {
      await handleI2CSensorData(deviceId, message);
    } else if (topic.startsWith('sensors/json/')) {
      await handleLegacyI2CData(deviceId, message);
    }
    
  } catch (error) {
    console.error('❌ I2C MQTT 처리 오류:', error);
  }
});

// I2C 센서 데이터 처리
async function handleI2CSensorData(deviceId, message) {
  try {
    const i2cData = JSON.parse(message.toString());
    
    // I2C 데이터 표준화
    const standardizedData = {
      device_id: deviceId,
      timestamp: i2cData.timestamp || Date.now(),
      protocol: 'i2c',
      sensor_count: i2cData.sensor_count || 0,
      sensors: i2cData.sensors || [],
      receivedAt: new Date().toISOString()
    };
    
    console.log(`📊 I2C 센서 데이터 수신: ${deviceId} (${standardizedData.sensor_count}개 센서)`);
    
    // 센서별 상세 로그
    standardizedData.sensors.forEach(sensor => {
      console.log(`  - ${sensor.name}: ${sensor.values?.join(', ')}`);
    });
    
    // 데이터베이스 저장
    await saveI2CSensorDataToDB(deviceId, standardizedData);
    
    // 캐시 업데이트
    latestI2CData[deviceId] = standardizedData;
    
    // 알림 체크
    await alertRoutes.checkAlerts(deviceId, standardizedData);
    
    // 디바이스 상태 업데이트
    await Database.query(
      `UPDATE devices SET last_seen_at = NOW() WHERE device_id = $1`,
      [deviceId]
    );
    
  } catch (error) {
    console.error('❌ I2C 센서 데이터 처리 실패:', error);
  }
}

// 레거시 I2C 데이터 처리
async function handleLegacyI2CData(deviceId, message) {
  try {
    const legacyData = JSON.parse(message.toString());
    
    // 레거시 데이터를 I2C 형식으로 변환
    const convertedData = convertLegacyToI2CFormat(legacyData);
    convertedData.protocol = 'i2c_legacy';
    convertedData.receivedAt = new Date().toISOString();
    
    console.log(`📊 레거시 I2C 데이터 수신: ${deviceId}`);
    
    await saveI2CSensorDataToDB(deviceId, convertedData);
    latestI2CData[deviceId] = convertedData;
    
    await alertRoutes.checkAlerts(deviceId, convertedData);
    
  } catch (error) {
    console.error('❌ 레거시 I2C 데이터 처리 실패:', error);
  }
}

// 레거시 형식을 I2C 형식으로 변환
function convertLegacyToI2CFormat(legacyData) {
  const sensors = [];
  let sensorId = 0;
  
  if (legacyData.sensors) {
    legacyData.sensors.forEach(sensor => {
      // I2C 센서만 필터링 (type 1-4)
      if (sensor.type <= 4) {
        sensors.push({
          sensor_id: sensorId++,
          name: sensor.name,
          type: sensor.type,
          channel: sensor.channel,
          address: sensor.address,
          active: sensor.active,
          values: sensor.values,
          value_names: getI2CValueNamesForType(sensor.type)
        });
      }
    });
  }
  
  return {
    device_id: legacyData.device_id,
    timestamp: legacyData.timestamp,
    sensor_count: sensors.length,
    sensors: sensors
  };
}

// I2C 센서 타입별 값 이름 매핑
function getI2CValueNamesForType(sensorType) {
  const typeMap = {
    1: ['temperature', 'humidity'],      // SHT20
    2: ['light_level'],                  // BH1750
    3: ['voltage_0', 'voltage_1', 'ph', 'ec', 'temperature'], // ADS1115
    4: ['co2_ppm', 'temperature', 'humidity']  // SCD30
  };
  
  return typeMap[sensorType] || ['value'];
}

// I2C 데이터 DB 저장
async function saveI2CSensorDataToDB(deviceId, sensorData) {
  try {
    await Database.query(
      `INSERT INTO sensor_data (device_id, timestamp, sensor_count, sensor_data, protocol) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        deviceId,
        new Date(sensorData.timestamp),
        sensorData.sensor_count,
        JSON.stringify(sensorData),
        'i2c'
      ]
    );
    
    const dataSize = JSON.stringify(sensorData).length;
    console.log(`💾 I2C 센서 데이터 저장: ${deviceId} (${dataSize} bytes)`);
    
  } catch (error) {
    console.error('❌ I2C DB 저장 실패:', error);
    throw error;
  }
}

// ============= API 라우트들 =============

// I2C 센서 현재 데이터 조회
router.get('/current', (req, res) => {
  res.json({
    success: true,
    protocol: 'i2c',
    data: latestI2CData,
    device_count: Object.keys(latestI2CData).length,
    timestamp: new Date().toISOString()
  });
});

// 특정 디바이스 I2C 센서 데이터
router.get('/current/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const data = latestI2CData[deviceId];
  
  if (data) {
    res.json({
      success: true,
      deviceId: deviceId,
      protocol: 'i2c',
      data: data
    });
  } else {
    res.status(404).json({
      success: false,
      message: `디바이스 ${deviceId}의 I2C 센서 데이터를 찾을 수 없습니다.`
    });
  }
});

// I2C 센서 히스토리
router.get('/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100, hours = 24 } = req.query;
    
    const history = await Database.query(
      `SELECT sensor_data, created_at, timestamp
       FROM sensor_data 
       WHERE device_id = $1 
         AND protocol = 'i2c'
         AND created_at > NOW() - INTERVAL '${parseInt(hours)} hours'
       ORDER BY created_at DESC 
       LIMIT $2`,
      [deviceId, parseInt(limit)]
    );
    
    res.json({
      success: true,
      deviceId: deviceId,
      protocol: 'i2c',
      data: history.map(row => ({
        ...row.sensor_data,
        stored_at: row.created_at
      })),
      count: history.length
    });
    
  } catch (error) {
    console.error('I2C 센서 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: 'I2C 센서 히스토리 조회 실패'
    });
  }
});

// I2C 채널별 센서 정보
router.get('/channels/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const deviceData = latestI2CData[deviceId];
  
  if (!deviceData) {
    return res.status(404).json({
      success: false,
      message: `디바이스 ${deviceId}를 찾을 수 없습니다.`
    });
  }
  
  const channels = {};
  deviceData.sensors?.forEach(sensor => {
    if (sensor.channel !== undefined) {
      channels[sensor.channel] = sensor;
    }
  });
  
  res.json({
    success: true,
    deviceId: deviceId,
    protocol: 'i2c',
    channels: channels,
    channel_count: Object.keys(channels).length
  });
});

// I2C 연결 상태
router.get('/status', (req, res) => {
  res.json({
    success: true,
    mqtt_connected: i2cMqttClient.connected,
    client_id: i2cMqttClient.options.clientId,
    connected_devices: Object.keys(latestI2CData).length,
    protocol: 'i2c',
    timestamp: new Date().toISOString()
  });
});

// 캐시된 데이터 내보내기 (sensors.js에서 사용)
function getLatestI2CData() {
  return latestI2CData;
}

console.log('📊 I2C 센서 데이터 MQTT API 등록 완료');

module.exports = { router, getLatestI2CData };