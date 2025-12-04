// routes/mqtt.js - 프로토콜별 데이터 처리 추가
const express = require('express');
const mqtt = require('mqtt');
const Database = require('../lib/database');
const alertRoutes = require('./alerts');
const { updateSensorCache } = require('./sensors');
const router = express.Router();

const sensorMqttClient = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'sensor_backend_' + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  keepalive: 60
});

let deviceStatus = {};
let latestSensorData = {};

// 🔥 프로토콜별 데이터 수집기
let i2cSensorCollector = new Map();
let modbusSensorCollector = new Map();
const COLLECTION_TIMEOUT = 2000;

sensorMqttClient.on('connect', () => {
  console.log('✅ MQTT 센서 클라이언트 연결 완료');
  
  // 🔥 프로토콜별 토픽 구독
  sensorMqttClient.subscribe('sensors/i2c/+');          // I2C 센서 데이터
  sensorMqttClient.subscribe('sensors/json/+');         // 레거시 JSON 데이터
  sensorMqttClient.subscribe('modbus/heartbeat/+');     // Modbus 하트비트
  sensorMqttClient.subscribe('modbus/responses/+');     // Modbus 응답
});

// 🔥 프로토콜별 메시지 처리
sensorMqttClient.on('message', async (topic, message) => {
  console.log(`📨 센서 MQTT: ${topic} (${message.length} bytes)`);
  
  try {
    const deviceId = topic.split('/')[2];
    
    // I2C 센서 데이터 처리
    if (topic.startsWith('sensors/i2c/')) {
      await handleI2CSensorData(deviceId, message);
      return;
    }
    
    // 레거시 JSON 데이터 처리 (하위 호환성)
    if (topic.startsWith('sensors/json/')) {
      await handleLegacySensorData(deviceId, message);
      return;
    }
    
    // Modbus 하트비트 처리
    if (topic.startsWith('modbus/heartbeat/')) {
      await handleModbusHeartbeat(deviceId, message);
      return;
    }
    
    // Modbus 응답 처리
    if (topic.startsWith('modbus/responses/')) {
      await handleModbusResponse(deviceId, message);
      return;
    }
    
  } catch (error) {
    console.error('❌ 센서 MQTT 처리 오류:', error);
  }
});

// 🔥 I2C 센서 데이터 처리
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
    
    // 데이터베이스 저장
    await saveSensorDataToDB(deviceId, standardizedData);
    
    // 캐시 업데이트
    latestSensorData[deviceId] = standardizedData;
    updateSensorCache(deviceId, standardizedData);
    
    // 알림 체크
    await alertRoutes.checkAlerts(deviceId, standardizedData);
    
  } catch (error) {
    console.error('❌ I2C 센서 데이터 처리 실패:', error);
  }
}

// 🔥 레거시 센서 데이터 처리 (기존 방식)
async function handleLegacySensorData(deviceId, message) {
  try {
    const legacyData = JSON.parse(message.toString());
    
    // 레거시 데이터를 새 형식으로 변환
    const convertedData = convertLegacyToNewFormat(legacyData);
    convertedData.protocol = 'legacy';
    convertedData.receivedAt = new Date().toISOString();
    
    console.log(`📊 레거시 센서 데이터 수신: ${deviceId}`);
    
    await saveSensorDataToDB(deviceId, convertedData);
    latestSensorData[deviceId] = convertedData;
    updateSensorCache(deviceId, convertedData);
    
    await alertRoutes.checkAlerts(deviceId, convertedData);
    
  } catch (error) {
    console.error('❌ 레거시 센서 데이터 처리 실패:', error);
  }
}

// 🔥 Modbus 하트비트 처리
async function handleModbusHeartbeat(deviceId, message) {
  try {
    const heartbeatData = JSON.parse(message.toString());
    
    console.log(`💓 Modbus 하트비트: ${deviceId}`, {
      상태: heartbeatData.device_status,
      센서수: heartbeatData.sensor_count,
      펌웨어: heartbeatData.firmware_version
    });
    
    deviceStatus[deviceId] = {
      ...heartbeatData,
      protocol: 'modbus',
      receivedAt: new Date().toISOString()
    };
    
    await Database.query(
      `UPDATE devices SET last_seen_at = NOW() WHERE device_id = $1`,
      [deviceId]
    );
    
  } catch (error) {
    console.error('❌ Modbus 하트비트 처리 실패:', error);
  }
}

// 🔥 Modbus 응답 처리
async function handleModbusResponse(deviceId, message) {
  try {
    const modbusResponse = JSON.parse(message.toString());
    
    if (modbusResponse.function_code === 3 && modbusResponse.registers) {
      const collector = initModbusCollector(deviceId);
      
      const parsed = parseModbusRegisters(
        modbusResponse.registers,
        modbusResponse.start_address,
        deviceId
      );
      
      if (parsed) {
        if (parsed.type === 'system') {
          collector.systemInfo = parsed.data;
        } else if (parsed.type === 'sensor') {
          collector.sensors.set(parsed.data.sensor_id, parsed.data);
        }
        
        collector.lastUpdate = Date.now();
        scheduleModbusDataSave(deviceId);
        
        console.log(`✅ Modbus ${parsed.type} 데이터 수집: ${deviceId}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Modbus 응답 처리 실패:', error);
  }
}

// 🔥 Modbus 데이터 수집기 초기화
function initModbusCollector(deviceId) {
  if (!modbusSensorCollector.has(deviceId)) {
    modbusSensorCollector.set(deviceId, {
      sensors: new Map(),
      systemInfo: null,
      lastUpdate: Date.now(),
      timeout: null
    });
  }
  return modbusSensorCollector.get(deviceId);
}

// 🔥 Modbus 데이터 저장 스케줄링
function scheduleModbusDataSave(deviceId) {
  const collector = modbusSensorCollector.get(deviceId);
  if (!collector) return;
  
  if (collector.timeout) {
    clearTimeout(collector.timeout);
  }
  
  collector.timeout = setTimeout(async () => {
    await saveModbusCollectedData(deviceId);
  }, COLLECTION_TIMEOUT);
}

// 🔥 수집된 Modbus 데이터 저장
async function saveModbusCollectedData(deviceId) {
  const collector = modbusSensorCollector.get(deviceId);
  if (!collector || collector.sensors.size === 0) return;
  
  try {
    const allSensors = Array.from(collector.sensors.values());
    
    const combinedData = {
      device_id: deviceId,
      timestamp: Date.now(),
      protocol: 'modbus',
      sensor_count: allSensors.length,
      sensors: allSensors,
      system: collector.systemInfo,
      receivedAt: new Date().toISOString()
    };
    
    // 압축 저장
    await saveSensorDataToDB(deviceId, combinedData);
    
    // 캐시 업데이트
    latestSensorData[deviceId] = combinedData;
    updateSensorCache(deviceId, combinedData);
    
    // 알림 체크
    await alertRoutes.checkAlerts(deviceId, combinedData);
    
    // 수집기 초기화
    collector.sensors.clear();
    collector.systemInfo = null;
    
    console.log(`💾 Modbus 데이터 저장 완료: ${deviceId} (${allSensors.length}개 센서)`);
    
  } catch (error) {
    console.error('❌ Modbus 데이터 저장 실패:', error);
  }
}

// 🔥 레거시 형식을 새 형식으로 변환
function convertLegacyToNewFormat(legacyData) {
  const sensors = [];
  let sensorId = 0;
  
  // 기존 센서 데이터를 새 형식으로 변환
  if (legacyData.sensors) {
    legacyData.sensors.forEach(sensor => {
      sensors.push({
        sensor_id: sensorId++,
        name: sensor.name,
        type: sensor.type,
        channel: sensor.channel,
        address: sensor.address,
        active: sensor.active,
        values: sensor.values,
        value_names: getValueNamesForType(sensor.type)
      });
    });
  }
  
  return {
    device_id: legacyData.device_id,
    timestamp: legacyData.timestamp,
    sensor_count: sensors.length,
    sensors: sensors
  };
}

// 센서 타입별 값 이름 매핑
function getValueNamesForType(sensorType) {
  const typeMap = {
    1: ['temperature', 'humidity'],
    2: ['light_level'],
    3: ['voltage_0', 'voltage_1', 'ph', 'ec', 'temperature'],
    4: ['co2_ppm'],
    5: ['temperature', 'humidity'],
    6: ['pressure'],
    7: ['flow_rate'],
    8: ['relay_status'],
    9: ['voltage', 'current', 'power']
  };
  
  return typeMap[sensorType] || ['value'];
}

// Modbus 레지스터 파싱 (기존 코드 유지)
const MODBUS_SENSOR_TYPES = {
  0: { name: 'NONE', values: [] },
  1: { name: 'SHT20', values: ['temperature', 'humidity'] },
  2: { name: 'BH1750', values: ['light_level'] },
  3: { name: 'ADS1115', values: ['voltage_0', 'voltage_1'] },
  4: { name: 'BME280', values: ['temperature', 'humidity', 'pressure'] },
  5: { name: 'DS18B20', values: ['temperature'] },
  6: { name: 'PRESSURE', values: ['pressure'] },
  7: { name: 'FLOW', values: ['flow_rate'] },
  8: { name: 'RELAY', values: ['status'] },
  9: { name: 'ENERGY', values: ['voltage', 'current', 'power'] }
};

function parseModbusRegisters(registers, startAddr, deviceId) {
  // 시스템 레지스터 (40001-40010)
  if (startAddr === 40001) {
    const systemInfo = {
      device_status: registers[0] || 0,
      sensor_count: registers[1] || 0,
      firmware_version: registers[2] || 0,
      uptime_hours: registers[3] || 0,
      last_error: registers[4] || 0
    };
    
    return { type: 'system', data: systemInfo };
  }
  
  // 센서 레지스터 (40011부터)
  if (startAddr >= 40011 && registers.length >= 10) {
    const sensorId = Math.floor((startAddr - 40011) / 10);
    
    const sensorType = registers[0];
    const sensorStatus = registers[1];
    const sensorChannel = registers[2];
    const sensorAddress = registers[3];
    
    if (sensorType > 0 && sensorStatus > 0) {
      const value1 = registers[4] + (registers[5] / 100.0);
      const value2 = registers[6] + (registers[7] / 100.0);
      const lastRead = registers[8];
      const errorCode = registers[9];
      
      const sensorTypeInfo = MODBUS_SENSOR_TYPES[sensorType] || MODBUS_SENSOR_TYPES[0];
      const values = sensorTypeInfo.values.length > 1 ? [value1, value2] : [value1];
      
      const sensorData = {
        sensor_id: sensorId,
        name: `${sensorTypeInfo.name}_CH${sensorChannel}`,
        type: sensorType,
        channel: sensorChannel,
        address: sensorAddress,
        slave_id: sensorAddress, // Modbus에서는 address가 slave_id
        status: sensorStatus,
        active: sensorStatus === 1,
        values: values,
        value_names: sensorTypeInfo.values,
        registers: registers.slice(0, 10), // 원시 레지스터 값 저장
        last_read: lastRead,
        error_code: errorCode
      };
      
      return { type: 'sensor', data: sensorData };
    }
  }
  
  return null;
}

// 압축 저장 함수 (기존 유지)
async function saveSensorDataToDB(deviceId, sensorData) {
  try {
    let dataToStore = sensorData;
    
    // Modbus 데이터만 압축
    if (sensorData.protocol === 'modbus') {
      dataToStore = compressSensorData(sensorData);
    }
    
    await Database.query(
      `INSERT INTO sensor_data (device_id, timestamp, sensor_count, sensor_data) 
       VALUES ($1, $2, $3, $4)`,
      [
        deviceId,
        new Date(sensorData.timestamp),
        sensorData.sensor_count,
        JSON.stringify(dataToStore)
      ]
    );
    
    const dataSize = JSON.stringify(dataToStore).length;
    const originalSize = JSON.stringify(sensorData).length;
    const savings = Math.round((1 - dataSize/originalSize) * 100);
    
    console.log(`💾 ${sensorData.protocol} 센서 데이터 저장: ${deviceId} (${dataSize}/${originalSize} bytes, ${savings}% 절약)`);
    
  } catch (error) {
    console.error('❌ DB 저장 실패:', error);
    throw error;
  }
}

// 압축 함수들 (기존 유지)
function compressSensorData(sensorData) {
  return {
    d: sensorData.device_id,
    t: sensorData.timestamp,
    c: sensorData.sensor_count,
    s: {
      st: sensorData.system?.device_status || 0,
      sc: sensorData.system?.sensor_count || 0,
      fv: sensorData.system?.firmware_version || 0,
      uh: sensorData.system?.uptime_hours || 0,
      le: sensorData.system?.last_error || 0
    },
    sensors: sensorData.sensors.map(sensor => [
      sensor.sensor_id,
      sensor.type,
      sensor.channel,
      sensor.status,
      ...sensor.values.map(v => Math.round(v * 100))
    ])
  };
}

// API 라우트들 (기존 유지하되 새 센서 라우터로 위임)
router.get('/sensors', (req, res) => {
  res.json({
    success: true,
    data: latestSensorData,
    timestamp: new Date().toISOString()
  });
});

router.get('/sensors/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const data = latestSensorData[deviceId];
  
  if (data) {
    res.json({ success: true, data: data });
  } else {
    res.status(404).json({
      success: false,
      message: `디바이스 ${deviceId}의 센서 데이터를 찾을 수 없습니다.`
    });
  }
});

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: deviceStatus,
    timestamp: new Date().toISOString()
  });
});

router.get('/broker/status', (req, res) => {
  res.json({
    success: true,
    mqtt_connected: sensorMqttClient.connected,
    client_id: sensorMqttClient.options.clientId,
    connected_devices: Object.keys(latestSensorData).length,
    protocol_stats: {
      i2c_devices: Object.values(latestSensorData).filter(d => d.protocol === 'i2c').length,
      modbus_devices: Object.values(latestSensorData).filter(d => d.protocol === 'modbus').length,
      legacy_devices: Object.values(latestSensorData).filter(d => d.protocol === 'legacy').length
    },
    timestamp: new Date().toISOString()
  });
});

console.log('📊 프로토콜별 센서 데이터 MQTT API 등록 완료');

module.exports = router;