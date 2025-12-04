const jwt = require('jsonwebtoken');
const Database = require('../lib/database');

// IP 감지 함수 추가
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.ip ||
         req.connection.remoteAddress ||
         '127.0.0.1';
}

const authenticateToken = async (req, res, next) => {
  try {
    // Authorization 헤더 또는 쿠키에서 토큰 추출
    let token = null;
    
    // 1. Authorization 헤더 확인
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 2. 쿠키에서 accessToken 확인
    if (!token && req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: '인증 토큰이 없습니다.' 
      });
    }

    // 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 🔥 사용자 정보 조회 (last_ip 포함)
    const users = await Database.query(
      'SELECT id, email, name, last_ip FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: '유효하지 않은 사용자입니다.' 
      });
    }
    
    const user = users[0];
    const currentIP = getClientIP(req);
    
    // 🔥 IP가 변경되었으면 업데이트
    if (user.last_ip !== currentIP) {
      await Database.query(
        'UPDATE users SET last_ip = $1, last_login_at = NOW() WHERE id = $2',
        [currentIP, user.id]
      );
      console.log(`📍 사용자 ${user.email} IP 업데이트: ${user.last_ip} → ${currentIP}`);
      user.last_ip = currentIP; // 현재 요청에서 사용할 수 있도록 업데이트
    }
    
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
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
    } else {
      return res.status(500).json({ 
        success: false, 
        error: '인증 처리 중 오류가 발생했습니다.' 
      });
    }
  }
};

module.exports = { authenticateToken };




