// websocket/sensorWebSocket.js
const WebSocket = require('ws');
const mqtt = require('mqtt');

class SensorWebSocketServer {
  constructor(port = 8080) {
    this.wss = new WebSocket.Server({ port });
    this.clients = new Map(); // clientId -> { ws, deviceFilters, userInfo }
    this.sensorData = new Map(); // deviceId -> latest sensor data
    
    this.setupMQTTConnection();
    this.setupWebSocketServer();
    
    console.log(`🌐 WebSocket 서버가 포트 ${port}에서 시작되었습니다.`);
  }

  setupMQTTConnection() {
    this.mqttClient = mqtt.connect('mqtt://localhost:1883');
    
    this.mqttClient.on('connect', () => {
      console.log('📡 WebSocket 서버 MQTT 연결됨');
      
      // 센서 데이터 구독
      this.mqttClient.subscribe('sensors/binary/+');
      this.mqttClient.subscribe('modbus/responses/+');
      this.mqttClient.subscribe('device/status/+');
    });

    this.mqttClient.on('message', (topic, message) => {
      this.handleMQTTMessage(topic, message);
    });
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      
      console.log(`🔌 새 WebSocket 클라이언트 연결: ${clientId}`);
      
      // 클라이언트 정보 저장
      this.clients.set(clientId, {
        ws: ws,
        deviceFilters: [], // 구독할 디바이스 목록
        userInfo: null,    // 인증 후 사용자 정보
        connectedAt: new Date()
      });

      // 연결 확인 메시지
      this.sendToClient(clientId, {
        type: 'connection',
        status: 'connected',
        clientId: clientId,
        timestamp: new Date().toISOString()
      });

      // 메시지 핸들러
      ws.on('message', (data) => {
        this.handleClientMessage(clientId, data);
      });

      // 연결 종료 핸들러
      ws.on('close', () => {
        console.log(`🔌 WebSocket 클라이언트 연결 종료: ${clientId}`);
        this.clients.delete(clientId);
      });

      // 에러 핸들러
      ws.on('error', (error) => {
        console.error(`❌ WebSocket 클라이언트 오류 ${clientId}:`, error);
      });
    });
  }

  handleMQTTMessage(topic, message) {
    try {
      if (topic.startsWith('sensors/binary/')) {
        const deviceId = topic.split('/')[2];
        const sensorData = this.parseBinarySensorData(message, deviceId);
        
        if (sensorData) {
          this.sensorData.set(deviceId, sensorData);
          
          // 해당 디바이스를 구독하는 클라이언트들에게 전송
          this.broadcastToSubscribers('sensor_data', {
            deviceId: deviceId,
            data: sensorData
          });
        }
      }
      
      else if (topic.startsWith('modbus/responses/')) {
        const deviceId = topic.split('/')[2];
        const response = JSON.parse(message.toString());
        
        this.broadcastToSubscribers('modbus_response', {
          deviceId: deviceId,
          response: response
        });
      }
      
      else if (topic.startsWith('device/status/')) {
        const deviceId = topic.split('/')[2];
        const status = JSON.parse(message.toString());
        
        this.broadcastToSubscribers('device_status', {
          deviceId: deviceId,
          status: status
        });
      }
      
    } catch (error) {
      console.error('MQTT 메시지 처리 오류:', error);
    }
  }

  handleClientMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (message.type) {
        case 'auth':
          this.handleAuth(clientId, message);
          break;
          
        case 'subscribe_devices':
          this.handleDeviceSubscription(clientId, message);
          break;
          
        case 'get_latest_data':
          this.handleGetLatestData(clientId, message);
          break;
          
        case 'send_modbus_command':
          this.handleModbusCommand(clientId, message);
          break;
          
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        default:
          this.sendToClient(clientId, {
            type: 'error',
            message: `알 수 없는 메시지 타입: ${message.type}`
          });
      }
      
    } catch (error) {
      console.error(`클라이언트 메시지 처리 오류 ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        message: '메시지 파싱 오류'
      });
    }
  }

  handleAuth(clientId, message) {
    // JWT 토큰 검증 로직
    const { token } = message;
    
    // 실제 구현에서는 JWT 검증
    // const userInfo = verifyJWT(token);
    
    const client = this.clients.get(clientId);
    if (client) {
      client.userInfo = { id: 'user123', name: 'Test User' }; // 임시
      
      this.sendToClient(clientId, {
        type: 'auth_success',
        user: client.userInfo
      });
    }
  }

  handleDeviceSubscription(clientId, message) {
    const { deviceIds } = message;
    const client = this.clients.get(clientId);
    
    if (client && Array.isArray(deviceIds)) {
      client.deviceFilters = deviceIds;
      
      this.sendToClient(clientId, {
        type: 'subscription_updated',
        subscribedDevices: deviceIds
      });
      
      // 구독한 디바이스들의 최신 데이터 즉시 전송
      deviceIds.forEach(deviceId => {
        const latestData = this.sensorData.get(deviceId);
        if (latestData) {
          this.sendToClient(clientId, {
            type: 'sensor_data',
            deviceId: deviceId,
            data: latestData
          });
        }
      });
    }
  }

  handleGetLatestData(clientId, message) {
    const { deviceId } = message;
    
    if (deviceId) {
      const data = this.sensorData.get(deviceId);
      this.sendToClient(clientId, {
        type: 'latest_data_response',
        deviceId: deviceId,
        data: data || null
      });
    } else {
      // 모든 디바이스 데이터
      const allData = {};
      this.sensorData.forEach((value, key) => {
        allData[key] = value;
      });
      
      this.sendToClient(clientId, {
        type: 'all_latest_data',
        data: allData
      });
    }
  }

  handleModbusCommand(clientId, message) {
    const { deviceId, command } = message;
    
    // MQTT로 Modbus 명령 전송
    const commandTopic = `modbus/commands/${deviceId}`;
    this.mqttClient.publish(commandTopic, JSON.stringify(command));
    
    this.sendToClient(clientId, {
      type: 'command_sent',
      deviceId: deviceId,
      command: command
    });
  }

  parseBinarySensorData(binaryBuffer, deviceId) {
    // 이전에 구현한 바이너리 파싱 로직과 동일
    if (binaryBuffer.length !== 36) return null;
    
    const receivedCRC = binaryBuffer.readUInt32LE(32);
    const calculatedCRC = this.calculateCRC32(binaryBuffer.slice(0, 32));
    
    if (receivedCRC !== calculatedCRC) return null;
    
    return {
      deviceId: deviceId,
      temperature: binaryBuffer.readUInt16LE(16) / 10.0,
      humidity: binaryBuffer.readUInt16LE(18) / 10.0,
      waterTemp: binaryBuffer.readUInt16LE(20) / 10.0,
      lightLevel: binaryBuffer.readUInt16LE(22),
      ec: binaryBuffer.readUInt16LE(24),
      ph: binaryBuffer.readUInt16LE(26) / 100.0,
      deviceTimestamp: binaryBuffer.readUInt32LE(28),
      serverTimestamp: new Date().toISOString(),
      crc32: receivedCRC
    };
  }

  calculateCRC32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320;
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  broadcastToSubscribers(type, data) {
    const message = {
      type: type,
      ...data,
      timestamp: new Date().toISOString()
    };

    this.clients.forEach((client, clientId) => {
      // 디바이스 필터 확인
      if (data.deviceId && client.deviceFilters.length > 0) {
        if (!client.deviceFilters.includes(data.deviceId)) {
          return; // 구독하지 않은 디바이스
        }
      }
      
      this.sendToClient(clientId, message);
    });
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`클라이언트 ${clientId} 전송 오류:`, error);
      }
    }
  }

  generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
  }

  getConnectionStats() {
    return {
      connectedClients: this.clients.size,
      deviceCount: this.sensorData.size,
      uptime: process.uptime()
    };
  }
}

module.exports = SensorWebSocketServer;