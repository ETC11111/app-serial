// middleware/cache.js
const cache = require('../lib/cache');
const activeLocks = new Map();

// 캐시 미들웨어
const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    try {
      let cacheKey;
      
      if (keyGenerator) {
        cacheKey = typeof keyGenerator === 'function' ? keyGenerator(req) : keyGenerator;
      } else {
        const userId = req.admin?.id || req.user?.id || 'anonymous';
        cacheKey = `api:${req.originalUrl}:${userId}`;
      }
      
      console.log(`🔍 Cache check: ${cacheKey}`);
      
      // 🔥 이미 처리 중인 요청이 있으면 잠시 대기
      if (activeLocks.has(cacheKey)) {
        console.log(`⏳ Waiting for active request: ${cacheKey}`);
        await activeLocks.get(cacheKey);
        
        // 대기 후 캐시 재확인
        const cachedData = await cache.get(cacheKey);
        if (cachedData) {
          console.log(`✅ Cache hit after wait: ${cacheKey}`);
          return res.json(cachedData);
        }
      }
      
      // 캐시 확인
      const cachedData = await cache.get(cacheKey);
      if (cachedData) {
        console.log(`✅ Cache hit: ${cacheKey}`);
        return res.json(cachedData);
      }
      
      console.log(`❌ Cache miss: ${cacheKey}`);
      
      // 🔥 현재 요청을 락으로 등록
      let resolveLock;
      const lockPromise = new Promise(resolve => {
        resolveLock = resolve;
      });
      activeLocks.set(cacheKey, lockPromise);
      
      // 원본 res.json을 백업
      const originalJson = res.json;
      
      // res.json을 오버라이드
      res.json = function(data) {
        // 🔥 락 해제
        activeLocks.delete(cacheKey);
        resolveLock();
        
        // 캐시 저장
        if (res.statusCode === 200 && data && data.success) {
          cache.set(cacheKey, data, ttl).catch(err => {
            console.error('Cache set failed:', err.message);
          });
          console.log(`💾 Cached: ${cacheKey} for ${ttl}s`);
        }
        return originalJson.call(this, data);
      };
      
      // 에러 시에도 락 해제
      res.on('error', () => {
        activeLocks.delete(cacheKey);
        resolveLock();
      });
      
      next();
      
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next();
    }
  };
};

// 사용자별 캐시 무효화
const invalidateUserCache = async (userId, pattern = '*') => {
  try {
    if (!cache.isConnected || !cache.client) {
      console.log('❌ Redis not connected, skip cache invalidation');
      return;
    }
    
    // 🔥 실제 키 패턴에 맞게 수정
    const searchPatterns = [
      `filter:*:*:${userId}`,  // filter 관련
      `api:*:${userId}`,       // 일반 API
      `*${userId}*${pattern}`  // 기존 패턴 유지
    ];
    
    let totalDeleted = 0;
    for (const searchPattern of searchPatterns) {
      const keys = await cache.client.keys(searchPattern);
      if (keys.length > 0) {
        await cache.client.del(keys);
        totalDeleted += keys.length;
        console.log(`🗑️ Pattern "${searchPattern}": ${keys.length} keys deleted`);
      }
    }
    
    if (totalDeleted > 0) {
      console.log(`🗑️ Total invalidated: ${totalDeleted} cache entries for user ${userId}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error.message);
  }
};

module.exports = {
  cacheMiddleware,
  invalidateUserCache
};