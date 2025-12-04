// routes/adminAuth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('../lib/database');

const router = express.Router();

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.ip ||
         req.connection.remoteAddress ||
         '127.0.0.1';
}

// 관리자 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = getClientIP(req);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: '이메일과 비밀번호를 입력해주세요.'
      });
    }
    
    // 관리자 조회
    const admins = await Database.query(
      'SELECT id, email, password, name, phone, is_active FROM admins WHERE email = $1',
      [email]
    );
    
    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        error: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    
    const admin = admins[0];
    
    // 활성 상태 확인
    if (!admin.is_active) {
      return res.status(401).json({
        success: false,
        error: '비활성화된 관리자 계정입니다.'
      });
    }
    
    // 비밀번호 확인
    const passwordMatch = await bcrypt.compare(password, admin.password);
    
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: '이메일 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    
    // JWT 토큰 생성
    const accessToken = jwt.sign(
      { adminId: admin.id, email: admin.email, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    const refreshToken = jwt.sign(
      { adminId: admin.id, isAdmin: true },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    // 마지막 로그인 시간 업데이트
    await Database.query(
      'UPDATE admins SET last_login = NOW(), last_ip = $1 WHERE id = $2',
      [clientIP, admin.id]
    );
    
    // 쿠키 설정
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    };
    
    res.cookie('adminAccessToken', accessToken, cookieOptions);
    res.cookie('adminRefreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    console.log(`✅ Admin logged in: ${admin.email} from IP: ${clientIP}`);
    
    res.json({
      success: true,
      message: '관리자 로그인 성공',
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        phone: admin.phone
      },
      accessToken: accessToken
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: '로그인 처리 중 오류가 발생했습니다.'
    });
  }
});

// 관리자 회원가입
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone, adminKey } = req.body;
    
    // 관리자 등록 키 확인 (보안)
    if (adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
      return res.status(403).json({
        success: false,
        error: '유효하지 않은 관리자 등록 키입니다.'
      });
    }
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: '모든 필수 필드를 입력해주세요.'
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
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: '비밀번호는 8자 이상이어야 합니다.'
      });
    }
    
    // 이메일 중복 확인
    const existingAdmins = await Database.query(
      'SELECT id FROM admins WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (existingAdmins.length > 0) {
      return res.status(400).json({
        success: false,
        error: '이미 사용 중인 이메일입니다.'
      });
    }
    
    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 관리자 생성
    const newAdmins = await Database.query(
      'INSERT INTO admins (email, password, name, phone, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, email, name, phone, created_at',
      [email.toLowerCase(), hashedPassword, name.trim(), phone || null]
    );
    
    const newAdmin = newAdmins[0];
    
    console.log(`✅ New admin registered: ${newAdmin.email}`);
    
    res.status(201).json({
      success: true,
      message: '관리자 계정이 생성되었습니다.',
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        phone: newAdmin.phone
      }
    });
    
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '관리자 등록 처리 중 오류가 발생했습니다.'
    });
  }
});

// 관리자 로그아웃
router.post('/logout', (req, res) => {
  res.clearCookie('adminAccessToken');
  res.clearCookie('adminRefreshToken');
  
  res.json({
    success: true,
    message: '로그아웃 되었습니다.'
  });
});

// 현재 관리자 정보 조회
router.get('/me', async (req, res) => {
  try {
    // 토큰에서 관리자 정보 추출
    let token = null;
    
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token && req.cookies && req.cookies.adminAccessToken) {
      token = req.cookies.adminAccessToken;
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: '인증 토큰이 없습니다.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        error: '관리자 권한이 필요합니다.'
      });
    }
    
    const admins = await Database.query(
      'SELECT id, email, name, phone, created_at, last_login FROM admins WHERE id = $1 AND is_active = true',
      [decoded.adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        success: false,
        error: '관리자를 찾을 수 없습니다.'
      });
    }

    const admin = admins[0];
    
    res.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        phone: admin.phone,
        created_at: admin.created_at,
        last_login: admin.last_login
      }
    });
    
  } catch (error) {
    console.error('Get admin info error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: '유효하지 않은 토큰입니다.' 
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: '토큰이 만료되었습니다.' 
      });
    }
    
    res.status(500).json({
      success: false,
      error: '관리자 정보 조회 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;