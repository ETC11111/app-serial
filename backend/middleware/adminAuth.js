// middleware/adminAuth.js
const jwt = require('jsonwebtoken');
const Database = require('../lib/database');

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.ip ||
         req.connection.remoteAddress ||
         '127.0.0.1';
}

const requireAdmin = async (req, res, next) => {
  try {
    // 토큰 추출
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
        error: '관리자 인증 토큰이 필요합니다.'
      });
    }

    // 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        error: '관리자 권한이 필요합니다.'
      });
    }
    
    // 관리자 정보 조회
    const admins = await Database.query(
      'SELECT id, email, name, last_ip, is_active FROM admins WHERE id = $1',
      [decoded.adminId]
    );
    
    if (admins.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: '유효하지 않은 관리자입니다.' 
      });
    }
    
    const admin = admins[0];
    
    if (!admin.is_active) {
      return res.status(401).json({ 
        success: false, 
        error: '비활성화된 관리자 계정입니다.' 
      });
    }
    
    const currentIP = getClientIP(req);
    
    // IP가 변경되었으면 업데이트
    if (admin.last_ip !== currentIP) {
      await Database.query(
        'UPDATE admins SET last_ip = $1 WHERE id = $2',
        [currentIP, admin.id]
      );
      admin.last_ip = currentIP;
    }
    
    req.admin = admin;
    next();
    
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: '유효하지 않은 관리자 토큰입니다.' 
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: '관리자 토큰이 만료되었습니다.' 
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        error: '관리자 인증 처리 중 오류가 발생했습니다.' 
      });
    }
  }
};

module.exports = { requireAdmin };