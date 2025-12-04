// routes/admin.js
const express = require('express');
const Database = require('../lib/database');
const { requireAdmin } = require('../middleware/adminAuth');
const { cacheMiddleware } = require('../middleware/cache');
const cache = require('../lib/cache');

const router = express.Router();

// 모든 admin 라우트에 권한 체크 적용
router.use(requireAdmin);

// 📊 시스템 통계 조회
// routes/admin.js에서 사용자 관련 쿼리들 수정

// 📊 시스템 통계 조회 - 수정된 버전
router.get('/stats', cacheMiddleware(300, () => 'admin:stats'), async (req, res) => {
  try {
    const stats = await Promise.all([
      Database.query('SELECT COUNT(*) as count FROM users'), // role 제거
      Database.query('SELECT COUNT(*) as count FROM admins WHERE is_active = true'),
      Database.query('SELECT COUNT(*) as count FROM devices'),
      Database.query('SELECT COUNT(*) as count FROM sensor_data WHERE created_at >= NOW() - INTERVAL \'24 hours\''),
      Database.query('SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL \'7 days\''),
      Database.query('SELECT COUNT(*) as count FROM devices WHERE created_at >= NOW() - INTERVAL \'7 days\'')
    ]);

    const [totalUsers, adminUsers, totalDevices, todaySensorData, newUsersWeek, newDevicesWeek] = stats;

    // 월별 가입자 통계
    const monthlyUsers = await Database.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as count
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers[0].count),
        adminUsers: parseInt(adminUsers[0].count),
        totalDevices: parseInt(totalDevices[0].count),
        todaySensorData: parseInt(todaySensorData[0].count),
        newUsersThisWeek: parseInt(newUsersWeek[0].count),
        newDevicesThisWeek: parseInt(newDevicesWeek[0].count),
        monthlyUsers: monthlyUsers
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회 중 오류가 발생했습니다.'
    });
  }
});

// 👥 사용자 목록 조회 - role 관련 부분 제거
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // 검색 조건 구성 (role 제거)
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // 전체 개수 조회
    const totalQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const totalResult = await Database.query(totalQuery, queryParams);
    const total = parseInt(totalResult[0].count);

    // 사용자 목록 조회 (role 제거)
    const validSortColumns = ['id', 'name', 'email', 'created_at', 'last_login'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const usersQuery = `
      SELECT 
        id, name, email, phone, created_at, last_login, last_ip,
        (SELECT COUNT(*) FROM devices WHERE registered_by = users.id) as device_count
      FROM users 
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const users = await Database.query(usersQuery, [...queryParams, limit, offset]);

    res.json({
      success: true,
      data: {
        users: users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 목록 조회 중 오류가 발생했습니다.'
    });
  }
});

// 👤 특정 사용자 상세 정보 조회 - role 제거
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 사용자 기본 정보 (role 제거)
    const users = await Database.query(`
      SELECT 
        id, name, email, phone, created_at, last_login, last_ip
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    const user = users[0];

    // 사용자의 디바이스 목록
    const devices = await Database.query(`
      SELECT 
        device_id, device_name, device_type, 
        created_at, last_seen_at
      FROM devices 
      WHERE registered_by = $1
      ORDER BY created_at DESC
    `, [userId]);

    // 사용자의 센서 데이터 통계
    const sensorStats = await Database.query(`
      SELECT 
        COUNT(*) as total_readings,
        COUNT(DISTINCT device_id) as active_devices,
        MAX(timestamp) as last_reading
      FROM sensor_data sd
      JOIN devices d ON sd.device_id = d.device_id
      WHERE d.registered_by = $1
    `, [userId]);

    // 최근 활동 (최근 10개 센서 데이터)
    const recentActivity = await Database.query(`
      SELECT 
        sd.device_id, d.device_name, sd.timestamp, sd.data
      FROM sensor_data sd
      JOIN devices d ON sd.device_id = d.device_id
      WHERE d.registered_by = $1
      ORDER BY sd.timestamp DESC
      LIMIT 10
    `, [userId]);

    res.json({
      success: true,
      data: {
        user,
        devices,
        stats: sensorStats[0] || { total_readings: 0, active_devices: 0, last_reading: null },
        recentActivity
      }
    });

  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 상세 정보 조회 중 오류가 발생했습니다.'
    });
  }
});

// ✏️ 사용자 정보 수정 - role 관련 기능 제거하고 기본 정보만
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone } = req.body; // role, isActive, notes 제거

    // 현재 사용자 확인
    const currentUsers = await Database.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (currentUsers.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    // 이메일 중복 확인 (본인 제외)
    if (email) {
      const existingUsers = await Database.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase(), userId]
      );
      
      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          error: '이미 사용 중인 이메일입니다.'
        });
      }
    }

    // 전화번호 중복 확인 (본인 제외)
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const existingUsers = await Database.query(
        'SELECT id FROM users WHERE phone = $1 AND id != $2',
        [cleanPhone, userId]
      );
      
      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          error: '이미 사용 중인 전화번호입니다.'
        });
      }
    }

    // 업데이트할 필드들 구성
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(name.trim());
      paramIndex++;
    }

    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      updateValues.push(email.toLowerCase());
      paramIndex++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`);
      updateValues.push(phone.replace(/[^0-9]/g, ''));
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: '업데이트할 정보가 없습니다.'
      });
    }

    updateValues.push(userId);
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, phone
    `;

    const updatedUsers = await Database.query(updateQuery, updateValues);
    const updatedUser = updatedUsers[0];

    console.log(`✅ Admin updated user: ${updatedUser.email} by ${req.admin.email}`);

    res.json({
      success: true,
      message: '사용자 정보가 성공적으로 수정되었습니다.',
      user: updatedUser
    });

  } catch (error) {
    console.error('Admin user update error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 정보 수정 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 사용자 비밀번호 업데이트 API
router.put('/users/:userId/password', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: '비밀번호는 8자 이상이어야 합니다.'
      });
    }

    // 사용자 존재 확인
    const users = await Database.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    const user = users[0];
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await Database.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    console.log(`✅ Admin updated password for user: ${user.email} by ${req.admin.email}`);

    res.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.'
    });

  } catch (error) {
    console.error('Admin password update error:', error);
    res.status(500).json({
      success: false,
      error: '비밀번호 변경 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 관리자용 장치 수정 API
router.put('/users/:userId/devices/:deviceId', async (req, res) => {
  try {
    const { userId, deviceId } = req.params;
    const { deviceName, adminName, deviceLocation } = req.body;

    // 입력 검증
    if (!deviceName || !deviceName.trim()) {
      return res.status(400).json({
        success: false,
        error: '장치 이름은 필수입니다.'
      });
    }

    // 사용자 소유 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id, device_name, admin_name, device_location FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '장치를 찾을 수 없습니다.'
      });
    }

    // 장치 정보 업데이트
    await Database.query(
      'UPDATE devices SET device_name = $1, admin_name = $2, device_location = $3 WHERE device_id = $4',
      [deviceName.trim(), adminName?.trim() || null, deviceLocation?.trim() || null, deviceId]
    );

    console.log(`✅ Admin updated device: ${deviceId} by ${req.admin.email}`);

    res.json({
      success: true,
      message: '장치 정보가 성공적으로 수정되었습니다.',
      updatedDevice: {
        deviceId,
        deviceName: deviceName.trim(),
        adminName: adminName?.trim() || null,
        deviceLocation: deviceLocation?.trim() || null
      }
    });

  } catch (error) {
    console.error('Admin device update error:', error);
    res.status(500).json({
      success: false,
      error: '장치 정보 수정 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 관리자용 장치 삭제 API
router.delete('/users/:userId/devices/:deviceId', async (req, res) => {
  try {
    const { userId, deviceId } = req.params;

    // 사용자 소유 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id, device_name FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '장치를 찾을 수 없습니다.'
      });
    }

    const device = deviceCheck[0];

    // 트랜잭션으로 관련 데이터 모두 삭제
    await Database.query('BEGIN');

    try {
      // 관련 데이터 삭제
      await Database.query('DELETE FROM device_group_members WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM user_device_favorites WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM sensor_data WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM command_logs WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM pending_commands WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM alert_logs WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM alert_settings WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM device_status_logs WHERE device_id = $1', [deviceId]);
      await Database.query('DELETE FROM devices WHERE device_id = $1', [deviceId]);

      await Database.query('COMMIT');

      console.log(`✅ Admin deleted device: ${device.device_name} (${deviceId}) by ${req.admin.email}`);

      res.json({
        success: true,
        message: `장치 "${device.device_name}"가 성공적으로 삭제되었습니다.`
      });

    } catch (error) {
      await Database.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Admin device delete error:', error);
    res.status(500).json({
      success: false,
      error: '장치 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 센서 데이터 히스토리 API (압축 해제 포함)
// routes/admin.js에서 센서 데이터 히스토리 API 수정

// 🔥 센서 데이터 히스토리 API (압축 해제 포함)
router.get('/users/:userId/devices/:deviceId/sensor-history', async (req, res) => {
  try {
    const { userId, deviceId } = req.params;
    const { limit = 30 } = req.query;

    // 사용자 소유 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id, device_name FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '장치를 찾을 수 없습니다.'
      });
    }

    // 🔥 압축된 센서 데이터 조회
    const sensorHistory = await Database.query(`
      SELECT 
        timestamp,
        created_at,
        sensor_count,
        sensor_data,
        protocol
      FROM sensor_data 
      WHERE device_id = $1 AND protocol = 'unified'
      ORDER BY created_at DESC 
      LIMIT $2
    `, [deviceId, parseInt(limit)]);

    // 🔥 압축 해제 함수 (수정된 버전)
    function decompressUnifiedData(compressed) {
      return {
        device_id: compressed.d,
        timestamp: compressed.t,
        sensor_count: compressed.c,
        protocols: compressed.p,
        sensors: compressed.s.map(s => {
          const sensorType = s[1];
          const rawValues = s.slice(4);
          
          // 🔥 센서 타입별 값 변환 (압축 시 모든 값에 100을 곱했으므로 해제 시 100으로 나누기)
          let values = [];
          let valueNames = [];
          
          switch (sensorType) {
            case 1: // SHT20 - 온도/습도
              values = [rawValues[0] / 100, rawValues[1] / 100];
              valueNames = ['temperature', 'humidity'];
              break;
            case 2: // BH1750 - 조도 🔥 수정: 압축 해제 시 100으로 나눈 후 다시 10으로 나누기
              values = [(rawValues[0] / 100)];
              valueNames = ['light_level'];
              break;
            case 3: // ADS1115 - pH/EC
              values = [rawValues[0] / 100, (rawValues[1] / 100) / 100]; // EC: µS/cm → dS/m
              valueNames = ['ph', 'ec'];
              break;
            case 4: // SCD30 - CO2 🔥 수정: 압축 해제 시 100으로 나누기
              values = [rawValues[0] / 100];
              valueNames = ['co2_ppm'];
              break;
            case 5: // DS18B20 - 온도
              values = [rawValues[0] / 100];
              valueNames = ['temperature'];
              break;
            default:
              if (sensorType >= 11) { // Modbus 센서들
                values = [rawValues[0] / 100, rawValues[1] / 100];
                valueNames = ['value1', 'value2'];
              } else {
                values = [rawValues[0] / 100, rawValues[1] / 100];
                valueNames = ['value1', 'value2'];
              }
              break;
          }
          
          return {
            sensor_id: s[0],
            name: `SENSOR_${sensorType}_CH${s[2]}`,
            type: sensorType,
            channel: s[2],
            status: s[3],
            active: s[3] === 1,
            values: values,
            value_names: valueNames
          };
        })
      };
    }

    // 🔥 압축 해제하여 반환
    const processedHistory = sensorHistory.map(row => {
      try {
        const decompressed = decompressUnifiedData(row.sensor_data);
        return {
          ...decompressed,
          stored_at: row.created_at,
          original_timestamp: row.timestamp
        };
      } catch (error) {
        console.error('센서 데이터 압축 해제 실패:', error);
        return null;
      }
    }).filter(Boolean);

    res.json({
      success: true,
      device: deviceCheck[0],
      history: processedHistory,
      count: processedHistory.length
    });

  } catch (error) {
    console.error('Sensor history error:', error);
    res.status(500).json({
      success: false,
      error: '센서 데이터 히스토리 조회 중 오류가 발생했습니다.'
    });
  }
});
// 🗑️ 사용자 삭제 (실제로는 비활성화)
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 자기 자신을 삭제하려는 경우 방지
    if (req.user.id == userId) {
      return res.status(400).json({
        success: false,
        error: '자신의 계정을 삭제할 수 없습니다.'
      });
    }

    // 사용자 존재 확인
    const users = await Database.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    const user = users[0];

    // 비활성화 처리
    await Database.query(
      'UPDATE users SET is_active = false, notes = COALESCE(notes, \'\') || $1 WHERE id = $2',
      [`\n[${new Date().toISOString()}] Admin ${req.user.email}에 의해 비활성화됨`, userId]
    );

    // 캐시 무효화
    await cache.del(`user:profile:${userId}`);

    console.log(`✅ Admin deactivated user: ${user.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: '사용자가 성공적으로 비활성화되었습니다.'
    });

  } catch (error) {
    console.error('Admin user delete error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 📱 특정 사용자의 디바이스 목록 조회
// routes/admin.js에서 사용자의 디바이스 목록 조회 API 수정

// 📱 특정 사용자의 디바이스 목록 조회
router.get('/users/:userId/devices', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // 사용자 존재 확인
    const users = await Database.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    // 🔥 실제 존재하는 컬럼만 조회하도록 수정
    const devices = await Database.query(`
      SELECT 
        d.device_id, 
        d.device_name, 
        d.device_type,
        d.admin_name,
        d.device_location,
        d.created_at, 
        d.last_seen_at,
        d.last_seen_ip,
        (SELECT COUNT(*) FROM sensor_data WHERE device_id = d.device_id) as total_readings,
        (SELECT MAX(timestamp) FROM sensor_data WHERE device_id = d.device_id) as last_reading
      FROM devices d
      WHERE d.registered_by = $1
      ORDER BY d.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // 전체 개수
    const totalResult = await Database.query(
      'SELECT COUNT(*) as count FROM devices WHERE registered_by = $1',
      [userId]
    );
    const total = parseInt(totalResult[0].count);

    res.json({
      success: true,
      data: {
        user: users[0],
        devices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Admin user devices error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 디바이스 목록 조회 중 오류가 발생했습니다.'
    });
  }
});

// 📊 특정 사용자의 센서 데이터 통계
router.get('/users/:userId/sensor-stats', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '7d' } = req.query;

    // 기간별 설정
    let intervalClause;
    switch (period) {
      case '24h':
        intervalClause = "NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        intervalClause = "NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        intervalClause = "NOW() - INTERVAL '30 days'";
        break;
      default:
        intervalClause = "NOW() - INTERVAL '7 days'";
    }

    // 사용자의 센서 데이터 통계
    const stats = await Database.query(`
      SELECT 
        COUNT(*) as total_readings,
        COUNT(DISTINCT sd.device_id) as active_devices,
        DATE_TRUNC('day', sd.timestamp) as date,
        COUNT(*) as daily_count
      FROM sensor_data sd
      JOIN devices d ON sd.device_id = d.device_id
      WHERE d.registered_by = $1 AND sd.timestamp >= ${intervalClause}
      GROUP BY DATE_TRUNC('day', sd.timestamp)
      ORDER BY date DESC
    `, [userId]);

    // 디바이스별 통계
    const deviceStats = await Database.query(`
      SELECT 
        d.device_id, d.device_name,
        COUNT(sd.*) as reading_count,
        MAX(sd.timestamp) as last_reading
      FROM devices d
      LEFT JOIN sensor_data sd ON d.device_id = sd.device_id 
        AND sd.timestamp >= ${intervalClause}
      WHERE d.registered_by = $1
      GROUP BY d.device_id, d.device_name
      ORDER BY reading_count DESC
    `, [userId]);

    res.json({
      success: true,
      data: {
        period,
        dailyStats: stats,
        deviceStats
      }
    });

  } catch (error) {
    console.error('Admin user sensor stats error:', error);
    res.status(500).json({
      success: false,
      error: '센서 데이터 통계 조회 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;