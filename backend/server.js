// server.js - 장치-스트림 연결 기능 추가
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// 기존 라우트들
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const deviceRoutes = require('./routes/devices');
const kakaoRoutes = require('./routes/kakao');
const alertRoutes = require('./routes/alerts');
const sensorsRouter = require('./routes/sensors');
const commandsRouter = require('./routes/commands');
const apiRouter = require('./routes/api');
const cache = require('./lib/cache');

// 🔥 필터 라우트 추가
const filtersRouter = require('./routes/filters');

// 스트리밍 라우트들 추가
const streamRoutes = require('./routes/stream');
const streamDevicesRoutes = require('./routes/stream-devices');

// 🔥 새로운 장치-스트림 연결 라우트 추가
const deviceStreamsRoutes = require('./routes/device-streams');

// 🔥 Arduino HTTP 테스트 라우트
const arduinoTestRoutes = require('./routes/arduino-test');

// 🔥 날씨 라우트 추가
const weatherRoutes = require('./routes/weather');

// 기존 인증 미들웨어 사용
const { authenticateToken } = require('./middleware/auth');

// Swagger 설정
const { swaggerUi, swaggerSpec } = require('./swagger');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// 스트리밍 설정
const HLS_OUTPUT_DIR = path.join(__dirname, 'public', 'hls');

// public 디렉토리와 HLS 디렉토리 생성
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('📁 Public 디렉토리 생성됨:', publicDir);
}

if (!fs.existsSync(HLS_OUTPUT_DIR)) {
    fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
    console.log('📁 HLS 디렉토리 생성됨:', HLS_OUTPUT_DIR);
}

app.set('trust proxy', true);

// 1. CORS 설정 (스트리밍 헤더 추가 + Capacitor 웹뷰 지원)
app.use(cors({
  origin: function (origin, callback) {
    // Capacitor 앱은 origin이 없을 수 있음 (file:// 또는 capacitor://)
    if (!origin) {
      // Capacitor 앱에서 오는 요청 허용
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'https://seriallog.com',
      'https://seriallog.com:5174',
      'https://seriallog.com:5175',
      'https://seriallog.com:5176',
      'https://seriallog.com:5177',
      'https://www.seriallog.com',
      'capacitor://localhost',  // Capacitor iOS
      'ionic://localhost',      // Ionic Capacitor
      'http://localhost',        // Capacitor Android (개발)
      'http://localhost:8080',  // Capacitor Android (개발)
      'http://10.0.2.2:3000',   // Android Emulator
      'http://10.0.2.2:8080'    // Android Emulator
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS 차단된 Origin: ${origin}`);
      callback(null, true); // 개발 중에는 모두 허용 (프로덕션에서는 주석 처리)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'userid', 
    'Range',
    'X-Capacitor-Platform',  // Capacitor 헤더
    'X-Capacitor-App-Id'     // Capacitor 헤더
  ],
  exposedHeaders: ['Content-Length', 'Content-Range']
}));

// 2. 스트리밍용 헤더 미들웨어
app.use('/hls', (req, res, next) => {
    console.log(`🎥 HLS 요청: ${req.method} ${req.url}`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    next();
});

// 3. 기본 미들웨어들
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: ['text/plain', 'application/octet-stream'], limit: '50mb' }));
app.use(express.text({ type: 'text/*', limit: '50mb' }));
app.use(cookieParser());

// 4. 정적 파일 서빙 (HLS 파일들) - 404 처리 개선
app.use('/hls', (req, res, next) => {
    const filePath = path.join(HLS_OUTPUT_DIR, req.path);
    
    // 파일이 존재하지 않으면 404 대신 빈 응답
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ HLS 파일 없음: ${req.path}`);
        
        // playlist.m3u8 파일이 없으면 빈 플레이리스트 반환
        if (req.path.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.send('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-ENDLIST\n');
        }
        
        return res.status(404).json({ error: 'HLS file not found' });
    }
    
    next();
}, express.static(HLS_OUTPUT_DIR, {
    setHeaders: (res, filePath) => {
        console.log(`📄 HLS 파일 서빙: ${filePath}`);
        if (filePath.endsWith('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        } else if (filePath.endsWith('.ts')) {
            res.setHeader('Content-Type', 'video/mp2t');
        }
    }
}));
app.use('/public', express.static(path.join(__dirname, 'public')));

// 5. 요청 로깅 미들웨어 (Capacitor 웹뷰 진단 강화)
app.use((req, res, next) => {
  const userAgent = req.get('user-agent') || '';
  const isCapacitor = userAgent.includes('CapacitorHttp') || 
                      userAgent.includes('Capacitor') ||
                      req.get('x-capacitor-platform');
  
  // Capacitor 요청인 경우 상세 로깅
  if (isCapacitor) {
    console.log(`📱 [Capacitor] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log(`   User-Agent: ${userAgent}`);
    console.log(`   Origin: ${req.get('origin') || 'N/A'}`);
    console.log(`   Referer: ${req.get('referer') || 'N/A'}`);
    console.log(`   X-Capacitor-Platform: ${req.get('x-capacitor-platform') || 'N/A'}`);
    console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
  } else {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// 6. 라우팅 (기존 + 스트리밍 관리 + 필터 관리 + 🔥 장치-스트림 연결)
app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/mqtt/alerts', alertRoutes);
app.use('/api/kakao', kakaoRoutes);
app.use('/internal/sensors', sensorsRouter);
app.use('/internal/commands', commandsRouter);
app.use('/api', apiRouter);
app.use('/api/arduino-test', arduinoTestRoutes);
app.use('/api/weather', weatherRoutes);

// 스트리밍 관련 라우트들 (인증 필요)
app.use('/api/stream-devices', authenticateToken, streamDevicesRoutes);
app.use('/api/stream', authenticateToken, streamRoutes);

// 🔥 필터 관련 라우트 (인증 필요)
app.use('/api/filters', authenticateToken, filtersRouter);

// 🔥 NEW: 장치-스트림 연결 관리 라우트 (인증 필요)
app.use('/api/device-streams', authenticateToken, deviceStreamsRoutes);

// 7. Swagger API 문서 (Capacitor 웹뷰 호환성 개선)
// Swagger UI 정적 자산을 위한 CORS 헤더 추가
app.use('/api-docs', (req, res, next) => {
  // Capacitor 웹뷰에서 Swagger UI 자산 로딩을 위한 CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SerialLogger API 문서',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
    // Capacitor 웹뷰 호환성을 위한 설정
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    validatorUrl: null, // 외부 validator 비활성화 (웹뷰에서 차단될 수 있음)
    oauth2RedirectUrl: `${process.env.NODE_ENV === 'production' ? 'https://seriallog.com' : 'http://localhost:3000'}/api-docs/oauth2-redirect.html`
  }
}));

// Swagger JSON 엔드포인트 (CORS 헤더 추가)
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(swaggerSpec);
});

// 8. 헬스 체크
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: 서버 상태 확인
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 서버가 정상 작동 중
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 server:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 port:
 *                   type: integer
 *                 features:
 *                   type: object
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    server: 'IoT Backend with Stream & Filter & Device-Stream Connection Management',
    timestamp: new Date().toISOString(),
    port: PORT,
    features: {
      streaming: {
        hlsDir: HLS_OUTPUT_DIR,
        userStreamManagement: 'enabled'
      },
      filters: {
        userDeviceFilters: 'enabled',
        globalSettings: 'enabled',
        sensorPositions: 'enabled'
      },
      deviceStreams: {
        connectionManagement: 'enabled',
        manyToManySupport: 'enabled',
        groupIntegration: 'enabled'
      },
      utilities: {
        arduinoHttpTest: 'enabled',
        endpoints: [
          '/api/arduino-test',
          '/api/arduino-test/ping',
          '/api/arduino-test/echo',
          '/api/arduino-test/status'
        ]
      }
    }
  });
});

// 9. 기본 라우트
/**
 * @swagger
 * /:
 *   get:
 *     summary: API 서버 정보 및 엔드포인트 목록
 *     tags: [Info]
 *     responses:
 *       200:
 *         description: API 서버 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 availableEndpoints:
 *                   type: object
 *                   description: 사용 가능한 API 엔드포인트 목록
 */
app.get('/', (req, res) => {
  res.json({ 
    message: 'Dashboard API Server with Stream & Filter & Device-Stream Connection Management',
    apiDocs: `${req.protocol}://${req.get('host')}/api-docs`,
    availableEndpoints: {
      auth: `${req.protocol}://${req.get('host')}/api/auth`,
      admin: `${req.protocol}://${req.get('host')}/api/admin`,
      adminAuth: `${req.protocol}://${req.get('host')}/api/admin/auth`,
      devices: `${req.protocol}://${req.get('host')}/api/devices`,
      kakao: `${req.protocol}://${req.get('host')}/api/kakao`,
      health: `${req.protocol}://${req.get('host')}/api/health`,
      alerts: `${req.protocol}://${req.get('host')}/api/mqtt/alerts`,
      commands: `${req.protocol}://${req.get('host')}/internal/commands`,
      sensors: `${req.protocol}://${req.get('host')}/internal/sensors`,
      streamDevices: `${req.protocol}://${req.get('host')}/api/stream-devices`,
      stream: `${req.protocol}://${req.get('host')}/api/stream`,
      hls: `${req.protocol}://${req.get('host')}/hls/`,
      filters: `${req.protocol}://${req.get('host')}/api/filters`,
      deviceStreams: `${req.protocol}://${req.get('host')}/api/device-streams`,
      arduinoTest: `${req.protocol}://${req.get('host')}/api/arduino-test`,
      weather: `${req.protocol}://${req.get('host')}/api/weather`
    }
  });
});

// 10. 404 처리
app.use('*', (req, res) => {
  console.log(`404 - ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'API 엔드포인트를 찾을 수 없습니다.',
    path: req.originalUrl,
    apiDocs: `${req.protocol}://${req.get('host')}/api-docs`
  });
});

// 11. 에러 처리 (Capacitor 웹뷰 진단 강화)
app.use((error, req, res, next) => {
  const userAgent = req.get('user-agent') || '';
  const isCapacitor = userAgent.includes('CapacitorHttp') || 
                      userAgent.includes('Capacitor') ||
                      req.get('x-capacitor-platform');
  
  console.error('Server Error:', error);
  console.error('Request Details:', {
    method: req.method,
    url: req.url,
    userAgent: userAgent,
    isCapacitor: isCapacitor,
    origin: req.get('origin'),
    ip: req.ip || req.connection.remoteAddress
  });
  
  // 에러 스택도 로깅 (개발 환경에서만)
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error Stack:', error.stack);
  }
  
  res.status(500).json({ 
    error: '서버 내부 오류가 발생했습니다.',
    // 개발 환경에서만 상세 정보 제공
    ...(process.env.NODE_ENV !== 'production' && {
      message: error.message,
      isCapacitor: isCapacitor
    })
  });
});

// HTTPS 옵션
let httpsOptions = {};
try {
    httpsOptions = {
        key: fs.readFileSync('/etc/letsencrypt/live/seriallog.com/privkey.pem'),
        cert: fs.readFileSync('/etc/letsencrypt/live/seriallog.com/fullchain.pem')
    };
    console.log('SSL 인증서를 성공적으로 로드했습니다.');
} catch (err) {
    console.warn('SSL 인증서를 로드할 수 없습니다. HTTPS 서버는 비활성화됩니다.');
}

// HTTP 서버 생성
const server = http.createServer(app);

// HTTPS 서버 생성 (인증서가 있는 경우)
let httpsServer;
if (httpsOptions.key && httpsOptions.cert) {
    httpsServer = https.createServer(httpsOptions, app);
}

// 활성 스트림들을 관리하는 전역 객체
global.activeStreams = new Map();

// 서버 시작
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 HTTP Server running on http://0.0.0.0:${PORT}`);
  
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 HTTPS Server running on https://0.0.0.0:${HTTPS_PORT}`);
    });
  }
  
  try {
    await cache.connect();
    console.log('💾 Cache system initialized');
  } catch (error) {
    console.error('❌ Cache initialization failed:', error);
  }
  
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Available endpoints:`);
  console.log(`   - Auth: /api/auth`);
  console.log(`   - Devices: /api/devices`);
  console.log(`   - Kakao: /api/kakao`);
  console.log(`   - Sensors: /internal/sensors`);
  console.log(`   - Commands: /internal/commands`);
  console.log(`   - Stream Devices: /api/stream-devices`);
  console.log(`   - Stream Control: /api/stream`);
  console.log(`   - HLS Streams: /hls/`);
  console.log(`   - 🔥 Filters: /api/filters`);
  console.log(`   - 🔥 Device-Stream Connections: /api/device-streams`); // 🔥 추가된 라우트 로그
  console.log(`   - 🔧 Arduino HTTP Test: /api/arduino-test`);
  console.log(`   - 🌤️ Weather: /api/weather`);
});

// 프로세스 종료 시 처리
process.on('SIGINT', () => {
  console.log('서버 종료 중...');
  if (global.activeStreams) {
    for (const [streamId, streamInfo] of global.activeStreams) {
      if (streamInfo.process) {
        console.log(`스트림 ${streamId} 정리 중...`);
        streamInfo.process.kill('SIGKILL');
      }
    }
    global.activeStreams.clear();
  }
  process.exit();
});

module.exports = { app, HLS_OUTPUT_DIR };