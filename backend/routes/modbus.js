// routes/modbus.js - 명령 응답만 처리하도록 수정
const express = require('express');
const mqtt = require('mqtt');
const Database = require('../lib/database');
const ModbusService = require('../services/modbusService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// MQTT 클라이언트 설정 (제어 명령 전용)
const commandMqttClient = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'modbus_controller_' + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  keepalive: 60
});

// 명령 응답만 저장
let mqttConnected = false;
let commandResponses = new Map();
let pendingCommands = new Map(); // 🔥 보낸 명령 추적

commandMqttClient.on('connect', () => {
  console.log('✅ MQTT Modbus 제어 클라이언트 연결됨');
  mqttConnected = true;
  
  // 🔥 명령 응답만 구독 (센서 데이터 제외)
  commandMqttClient.subscribe('modbus/command-responses/+', (err) => {
    if (!err) {
      console.log('📡 Modbus 명령 응답 토픽 구독 완료');
    } else {
      console.error('❌ Modbus 명령 응답 구독 실패:', err);
    }
  });
});

commandMqttClient.on('disconnect', () => {
  console.log('❌ MQTT Modbus 제어 클라이언트 연결 해제');
  mqttConnected = false;
});

// 🔥 명령 응답만 처리 (센서 데이터 제외)
commandMqttClient.on('message', (topic, message) => {
  if (topic.startsWith('modbus/command-responses/')) {
    const deviceId = topic.split('/')[2];
    console.log(`📨 Modbus 명령 응답 수신 from ${deviceId}:`, message.toString());
    
    try {
      const response = JSON.parse(message.toString());
      
      // 🔥 명령 응답인지 확인 (특정 필드 검증)
      if (response.command_id || response.is_command_response) {
        // 응답을 임시 저장
        commandResponses.set(deviceId, {
          ...response,
          receivedAt: new Date().toISOString()
        });
        
        // 🔥 명령 로그 저장 (필요한 필드 확인 후)
        if (response.slave_id && response.function_code && response.address !== undefined) {
          ModbusService.logCommandExecution(
            deviceId, 
            {
              slaveId: response.slave_id,
              functionCode: response.function_code,
              address: response.address,
              value: response.value || 0
            },
            response.success !== false, 
            message.toString()
          ).catch(error => {
            console.error('❌ 명령 로그 저장 실패:', error);
          });
        }
      } else {
        console.log(`⏭️  센서 데이터 응답 무시: ${deviceId}`);
      }
      
    } catch (error) {
      console.error('❌ Modbus 명령 응답 파싱 오류:', error);
    }
  }
});

// 🔥 1. MQTT로 명령 전송 (수정)
router.post('/send-command/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { slaveId, functionCode, address, value } = req.body;
    
    // 입력 검증
    if (!slaveId || !functionCode || address === undefined) {
      return res.status(400).json({
        success: false,
        error: 'slaveId, functionCode, address는 필수입니다.'
      });
    }
    
    // 사용자 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없거나 권한이 없습니다.'
      });
    }
    
    // MQTT 연결 확인
    if (!mqttConnected) {
      return res.status(503).json({
        success: false,
        error: 'MQTT 서버에 연결되지 않았습니다.'
      });
    }
    
    console.log(`🔧 Sending Modbus command to ${deviceId}:`, {
      slaveId, functionCode, address, value
    });
    
    // 🔥 명령 ID 생성
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // MQTT로 명령 전송
    const commandTopic = `modbus/commands/${deviceId}`;
    const command = {
      command_id: commandId, // 🔥 명령 식별자 추가
      slave_id: parseInt(slaveId),
      function_code: parseInt(functionCode),
      address: parseInt(address),
      value: parseInt(value) || 0,
      timestamp: new Date().toISOString(),
      user_id: req.user.id,
      is_control_command: true // 🔥 제어 명령임을 명시
    };
    
    // 🔥 보낸 명령 추적
    pendingCommands.set(commandId, {
      deviceId,
      command,
      sentAt: new Date().toISOString()
    });
    
    commandMqttClient.publish(commandTopic, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error('❌ MQTT 명령 전송 실패:', err);
        pendingCommands.delete(commandId);
        return res.status(500).json({
          success: false,
          error: 'MQTT 명령 전송 실패'
        });
      }
      
      console.log(`✅ Modbus 명령 전송 완료: ${deviceId} (${commandId})`);
    });
    
    res.json({
      success: true,
      message: `Modbus 명령이 ${deviceId}에 전송되었습니다.`,
      command_id: commandId,
      command: command
    });
    
  } catch (error) {
    console.error('❌ Send Modbus command error:', error);
    res.status(500).json({ 
      success: false, 
      error: '서버 내부 오류' 
    });
  }
});

// 🔥 2. LED 제어 (수정)
router.post('/led/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { state } = req.body;
    
    if (!state || !['on', 'off'].includes(state)) {
      return res.status(400).json({
        success: false,
        error: 'state는 "on" 또는 "off"여야 합니다.'
      });
    }
    
    // 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없거나 권한이 없습니다.'
      });
    }
    
    const commandId = `led_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const commandTopic = `modbus/commands/${deviceId}`;
    const command = {
      command_id: commandId,
      slave_id: 1,
      function_code: 5, // Write Single Coil
      address: 1,       // LED 주소
      value: state === 'on' ? 1 : 0,
      timestamp: new Date().toISOString(),
      user_id: req.user.id,
      is_control_command: true,
      control_type: 'led'
    };
    
    pendingCommands.set(commandId, {
      deviceId,
      command,
      sentAt: new Date().toISOString()
    });
    
    commandMqttClient.publish(commandTopic, JSON.stringify(command), { qos: 1 });
    
    res.json({
      success: true,
      message: `LED ${state} 명령이 전송되었습니다.`,
      command_id: commandId,
      command: command
    });
    
  } catch (error) {
    console.error('❌ LED control error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'LED 제어 실패' 
    });
  }
});

// 🔥 3. 릴레이 제어 (수정)
router.post('/relay/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { relay, state } = req.body;
    
    if (!relay || !state || !['on', 'off'].includes(state)) {
      return res.status(400).json({
        success: false,
        error: 'relay 번호와 state("on"/"off")가 필요합니다.'
      });
    }
    
    const relayNum = parseInt(relay);
    if (relayNum < 1 || relayNum > 8) {
      return res.status(400).json({
        success: false,
        error: '릴레이 번호는 1-8 사이여야 합니다.'
      });
    }
    
    // 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없거나 권한이 없습니다.'
      });
    }
    
    const commandId = `relay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const commandTopic = `modbus/commands/${deviceId}`;
    const command = {
      command_id: commandId,
      slave_id: 1,
      function_code: 5, // Write Single Coil
      address: relayNum + 1, // 릴레이 주소
      value: state === 'on' ? 1 : 0,
      timestamp: new Date().toISOString(),
      user_id: req.user.id,
      is_control_command: true,
      control_type: 'relay',
      relay_number: relayNum
    };
    
    pendingCommands.set(commandId, {
      deviceId,
      command,
      sentAt: new Date().toISOString()
    });
    
    commandMqttClient.publish(commandTopic, JSON.stringify(command), { qos: 1 });
    
    res.json({
      success: true,
      message: `릴레이 ${relay} ${state} 명령이 전송되었습니다.`,
      command_id: commandId,
      command: command
    });
    
  } catch (error) {
    console.error('❌ Relay control error:', error);
    res.status(500).json({ 
      success: false, 
      error: '릴레이 제어 실패' 
    });
  }
});

// 🔥 4. 큐 기반 명령 (나중에 처리)
router.post('/queue-command/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { slaveId, functionCode, address, value } = req.body;
    
    // 사용자 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없습니다.'
      });
    }
    
    const result = await ModbusService.queueCommand(deviceId, {
      slaveId, functionCode, address, value
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Queue command error:', error);
    res.status(500).json({ 
      success: false, 
      error: '명령 큐 추가 실패' 
    });
  }
});

// 🔥 5. 대기 중인 명령 조회
router.get('/pending/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 사용자 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없습니다.'
      });
    }
    
    const result = await ModbusService.getPendingCommands(deviceId);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Get pending commands error:', error);
    res.status(500).json({ 
      success: false, 
      error: '대기 명령 조회 실패' 
    });
  }
});

// 🔥 6. 명령 큐 상태
router.get('/queue-status/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const result = await ModbusService.getQueueStatus(deviceId);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Get queue status error:', error);
    res.status(500).json({ 
      success: false, 
      error: '큐 상태 조회 실패' 
    });
  }
});

// 🔥 7. 최근 명령 응답 조회 (수정)
router.get('/responses/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없습니다.'
      });
    }
    
    // 🔥 명령 응답만 반환
    const response = commandResponses.get(deviceId);
    
    res.json({
      success: true,
      deviceId: deviceId,
      latestCommandResponse: response || null,
      hasResponse: !!response,
      pendingCommands: Array.from(pendingCommands.values())
        .filter(cmd => cmd.deviceId === deviceId)
        .length
    });
    
  } catch (error) {
    console.error('❌ Get command responses error:', error);
    res.status(500).json({ 
      success: false, 
      error: '명령 응답 조회 실패' 
    });
  }
});


// 🔥 8. 명령 통계
router.get('/stats/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { hours = 24 } = req.query;
    
    const result = await ModbusService.getCommandStats(
      deviceId, 
      req.user.id, 
      parseInt(hours)
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Get command stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: '명령 통계 조회 실패' 
    });
  }
});

// 🔥 9. MQTT 연결 상태 확인
router.get('/mqtt-status', (req, res) => {
  res.json({
    success: true,
    connected: mqttConnected,
    clientId: mqttClient.options.clientId,
    timestamp: new Date().toISOString()
  });
});

// 🔥 10. 명령 큐 정리
router.delete('/cleanup/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 사용자 권한 확인
    const deviceCheck = await Database.query(
      'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, req.user.id]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '디바이스를 찾을 수 없습니다.'
      });
    }
    
    const result = await ModbusService.clearCommands(deviceId);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Clear commands error:', error);
    res.status(500).json({ 
      success: false, 
      error: '명령 큐 정리 실패' 
    });
  }
});

module.exports = router;