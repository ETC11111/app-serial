// services/modbusService.js (수정 완료)
const Database = require('../lib/database');

class ModbusService {
  // 디바이스 명령 큐 조회
  static async getPendingCommands(deviceId) {
    try {
      const commands = await Database.query(
        'SELECT * FROM pending_commands WHERE device_id = $1 ORDER BY created_at',
        [deviceId]
      );
      
      return {
        success: true,
        commands: commands // 이미 배열이므로 그대로 사용
      };
    } catch (error) {
      console.error('Get pending commands error:', error);
      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // 명령 큐에서 삭제
  static async clearCommands(deviceId) {
    try {
      const result = await Database.query(
        'DELETE FROM pending_commands WHERE device_id = $1',
        [deviceId]
      );
      
      return { 
        success: true,
        deletedCount: result.length // 삭제된 행의 개수
      };
    } catch (error) {
      console.error('Clear commands error:', error);
      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // 명령 큐에 추가
  static async queueCommand(deviceId, commandData) {
    try {
      const { slaveId, functionCode, address, value } = commandData;
      
      const result = await Database.query(
        `INSERT INTO pending_commands (device_id, slave_id, function_code, address, value) 
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [deviceId, slaveId, functionCode, address, value]
      );
      
      return {
        success: true,
        command: result[0], // 🔥 수정: result[0]으로 첫 번째 행 접근
        message: 'Command queued successfully'
      };
    } catch (error) {
      console.error('Queue command error:', error);
      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // 큐 상태 조회
  static async getQueueStatus(deviceId) {
    try {
      const result = await Database.query(
        'SELECT COUNT(*) as count FROM pending_commands WHERE device_id = $1',
        [deviceId]
      );
      
      return {
        success: true,
        deviceId,
        queueCount: parseInt(result[0].count), // 🔥 수정: result[0].count
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Get queue status error:', error);
      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // 명령 실행 로그 저장 (선택사항)
  static async logCommandExecution(deviceId, commandData, success, response) {
    try {
      const { slaveId, functionCode, address, value } = commandData;
      
      // command_logs 테이블이 있다면 로그 저장
      await Database.query(
        `INSERT INTO command_logs (device_id, slave_id, function_code, address, value, success, response, executed_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [deviceId, slaveId, functionCode, address, value, success, response || null]
      );
      
      return { success: true };
    } catch (error) {
      // 로그 저장 실패는 무시 (선택적 기능)
      console.warn('Log command execution warning:', error.message);
      return { success: false };
    }
  }

  // 디바이스별 명령 통계 (선택사항)
  static async getCommandStats(deviceId, userId, hours = 24) {
    try {
      // 사용자 권한 확인
      const deviceCheck = await Database.query(
        'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
        [deviceId, userId]
      );

      if (deviceCheck.length === 0) {
        return {
          success: false,
          error: '디바이스를 찾을 수 없습니다.'
        };
      }

      const stats = await Database.query(
        `SELECT
          COUNT(*) as total_commands,
          COUNT(CASE WHEN success = true THEN 1 END) as successful_commands,
          COUNT(CASE WHEN success = false THEN 1 END) as failed_commands
         FROM command_logs
         WHERE device_id = $1
         AND executed_at > NOW() - INTERVAL '${hours} hours'`,
        [deviceId]
      );

      return {
        success: true,
        stats: stats[0], // 🔥 수정: stats[0]
        deviceId: deviceId,
        timeRange: `${hours} hours`
      };

    } catch (error) {
      console.error('Get command stats error:', error);
      return {
        success: false,
        error: '명령 통계 조회 중 오류가 발생했습니다.'
      };
    }
  }

  // 오래된 명령 정리 (선택사항)
  static async cleanupOldCommands(hoursToKeep = 24) {
    try {
      const result = await Database.query(
        `DELETE FROM pending_commands
         WHERE created_at < NOW() - INTERVAL '${hoursToKeep} hours'`
      );

      return {
        success: true,
        message: `Cleaned up old pending commands`,
        deletedCount: result.length // 🔥 수정: result.length
      };

    } catch (error) {
      console.error('Cleanup old commands error:', error);
      return {
        success: false,
        error: 'Failed to cleanup old commands'
      };
    }
  }
}

module.exports = ModbusService;
