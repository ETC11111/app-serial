// swagger.js - Swagger API 문서 설정
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SerialLogger IoT API',
      version: '1.0.0',
      description: 'IoT 디바이스 관리 및 센서 데이터 수집 API 문서',
      contact: {
        name: 'API Support',
        email: 'project307@naver.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '로컬 개발 서버'
      },
      {
        url: 'https://seriallog.com',
        description: '프로덕션 서버'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT 토큰을 사용한 인증. 형식: Bearer {token}'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
          description: '쿠키에 저장된 accessToken을 사용한 인증'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '사용자 ID'
            },
            email: {
              type: 'string',
              format: 'email',
              description: '이메일 주소'
            },
            name: {
              type: 'string',
              description: '이름'
            },
            phone: {
              type: 'string',
              description: '전화번호'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: '생성일시'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: '에러 메시지'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              description: '성공 메시지'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Auth',
        description: '인증 관련 API'
      },
      {
        name: 'Devices',
        description: '디바이스 관리 API'
      },
      {
        name: 'Sensors',
        description: '센서 데이터 API'
      },
      {
        name: 'Streams',
        description: '스트리밍 관리 API'
      },
      {
        name: 'Alerts',
        description: '알림 관리 API'
      },
      {
        name: 'Admin',
        description: '관리자 API'
      },
      {
        name: 'Kakao',
        description: '카카오 알림톡 API'
      },
      {
        name: 'Weather',
        description: '날씨 정보 API'
      },
      {
        name: 'Health',
        description: '서버 상태 확인 API'
      },
      {
        name: 'Info',
        description: '서버 정보 API'
      }
    ]
  },
  apis: [
    './routes/*.js', // 라우트 파일들에서 Swagger 주석 읽기
    './server.js' // 서버 파일에서도 읽기
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  swaggerSpec
};

