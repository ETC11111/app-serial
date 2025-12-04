// routes/sensors.js - 통합 센서 데이터 수신/조회 (전체 코드)
const express = require('express');
const mqtt = require('mqtt');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const { cacheMiddleware, invalidateUserCache } = require('../middleware/cache'); // 🔥 추가
const { SENSOR_TYPES, SENSOR_METADATA } = require('../shared/sensorTypes');
const cache = require('../lib/cache'); // 🔥 추가
const router = express.Router();

const sensorMqttClient = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'unified_sensors_' + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  keepalive: 60
});

// 🔥 디바이스 상태 추적을 위한 메모리 캐시 (sensors.js로 이동)
const deviceStatusCache = new Map();
// 🔥 디바이스 상태 알림 설정 (devices.js와 동일하게 유지)
const DEVICE_STATUS_CONFIG = {
  ONLINE_THRESHOLD_MINUTES: 1,   // 5분 이내 = 온라인
  OFFLINE_THRESHOLD_MINUTES: 1, // 15분 이상 = 오프라인
  HYSTERESIS_MINUTES: 2          // 히스테리시스 (상태 변경을 위한 추가 시간)
};

let latestSensorData = {};
let deviceStatus = {};

// 🔥 통합 센서 타입 정의
const UNIFIED_SENSOR_TYPES = SENSOR_METADATA; // 호환성을 위해

// 🔥 디바이스 상태 계산 함수
function getDeviceStatus(lastSeenAt) {
  if (!lastSeenAt) return 'unknown';

  const now = new Date();
  const diffMinutes = (now - new Date(lastSeenAt)) / (1000 * 60);

  if (diffMinutes <= DEVICE_STATUS_CONFIG.ONLINE_THRESHOLD_MINUTES) {
    return 'online';
  } else if (diffMinutes >= DEVICE_STATUS_CONFIG.OFFLINE_THRESHOLD_MINUTES) {
    return 'offline';
  } else {
    return 'recent'; // 중간 상태 (5분 ~ 30분)
  }
}

// 🔥 디바이스 소유자의 모든 수신 번호(메인 + 서브 인증완료) 가져오기
async function getOwnerPhonesAndDeviceInfo(deviceId) {
  // 디바이스/소유자 기본 정보
  const rows = await Database.query(
    `SELECT u.id AS user_id, u.name, u.phone AS primary_phone,
            d.device_name, d.admin_name, d.device_location
       FROM devices d
       JOIN users u ON d.registered_by = u.id
      WHERE d.device_id = $1`,
    [deviceId]
  );
  if (rows.length === 0) {
    return { owner: null, device: null, phones: [] };
  }
  const owner = rows[0];

  // 서브 번호(인증된 것만)
  const subs = await Database.query(
    `SELECT phone
       FROM user_phones
      WHERE user_id = $1
        AND is_verified = true
      ORDER BY is_primary DESC, created_at ASC`,
    [owner.user_id]
  );

  // 메인 + 서브 합치고 하이픈 제거 후 중복 제거
  const set = new Set();
  const add = (p) => {
    if (!p) return;
    const n = String(p).replace(/-/g, '').trim();
    if (n) set.add(n);
  };
  add(owner.primary_phone);
  for (const s of subs) add(s.phone);

  return {
    owner: { id: owner.user_id, name: owner.name, adminName: owner.admin_name },
    device: {
      name: owner.device_name,
      location: owner.device_location || '위치 정보 없음'
    },
    phones: Array.from(set)
  };
}

// 🔥 디바이스 상태 알림 발송 함수 (devices.js에서 가져오기)
// 🔥 디바이스 상태 알림 발송 (모든 등록 번호로 발송)
// 🔥 디바이스 상태 알림 발송 (모든 등록 번호로 발송)
async function sendDeviceStatusAlert(deviceId, newStatus, lastSeenAt) {
  try {
    const KAKAO_CONFIG = {
      userid: 'etcom262',
      profile: 'd3393e690b02911e022c8e305920de8a3b6520f2', // 기존 sensors.js 값 유지
      smsSender: '01022957774',
      apiUrl: 'https://alimtalk-api.bizmsg.kr/v2/sender/send'
    };

    const info = await getOwnerPhonesAndDeviceInfo(deviceId);
    if (!info.owner || info.phones.length === 0) {
      console.warn(`⚠️ 상태알림 수신번호 없음: deviceId=${deviceId}`);
      return false;
    }

    const ts = new Date().toLocaleString('ko-KR');
    const lastSeenText = lastSeenAt ? new Date(lastSeenAt).toLocaleString('ko-KR') : '알 수 없음';

    // 🔥 템플릿 생성 시 deviceId를 명시적으로 전달
    const template = generateDeviceStatusTemplate(newStatus, {
      deviceName: info.device.name,
      adminName: info.owner.adminName,
      ownerName: info.owner.name,
      deviceLocation: info.device.location,
      timestamp: ts,
      lastSeenAt: lastSeenText
    }, deviceId); // 🔥 deviceId 파라미터 추가

    // 각 번호에 병렬 발송
    const tasks = info.phones.map(async (phn) => {
      // 🔥 PHP 코드와 동일한 구조로 payload 생성
      const payload = [{
        message_type: 'AT',
        phn,
        profile: KAKAO_CONFIG.profile,
        tmplId: template.tmplId,
        msg: template.message,
        smsKind: 'L',
        msgSms: template.message,
        smsSender: KAKAO_CONFIG.smsSender,
        smsLmsTit: template.title,
        reserveDt: '00000000000000'
      }];

      // 🔥 PHP 방식처럼 조건부로 버튼 추가 (isset 체크와 동일)
      if (template.button1) {
        payload[0].button1 = template.button1;
      }
      if (template.button2) {
        payload[0].button2 = template.button2;
      }

      try {
        const resp = await fetch(KAKAO_CONFIG.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'userid': KAKAO_CONFIG.userid
          },
          body: JSON.stringify(payload) // 🔥 PHP처럼 배열로 감싸기
        });

        const result = await resp.json();
        if (resp.ok && result[0]?.code === 'success') {
          return { phone: phn, ok: true };
        } else {
          console.error(`❌ 상태알림 발송 실패: ${phn}`, result);
          return { phone: phn, ok: false, error: result };
        }
      } catch (err) {
        console.error(`❌ 상태알림 예외: ${phn}`, err);
        return { phone: phn, ok: false, error: err?.message || err };
      }
    });

    const results = await Promise.all(tasks);
    const ok = results.some(r => r.ok);
    const fail = results.filter(r => !r.ok).length;

    if (!ok) {
      console.error(`❌ 상태알림 전체 실패: deviceId=${deviceId}`, results);
      return false;
    }
    if (fail > 0) {
      console.warn(`⚠️ 상태알림 일부 실패: 성공 ${results.length - fail} / 실패 ${fail}`);
    }

    // 상태 변화 로그 저장 (한 번만 기록)
    await Database.query(
      `INSERT INTO device_status_logs (device_id, status_change, message, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [deviceId, newStatus, `디바이스가 ${newStatus === 'online' ? '온라인' : '오프라인'} 상태로 변경되었습니다.`]
    );

    return true;
  } catch (error) {
    console.error('디바이스 상태 알림 다중 발송 오류:', error);
    return false;
  }
}
// 🔥 디바이스 상태 템플릿 생성 (규격 고정)
//  - seriallog1: 온라인(모니터링 시작)  → 버튼 포함
//  - seriallog2: 오프라인(통신 중단)    → 버튼 없음
function generateDeviceStatusTemplate(newStatus, data, deviceId) {
  const systemType = data.systemType || '시리얼로거 데이터로거';
  const userName = data.ownerName || data.adminName || '사용자';
  const deviceName = data.deviceName || '장치';
  const location = data.deviceLocation || '위치 정보 없음';

  const baseUrl =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    'https://seriallog.com';

  // 🔥 deviceId 파라미터 우선 사용, 없으면 data.deviceId 사용
  const actualDeviceId = deviceId || data.deviceId;
  const deviceUrl = actualDeviceId
    ? `${baseUrl}/devices/${encodeURIComponent(actualDeviceId)}`
    : baseUrl;

  if (newStatus === 'online') {
    // ✅ seriallog1: 버튼 1개만 (PHP의 idx 0번과 동일)
    const message =
      `${userName}님의 ${systemType} ${deviceName} 모니터링 시작


장치위치: ${location}
장치상태 : 온라인
시작시간: ${data.timestamp}


시리얼로거 데이터로거 장치 모니터링을 시작합니다.`;

    return {
      tmplId: 'seriallog1',
      title: '(안내)',
      message,
      button1: {
        name: '채널 추가',
        type: 'AC'
      }
    };
  }

  // ✅ seriallog2: 버튼 없음 (그대로 유지)
  const message =
    `${userName}님의 ${systemType} ${deviceName} 통신 중단


장치위치: ${location}
장치상태 : 오프라인
최종 통신 시간: ${data.timestamp}


장치 통신에 에러가 발생하였습니다.
현장에서 장치 연결 상태, 네트워크상태 등을 확인해주세요.`;

  return {
    tmplId: 'seriallog2',
    title: '(안내)',
    message
  };
}


// 🔥 디바이스 상태 변화 알림 체크 함수
// async function checkDeviceStatusChange(deviceId, lastSeenAt) {
//   try {
//     const currentStatus = getDeviceStatus(lastSeenAt);
//     // const cachedStatus = deviceStatusCache.get(deviceId) || 'unknown';
//     let cachedStatus = deviceStatusCache.get(deviceId);
//     // 🔥 캐시가 없으면 DB에서 마지막 상태 조회
//     if (!cachedStatus) {
//       const lastStatusLog = await Database.query(
//         `SELECT status_change FROM device_status_logs 
//           WHERE device_id = $1 
//           ORDER BY created_at DESC 
//           LIMIT 1`,
//         [deviceId]
//       );

//       if (lastStatusLog.length > 0) {
//         cachedStatus = lastStatusLog[0].status_change;
//         //console.log(`🔍 DB에서 마지막 상태 조회: ${deviceId} → ${cachedStatus}`);
//       } else {
//         cachedStatus = 'unknown';
//         //console.log(`🔍 DB에 상태 기록 없음: ${deviceId} → unknown`);
//       }

//       // 메모리 캐시에 저장
//       deviceStatusCache.set(deviceId, cachedStatus);
//     }
//     //console.log(`📊 상태 체크 상세: ${deviceId}`);
//     //console.log(`  - 현재 상태: ${currentStatus}`);
//     //console.log(`  - 캐시된 상태: ${cachedStatus}`);
//     //console.log(`  - 마지막 접속: ${lastSeenAt}`);

//     // 상태가 변경되었는지 확인
//     // 상태가 변경되었는지 확인
//     if (currentStatus !== cachedStatus) {
//       //console.log(`📊 디바이스 상태 변화 감지: ${deviceId} (${cachedStatus} → ${currentStatus})`);

//       // 🔥 실제 상태 변화만 알림 발송 (unknown 제외)
//       const shouldSendAlert = 
//         (cachedStatus === 'offline' && currentStatus === 'online') ||
//         (cachedStatus === 'online' && currentStatus === 'offline') ||
//         (cachedStatus === 'unknown' && currentStatus === 'offline'); // unknown → online은 제외

//       //console.log(`  - 알림 발송 여부: ${shouldSendAlert}`);
//       //console.log(`  - offline→online: ${cachedStatus === 'offline' && currentStatus === 'online'}`);
//       //console.log(`  - online→offline: ${cachedStatus === 'online' && currentStatus === 'offline'}`);
//       //console.log(`  - unknown→offline: ${cachedStatus === 'unknown' && currentStatus === 'offline'}`);

//       if (shouldSendAlert) {
//         //console.log(`📤 알림 발송 시도: ${deviceId} (${currentStatus})`);
//         await sendDeviceStatusAlert(deviceId, currentStatus, lastSeenAt);
//       } else {
//         //console.log(`⏭️ 알림 발송 조건 불만족: ${deviceId} (서버 재시작 후 첫 접속으로 판단)`);
//       }

//       // 상태 캐시 업데이트
//       deviceStatusCache.set(deviceId, currentStatus);
//       //console.log(`💾 상태 캐시 업데이트: ${deviceId} → ${currentStatus}`);
//     } else {
//       //console.log(`⏭️ 상태 변화 없음: ${deviceId} (${currentStatus})`);
//     }

//   } catch (error) {
//     console.error('디바이스 상태 변화 체크 오류:', error);
//   }
// }
// 🔥 DB 기반 디바이스 상태 변화 체크 함수 (개선된 버전)
async function checkDeviceStatusChange(deviceId, lastSeenAt) {
  try {
    const currentStatus = getDeviceStatus(lastSeenAt);

    // 🔥 항상 DB에서 마지막 상태 조회
    const lastStatusLog = await Database.query(
      `SELECT status_change FROM device_status_logs 
       WHERE device_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [deviceId]
    );

    const previousStatus = lastStatusLog.length > 0 ? lastStatusLog[0].status_change : 'unknown';

    //console.log(`📊 상태 체크 상세: ${deviceId}`);
    //console.log(`  - 현재 상태: ${currentStatus}`);
    //console.log(`  - 이전 상태: ${previousStatus} (DB 조회)`);
    //console.log(`  - 마지막 접속: ${lastSeenAt}`);

    // 상태가 변경되었는지 확인
    if (currentStatus !== previousStatus) {
      //console.log(`📊 디바이스 상태 변화 감지: ${deviceId} (${previousStatus} → ${currentStatus})`);

      // 🔥 실제 의미있는 상태 변화만 알림 발송
      const shouldSendAlert =
        (previousStatus === 'offline' && currentStatus === 'online') ||
        (previousStatus === 'online' && currentStatus === 'offline') ||
        (previousStatus === 'unknown' && currentStatus === 'offline'); // 새 디바이스가 오프라인인 경우만

      //console.log(`  - 알림 발송 여부: ${shouldSendAlert}`);
      //console.log(`  - offline→online: ${previousStatus === 'offline' && currentStatus === 'online'}`);
      //console.log(`  - online→offline: ${previousStatus === 'online' && currentStatus === 'offline'}`);
      //console.log(`  - unknown→offline: ${previousStatus === 'unknown' && currentStatus === 'offline'}`);

      if (shouldSendAlert) {
        //console.log(`📤 알림 발송 시도: ${deviceId} (${currentStatus})`);
        await sendDeviceStatusAlert(deviceId, currentStatus, lastSeenAt);
      } else {
        //console.log(`⏭️ 알림 발송 조건 불만족: ${deviceId} (unknown→online은 제외)`);
      }
    } else {
      //console.log(`⏭️ 상태 변화 없음: ${deviceId} (${currentStatus})`);
    }

  } catch (error) {
    console.error('디바이스 상태 변화 체크 오류:', error);
  }
}

// 🔥 MQTT 센서 데이터 수신 시 호출되는 함수 (인증 없이)
async function handleSensorDataUpdate(deviceId, sensorData) {
  try {
    //console.log(`📊 MQTT 센서 데이터 처리: ${deviceId}`);

    // 디바이스 존재 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceCheck.length === 0) {
      //console.log(`❌ 등록되지 않은 디바이스: ${deviceId}`);
      return false;
    }

    const now = new Date();

    // 🔥 디바이스 last_seen_at 업데이트 (상태 추적을 위해)
    await Database.query(
      'UPDATE devices SET last_seen_at = $1 WHERE device_id = $2',
      [now, deviceId]
    );

    // 🔥 상태 변화 체크 및 알림 발송
    await checkDeviceStatusChange(deviceId, now);

    // 센서 데이터 저장 (배치로 처리)
    if (Array.isArray(sensorData)) {
      for (const data of sensorData) {
        await Database.query(
          `INSERT INTO sensor_data (device_id, sensor_type, value, unit, timestamp)
           VALUES ($1, $2, $3, $4, $5)`,
          [deviceId, data.type, data.value, data.unit || null, now]
        );
      }
    } else {
      await Database.query(
        `INSERT INTO sensor_data (device_id, sensor_type, value, unit, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [deviceId, sensorData.type, sensorData.value, sensorData.unit || null, now]
      );
    }

    //console.log(`✅ MQTT 센서 데이터 처리 완료: ${deviceId}`);

    //console.log(`🔔 알림 체크 시작: ${deviceId}`);

    // alerts.js의 checkAlerts 함수 호출
    const alertsModule = require('./alerts');
    if (alertsModule.checkAlerts) {
      await alertsModule.checkAlerts(deviceId, sensorData); // 🔥 압축 해제된 데이터 전달
      //console.log(`✅ 알림 체크 완료: ${deviceId}`);
    } else {
      //console.log(`❌ checkAlerts 함수를 찾을 수 없음`);
    }

    // 관련 캐시 무효화
    if (cache && cache.del) {
      await cache.del(`device:sensors:${deviceId}`);
    }

    return true;

  } catch (error) {
    console.error('MQTT 센서 데이터 처리 오류:', error);
    return false;
  }
}

// 🔥 바이너리 데이터 파싱 함수
// 🔥 바이너리 데이터 파싱 함수에 로그 추가
// routes/sensors.js - decompressBinaryData 함수 수정
function decompressBinaryData(buffer) {
  try {
    if (buffer.length < 8) {
      console.error('❌ 바이너리 데이터 크기 부족:', buffer.length);
      return null;
    }

    let offset = 0;
    const deviceId = buffer[offset++];
    const functionCode = buffer[offset++];
    const timestamp = (buffer[offset++] << 24) | (buffer[offset++] << 16) |
      (buffer[offset++] << 8) | buffer[offset++];
    const sensorCount = buffer[offset++];
    const reserved = buffer[offset++];

    // console.log(`📦 바이너리 헤더 파싱:`);
    // console.log(`   - Device ID: ${deviceId}`);
    // console.log(`   - Function Code: 0x${functionCode.toString(16).padStart(2, '0')}`);
    // console.log(`   - Timestamp: ${timestamp}`);
    // console.log(`   - Sensor Count: ${sensorCount}`);

    const sensors = [];

    for (let i = 0; i < sensorCount && offset + 10 <= buffer.length; i++) {
      // console.log(`🔧 센서 파싱 #${i}: offset=${offset}, buffer[offset]=${buffer[offset]}`);
      
      const sensorId = buffer[offset++];
      const sensorType = buffer[offset++];
      const slaveId = buffer[offset++]; // 🔥 Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
      const channel = buffer[offset++]; // 🔥 CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
      // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)

      const value1 = (buffer[offset++] << 8) | buffer[offset++];
      const value2 = (buffer[offset++] << 8) | buffer[offset++];
      // ✅ 토양센서의 경우 reserved1, reserved2도 16비트 값 (EC, pH)
      // 일반 센서는 1바이트씩, 토양센서는 2바이트씩 읽기
      let reserved1, reserved2;
      if (sensorType === 19) { // 토양센서
        reserved1 = (buffer[offset++] << 8) | buffer[offset++];  // EC (16비트)
        reserved2 = (buffer[offset++] << 8) | buffer[offset++];  // pH (16비트)
      } else {
        reserved1 = buffer[offset++];  // 1바이트
        reserved2 = buffer[offset++]; // 1바이트
      }

      // const typeInfo = UNIFIED_SENSOR_TYPES[sensorType] || { 
      //   name: 'UNKNOWN', 
      //   protocol: 'unknown', 
      //   values: ['value1', 'value2'] 
      // };

      // 🔥 센서 타입별 값 변환 로직 수정
      let convertedValues = [];
      let valueNames = [];

      switch (sensorType) {
        case 1: // SHT20 - 온도/습도 (×100)
          convertedValues = [value1 / 100, value2 / 100];
          valueNames = ['temperature', 'humidity'];
          // console.log(`   - 변환값: 온도=${convertedValues[0]}°C, 습도=${convertedValues[1]}%`);
          break;

        case 2: // TSL2591 - 조도 (×1로 전송, 그대로 사용)
          convertedValues = [value1];  // 🔥 UNO에서 ×1로 전송하므로 그대로 사용
          valueNames = ['light_level'];
          // console.log(`   - 변환값: 조도=${convertedValues[0]} lux`);
          break;

        case 3: // ADS1115 - pH/EC/WaterTemp 🔥 waterTemp 추가
          convertedValues = [
            value1 / 100,           // pH는 그대로
            value2 / 10,            // 🔥 EC: dS/m (×10으로 전송됨)
            (reserved1 << 8 | reserved2) / 100  // 🔥 waterTemp: ×100으로 전송됨
          ];
          valueNames = ['ph', 'ec', 'water_temp'];
          // console.log(`   - 변환값: pH=${convertedValues[0]}, EC=${convertedValues[1]} dS/m, WaterTemp=${convertedValues[2]}°C`);
          break;

        case 4: // SCD30 - CO2 (정수값 그대로) 🔥 값 하나만
          convertedValues = [value1];  // 🔥 배열에 값 하나만 추가
          valueNames = ['co2_ppm'];
          // console.log(`   - 변환값: CO2=${convertedValues[0]} ppm`);
          break;

        case 5: // DS18B20 - 온도 (×100) 🔥 값 하나만
          convertedValues = [value1 / 100];  // 🔥 배열에 값 하나만 추가
          valueNames = ['temperature'];
          // console.log(`   - 변환값: 온도=${convertedValues[0]}°C`);
          break;

        case 6: // BH1750 (×1로 전송, 그대로 사용)
          convertedValues = [value1];  // 🔥 UNO에서 ×1로 전송하므로 그대로 사용
          valueNames = ['light_level'];
          // console.log(` - 변환값: 조도=${convertedValues[0]} lux (type=6)`);
          break;

        case 7: // MH-Z19 (PWM, CO2)
          convertedValues = [value1];
          valueNames = ['co2_ppm'];
          // console.log(`   - 변환값: CO2=${convertedValues[0]} ppm (MH-Z19)`);
          break;

        case 16: // 🔥 풍향 센서
          // 8방향 문자열 배열
          const directions = ['북풍(N)', '북동풍(NE)', '동풍(E)', '남동풍(SE)',
            '남풍(S)', '남서풍(SW)', '서풍(W)', '북서풍(NW)'];

          const gearDirection = value1;
          const degreeDirection = value2;

          // 풍향 문자열 계산
          let windDirectionStr = '';
          if (gearDirection >= 0 && gearDirection <= 7) {
            windDirectionStr = directions[gearDirection];
          } else {
            // 360도 값으로 계산
            if (degreeDirection >= 0 && degreeDirection < 22.5) windDirectionStr = '북풍(N)';
            else if (degreeDirection < 67.5) windDirectionStr = '북동풍(NE)';
            else if (degreeDirection < 112.5) windDirectionStr = '동풍(E)';
            else if (degreeDirection < 157.5) windDirectionStr = '남동풍(SE)';
            else if (degreeDirection < 202.5) windDirectionStr = '남풍(S)';
            else if (degreeDirection < 247.5) windDirectionStr = '남서풍(SW)';
            else if (degreeDirection < 292.5) windDirectionStr = '서풍(W)';
            else if (degreeDirection < 337.5) windDirectionStr = '북서풍(NW)';
            else windDirectionStr = '북풍(N)';
          }

          convertedValues = [gearDirection, degreeDirection, windDirectionStr];
          valueNames = ['gear_direction', 'degree_direction', 'direction_text'];
          console.log(`   - 변환값: 기어=${gearDirection}, 각도=${degreeDirection}°, 방향=${windDirectionStr}`);
          break;

        case 17: // 🔥 풍속 센서
          const rawWindSpeed = value1;
          const windSpeedMs = rawWindSpeed / 10.0;  // 실제 m/s 값

          // 풍속 등급 계산 (보퍼트 풍력계급)
          let windScale = '';
          let windCondition = '';

          if (windSpeedMs === 0) {
            windScale = '무풍';
            windCondition = '고요';
          } else if (windSpeedMs < 0.2) {
            windScale = '감지한계';
            windCondition = '연기 방향 감지 곤란';
          } else if (windSpeedMs < 1.5) {
            windScale = '실바람';
            windCondition = '연기 방향으로 감지';
          } else if (windSpeedMs < 3.3) {
            windScale = '남실바람';
            windCondition = '바람이 얼굴에 느껴짐';
          } else if (windSpeedMs < 5.4) {
            windScale = '산들바람';
            windCondition = '나뭇잎이 흔들림';
          } else if (windSpeedMs < 7.9) {
            windScale = '건들바람';
            windCondition = '작은 가지가 흔들림';
          } else if (windSpeedMs < 10.7) {
            windScale = '흔들바람';
            windCondition = '큰 가지가 흔들림';
          } else if (windSpeedMs < 13.8) {
            windScale = '된바람';
            windCondition = '나무 전체가 흔들림';
          } else if (windSpeedMs < 17.1) {
            windScale = '센바람';
            windCondition = '걷기 곤란';
          } else {
            windScale = '강풍';
            windCondition = '심한 손상 가능';
          }

          convertedValues = [windSpeedMs, windScale, windCondition];
          valueNames = ['wind_speed_ms', 'wind_scale', 'wind_condition'];
          console.log(`   - 변환값: 풍속=${windSpeedMs.toFixed(1)}m/s, 등급=${windScale}, 상태=${windCondition}`);
          break;



        case 18: // 🔥 강우/강설 센서 (새로 추가)
          // 첫 번째 값: 강수 상태(상위 4비트) + 수분 레벨(하위 12비트)
          const precipStatus = (value1 >> 12) & 0x0F;
          const moistureLevel = value1 & 0x0FFF;

          // 두 번째 값: 온도(상위 8비트) + 습도(하위 8비트)
          const tempByte = (value2 >> 8) & 0xFF;
          const humidity = value2 & 0xFF;
          const temperature = tempByte - 40; // -40~215°C 범위에서 실제 온도로 변환

          // 강수 상태 문자열 변환
          let precipStatusText = '';
          let precipIcon = '';
          switch (precipStatus) {
            case 0:
              precipStatusText = '건조';
              precipIcon = '☀️';
              break;
            case 1:
              precipStatusText = '강우';
              precipIcon = '🌧️';
              break;
            case 2:
              precipStatusText = '강설';
              precipIcon = '🌨️';
              break;
            default:
              precipStatusText = '알 수 없음';
              precipIcon = '❓';
              break;
          }

          // 수분 레벨에 따른 강도 평가
          let moistureIntensity = '';
          if (precipStatus > 0) { // 강우 또는 강설이 감지된 경우
            if (moistureLevel > 3000) {
              moistureIntensity = '강함';
            } else if (moistureLevel > 1500) {
              moistureIntensity = '보통';
            } else if (moistureLevel > 500) {
              moistureIntensity = '약함';
            } else {
              moistureIntensity = '미약';
            }
          } else {
            if (moistureLevel > 500) {
              moistureIntensity = '잔여수분';
            } else {
              moistureIntensity = '완전건조';
            }
          }

          // 온도 상태 평가
          let tempStatus = '';
          if (temperature >= 30) {
            tempStatus = '높음';
          } else if (temperature >= 20) {
            tempStatus = '적정';
          } else if (temperature >= 10) {
            tempStatus = '낮음';
          } else if (temperature >= 0) {
            tempStatus = '매우낮음';
          } else {
            tempStatus = '결빙위험';
          }

          convertedValues = [
            precipStatus,           // 강수 상태 코드 (0=건조, 1=강우, 2=강설)
            precipStatusText,       // 강수 상태 텍스트
            moistureLevel,          // 수분 레벨 (0-4095)
            moistureIntensity,      // 수분 강도 텍스트
            temperature,            // 온도 (°C)
            humidity,               // 습도 (%)
            tempStatus,             // 온도 상태 텍스트
            precipIcon              // 아이콘
          ];

          valueNames = [
            'precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity',
            'temperature', 'humidity', 'temp_status', 'precip_icon'
          ];

          console.log(`   - 변환값: ${precipIcon}${precipStatusText}(${precipStatus}), 수분=${moistureLevel}(${moistureIntensity}), 온도=${temperature}°C(${tempStatus}), 습도=${humidity}%`);
          break;

        case 19: // 🔥 토양 센서 (H, T, EC, PH, NPK) - 습도 활성화
          // ✅ UNO 레지스터 순서: reg0=습도, reg1=온도, reg2=EC, reg3=pH
          // ✅ Mega 전송 순서: value1=습도, value2=온도, reserved1=EC, reserved2=pH
          // ✅ 서버 기대 순서: pH, EC, 온도, 습도
          
          // 🔥 디버깅: 원시 값 출력
          console.log(`   - 토양센서 원시값: value1=${value1} (습도), value2=${value2} (온도), reserved1=${reserved1} (EC), reserved2=${reserved2} (pH)`);
          
          // UNO에서 전송된 값 (16비트)
          // 습도: value1 (0-1000, 실제값 = value1 / 10.0)
          // 온도: value2 (0-2550, 실제값 = value2 / 10.0)
          // EC: reserved1 (μS/cm, 실제값 = reserved1 / 1000.0 → dS/m)
          // pH: reserved2 (×10 스케일, 실제값 = reserved2 / 10.0)
          
          const soilHumidity = value1 / 10.0;      // 습도 (%)
          const soilTemp = value2 / 10.0;          // 온도 (°C)
          const soilEC = reserved1 / 1000.0;       // EC (μS/cm → dS/m 변환)
          const soilPH = reserved2 / 10.0;         // pH (×10 스케일)

          // ✅ 토양센서: pH, EC, 온도, 습도 순서로 변환 (서버 기대 순서)
          convertedValues = [
            soilPH, soilEC, soilTemp, soilHumidity
          ];

          valueNames = [
            'soil_ph','soil_ec','soil_temperature','soil_humidity'
          ];

          console.log(`   - 변환값: pH=${soilPH.toFixed(1)}, EC=${soilEC.toFixed(3)}dS/m, 온도=${soilTemp.toFixed(1)}°C, 습도=${soilHumidity.toFixed(1)}%`);
          break;

        default: // Modbus 센서들 또는 알 수 없는 센서
          if (sensorType >= 11) {
            convertedValues = [value1 / 100, value2 / 100];
            valueNames = ['value1', 'value2'];
            console.log(`   - 변환값: Modbus값1=${convertedValues[0]}, 값2=${convertedValues[1]}`);
          } else {
            convertedValues = [value1, value2];
            valueNames = ['value1', 'value2'];
            console.log(`   - 변환값: 원시값1=${convertedValues[0]}, 값2=${convertedValues[1]}`);
          }
          break;
      }

      const typeInfo = UNIFIED_SENSOR_TYPES[sensorType] || {
        name: 'UNKNOWN',
        protocol: 'unknown',
        values: valueNames
      };

      // 🔥 CH = UNO_ID (Mega에서 할당한 물리적 순서, 1~6)
      // CH와 Mega 핀 매핑: D38=1, D39=2, D40=3, D41=4, D42=5, D43=6
      const megaPin = 37 + channel; // Mega 핀 번호 계산
      
      // 🔥 디버깅: 센서 정보 출력
      console.log(`🔍 센서 #${i}: ID=${sensorId}, Type=${sensorType}, SlaveID=${slaveId}, CH=${channel} (UNO_ID=${channel}, Mega핀=D${megaPin})`);
      
      // status 필드는 제거되었으므로 항상 active=true
      sensors.push({
        sensor_id: sensorId,
        type: sensorType,
        protocol: typeInfo.protocol,
        channel: channel, // 🔥 UNO_ID를 CH로 직접 사용 (Mega에서 할당한 물리적 순서)
        slaveId: slaveId, // 🔥 Combined ID 저장
        status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
        active: true,
        values: convertedValues,
        value_names: valueNames,
        // 🔥 물리적 위치 정보 추가
        physical_port: channel, // 제품 포트 번호 (1~6)
        mega_pin: `D${megaPin}`, // Mega 핀 번호 (D38~D43)
        uno_id: channel // UNO_ID 명시적 저장
      });
    }

    // 🔥 센서 이름 생성 (재할당된 채널 번호 사용)
    sensors.forEach(sensor => {
      const typeInfo = UNIFIED_SENSOR_TYPES[sensor.type] || {
        name: 'UNKNOWN',
        protocol: 'unknown'
      };

      let sensorName;
      if (sensor.type >= 11) {
        // Modbus 센서: 타입명 + 채널
        const modbusTypeNames = {
          11: '온습도센서',
          12: '압력센서', 
          13: '유량센서',
          14: '릴레이모듈',
          15: '전력계',
          16: '풍향센서',
          17: '풍속센서',
          18: '강우강설센서',
          19: '토양센서'
        };
        const typeName = modbusTypeNames[sensor.type] || `Modbus센서_${sensor.type}`;
        sensorName = `${typeName}_CH${sensor.channel}`;
      } else {
        // I2C 센서: 타입명 + 채널 (예: SHT20_CH1, SHT20_CH2)
        sensorName = `${typeInfo.name}_CH${sensor.channel}`;
      }
      sensor.name = sensorName;
    });

    // CRC 검증 로그
    const crcOffset = buffer.length - 2;
    const receivedCRC = buffer[crcOffset] | (buffer[crcOffset + 1] << 8);
    const calculatedCRC = calculateCRC(buffer.slice(0, crcOffset));
    console.log(`🔐 CRC 검증: 수신=${receivedCRC.toString(16)}, 계산=${calculatedCRC.toString(16)}, ${receivedCRC === calculatedCRC ? '✅' : '❌'}`);

    const result = {
      device_id: deviceId,  // 🔥 원본 deviceId 사용 (ARDUINO_MEGA 변환 제거)
      timestamp: Date.now(),
      sensor_count: sensors.length,
      sensors: sensors,
      protocols: {
        i2c: sensors.filter(s => s.protocol === 'i2c').length,
        modbus: sensors.filter(s => s.protocol === 'modbus').length
      },
      receivedAt: new Date().toISOString()
    };

    console.log(`✅ 바이너리 파싱 완료: ${deviceId}`); // 🔥 로그도 원본 사용
    return result;

  } catch (error) {
    console.error('❌ 바이너리 데이터 파싱 오류:', error);
    return null;
  }
}

// CRC 계산 함수
function calculateCRC(buffer) {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// 압축 해제 함수
function decompressUnifiedData(compressed) {
  // 🔥 먼저 모든 센서를 파싱하고, 동종 센서에 대해 채널 재계산
  const rawSensors = compressed.s.map(s => {
      const typeInfo = UNIFIED_SENSOR_TYPES[s[1]] || { name: 'UNKNOWN', protocol: 'unknown', values: [] };

      // 🔥 센서 타입별 값 변환
      let values = [];
      let valueNames = [];
      const sensorType = s[1];
      const rawValues = s.slice(4);

      switch (sensorType) {
        case 1: // SHT20
          values = [rawValues[0] / 100, rawValues[1] / 100];
          valueNames = ['temperature', 'humidity'];
          break;
        case 2: // TSL2591 (×1로 전송, 그대로 사용)
          values = [rawValues[0]];  // 🔥 UNO에서 ×1로 전송하므로 그대로 사용
          valueNames = ['light_level'];
          break;
        case 3: // ADS1115 - pH/EC/WaterTemp
          values = [rawValues[0] / 100, rawValues[1] / 100, rawValues[2] / 100];  // EC: dS/m × 100 ÷ 100 = dS/m
          valueNames = ['ph', 'ec', 'water_temp'];
          break;
        case 4: // SCD30 🔥 값 하나만
          values = [rawValues[0]];
          valueNames = ['co2_ppm'];
          break;
        case 5: // DS18B20 🔥 값 하나만
          values = [rawValues[0] / 100];
          valueNames = ['temperature'];
          break;
        case 6: // BH1750 (×1로 전송, 그대로 사용)
          values = [rawValues[0]];  // 🔥 UNO에서 ×1로 전송하므로 그대로 사용
          valueNames = ['light_level'];
          break;
        case 7: // MH-Z19 (PWM, CO2)
          values = [rawValues[0]];
          valueNames = ['co2_ppm'];
          break;

        // 압축 해제 함수에서도 동일하게 수정
        case 16: // 🔥 풍향 센서 - 저장된 2개 값으로 텍스트 재생성
          const gearDirection = rawValues[0];
          const degreeDirection = rawValues[1];

          const directions = ['북풍(N)', '북동풍(NE)', '동풍(E)', '남동풍(SE)',
            '남풍(S)', '남서풍(SW)', '서풍(W)', '북서풍(NW)'];

          let windDirectionStr = '';
          if (gearDirection >= 0 && gearDirection <= 7) {
            windDirectionStr = directions[gearDirection];
          } else {
            // 360도 값으로 계산
            if (degreeDirection >= 0 && degreeDirection < 22.5) windDirectionStr = '북풍(N)';
            else if (degreeDirection < 67.5) windDirectionStr = '북동풍(NE)';
            else if (degreeDirection < 112.5) windDirectionStr = '동풍(E)';
            else if (degreeDirection < 157.5) windDirectionStr = '남동풍(SE)';
            else if (degreeDirection < 202.5) windDirectionStr = '남풍(S)';
            else if (degreeDirection < 247.5) windDirectionStr = '남서풍(SW)';
            else if (degreeDirection < 292.5) windDirectionStr = '서풍(W)';
            else if (degreeDirection < 337.5) windDirectionStr = '북서풍(NW)';
            else windDirectionStr = '북풍(N)';
          }

          values = [gearDirection, degreeDirection, windDirectionStr];
          valueNames = ['gear_direction', 'degree_direction', 'direction_text'];
          break;

        case 17: // 🔥 풍속 센서 - 저장된 1개 값으로 텍스트 재생성
          const windSpeedMs = rawValues[0] / 10.0;  // ×10으로 저장했으므로 복원

          // 풍속 등급 재계산
          let windScale = '';
          let windCondition = '';

          if (windSpeedMs === 0) {
            windScale = '무풍';
            windCondition = '고요';
          } else if (windSpeedMs < 0.2) {
            windScale = '감지한계';
            windCondition = '연기 방향 감지 곤란';
          } else if (windSpeedMs < 1.5) {
            windScale = '실바람';
            windCondition = '연기 방향으로 감지';
          } else if (windSpeedMs < 3.3) {
            windScale = '남실바람';
            windCondition = '바람이 얼굴에 느껴짐';
          } else if (windSpeedMs < 5.4) {
            windScale = '산들바람';
            windCondition = '나뭇잎이 흔들림';
          } else if (windSpeedMs < 7.9) {
            windScale = '건들바람';
            windCondition = '작은 가지가 흔들림';
          } else if (windSpeedMs < 10.7) {
            windScale = '흔들바람';
            windCondition = '큰 가지가 흔들림';
          } else if (windSpeedMs < 13.8) {
            windScale = '된바람';
            windCondition = '나무 전체가 흔들림';
          } else if (windSpeedMs < 17.1) {
            windScale = '센바람';
            windCondition = '걷기 곤란';
          } else {
            windScale = '강풍';
            windCondition = '심한 손상 가능';
          }

          values = [windSpeedMs, windScale, windCondition];
          valueNames = ['wind_speed_ms', 'wind_scale', 'wind_condition'];
          break;

        case 18: // 🔥 강우/강설 센서 - 저장된 4개 값으로 텍스트 재생성
          const precipStatusCode = rawValues[0];
          const moistureLvl = rawValues[1];
          const temp2 = rawValues[2] / 100; // ×100으로 저장했으므로 복원
          const humidity2 = rawValues[3];

          // 텍스트 재생성
          let precipText = '';
          let precipEmoji = '';
          switch (precipStatusCode) {
            case 0: precipText = '건조'; precipEmoji = '☀️'; break;
            case 1: precipText = '강우'; precipEmoji = '🌧️'; break;
            case 2: precipText = '강설'; precipEmoji = '🌨️'; break;
            default: precipText = '알 수 없음'; precipEmoji = '❓'; break;
          }

          let moistureIntens = '';
          if (precipStatusCode > 0) {
            if (moistureLvl > 3000) moistureIntens = '강함';
            else if (moistureLvl > 1500) moistureIntens = '보통';
            else if (moistureLvl > 500) moistureIntens = '약함';
            else moistureIntens = '미약';
          } else {
            if (moistureLvl > 500) moistureIntens = '잔여수분';
            else moistureIntens = '완전건조';
          }

          values = [
            precipStatusCode, precipText, moistureLvl, moistureIntens,
            temp2, humidity2, precipEmoji
          ];
          valueNames = [
            'precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity',
            'temperature', 'humidity', 'precip_icon'
          ];
          break;

        case 19: // 🔥 토양 센서 - 저장된 4개 값으로 복원 (실제 센서 값만)
          // ✅ 저장 형식: [pH×100, EC×100, T×100, H]
          // ✅ pH는 ×10 스케일로 저장되므로 /10으로 복원 (×100이 아니라 ×10으로 저장됨)
          // ✅ EC는 ×100 스케일로 저장되므로 /100으로 복원
          const savedPH       = rawValues[0] / 10;   // pH (×10 스케일)
          const savedEC       = rawValues[1] / 100;  // EC (×100 스케일, dS/m)
          const savedTemp     = rawValues[2] / 100;  // 실제 토양 온도값
          const savedHumidity = rawValues[3];        // 토양 습도 (%)

          // 실제 센서 값 4개만 사용 (상태값, NPK 제거)
          values = [savedPH, savedEC, savedTemp, savedHumidity];
          valueNames = ['soil_ph', 'soil_ec', 'soil_temperature', 'soil_humidity'];
          break;

        default:
          if (sensorType >= 11) {
            values = [rawValues[0] / 100, rawValues[1] / 100];
            valueNames = ['value1', 'value2'];
          } else {
            values = rawValues;
            valueNames = ['value1', 'value2'];
          }
          break;
      }

      // 🔥 압축 데이터 구조: [sensorId, type, slaveId(Combined ID), channel(UNO_ID), ...values]
      const slaveId = s[2]; // Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
      const channel = s[3]; // CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
      // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)
      
      // 🔥 CH와 Mega 핀 매핑: D38=1, D39=2, D40=3, D41=4, D42=5, D43=6
      const megaPin = 37 + channel; // Mega 핀 번호 계산

      // 🔥 디버깅: 센서 정보 출력
      console.log(`🔍 압축 센서 #${s[0]}: ID=${s[0]}, Type=${sensorType}, SlaveID=${slaveId}, CH=${channel} (UNO_ID=${channel}, Mega핀=D${megaPin}, 포트=${channel})`);

      return {
        sensor_id: s[0],
        type: sensorType,
        protocol: typeInfo.protocol,
        channel: channel, // 🔥 UNO_ID를 CH로 직접 사용 (Mega에서 할당한 물리적 순서)
        slaveId: slaveId, // 🔥 Combined ID 저장
        status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
        active: true,
        values: values,
        value_names: valueNames,
        // 🔥 물리적 위치 정보 추가
        physical_port: channel, // 제품 포트 번호 (1~6)
        mega_pin: `D${megaPin}`, // Mega 핀 번호 (D38~D43)
        uno_id: channel // UNO_ID 명시적 저장
      };
    });

  // 🔥 센서 이름 생성 (재할당된 채널 번호 사용)
  rawSensors.forEach(sensor => {
    const typeInfo = UNIFIED_SENSOR_TYPES[sensor.type] || {
      name: 'UNKNOWN',
      protocol: 'unknown'
    };

    let sensorName;
    if (sensor.type >= 11) {
      // Modbus 센서: 타입명 + 채널
      const modbusTypeNames = {
        11: '온습도센서',
        12: '압력센서', 
        13: '유량센서',
        14: '릴레이모듈',
        15: '전력계',
        16: '풍향센서',
        17: '풍속센서',
        18: '강우강설센서',
        19: '토양센서'
      };
      const typeName = modbusTypeNames[sensor.type] || `Modbus센서_${sensor.type}`;
      sensorName = `${typeName}_CH${sensor.channel}`;
    } else {
      // I2C 센서: 타입명 + 채널 (예: SHT20_CH1, SHT20_CH2)
      sensorName = `${typeInfo.name}_CH${sensor.channel}`;
    }
    sensor.name = sensorName;
  });

  return {
    device_id: compressed.d,
    timestamp: compressed.t,
    sensor_count: compressed.c,
    protocols: compressed.p,
    sensors: rawSensors
  };
}

// 🔥 통합 DB 저장 함수
// 🔥 통합 DB 저장 함수 (수정된 버전)
async function saveUnifiedSensorData(deviceId, sensorData) {
  try {
    const compressed = {
      d: deviceId,
      t: Date.now(),
      c: sensorData.sensor_count,
      p: sensorData.protocols,
      s: sensorData.sensors.map(sensor => {
        // 🔥 센서 타입별로 저장할 값들을 선별
        let valuesToStore = [];

        switch (sensor.type) {
          case 1: // SHT20 - 온도, 습도
            valuesToStore = [
              Math.round(sensor.values[0] * 100), // temperature
              Math.round(sensor.values[1] * 100)  // humidity
            ];
            break;

          case 2: // TSL2591 - 조도 (×1로 저장)
            valuesToStore = [
              Math.round(sensor.values[0]) // light_level (×1로 저장)
            ];
            break;

          case 3: // ADS1115 - pH, EC
            valuesToStore = [
              Math.round(sensor.values[0] * 100), // ph
              Math.round(sensor.values[1] * 100)  // ec (dS/m)
            ];
            break;

          case 4: // SCD30/SCD41 - CO2
            valuesToStore = [
              Math.round(sensor.values[0]) // co2_ppm (정수)
            ];
            break;

          case 5: // DS18B20 - 온도
            valuesToStore = [
              Math.round(sensor.values[0] * 100) // temperature
            ];
            break;

          case 6: // BH1750 (×1로 저장)
            valuesToStore = [
              Math.round(sensor.values[0]) // light_level (×1로 저장)
            ];
            break;

          case 7: // MH-Z19
            valuesToStore = [Math.round(sensor.values[0])];
            break;

          case 16: // 풍향센서 - 기어값, 각도값만 저장 (텍스트 제외)
            valuesToStore = [
              Math.round(sensor.values[0]), // gear_direction
              Math.round(sensor.values[1])  // degree_direction
            ];
            break;

          case 17: // 풍속센서 - 풍속값만 저장 (텍스트 제외)
            valuesToStore = [
              Math.round(sensor.values[0] * 10) // wind_speed_ms (×10으로 저장)
            ];
            break;

          case 18: // 강우/강설센서 - 숫자값만 저장
            valuesToStore = [
              Math.round(sensor.values[0]),        // precip_status (코드)
              Math.round(sensor.values[2]),        // moisture_level
              Math.round(sensor.values[4] * 100),  // temperature (×100)
              Math.round(sensor.values[5])         // humidity
            ];
            break;

          case 19:
            // values = [pH, EC, T, H] (실제 센서 값 4개만)
            // ✅ pH는 ×10 스케일로 저장 (UNO에서 ×10 스케일로 전송)
            // ✅ EC는 ×100 스케일로 저장 (dS/m 단위)
            valuesToStore = [
              Math.round(sensor.values[0] * 10),   // soil_ph ×10 (pH는 ×10 스케일)
              Math.round(sensor.values[1] * 100),  // soil_ec ×100 (dS/m)
              Math.round(sensor.values[2] * 100),  // soil_temperature ×100
              Math.round(sensor.values[3])         // soil_humidity (0-100%)
            ];
            break;

          default: // 기타 센서들
            if (sensor.type >= 11) {
              // Modbus 센서들 - 숫자값만 필터링
              valuesToStore = sensor.values
                .filter(v => typeof v === 'number' && !isNaN(v))
                .slice(0, 2) // 최대 2개 값만
                .map(v => Math.round(v * 100));
            } else {
              // 알 수 없는 I2C 센서들
              valuesToStore = sensor.values
                .filter(v => typeof v === 'number' && !isNaN(v))
                .map(v => Math.round(v * 100));
            }
            break;
        }

        return [
          sensor.sensor_id,
          sensor.type,
          sensor.channel,
          sensor.status,
          ...valuesToStore
        ];
      })
    };

    console.log(`💾 압축된 데이터 확인:`, JSON.stringify(compressed, null, 2));

    await Database.query(
      `INSERT INTO sensor_data (device_id, timestamp, sensor_count, sensor_data, protocol) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        deviceId,
        new Date(),
        sensorData.sensor_count,
        JSON.stringify(compressed),
        'unified'
      ]
    );

    console.log(`💾 통합 센서 데이터 저장 완료: ${deviceId}`);

    // 🔥 디바이스 상태 업데이트 및 체크
    await Database.query(
      'UPDATE devices SET last_seen_at = $1 WHERE device_id = $2',
      [new Date(), deviceId]
    );

    await checkDeviceStatusChange(deviceId, new Date());

  } catch (error) {
    console.error('❌ 통합 센서 DB 저장 실패:', error);
    console.error('❌ 저장 시도한 데이터:', deviceId, sensorData.sensor_count);
  }
}

// MQTT 연결 및 메시지 처리
sensorMqttClient.on('connect', () => {
  //console.log('✅ 통합 센서 MQTT 클라이언트 연결');

  sensorMqttClient.subscribe('sensors/modbus/+', (err) => {
    // if (!err) //console.log('📡 통합 센서 토픽 구독 완료');
  });
});
// routes/sensors.js - MQTT 메시지 처리 부분 수정

sensorMqttClient.on('message', async (topic, message) => {
  const deviceId = topic.split('/')[2];
  console.log(`📨 MQTT 메시지 수신: ${deviceId} (${message.length} bytes)`);

  try {
    if (message.length >= 8 && message[0] === 0x01 && message[1] === 0x03) {
      console.log('🔍 바이너리 Modbus 데이터 감지');
      
      // 🔥 서버에서 수신한 원시 바이너리 데이터 출력 (축소)
      // console.log(`📦 서버 수신 원시 데이터 (${message.length} bytes):`);
      // const hexData = Array.from(message).map(b => b.toString(16).padStart(2, '0')).join(' ');
      // console.log(`   ${hexData}`);
      
      // 🔥 바이너리 헤더 상세 분석 (축소)
      // console.log(`📦 헤더 분석:`);
      // console.log(`   - Device ID: ${message[0]}`);
      // console.log(`   - Function Code: 0x${message[1].toString(16).padStart(2, '0')}`);
      // console.log(`   - Timestamp: ${(message[2] << 24) | (message[3] << 16) | (message[4] << 8) | message[5]}`);
      // console.log(`   - Sensor Count: ${message[6]}`);
      // console.log(`   - Reserved: ${message[7]}`);
      
      const decompressed = decompressBinaryData(message);
      if (decompressed) {
        latestSensorData[deviceId] = decompressed;

        // 🔥 수신한 센서값 상세 로그 출력
        console.log(`✅ 바이너리 센서 데이터 처리 완료: ${deviceId}`);
        console.log(`📊 센서 개수: ${decompressed.sensor_count}개`);
        console.log(`🕐 타임스탬프: ${new Date(decompressed.timestamp).toLocaleString('ko-KR')}`);
        console.log(`📡 프로토콜: I2C(${decompressed.protocols.i2c}개), Modbus(${decompressed.protocols.modbus}개)`);

        // 🔥 센서별 상세 값 출력 (다중 센서 지원)
        console.log(`📊 센서 데이터 수신: ${decompressed.sensor_count}개 센서`);
        
        // 센서 타입별로 그룹화하여 표시
        const sensorsByType = {};
        decompressed.sensors.forEach(sensor => {
          if (!sensorsByType[sensor.type]) {
            sensorsByType[sensor.type] = [];
          }
          sensorsByType[sensor.type].push(sensor);
        });
        
        Object.keys(sensorsByType).forEach(type => {
          const sensors = sensorsByType[type];
          const typeName = sensors[0].name.split('_')[0]; // 첫 번째 센서에서 타입명 추출
          console.log(`🔹 ${typeName}: ${sensors.length}개 (ID: ${sensors.map(s => s.sensor_id).join(', ')})`);
        });

        await saveUnifiedSensorData(deviceId, decompressed);

        // 디바이스 상태 체크
        console.log(`🔔 디바이스 상태 체크: ${deviceId}`);
        await checkDeviceStatusChange(deviceId, new Date());

        // 센서 알림 체크
        console.log(`🔔 알림 체크 시작: ${deviceId}`);
        const alertsModule = require('./alerts');
        if (alertsModule.checkAlerts) {
          try {
            await alertsModule.checkAlerts(deviceId, decompressed);
            console.log(`✅ 알림 체크 완료: ${deviceId}`);
          } catch (alertError) {
            console.error(`❌ 알림 체크 오류:`, alertError);
          }
        }
      } else {
        console.error(`❌ 바이너리 데이터 파싱 실패: ${deviceId}`);
      }
    } else {
      console.log(`⚠️ 알 수 없는 메시지 형식: ${deviceId} (길이: ${message.length})`);
      // 🔥 바이너리 데이터 16진수 출력 (디버깅용)
      const hexData = Array.from(message).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`   hex: ${hexData}`);
    }
  } catch (error) {
    console.error('❌ 센서 데이터 처리 오류:', error);
  }
});

// ============= API 라우트들 =============

router.get('/', (req, res) => {
  res.json({
    success: true,
    protocol: 'unified',
    data: latestSensorData,
    device_count: Object.keys(latestSensorData).length,
    timestamp: new Date().toISOString()
  });
});

// 🔥 센서 데이터 조회 API (캐시 미들웨어 사용)
router.get('/:deviceId', authenticateToken, cacheMiddleware(60, (req) => `device:sensors:${req.params.deviceId}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    const { limit = 100, hours = 24 } = req.query;

    //console.log(`📊 센서 데이터 조회: ${deviceId} by user ${req.user.email}`);

    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id, device_name, device_location, last_seen_at FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );

    if (deviceCheck.length === 0) {
      return res.status(403).json({
        success: false,
        error: '해당 장치에 대한 권한이 없습니다.'
      });
    }

    const device = deviceCheck[0];

    // 🔥 unified 프로토콜 데이터 조회 (최신 데이터 1개)
    // 🔥 sensor_data 테이블의 JSON 필드(sensor_data)에 압축된 unified 데이터가 저장됨
    const unifiedDataQuery = `
      SELECT sensor_data, created_at, timestamp
      FROM sensor_data
      WHERE device_id = $1 AND protocol = 'unified'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const unifiedData = await Database.query(unifiedDataQuery, [deviceId]);

    // 🔥 현재 디바이스 상태 계산
    const currentStatus = getDeviceStatus(device.last_seen_at);

    let sensorData = null;
    if (unifiedData.length > 0) {
      // 🔥 unified 데이터 압축 해제
      sensorData = decompressUnifiedData(unifiedData[0].sensor_data);
      sensorData.stored_at = unifiedData[0].created_at;
    }

    //console.log(`📊 센서 데이터 조회 완료: ${unifiedData.length}개, 상태: ${currentStatus}`);

    // 🔥 데이터가 없으면 404 반환 (프론트엔드에서 일관되게 처리)
    if (!sensorData) {
      return res.status(404).json({
        success: false,
        error: '센서 데이터 없음',
        message: `디바이스 ${deviceId}의 센서 데이터를 찾을 수 없습니다.`,
        device: {
          deviceId: device.device_id,
          deviceName: device.device_name,
          deviceLocation: device.device_location,
          lastSeenAt: device.last_seen_at,
          status: currentStatus
        }
      });
    }

    res.json({
      success: true,
      device: {
        deviceId: device.device_id,
        deviceName: device.device_name,
        deviceLocation: device.device_location, // 🔥 추가
        lastSeenAt: device.last_seen_at,
        status: currentStatus
      },
      data: sensorData, // 🔥 unified 데이터 반환
      sensors: sensorData ? sensorData.sensors : [], // 🔥 호환성 유지
      meta: {
        totalRecords: sensorData ? sensorData.sensor_count : 0,
        timeRange: `${hours}시간`,
        status: currentStatus
      }
    });

  } catch (error) {
    console.error('Get sensor data error:', error);
    res.status(500).json({
      success: false,
      error: '센서 데이터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 나머지 API들은 캐시 미들웨어 없이 처리
router.get('/current/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const data = latestSensorData[deviceId];

  if (data) {
    res.json({
      success: true,
      deviceId: deviceId,
      data: data
    });
  } else {
    res.status(404).json({
      success: false,
      message: `디바이스 ${deviceId}의 센서 데이터를 찾을 수 없습니다.`
    });
  }
});

router.get('/current/:deviceId/:protocol', (req, res) => {
  const { deviceId, protocol } = req.params;
  const data = latestSensorData[deviceId];

  if (!data) {
    return res.status(404).json({
      success: false,
      message: `디바이스 ${deviceId}를 찾을 수 없습니다.`
    });
  }

  const filteredSensors = data.sensors.filter(sensor => sensor.protocol === protocol);

  res.json({
    success: true,
    deviceId: deviceId,
    protocol: protocol,
    sensors: filteredSensors,
    sensor_count: filteredSensors.length
  });
});

router.get('/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100, hours = 24, protocol, start, end } = req.query;

    let whereClause = 'device_id = $1';
    let params = [deviceId];
    let paramIndex = 2;

    // 🔥 start/end 파라미터 지원 (기간별 보기용)
    if (start && end) {
      whereClause += ` AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
      params.push(new Date(start), new Date(end));
      paramIndex += 2;
    } else {
      // 기존 hours 파라미터 지원
      whereClause += ` AND created_at > NOW() - INTERVAL $${paramIndex}`;
      params.push(`${parseInt(hours)} hours`);
      paramIndex++;
    }

    whereClause += ` AND protocol = $${paramIndex}`;
    params.push('unified');
    paramIndex++;

    const history = await Database.query(
      `SELECT sensor_data, created_at, timestamp
       FROM sensor_data 
       WHERE ${whereClause}
       ORDER BY created_at DESC 
       LIMIT ${parseInt(limit)}`,
      params
    );

    let processedHistory = history.map(row => {
      const decompressed = decompressUnifiedData(row.sensor_data);
      return {
        ...decompressed,
        stored_at: row.created_at
      };
    });

    if (protocol && ['i2c', 'modbus'].includes(protocol)) {
      processedHistory = processedHistory.map(data => ({
        ...data,
        sensors: data.sensors.filter(s => s.protocol === protocol)
      }));
    }

    res.json({
      success: true,
      deviceId: deviceId,
      protocol: protocol || 'unified',
      history: processedHistory, // 🔥 frontend에서 사용하는 키로 변경
      data: processedHistory, // 🔥 기존 호환성 유지
      count: history.length
    });

  } catch (error) {
    console.error('센서 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '센서 히스토리 조회 실패'
    });
  }
});

// 🔥 실시간 센서 데이터 업데이트 API (MQTT에서 호출, 인증 없음)
router.post('/update/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { sensorData } = req.body;

    //console.log(`🔄 실시간 센서 데이터 업데이트: ${deviceId}`);

    const result = await handleSensorDataUpdate(deviceId, sensorData);

    if (result) {
      res.json({
        success: true,
        message: '센서 데이터가 성공적으로 업데이트되었습니다.',
        timestamp: new Date()
      });
    } else {
      res.status(500).json({
        success: false,
        error: '센서 데이터 업데이트 중 오류가 발생했습니다.'
      });
    }

  } catch (error) {
    console.error('Update sensor data error:', error);
    res.status(500).json({
      success: false,
      error: '센서 데이터 업데이트 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 오프라인 상태 체크 및 알림 (스케줄러에서 주기적으로 호출, 인증 없음)
router.post('/check-offline-devices', async (req, res) => {
  try {
    //console.log('🔍 오프라인 디바이스 체크 시작');

    // 30분 이상 접속하지 않은 디바이스 조회
    const offlineThreshold = new Date(Date.now() - DEVICE_STATUS_CONFIG.OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    const potentiallyOfflineDevices = await Database.query(
      `SELECT device_id, device_name, last_seen_at
       FROM devices 
       WHERE last_seen_at < $1 OR last_seen_at IS NULL`,
      [offlineThreshold]
    );

    //console.log(`🔍 오프라인 가능성 디바이스: ${potentiallyOfflineDevices.length}개`);

    // 각 디바이스의 상태 변화 체크
    for (const device of potentiallyOfflineDevices) {
      await checkDeviceStatusChange(device.device_id, device.last_seen_at);
    }

    res.json({
      success: true,
      message: '오프라인 디바이스 체크 완료',
      checkedDevices: potentiallyOfflineDevices.length
    });

  } catch (error) {
    console.error('Check offline devices error:', error);
    res.status(500).json({
      success: false,
      error: '오프라인 디바이스 체크 중 오류가 발생했습니다.'
    });
  }
});

function getLatestSensorData() {
  return latestSensorData;
}

// 🔥 주기적 오프라인 장치 체크 (5분마다)
setInterval(async () => {
  try {
    console.log('🕐 주기적 오프라인 장치 체크 시작');

    const offlineThreshold = new Date(Date.now() - DEVICE_STATUS_CONFIG.OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    const potentiallyOfflineDevices = await Database.query(
      `SELECT device_id, device_name, last_seen_at
       FROM devices 
       WHERE last_seen_at < $1 OR last_seen_at IS NULL`,
      [offlineThreshold]
    );

    console.log(`🔍 오프라인 가능성 디바이스: ${potentiallyOfflineDevices.length}개`);

    for (const device of potentiallyOfflineDevices) {
      await checkDeviceStatusChange(device.device_id, device.last_seen_at);
    }

  } catch (error) {
    console.error('주기적 오프라인 체크 오류:', error);
  }
}, 3 * 60 * 1000); // 5분마다 실행

//console.log('📊 통합 센서 데이터 API 등록 완료');

// 🔥 내보내기: MQTT 핸들러에서 사용할 함수들
module.exports = router;
module.exports.handleSensorDataUpdate = handleSensorDataUpdate;
module.exports.checkDeviceStatusChange = checkDeviceStatusChange;
module.exports.getDeviceStatus = getDeviceStatus; // 🔥 commands.js에서 사용
module.exports.getLatestSensorData = getLatestSensorData; // 🔥 추가
module.exports.decompressUnifiedData = decompressUnifiedData; // 🔥 추가 (필요시)