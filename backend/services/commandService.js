// services/commandService.js
class CommandService {
  
  // 즉시 Modbus 명령 전송
  static async sendImmediateModbusCommand(deviceId, commandData) {
    try {
      // 디바이스 IP 조회
      const device = await Database.query(
        'SELECT ip_address, port FROM devices WHERE device_id = $1',
        [deviceId]
      );
      
      if (device.length === 0) {
        return { success: false, error: 'Device not found' };
      }
      
      const deviceIP = device[0].ip_address;
      const devicePort = device[0].port || 80;
      
      // 🔥 타임아웃 컨트롤러 생성
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        // 텍스트 명령 전송
        if (commandData.type === 'text') {
          const commandText = `MODBUS:${commandData.slaveId},${commandData.functionCode},${commandData.address},${commandData.value}`;
          
          const response = await fetch(`http://${deviceIP}:${devicePort}/modbus-command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain'
            },
            body: commandText,
            signal: controller.signal // 🔥 AbortController 사용
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            console.log(`✅ Immediate command sent to ${deviceId}`);
            return { success: true, message: 'Command sent immediately' };
          } else {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
          }
        }
        
        // 바이너리 명령 전송
        if (commandData.type === 'binary') {
          const binaryFrame = this.createModbusRTUFrame(commandData);
          
          const response = await fetch(`http://${deviceIP}:${devicePort}/modbus-binary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream'
            },
            body: binaryFrame,
            signal: controller.signal // 🔥 AbortController 사용
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            console.log(`✅ Immediate binary command sent to ${deviceId}`);
            return { success: true, message: 'Binary command sent immediately' };
          } else {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
          }
        }
        
        clearTimeout(timeoutId);
        return { success: false, error: 'Invalid command type' };
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return { success: false, error: 'Request timeout (5s)' };
        }
        throw fetchError;
      }
      
    } catch (error) {
      console.error('Send immediate command error:', error);
      return { success: false, error: `Network error: ${error.message}` };
    }
  }
  
  // Modbus RTU 바이너리 프레임 생성
  static createModbusRTUFrame(commandData) {
    const frame = Buffer.alloc(8);
    
    frame[0] = commandData.slaveId;
    frame[1] = commandData.functionCode;
    frame.writeUInt16BE(commandData.address, 2);
    frame.writeUInt16BE(commandData.value, 4);
    
    // CRC-16 계산
    const crc = this.calculateCRC16(frame.slice(0, 6));
    frame.writeUInt16LE(crc, 6);
    
    return frame;
  }
  
  // CRC-16 계산 (Modbus 표준)
  static calculateCRC16(data) {
    let crc = 0xFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    
    return crc;
  }
}

module.exports = CommandService;