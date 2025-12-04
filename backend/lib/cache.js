const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.client && this.isConnected) {
        return;
      }

      this.client = redis.createClient({
        // url: `redis://:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        // 또는 개별 옵션으로
        // Redis 서버가 없을 때 에러 방지
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              //console.log('❌ Redis 연결 포기');
              return false;
            }
            return Math.min(retries * 50, 500);
          }
        },
        password: process.env.REDIS_PASSWORD || undefined,
        // 🔥 Redis 서버가 없어도 앱이 죽지 않도록
        lazyConnect: true
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        //console.log('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        //console.log('❌ Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      this.isConnected = false;
      // 🔥 Redis 없어도 앱은 계속 실행
    }
  }

  async get(key) {
    try {
      // 🔥 더 정확한 연결 상태 체크
      if (!this.client || !this.client.isReady) {
        return null;
      }
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      if (!this.client || !this.client.isReady) {
        return false;
      }
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error.message);
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.client || !this.client.isReady) {
        return false;
      }
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error.message);
      return false;
    }
  }
}

module.exports = new CacheManager();