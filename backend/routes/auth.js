const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const cache = require('../lib/cache');

const router = express.Router();
// 로그인 시에도 IP 업데이트
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.ip ||
         req.connection.remoteAddress ||
         '127.0.0.1';
}
function validatePhoneNumber(phone) {
  if (!phone) {
    return { isValid: false, error: '전화번호가 필요합니다.' };
  }

  // 전화번호에서 숫자만 추출
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  
  // 길이 체크 (10~11자리)
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { isValid: false, error: '전화번호는 10-11자리 숫자여야 합니다.' };
  }
  
  // 한국 휴대폰 번호 패턴 체크
  if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
    return { isValid: false, error: '올바른 휴대폰 번호 형식이 아닙니다. (010, 011, 016, 017, 018, 019)' };
  }
  
  return { isValid: true, cleanPhone };
}

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 회원가입 (SMS 인증 필요)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - phone
 *               - isPhoneVerified
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: password123
 *               name:
 *                 type: string
 *                 example: 홍길동
 *               phone:
 *                 type: string
 *                 pattern: '^01[0-9]{8,9}$'
 *                 example: '01012345678'
 *               isPhoneVerified:
 *                 type: boolean
 *                 description: 전화번호 인증 완료 여부 (true여야 함)
 *                 example: true
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 회원가입이 완료되었습니다.
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: 잘못된 요청 (중복 이메일, 전화번호 미인증 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// 🔥 회원가입 API (SMS 인증 포함 - 이것만 유지)
router.post('/register', async (req, res) => {
  try {
    // const { email, password, name, phone, isPhoneVerified } = req.body;
    let email, password, name, phone, isPhoneVerified;
    ({ email, password, name, phone, isPhoneVerified } = req.body);
    // Content-Type에 따라 다르게 처리
    const contentType = req.headers['content-type'];
    
    if (contentType?.includes('application/json')) {
      // JSON 형식
      ({ email, password, name, phone, isPhoneVerified } = req.body);
    } else if (contentType?.includes('multipart/form-data')) {
      // Form-data 형식
      email = req.body.email;
      password = req.body.password;
      name = req.body.name;
      phone = req.body.phone;
      isPhoneVerified = req.body.isPhoneVerified === 'true'; // 문자열을 boolean으로 변환
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      // URL-encoded 형식
      ({ email, password, name, phone, isPhoneVerified } = req.body);
    } else {
      return res.status(400).json({
        success: false,
        error: '지원하지 않는 Content-Type입니다.'
      });
    }
    
    //console.log('Received data:', { email, password: !!password, name });


    if (!email || !password || !name || !phone) {
      return res.status(400).json({
        success: false,
        error: '모든 필드를 입력해주세요.'
      });
    }

    // 전화번호 유효성 검사
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: phoneValidation.error
      });
    }
    const cleanPhone = phoneValidation.cleanPhone;

    // 전화번호 인증 확인
    if (!isPhoneVerified) {
      return res.status(400).json({
        success: false,
        error: '전화번호 인증을 완료해주세요.'
      });
    }

    // 이메일 유효성 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: '올바른 이메일 형식이 아닙니다.'
      });
    }

    // 비밀번호 강도 검사
    if (password.length < 6) { // 프론트엔드와 맞춤
      return res.status(400).json({
        success: false,
        error: '비밀번호는 6자 이상이어야 합니다.'
      });
    }

    // 이메일 중복 확인
    const existingEmailUsers = await Database.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingEmailUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: '이미 사용 중인 이메일입니다.'
      });
    }

    // 전화번호 중복 확인
    const existingPhoneUsers = await Database.query(
      'SELECT id FROM users WHERE phone = $1',
      [cleanPhone]
    );
    
    if (existingPhoneUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: '이미 사용 중인 전화번호입니다.'
      });
    }
    
    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 사용자 생성
    const newUsers = await Database.query(
      'INSERT INTO users (email, password, name, phone, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, email, name, phone, created_at',
      [email.toLowerCase(), hashedPassword, name.trim(), cleanPhone]
    );
    
    const newUser = newUsers[0];
    
    //console.log(`✅ New user registered: ${newUser.email}, phone: ${newUser.phone}`);
    
    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        phone: newUser.phone
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '회원가입 처리 중 오류가 발생했습니다.'
    });
  }
});

// SMS 인증번호 발송 API 수정
router.post('/send-verification', async (req, res) => {
  try {
    const { phone, isUpdate = false } = req.body;
    
    // 🔥 전화번호 유효성 검사
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: phoneValidation.error
      });
    }
    const cleanPhone = phoneValidation.cleanPhone;

    // 전화번호 중복 확인 (회원가입시에만 체크)
    if (!isUpdate) {
      const existingUsers = await Database.query(
        'SELECT id FROM users WHERE phone = $1',
        [cleanPhone]
      );
      
      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          error: '이미 사용 중인 전화번호입니다.'
        });
      }
    }

    // 🔥 하루 SMS 발송 횟수 제한 (5회)
    const today = new Date().toISOString().split('T')[0];
    const smsKey = `sms_${cleanPhone}_${today}`;
    
    if (!global.smsSendCounts) {
      global.smsSendCounts = {};
    }
    
    const todayCount = global.smsSendCounts[smsKey] || 0;
    if (todayCount >= 5) {
      return res.status(429).json({
        success: false,
        error: '하루 SMS 발송 횟수를 초과했습니다. 내일 다시 시도해주세요.'
      });
    }

    // 인증번호 생성 (4자리)
    const verificationCode = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
    
    // 메시지 내용
    const message = `[SerialLogger] 인증번호는 ${verificationCode} 입니다.`;

    const smsData = {
      phn: cleanPhone,
      profile: 'd3393e690b02911e022c8e305920de8a3b6520f2',
      reserveDt: '00000000000000',
      smsOnly: 'Y',
      smsKind: 'S',
      msgSms: message,
      smsSender: '01022957774'
    };

    // SMS API 호출
    const response = await fetch('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'userid': 'etcom262'
      },
      body: JSON.stringify([smsData])
    });

    const responseText = await response.text();
    let result;
    
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error('SMS 발송 중 오류가 발생했습니다.');
    }

    // 발송 성공 시에만 카운트 증가
    if (response.ok) {
      global.smsSendCounts[smsKey] = todayCount + 1;
    }

    // 인증번호를 임시 저장
    if (!global.verificationCodes) {
      global.verificationCodes = {};
    }
    
    global.verificationCodes[cleanPhone] = {
      code: verificationCode,
      expires: Date.now() + (3 * 60 * 1000),
      attempts: 0,
      createdAt: new Date()
    };

    res.json({
      success: true,
      message: '인증번호가 발송되었습니다.',
      phone: cleanPhone,
      remainingAttempts: 5 - (todayCount + 1),
      ...(process.env.NODE_ENV === 'development' && { testCode: verificationCode })
    });

  } catch (error) {
    console.error('SMS 인증번호 발송 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message || '인증번호 발송 중 오류가 발생했습니다.'
    });
  }
});
// SMS 인증번호 확인
router.post('/verify-phone', async (req, res) => {
  try {
    //console.log('SMS 인증번호 확인 요청:', req.body);

    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        error: '전화번호와 인증번호가 필요합니다.'
      });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    
    // 저장된 인증번호 확인
    const stored = global.verificationCodes?.[cleanPhone];
    
    if (!stored) {
      return res.status(400).json({
        success: false,
        error: '인증번호를 먼저 요청해주세요.'
      });
    }

    // 만료 시간 확인
    if (Date.now() > stored.expires) {
      delete global.verificationCodes[cleanPhone];
      return res.status(400).json({
        success: false,
        error: '인증번호가 만료되었습니다. 다시 요청해주세요.'
      });
    }

    // 시도 횟수 확인 (5회 제한)
    if (stored.attempts >= 5) {
      delete global.verificationCodes[cleanPhone];
      return res.status(400).json({
        success: false,
        error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.'
      });
    }

    // 인증번호 확인
    if (code !== stored.code.toString()) {
      stored.attempts++;
      return res.status(400).json({
        success: false,
        error: '인증번호가 일치하지 않습니다.',
        remainingAttempts: 5 - stored.attempts
      });
    }

    // 인증 성공 - 저장된 데이터 삭제
    delete global.verificationCodes[cleanPhone];

    res.json({
      success: true,
      message: '전화번호 인증이 완료되었습니다.',
      phone: cleanPhone
    });

  } catch (error) {
    console.error('SMS 인증번호 확인 오류:', error);
    res.status(500).json({
      success: false,
      error: '인증번호 확인 중 오류가 발생했습니다.'
    });
  }
});
// 기본정보 업데이트
router.put('/update-profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: '이름이 필요합니다.'
      });
    }

    const trimmedName = name.trim();
    
    // 이름 업데이트
    const updatedUsers = await Database.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name, phone',
      [trimmedName, userId]
    );
    
    if (updatedUsers.length === 0) {
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    const updatedUser = updatedUsers[0];
    
    //console.log(`✅ Profile updated for user: ${updatedUser.email}, new name: ${updatedUser.name}`);
    
    // 성공 시 사용자 프로필 캐시 무효화
    await cache.del(`user:profile:${req.user.id}`);

    res.json({
      success: true,
      message: '기본정보가 성공적으로 변경되었습니다.',
      user: updatedUser
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: '기본정보 변경 중 오류가 발생했습니다.'
    });
  }
});
// 🔥 회원 탈퇴 API (프론트엔드 경로에 맞춤)
// 🔥 회원 탈퇴 API - 컬럼명 수정
router.delete('/withdraw', async (req, res) => {
  const client = await Database.getClient();
  
  try {
    const { password } = req.body;
    
    // JWT 토큰에서 사용자 ID 추출
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.accessToken; // 🔥 쿠키명 수정
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 없습니다.'
      });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      });
    }
    
    const userId = decoded.userId;
    
    // 🔥 컬럼명 수정: user_id → id, username → name
    const userCheck = await client.query(
      'SELECT id, name, password FROM users WHERE id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 사용자입니다.'
      });
    }
    
    const user = userCheck.rows[0];
    
    // 비밀번호 확인
    if (!password) {
      return res.status(400).json({
        success: false,
        message: '비밀번호를 입력해주세요.'
      });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: '비밀번호가 일치하지 않습니다.'
      });
    }
    
    //console.log(`🗑️ 사용자 ${user.name} (ID: ${userId}) 탈퇴 처리 시작...`);
    
    // 트랜잭션 시작
    await client.query('BEGIN');
    
    // 🔥 사용자 소유 디바이스들 조회
    const userDevices = await client.query(
      'SELECT device_id, device_name FROM devices WHERE registered_by = $1',
      [userId]
    );
    
    //console.log(`📱 삭제할 디바이스 ${userDevices.rows.length}개 발견`);
    
    // 각 디바이스별로 관련 데이터 삭제 (동일)
    for (const device of userDevices.rows) {
      const deviceId = device.device_id;
      const deviceName = device.device_name;
      
      //console.log(`🗑️ 디바이스 ${deviceName} (${deviceId}) 관련 데이터 삭제 중...`);
      
      await client.query('DELETE FROM user_device_favorites WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM device_group_members WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM sensor_data WHERE device_id = $1', [deviceId]);
      
      try {
        await client.query('DELETE FROM sensor_readings_json WHERE device_id = $1', [deviceId]);
      } catch (err) {
        //console.log('  - sensor_readings_json 테이블이 없습니다.');
      }
      
      await client.query('DELETE FROM command_logs WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM pending_commands WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM alert_logs WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM alert_settings WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM pending_devices WHERE device_id = $1', [deviceId]);
    }
    
    // 사용자 소유 디바이스 그룹들 조회 및 삭제
    const userGroups = await client.query(
      'SELECT group_id, group_name FROM device_groups WHERE created_by = $1',
      [userId]
    );
    
    //console.log(`👥 삭제할 디바이스 그룹 ${userGroups.rows.length}개 발견`);
    
    for (const group of userGroups.rows) {
      const groupId = group.group_id;
      await client.query('DELETE FROM device_group_members WHERE group_id = $1', [groupId]);
      await client.query('DELETE FROM device_groups WHERE group_id = $1', [groupId]);
    }
    
    await client.query('DELETE FROM user_device_favorites WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM devices WHERE registered_by = $1', [userId]);
    
    // 🔥 사용자 삭제 - 컬럼명 수정
    const userDeleteResult = await client.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );
    
    if (userDeleteResult.rowCount === 0) {
      throw new Error('사용자 삭제에 실패했습니다.');
    }
    
    await client.query('COMMIT');
    
    //console.log(`✅ 사용자 ${user.name} (ID: ${userId}) 탈퇴 처리 완료`);
    
    // 🔥 쿠키명 수정
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    res.json({
      success: true,
      message: `회원 탈퇴가 완료되었습니다.`,
      details: {
        deletedUsername: user.name, // 🔥 수정
        deletedDevicesCount: userDevices.rows.length,
        deletedGroupsCount: userGroups.rows.length
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 회원 탈퇴 처리 오류:', error);
    res.status(500).json({
      success: false,
      message: '회원 탈퇴 처리 중 오류가 발생했습니다.',
      error: error.message
    });
  } finally {
    client.release();
  }
});
// 🔥 탈퇴 전 데이터 확인 API - 컬럼명 수정
router.get('/withdraw/preview', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.accessToken; // 🔥 쿠키명 수정
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 없습니다.'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    // 🔥 컬럼명 수정
    const userInfo = await Database.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 사용자입니다.'
      });
    }
    
    const devices = await Database.query(
      'SELECT device_id, device_name, created_at FROM devices WHERE registered_by = $1',
      [userId]
    );
    
    const groups = await Database.query(
      'SELECT group_id, group_name, created_at FROM device_groups WHERE created_by = $1',
      [userId]
    );
    
    let totalSensorData = 0;
    for (const device of devices) {
      const sensorCount = await Database.query(
        'SELECT COUNT(*) as count FROM sensor_data WHERE device_id = $1',
        [device.device_id]
      );
      totalSensorData += parseInt(sensorCount[0].count || 0);
    }
    
    const favoritesCount = await Database.query(
      'SELECT COUNT(*) as count FROM user_device_favorites WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      success: true,
      message: '탈퇴 시 삭제될 데이터 미리보기',
      user: {
        username: userInfo[0].name, // 🔥 수정
        email: userInfo[0].email,
        memberSince: userInfo[0].created_at
      },
      dataToBeDeleted: {
        devices: devices,
        deviceGroups: groups,
        totalSensorDataCount: totalSensorData,
        favoritesCount: parseInt(favoritesCount[0].count || 0)
      },
      warning: '탈퇴 시 위의 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.'
    });
    
  } catch (error) {
    console.error('탈퇴 미리보기 오류:', error);
    res.status(500).json({
      success: false,
      message: '탈퇴 미리보기 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});
// 전화번호 변경 API
router.put('/update-phone', authenticateToken, async (req, res) => {
  const client = await Database.getClient();
  try {
    const { phone, isPhoneVerified } = req.body;
    const n = normalizePhone(phone);
    if (!n.ok) return res.status(400).json({ success: false, error: n.error });
    const cleanPhone = n.value;

    if (!isPhoneVerified) {
      return res.status(400).json({ success: false, error: '전화번호 인증을 완료해주세요.' });
    }

    await client.query('BEGIN');

    // 현재 users.phone 가져오기 (구 메인)
    const me = await client.query('SELECT id, phone FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (me.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
    }
    const oldMain = me.rows[0].phone;

    // 1) users.phone 업데이트
    await client.query('UPDATE users SET phone = $1 WHERE id = $2', [cleanPhone, req.user.id]);

    // 2) user_phones: 기존 primary 전부 해제
    await client.query('UPDATE user_phones SET is_primary = false WHERE user_id = $1 AND is_primary = true', [req.user.id]);

    // 3) user_phones: 새 번호 업서트 (verified + primary)
    const existingNew = await client.query(
      'SELECT id FROM user_phones WHERE user_id = $1 AND phone = $2 FOR UPDATE',
      [req.user.id, cleanPhone]
    );
    if (existingNew.rows.length === 0) {
      await client.query(
        `INSERT INTO user_phones(user_id, phone, is_verified, verified_at, is_primary)
         VALUES ($1,$2,true,now(),true)`,
        [req.user.id, cleanPhone]
      );
    } else {
      await client.query(
        `UPDATE user_phones
            SET is_verified = true, verified_at = now(), is_primary = true
          WHERE id = $1`,
        [existingNew.rows[0].id]
      );
    }

    // (선택) 구 메인(oldMain)이 user_phones에 존재하면 그냥 서브로 남김 (is_primary=false)
    //       존재하지 않으면 자동 등록까지 원하면 아래 주석 해제
    // if (oldMain && oldMain !== cleanPhone) {
    //   const oldRow = await client.query(
    //     'SELECT id FROM user_phones WHERE user_id = $1 AND phone = $2',
    //     [req.user.id, oldMain]
    //   );
    //   if (oldRow.rows.length === 0) {
    //     await client.query(
    //       `INSERT INTO user_phones(user_id, phone, is_verified, verified_at, is_primary)
    //        VALUES ($1,$2,true,now(),false)`,
    //       [req.user.id, oldMain]
    //     );
    //   }
    // }

    await client.query('COMMIT');

    // 최신 정보 반환
    const user = (await Database.query('SELECT id, email, name, phone FROM users WHERE id = $1', [req.user.id]))[0];
    return res.json({ success: true, user });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ success: false, error: '전화번호 변경 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *               rememberMe:
 *                 type: boolean
 *                 description: 자동 로그인 여부 (기본값: true)
 *                 example: true
 *               returnUrl:
 *                 type: string
 *                 description: 로그인 후 리다이렉트할 URL
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 로그인 성공
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                   description: JWT 액세스 토큰
 *                 refreshToken:
 *                   type: string
 *                   description: 리프레시 토큰 (rememberMe가 true일 때만 포함)
 *         headers:
 *           Set-Cookie:
 *             description: accessToken과 refreshToken이 쿠키로 설정됨
 *             schema:
 *               type: string
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = getClientIP(req); // 🔥 추가
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: '이메일과 비밀번호를 입력해주세요.'
      });
    }
    
    // 사용자 조회
    // 🔥 phone 필드도 포함하여 사용자 조회
    const users = await Database.query(
      'SELECT id, email, password, name, phone FROM users WHERE email = $1',
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    
    const user = users[0];
    
    // 비밀번호 확인
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    
    // 자동 로그인 여부 확인
    const { rememberMe } = req.body;
    
    // JWT 토큰 생성
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // 자동 로그인 선택 시 refreshToken 만료 시간을 30일로 연장
    const refreshTokenExpiresIn = rememberMe ? '30d' : '7d';
    const refreshTokenMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: refreshTokenExpiresIn }
    );
    
    // 마지막 로그인 시간 업데이트
    await Database.query(
      'UPDATE users SET last_login = NOW(), last_ip = $1 WHERE id = $2',
      [clientIP, user.id]
    );
    
    // 쿠키 설정
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS에서만
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24시간
    };
    
    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: refreshTokenMaxAge // 자동 로그인 선택 시 30일, 아니면 7일
    });
    
    //console.log(`✅ User logged in: ${user.email} from IP: ${clientIP}`);
    
    // 자동 로그인 선택 시 refreshToken도 응답에 포함 (Capacitor 앱 호환성)
    const responseData = {
      success: true,
      message: '로그인 성공',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone // 🔥 phone 필드 추가
      },
      accessToken: accessToken // 프론트엔드에서 필요시 사용
    };
    
    // 자동 로그인 선택 시 refreshToken도 응답에 포함 (웹뷰에서 쿠키가 작동하지 않을 수 있음)
    if (rememberMe) {
      responseData.refreshToken = refreshToken;
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: '로그인 처리 중 오류가 발생했습니다.'
    });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *         headers:
 *           Set-Cookie:
 *             description: accessToken과 refreshToken 쿠키가 삭제됨
 */
// 로그아웃
router.post('/logout', (req, res) => {
  // 쿠키 삭제
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  
  res.json({
    success: true,
    message: '로그아웃 되었습니다.'
  });
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 현재 로그인한 사용자 정보 조회
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 사용자 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: 인증되지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 사용자를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// auth.js에서 /me 라우트 수정
// 현재 사용자 정보 조회 - phone 필드 포함
router.get('/me', authenticateToken, cacheMiddleware(1800, (req) => `user:profile:${req.user.id}`), async (req, res) => {
  try {
    //console.log('🔍 /me 요청 - 사용자 ID:', req.user.id); // 🔥 디버깅
    
    // 🔥 phone 필드 포함하여 사용자 정보 조회
    const users = await Database.query(
      'SELECT id, email, name, phone, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );

    if (users.length === 0) {
      //console.log('❌ 사용자를 찾을 수 없음:', req.user.id);
      return res.status(404).json({
        success: false,
        error: '사용자를 찾을 수 없습니다.'
      });
    }

    const user = users[0];
    //console.log('✅ 사용자 정보 조회됨:', user); // 🔥 디버깅
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone, // 🔥 phone 필드 포함
        created_at: user.created_at,
        last_login: user.last_login
      }
    });
    
  } catch (error) {
    console.error('❌ Get user info error:', error);
    res.status(500).json({
      success: false,
      error: '사용자 정보 조회 중 오류가 발생했습니다.'
    });
  }
});
/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 액세스 토큰 갱신
 *     tags: [Auth]
 *     description: refreshToken을 사용하여 새로운 accessToken을 발급받습니다.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 토큰 갱신 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 accessToken:
 *                   type: string
 *                   description: 새로운 액세스 토큰
 *         headers:
 *           Set-Cookie:
 *             description: 새로운 accessToken이 쿠키로 설정됨
 *       401:
 *         description: 리프레시 토큰이 없거나 유효하지 않음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// 토큰 갱신 - 버그 수정
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const clientIP = getClientIP(req);
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: '리프레시 토큰이 없습니다.'
      });
    }
    
    // 🔥 decoded를 먼저 선언
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // 🔥 IP 업데이트 수정
    await Database.query(
      'UPDATE users SET last_ip = $1 WHERE id = $2',
      [clientIP, decoded.userId]
    );
    
    const newAccessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({
      success: true,
      accessToken: newAccessToken
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: '토큰 갱신에 실패했습니다.'
    });
  }
});

// =========================
// 📱 Multi-Phone APIs
// 경로: /auth/phones...
// =========================

/**
 * 유틸: 전화번호 정규화/검증 (기존 validatePhoneNumber와 동일 규칙 사용 권장)
 */
function normalizePhone(phone) {
  const clean = (phone || '').replace(/[^0-9]/g, '');
  if (!/^01[0-9]{8,9}$/.test(clean)) {
    return { ok: false, error: '올바른 휴대폰 번호 형식이 아닙니다. (010, 011, 016, 017, 018, 019)' };
  }
  return { ok: true, value: clean };
}

/**
 * POST /auth/phones/send
 * 내 계정에 "서브 번호 추가"를 위한 인증번호 발송
 * body: { phone }
 */
// 서브 번호용: 인증번호 발송
router.post('/phones/send', authenticateToken, async (req, res) => {
  try {
    const { phone } = req.body;

    // ✅ 1) 전화번호 유효성 검사 (send-verification 과 동일 함수 사용)
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: phoneValidation.error
      });
    }
    const cleanPhone = phoneValidation.cleanPhone;

    // ✅ 2) 중복 체크
    // (a) 내 계정에 이미 등록된 번호는 불가
    const dupMine = await Database.query(
      'SELECT 1 FROM user_phones WHERE user_id = $1 AND phone = $2',
      [req.user.id, cleanPhone]
    );
    if (dupMine.length > 0) {
      return res.status(400).json({ success: false, error: '이미 추가된 전화번호입니다.' });
    }

    // (b) 전역 중복(다른 계정이 이미 보유) 차단 — 정책에 따라 제거 가능
    const dupGlobal = await Database.query(
      'SELECT 1 FROM user_phones WHERE phone = $1 LIMIT 1',
      [cleanPhone]
    );
    if (dupGlobal.length > 0) {
      return res.status(400).json({ success: false, error: '다른 계정에서 사용 중인 전화번호입니다.' });
    }

    // ✅ 3) 일일 발송 횟수 제한 (send-verification 과 동일)
    const today = new Date().toISOString().split('T')[0];
    const smsKey = `sms_${cleanPhone}_${today}`;
    if (!global.smsSendCounts) global.smsSendCounts = {};
    const todayCount = global.smsSendCounts[smsKey] || 0;
    if (todayCount >= 5) {
      return res.status(429).json({
        success: false,
        error: '하루 SMS 발송 횟수를 초과했습니다. 내일 다시 시도해주세요.'
      });
    }

    // ✅ 4) 인증번호 생성(4자리) 및 메시지 구성 (send-verification 과 동일)
    const verificationCode = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
    const message = `[SerialLogger] 인증번호는 ${verificationCode} 입니다.`;

    // ✅ 5) 실제 문자 발송 (send-verification 의 fetch 블록 재사용)
    const smsData = {
      phn: cleanPhone,
      profile: 'd3393e690b02911e022c8e305920de8a3b6520f2',
      reserveDt: '00000000000000',
      smsOnly: 'Y',
      smsKind: 'S',
      msgSms: message,
      smsSender: '01022957774'
    };

    const response = await fetch('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'userid': 'etcom262'
      },
      body: JSON.stringify([smsData])
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error('SMS 발송 중 오류가 발생했습니다.');
    }

    // 발송 성공일 때만 일일 카운트 증가
    if (response.ok) {
      global.smsSendCounts[smsKey] = todayCount + 1;
    } else {
      // 외부 응답 에러 메시지 전달
      return res.status(500).json({
        success: false,
        error: result?.message || 'SMS 발송에 실패했습니다.'
      });
    }

    // ✅ 6) 인증번호 임시 저장 (3분/시도 제한 동일)
    if (!global.verificationCodes) global.verificationCodes = {};
    global.verificationCodes[cleanPhone] = {
      code: verificationCode,
      expires: Date.now() + (3 * 60 * 1000),
      attempts: 0,
      createdAt: new Date()
    };

    // ✅ 7) 응답
    return res.json({
      success: true,
      message: '인증번호가 전송되었습니다.',
      ...(process.env.NODE_ENV === 'development' && { testCode: verificationCode })
    });

  } catch (e) {
    console.error('서브번호 인증번호 발송 오류:', e);
    return res.status(500).json({ success: false, error: e.message || '인증 요청 중 오류가 발생했습니다.' });
  }
});


/**
 * POST /auth/phones/verify
 * 서브 번호 인증/등록
 * body: { phone, code, setPrimary? }
 * - 인증 성공 시 user_phones에 삽입(is_verified=true)
 * - setPrimary=true면 해당 번호를 메인으로 승격 + 기존 primary 해제 + users.phone 업데이트
 */
router.post('/phones/verify', authenticateToken, async (req, res) => {
  const client = await Database.getClient(); // 트랜잭션용
  try {
    const { phone, code, setPrimary = false } = req.body;

    const n = normalizePhone(phone);
    if (!n.ok) return res.status(400).json({ success: false, error: n.error });
    const cleanPhone = n.value;

    // 코드 검증
    const stored = global.verificationCodes?.[cleanPhone];
    if (!stored) return res.status(400).json({ success: false, error: '인증번호를 먼저 요청해주세요.' });
    if (Date.now() > stored.expires) {
      delete global.verificationCodes[cleanPhone];
      return res.status(400).json({ success: false, error: '인증번호가 만료되었습니다. 다시 요청해주세요.' });
    }
    if (stored.attempts >= 5) {
      delete global.verificationCodes[cleanPhone];
      return res.status(400).json({ success: false, error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.' });
    }
    if (String(code) !== String(stored.code)) {
      stored.attempts++;
      return res.status(400).json({ success: false, error: '인증번호가 일치하지 않습니다.' });
    }

    await client.query('BEGIN');

    // 내 계정에 이미 동일 번호가 있어도 다시 verified 갱신
    const exists = await client.query(
      'SELECT id, is_primary, is_verified FROM user_phones WHERE user_id = $1 AND phone = $2 FOR UPDATE',
      [req.user.id, cleanPhone]
    );

    let phoneRowId;
    if (exists.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO user_phones(user_id, phone, is_verified, verified_at, is_primary)
         VALUES ($1,$2,true,now(), false)
         RETURNING id`,
        [req.user.id, cleanPhone]
      );
      phoneRowId = ins.rows[0].id;
    } else {
      phoneRowId = exists.rows[0].id;
      await client.query(
        'UPDATE user_phones SET is_verified = true, verified_at = now() WHERE id = $1',
        [phoneRowId]
      );
    }

    // setPrimary==true면 기존 primary 해제 후 이 번호를 primary로 승격 + users.phone 동기화
    if (setPrimary) {
      await client.query(
        'UPDATE user_phones SET is_primary = false WHERE user_id = $1 AND is_primary = true',
        [req.user.id]
      );
      await client.query(
        'UPDATE user_phones SET is_primary = true WHERE id = $1',
        [phoneRowId]
      );
      await client.query(
        'UPDATE users SET phone = $1 WHERE id = $2', // 하위호환 유지
        [cleanPhone, req.user.id]
      );
    }

    await client.query('COMMIT');
    delete global.verificationCodes[cleanPhone];

    return res.json({
      success: true,
      message: setPrimary ? '전화번호 인증 및 메인 번호로 설정되었습니다.' : '전화번호 인증이 완료되었습니다.',
      phone: cleanPhone
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ success: false, error: '전화번호 인증 처리 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

/**
 * GET /auth/phones
 * 내 전화번호 목록 조회
 */
router.get('/phones', authenticateToken, async (req, res) => {
  try {
    const rows = await Database.query(
      `SELECT id, phone, is_verified, is_primary, created_at, verified_at
         FROM user_phones
        WHERE user_id = $1
        ORDER BY is_primary DESC, created_at ASC`,
      [req.user.id]
    );
    return res.json({ success: true, phones: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: '전화번호 목록 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * PUT /auth/phones/:id/primary
 * 특정 번호를 메인으로 승격
 */
router.put('/phones/:id/primary', authenticateToken, async (req, res) => {
  const client = await Database.getClient();
  try {
    await client.query('BEGIN');

    const phoneRow = await client.query(
      'SELECT id, phone, is_verified FROM user_phones WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (phoneRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: '전화번호를 찾을 수 없습니다.' });
    }
    if (!phoneRow.rows[0].is_verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: '인증되지 않은 번호는 메인으로 설정할 수 없습니다.' });
    }

    await client.query('UPDATE user_phones SET is_primary = false WHERE user_id = $1 AND is_primary = true', [req.user.id]);
    await client.query('UPDATE user_phones SET is_primary = true WHERE id = $1', [req.params.id]);

    // users.phone 동기화(하위호환)
    await client.query('UPDATE users SET phone = $1 WHERE id = $2', [phoneRow.rows[0].phone, req.user.id]);

    await client.query('COMMIT');
    return res.json({ success: true, message: '메인 전화번호가 변경되었습니다.' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ success: false, error: '메인 번호 설정 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /auth/phones/:id
 * 서브 번호 삭제(메인은 삭제 불가 또는 먼저 다른 메인 지정)
 */
router.delete('/phones/:id', authenticateToken, async (req, res) => {
  try {
    const rows = await Database.query(
      'SELECT id, is_primary FROM user_phones WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: '전화번호를 찾을 수 없습니다.' });
    if (rows[0].is_primary) {
      return res.status(400).json({ success: false, error: '메인 번호는 삭제할 수 없습니다. 먼저 다른 번호를 메인으로 지정하세요.' });
    }

    await Database.query('DELETE FROM user_phones WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    return res.json({ success: true, message: '전화번호가 삭제되었습니다.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: '전화번호 삭제 중 오류가 발생했습니다.' });
  }
});



module.exports = router;