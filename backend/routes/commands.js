const express = require('express');
const mqtt = require('mqtt');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const { getDeviceStatus } = require('./sensors');

const router = express.Router();

// MQTT 설정
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const TOPIC_PREFIX = 'modbus';
const CLIENT_ID_PREFIX = 'farm_api';
const COMMAND_QOS = 1;

// 내부 상태
const pendingCommands = new Map();
const lastResponses = new Map();
// 채널별 모드 관리 Map 추가
const channelModes = new Map(); // key: "deviceId_channel", value: "auto" | "manual"
const nutrientStatus = new Map(); // deviceId -> latest status
const processedResponseIds = new Map(); // deviceId -> Set of processed response IDs

// 🔥 오래된 응답 정리 함수
function cleanupOldResponses() {
  const now = Date.now();
  const maxAge = 60000; // 60초
  
  for (const [deviceId, response] of lastResponses.entries()) {
    if (response.receivedAt) {
      const age = now - new Date(response.receivedAt).getTime();
      if (age > maxAge) {
        console.log(`[CLEANUP] 오래된 응답 제거: ${deviceId} (${Math.round(age/1000)}초 전)`);
        lastResponses.delete(deviceId);
      }
    }
  }
  
  // 처리된 응답 ID도 정리 (100개 이상이면 오래된 것 제거)
  for (const [deviceId, idSet] of processedResponseIds.entries()) {
    if (idSet.size > 100) {
      const ids = Array.from(idSet);
      const toKeep = ids.slice(-50); // 최근 50개만 유지
      processedResponseIds.set(deviceId, new Set(toKeep));
      console.log(`[CLEANUP] 응답 ID 정리: ${deviceId} (${ids.length} -> ${toKeep.length})`);
    }
  }
}

// MQTT 클라이언트
const mqttClient = mqtt.connect(MQTT_URL, {
  clientId: `${CLIENT_ID_PREFIX}_${Math.random().toString(16).slice(2, 10)}`,
  clean: true,
  keepalive: 60,
  reconnectPeriod: 2000,
  connectTimeout: 6000,
});

// MQTT 토픽 함수들
const CMD_TOPIC = (deviceId) => `${TOPIC_PREFIX}/commands/${deviceId}`;
const NUTRIENT_CMD_TOPIC = (deviceId) => `nutrient/commands/${deviceId}`;
const RESP_TOPIC = `${TOPIC_PREFIX}/command-responses/+`;
const NUTRIENT_RESP_TOPIC = `nutrient/command-responses/+`;
const NUTRIENT_STATUS_TOPIC = `nutrient/status/+`;

// MQTT 연결 및 구독
// MQTT 연결 성공 시 타이머 시작
mqttClient.on('connect', () => {
  console.log(`✅ [MQTT] Connected to: ${MQTT_URL}`);
  console.log(`📡 [MQTT] Client ID: ${mqttClient.options.clientId}`);
  mqttClient.subscribe(RESP_TOPIC, { qos: COMMAND_QOS });
  mqttClient.subscribe(NUTRIENT_RESP_TOPIC, { qos: COMMAND_QOS });
  mqttClient.subscribe(NUTRIENT_STATUS_TOPIC, { qos: COMMAND_QOS });
  console.log(`📡 [MQTT] Subscribed to response topics`);
  scheduleEngine.start();
  
  // 20초마다 온라인 장치에만 시간 동기화 전송
  setInterval(async () => {
    try {
      if (Database && typeof Database.query === 'function') {
        // 온라인 장치만 조회
        const devices = await Database.query(`
          SELECT device_id, last_seen_at 
          FROM devices 
          WHERE last_seen_at IS NOT NULL
        `);
        
        const onlineDevices = devices.filter(device => {
          const status = getDeviceStatus(device.last_seen_at);
          return status === 'online';
        });
        
        console.log(`🕐 [TIME_SYNC] 온라인 장치 ${onlineDevices.length}개에게 시간 동기화 전송`);
        
        for (const device of onlineDevices) {
          await sendTimeSync(device.device_id);
        }
      }
    } catch (e) {
      console.error('[AUTO_TIME_SYNC] Error:', e);
    }
  }, 20000);
  
  // 🔥 30초마다 오래된 응답 정리
  setInterval(() => {
    cleanupOldResponses();
  }, 30000);
});

mqttClient.on('message', (topic, buf) => {
  try {
    const parts = topic.split('/');
    const deviceId = parts[parts.length - 1];
    const payload = JSON.parse(buf.toString());
    
    // 양액 상태 처리 추가
    if (topic.startsWith('nutrient/status/')) {
      console.log(`[MQTT] Nutrient status from ${deviceId}:`, payload);
      nutrientStatus.set(deviceId, { 
        ...payload, 
        receivedAt: new Date().toISOString() 
      });
      return; // 상태는 command 처리와 별개
    }

    // UNO ACK 처리 추가 (중복 방지)
    if (payload.kind === 'UNO_MODULE') {
      const id = payload.command_id || payload.commandId;
      const isSuccess = payload.success === true;
      
      // 장치별 처리된 응답 ID Set 초기화
      if (!processedResponseIds.has(deviceId)) {
        processedResponseIds.set(deviceId, new Set());
      }
      
      // 성공한 응답만 중복 처리 방지 (실패한 명령은 재시도 가능)
      if (id && processedResponseIds.get(deviceId).has(id) && isSuccess) {
        console.log(`[MQTT] 이미 처리된 UNO 성공 응답, 건너뛰기: ${id}`);
        return;
      }
      
      console.log(`[MQTT] UNO ACK from ${deviceId}:`, payload);
      
      // 응답 구조 통일 (kind 기반으로 통일)
      const unifiedResponse = {
        command_id: payload.command_id || payload.commandId,
        kind: 'UNO_MODULE',
        command: payload.command,
        channel: payload.channel,
        success: payload.success,
        timestamp: payload.timestamp,
        receivedAt: new Date().toISOString()
      };
      
      // 🔥 응답 만료 처리: 30초 이상 된 응답은 무시
      const responseAge = Date.now() - new Date(payload.timestamp).getTime();
      if (responseAge > 30000) {
        console.log(`[MQTT] 오래된 UNO 응답 무시 (${Math.round(responseAge/1000)}초 전): ${id}`);
        return;
      }
      
      lastResponses.set(deviceId, unifiedResponse);
      
      // UNO 명령 완료 처리
      if (id && pendingCommands.has(id)) {
        console.log(`[MQTT] UNO Command ${id} completed with success: ${payload.success}`);
        pendingCommands.delete(id);
      }
      
      // 성공한 응답만 ID 저장 (실패한 명령은 재시도 가능)
      if (id && isSuccess) {
        processedResponseIds.get(deviceId).add(id);
        console.log(`[MQTT] UNO 성공 응답 ID 저장: ${id}`);
      }
      
      return;
    }

    console.log(`[MQTT] Response from ${deviceId}:`, payload);
    lastResponses.set(deviceId, { 
      ...payload, 
      receivedAt: new Date().toISOString() 
    });

    const id = payload.command_id || payload.commandId;
    if (id && pendingCommands.has(id)) {
      console.log(`[MQTT] Command ${id} completed`);
      pendingCommands.delete(id);
    }
    
    // 타임아웃된 명령 정리 (30초 이상 된 명령)
    const now = new Date();
    const timeoutCommands = [];
    for (const [cmdId, cmd] of pendingCommands.entries()) {
      if (cmd.deviceId === deviceId) {
        const sentTime = new Date(cmd.sentAt);
        const ageSeconds = (now - sentTime) / 1000;
        if (ageSeconds > 30) {
          timeoutCommands.push(cmdId);
        }
      }
    }
    
    if (timeoutCommands.length > 0) {
      console.log(`[MQTT] Cleaning up ${timeoutCommands.length} timeout commands for ${deviceId}`);
      timeoutCommands.forEach(cmdId => pendingCommands.delete(cmdId));
    }
    
  } catch (e) {
    console.error('[MQTT] Message parse error:', e);
  }
});

mqttClient.on('error', (err) => {
  console.error('❌ [MQTT] Connection error:', err);
  console.error('❌ [MQTT] Error code:', err.code);
  console.error('❌ [MQTT] Error message:', err.message);
});

mqttClient.on('reconnect', () => {
  console.log('🔄 [MQTT] Reconnecting...');
});

mqttClient.on('close', () => {
  console.log('⚠️ [MQTT] Connection closed');
});

mqttClient.on('offline', () => {
  console.log('⚠️ [MQTT] Client went offline');
});

// 🔥 MQTT 브로커 상태 디버깅을 위한 주기적 체크
setInterval(() => {
  const status = {
    connected: mqttClient.connected,
    options: {
      clientId: mqttClient.options.clientId,
      host: mqttClient.options.host,
      port: mqttClient.options.port,
      protocol: mqttClient.options.protocol,
      keepalive: mqttClient.options.keepalive
    }
  };
  if (!mqttClient.connected) {
    console.warn('⚠️ [MQTT_DEBUG] MQTT 브로커 연결 끊어짐:', JSON.stringify(status, null, 2));
  }
}, 30000); // 30초마다 체크

// 명령 ID 생성
function buildCommandId(prefix = 'cmd') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// NPN 명령 퍼블리시 (최적화된 버전)
function publishNPNCommand(deviceId, { command, channel }) {
  return new Promise((resolve, reject) => {
    const command_id = buildCommandId('npn');
    const cmd = String(command).toUpperCase();
    
    const payload = {
      command_id,
      kind: 'NPN_MODULE',
      command: cmd,
      channel: Number(channel) || 0,
      timestamp: new Date().toISOString(),
    };

    // 기존 대기 중인 명령이 있으면 정리 (먹통 방지)
    const existingCommands = Array.from(pendingCommands.entries())
      .filter(([_, cmd]) => cmd.deviceId === deviceId && cmd.payload.kind === 'NPN_MODULE');
    
    if (existingCommands.length > 0) {
      console.log(`[NPN] Cleaning up ${existingCommands.length} pending NPN commands for ${deviceId}`);
      existingCommands.forEach(([id, _]) => pendingCommands.delete(id));
    }

    pendingCommands.set(command_id, { 
      deviceId, 
      payload, 
      sentAt: new Date().toISOString() 
    });

    console.log(`[MQTT] Publishing NPN command to ${deviceId}:`, payload);

    mqttClient.publish(CMD_TOPIC(deviceId), JSON.stringify(payload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error(`[MQTT] NPN publish error:`, err);
        pendingCommands.delete(command_id); // 실패 시 정리
        return reject(err);
      }
      resolve({ command_id, payload });
    });
  });
}

// publishModbusCommand 함수 추가
function publishModbusCommand(deviceId, payload) {
  return new Promise((resolve, reject) => {
    const command_id = payload.command_id || buildCommandId('modbus');
    
    pendingCommands.set(command_id, { 
      deviceId, 
      payload, 
      sentAt: new Date().toISOString() 
    });

    console.log(`[MQTT] Publishing modbus command to ${deviceId}:`, payload);

    mqttClient.publish(CMD_TOPIC(deviceId), JSON.stringify(payload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error(`[MQTT] Modbus publish error:`, err);
        return reject(err);
      }
      resolve({ command_id, payload });
    });
  });
}

// 시간 동기화 함수 (수정됨)
function sendTimeSync(deviceId) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const timeString = now.getFullYear() + '-' + 
                      String(now.getMonth() + 1).padStart(2, '0') + '-' +
                      String(now.getDate()).padStart(2, '0') + ' ' +
                      String(now.getHours()).padStart(2, '0') + ':' +
                      String(now.getMinutes()).padStart(2, '0') + ':' +
                      String(now.getSeconds()).padStart(2, '0');
    
    const payload = {
      id: buildCommandId('time'),
      ts: Date.now(),
      cmd: 'TIME_SYNC',
      time: timeString
    };

    console.log(`🕐 [TIME_SYNC] 온라인 장치 ${deviceId}에게 시간 동기화 전송:`, payload);

    mqttClient.publish(NUTRIENT_CMD_TOPIC(deviceId), JSON.stringify(payload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error('[TIME_SYNC] Error:', err);
        reject(err);
      } else {
        resolve(payload);
      }
    });
  });
}

// 20초마다 온라인 장치에만 시간 동기화 (중복 제거됨 - 위의 로직과 통합)
// setInterval(async () => {
//   if (Database && typeof Database.query === 'function') {
//     try {
//       const devices = await Database.query(`
//         SELECT device_id, last_seen_at 
//         FROM devices 
//         WHERE last_seen_at IS NOT NULL
//       `);
//       
//       const onlineDevices = devices.filter(device => {
//         const status = getDeviceStatus(device.last_seen_at);
//         return status === 'online';
//       });
//       
//       for (const device of onlineDevices) {
//         await sendTimeSync(device.device_id);
//       }
//     } catch (e) {
//       console.error('[TIME_SYNC] Error:', e);
//     }
//   }
// }, 20000); // 20초마다

// 양액 명령 퍼블리시
// publishNutrientCommand 함수 전체 수정
function publishNutrientCommand(deviceId, payload) {
  return new Promise((resolve, reject) => {
    const command_id = buildCommandId('nutrient');
    
    console.log(`🔥 [NUTRIENT_DEBUG] 양액 명령 처리 시작: ${deviceId}`);
    console.log(`🔥 [NUTRIENT_DEBUG] 원본 payload:`, JSON.stringify(payload, null, 2));
    
    const cleanPayload = {
      id: command_id,  // command_id → id
      ts: Date.now(),  // timestamp → ts (숫자로 변경)
    };

    // 명령어 추가 (nutrient_command → cmd)
    if (payload.command) {
      cleanPayload.cmd = String(payload.command).toUpperCase();
      console.log(`🔥 [NUTRIENT_DEBUG] 명령어: ${cleanPayload.cmd}`);
    }

    // 설정값 축약 (settings → set) - STOP 명령이 아닐 때만
    if (payload.settings && (!payload.command || String(payload.command).toUpperCase() !== 'STOP')) {
      console.log(`🔥 [NUTRIENT_DEBUG] 원본 settings:`, JSON.stringify(payload.settings, null, 2));
      
      const originalCycleTime = Number(payload.settings.cycle_time);
      const originalSupplyTime = Number(payload.settings.supply_time);
      
      console.log(`🔥 [NUTRIENT_DEBUG] 원본 값들:`);
      console.log(`   - cycle_time: ${originalCycleTime} (타입: ${typeof originalCycleTime})`);
      console.log(`   - supply_time: ${originalSupplyTime} (타입: ${typeof originalSupplyTime})`);
      
      cleanPayload.set = {
        ph: Math.max(0, Math.min(14, Number(payload.settings.target_ph) || 6.5)),     // pH 범위 0-14로 확대
        ec: Math.max(0, Number(payload.settings.target_ec) || 1.2),                   // EC 상한 제거
        ep: Math.max(0.1, Math.min(99, Number(payload.settings.error_ph) || 5.0)),   // 오차범위 더 관대하게
        ee: Math.max(0.1, Math.min(99, Number(payload.settings.error_ec) || 10.0)),  // 오차범위 더 관대하게
        st: Math.max(0.1, Number(payload.settings.supply_time) || 5.0),               // 최소값만 0.1로 제한
        ct: Math.max(0.05, Number(payload.settings.cycle_time) || 2.0),               // 최소값 0.05시간으로 완화
        a: Number(payload.settings.bed_a) ? 1 : 0,                                    
        b: Number(payload.settings.bed_b) ? 1 : 0,                                    
        c: Number(payload.settings.bed_c) ? 1 : 0,                                    
        d: Number(payload.settings.bed_d) ? 1 : 0,                                    
      };
      
      console.log(`🔥 [NUTRIENT_DEBUG] 변환 후 값들:`);
      console.log(`   - st (supply_time): ${cleanPayload.set.st}`);
      console.log(`   - ct (cycle_time): ${cleanPayload.set.ct}`);
      console.log(`   - ph (target_ph): ${cleanPayload.set.ph}`);
      console.log(`   - ec (target_ec): ${cleanPayload.set.ec}`);
      
      // 유효성 검사 (사이클 간격 자동 조정 제거)
      // if (cleanPayload.set.st >= cleanPayload.set.ct) {
      //   cleanPayload.set.ct = cleanPayload.set.st + 1;
      // }
    } else if (payload.command && String(payload.command).toUpperCase() === 'STOP') {
      console.log(`🔥 [NUTRIENT_DEBUG] STOP 명령이므로 settings 처리 건너뛰기`);
    }

    // 스케줄값 축약 (schedule → sch) - 관대한 검사
    if (payload.schedule) {
      cleanPayload.sch = {
        sh: Math.max(0, Math.min(23, parseInt(payload.schedule.start_hour) || 6)),    
        sm: Math.max(0, Math.min(59, parseInt(payload.schedule.start_minute) || 0)),  
        eh: Math.max(0, Math.min(23, parseInt(payload.schedule.end_hour) || 18)),     
        em: Math.max(0, Math.min(59, parseInt(payload.schedule.end_minute) || 0)),    
        te: parseInt(payload.schedule.time_based_enabled) ? 1 : 0,                    
        oe: parseInt(payload.schedule.once_based_enabled) ? 1 : 0,                    
        de: parseInt(payload.schedule.daily_based_enabled) ? 1 : 0,                   
      };
    }

    pendingCommands.set(command_id, { 
      deviceId, 
      payload: cleanPayload, 
      sentAt: new Date().toISOString() 
    });

    console.log(`🔥 [NUTRIENT_DEBUG] 최종 전송할 cleanPayload:`, JSON.stringify(cleanPayload, null, 2));
    console.log(`🔥 [NUTRIENT_DEBUG] MQTT 토픽: ${NUTRIENT_CMD_TOPIC(deviceId)}`);
    console.log(`🔥 [NUTRIENT_DEBUG] 사이클 간격 최종값: ${cleanPayload.set?.ct || 'N/A'}`);

    mqttClient.publish(NUTRIENT_CMD_TOPIC(deviceId), JSON.stringify(cleanPayload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error(`🔥 [NUTRIENT_DEBUG] ❌ MQTT 전송 실패:`, err);
        return reject(err);
      }
      console.log(`🔥 [NUTRIENT_DEBUG] ✅ MQTT 전송 성공: ${deviceId}`);
      resolve({ command_id, payload: cleanPayload });
    });
  });
}

// 스케줄 엔진 (단순화된 버전)
const scheduleEngine = {
  _timer: null,
  _interval: null,
  _running: false,
  _activeSchedules: new Map(),

  start() {
    if (this._running) return;
    this._running = true;
    this._alignToMinute();
    console.log('[SCHEDULE] Engine started');
  },

  stop() {
    this._running = false;
    if (this._timer) clearTimeout(this._timer);
    if (this._interval) clearInterval(this._interval);
    this._activeSchedules.clear();
    console.log('[SCHEDULE] Engine stopped');
  },

  _alignToMinute() {
    const now = new Date();
    const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    this._timer = setTimeout(() => {
      this._tick();
      this._interval = setInterval(() => this._tick(), 60000);
    }, delay);
  },

  // commands.js의 _tick 함수 개선
  async _tick() {
    if (!this._running) return;
    
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    try {
      if (Database && typeof Database.query === 'function') {
        // 장치별로 그룹화하여 처리
        const rows = await Database.query(`
          SELECT device_id, channel_number, start_time, end_time
          FROM npn_schedules
          WHERE enabled = true AND channel_enabled = true
          ORDER BY device_id, channel_number
        `);

        const deviceChannels = new Map();
        
        // 장치별, 채널별로 그룹화
        for (const row of rows) {
          const key = `${row.device_id}_${row.channel_number}`;
          if (!deviceChannels.has(key)) {
            deviceChannels.set(key, []);
          }
          deviceChannels.get(key).push(row);
        }

        // 각 장치의 각 채널별로 처리
        // 기존 _tick 함수의 for 루프 안에 로그 추가
        for (const [key, schedules] of deviceChannels.entries()) {
          const parts = key.split('_');
          const channel = parts[parts.length - 1]; // 마지막 부분이 채널
          const deviceId = parts.slice(0, -1).join('_'); // 마지막을 제외한 나머지를 다시 조합
          const channelNum = parseInt(channel);
          const channelKey = `${deviceId}_${channelNum}`;
          
          console.log(`[DEBUG] Checking CH${channelNum} for ${deviceId}, mode: ${channelModes.get(channelKey) || 'auto'}`);
          
          // 수동 모드인 채널은 건너뛰기
          if (channelModes.get(channelKey) === 'manual') {
            console.log(`[SCHEDULE] Skipping CH${channelNum} - in MANUAL mode`);
            continue;
          }
          
          const isInAnyRange = schedules.some(schedule => {
            const sMin = this._hhmmToMin(schedule.start_time);
            const eMin = this._hhmmToMin(schedule.end_time);
            const inRange = this._isTimeInRange(nowMin, sMin, eMin);
            console.log(`[DEBUG] CH${channelNum} schedule ${schedule.start_time}-${schedule.end_time}, current: ${Math.floor(nowMin/60)}:${nowMin%60}, inRange: ${inRange}`);
            return inRange;
          });

          const isCurrentlyActive = this._activeSchedules.has(key);
          
          console.log(`[DEBUG] CH${channelNum} - isInAnyRange: ${isInAnyRange}, isCurrentlyActive: ${isCurrentlyActive}`);

          if (isInAnyRange && !isCurrentlyActive) {
            console.log(`[SCHEDULE] Activating CH${channelNum} for ${deviceId} (AUTO mode)`);
            try {
              await publishNPNCommand(deviceId, { command: 'ON', channel: channelNum });
              this._activeSchedules.set(key, { startTime: nowMin, endTime: nowMin });
              console.log(`[DEBUG] Successfully activated CH${channelNum}`);
            } catch (error) {
              console.error(`[ERROR] Failed to activate CH${channelNum}:`, error);
              // 실패 시 활성 스케줄에서 제거하여 재시도 가능하게 함
              this._activeSchedules.delete(key);
            }
          } else if (!isInAnyRange && isCurrentlyActive) {
            console.log(`[SCHEDULE] Deactivating CH${channelNum} for ${deviceId} (AUTO mode)`);
            try {
              await publishNPNCommand(deviceId, { command: 'OFF', channel: channelNum });
              this._activeSchedules.delete(key);
              console.log(`[DEBUG] Successfully deactivated CH${channelNum}`);
            } catch (error) {
              console.error(`[ERROR] Failed to deactivate CH${channelNum}:`, error);
              // 실패 시에도 활성 스케줄에서 제거하여 재시도 가능하게 함
              this._activeSchedules.delete(key);
            }
          }
        }
      }
    } catch (e) {
      console.error('[SCHEDULE] Tick error:', e);
    }
  },

  // 새로 추가: 시간이 범위 내에 있는지 확인하는 헬퍼 함수
  _isTimeInRange(currentMin, startMin, endMin) {
    if (startMin <= endMin) {
      // 같은 날 내 (예: 09:00 - 18:00)
      return currentMin >= startMin && currentMin <= endMin;
    } else {
      // 자정을 넘어가는 경우 (예: 22:00 - 06:00)
      return currentMin >= startMin || currentMin <= endMin;
    }
  },

  _hhmmToMin(timeStr) {
    const [h, m] = String(timeStr).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  },

  getActiveSchedules(deviceId) {
    const result = [];
    for (const [key, schedule] of this._activeSchedules.entries()) {
      if (key.startsWith(deviceId + '_')) {
        const parts = key.split('_');
        const channel = parseInt(parts[parts.length - 1]); // 마지막 부분이 채널 번호
        if (!isNaN(channel)) {
          result.push({ channel, ...schedule, isActive: true });
        }
      }
    }
    return result;
  }
};

// === API 라우트 ===

// NPN 제어
router.post('/npn/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command, channel } = req.body || {};
    
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
    }
    
    const cmd = String(command || '').toUpperCase();
    
    // 관대한 유효성 검사: 대소문자 구분 없음, 유사 명령어 허용
    if (!['ON', 'OFF', 'ALL_OFF', 'ALLON', 'ALL_ON'].includes(cmd)) {
      // 명령어가 없으면 기본값으로 처리
      console.log(`[NPN] Unknown command '${cmd}', treating as OFF`);
    }

    let ch = 0;
    if (cmd !== 'ALL_OFF' && cmd !== 'ALLON' && cmd !== 'ALL_ON') {
      const n = Number(channel);
      // 관대한 채널 검사: 범위 벗어나면 0으로 보정
      if (Number.isNaN(n) || n < 0 || n > 11) {
        console.log(`[NPN] Invalid channel '${channel}', using channel 0`);
        ch = 0;
      } else {
        ch = n;
      }
    }

    // 장치 권한 확인 (Database가 있을 경우)
    if (Database && typeof Database.query === 'function') {
      try {
        const device = await Database.query(
          'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
          [deviceId, req.user.id]
        );
        if (!device?.length) {
          return res.status(404).json({ success: false, error: '장치를 찾을 수 없습니다.' });
        }
      } catch (e) {
        console.log('[DB] Device check failed, proceeding without validation');
      }
    }

    // 수동 모드로 설정 로직 추가 (먹통 방지)
    if (cmd === 'ON' || cmd === 'OFF') {
      const channelKey = `${deviceId}_${ch}`;
      channelModes.set(channelKey, 'manual');
      console.log(`[MODE] CH${ch} for ${deviceId} set to MANUAL mode`);
      
      // 해당 채널의 활성 스케줄 정리 (먹통 방지)
      const scheduleKey = `${deviceId}_${ch}`;
      if (scheduleEngine._activeSchedules.has(scheduleKey)) {
        scheduleEngine._activeSchedules.delete(scheduleKey);
        console.log(`[SCHEDULE] Cleared active schedule for CH${ch} (manual override)`);
      }
    } else if (cmd === 'ALL_OFF') {
      for (let i = 0; i < 12; i++) {
        const channelKey = `${deviceId}_${i}`;
        channelModes.set(channelKey, 'manual');
        
        // 모든 채널의 활성 스케줄 정리 (먹통 방지)
        const scheduleKey = `${deviceId}_${i}`;
        if (scheduleEngine._activeSchedules.has(scheduleKey)) {
          scheduleEngine._activeSchedules.delete(scheduleKey);
        }
      }
      console.log(`[MODE] All channels for ${deviceId} set to MANUAL mode`);
      console.log(`[SCHEDULE] Cleared all active schedules for ${deviceId} (manual override)`);
    }

    const { command_id } = await publishNPNCommand(deviceId, { 
      command: cmd, 
      channel: ch 
    });
    
    const message = cmd === 'ALL_OFF' ? 
      `NPN 전체 OFF` : 
      `NPN CH${ch} ${cmd}`;
    
    return res.json({ 
      success: true, 
      message, 
      command_id,
      deviceId,
      details: { command: cmd, channel: ch }
    });
    
  } catch (e) {
    console.error('NPN command error:', e);
    return res.status(500).json({ 
      success: false, 
      error: 'NPN 명령 처리 중 오류가 발생했습니다.' 
    });
  }
});

// UNO 제어 엔드포인트 추가
router.post('/modbus/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { uno_command, channel, slave_id, function_code, address, value, npn_command, kind, command } = req.body || {};
    
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
    }

    // UNO 명령 처리
    if (uno_command) {
      const cmd = String(uno_command).toUpperCase();
      const validCommands = ['START', 'STOP', 'RESET', 'ALLOFF', 'ON', 'OFF', 'ALL_OFF', 'ALL_ON', 'ALLON'];
      
      // 관대한 명령어 검사: 알려진 명령어가 아니면 경고만 출력
      if (!validCommands.includes(cmd)) {
        console.log(`[UNO] Unknown command '${cmd}', proceeding anyway`);
      }

      if (['ON', 'OFF'].includes(cmd)) {
        const ch = Number(channel);
        // 관대한 채널 검사: 범위 벗어나면 0으로 보정
        if (Number.isNaN(ch) || ch < 0 || ch > 10) {
          console.log(`[UNO] Invalid channel '${channel}', using channel 0`);
        }
      }

      const payload = {
        command_id: buildCommandId('uno'),
        kind: 'UNO_MODULE',
        command: cmd,
        timestamp: new Date().toISOString(),
      };

      if (channel !== undefined) {
        payload.channel = Number(channel);
      }

      const result = await publishModbusCommand(deviceId, payload);
      
      return res.json({ 
        success: true, 
        message: `UNO ${cmd} 명령 전송`, 
        command_id: result.command_id,
        deviceId 
      });
    }

    // 기존 NPN 및 다른 modbus 명령 처리...
    
  } catch (e) {
    console.error('Modbus command error:', e);
    return res.status(500).json({ 
      success: false, 
      error: 'Modbus 명령 처리 중 오류가 발생했습니다.' 
    });
  }
});


// 양액 사이클 제어
router.post('/nutrient/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command, settings, schedule } = req.body || {};
    
    console.log(`🔥 [NUTRIENT_API_DEBUG] 양액 API 요청 수신: ${deviceId}`);
    console.log(`🔥 [NUTRIENT_API_DEBUG] 요청 body:`, JSON.stringify(req.body, null, 2));
    console.log(`🔥 [NUTRIENT_API_DEBUG] 추출된 값들:`);
    console.log(`   - command: ${command}`);
    console.log(`   - settings:`, settings ? JSON.stringify(settings, null, 2) : '없음');
    console.log(`   - schedule:`, schedule ? JSON.stringify(schedule, null, 2) : '없음');

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId가 필요합니다.' });
    }

    if (!command && !settings && !schedule) {
      return res.status(400).json({ 
        success: false, 
        error: 'command, settings, schedule 중 하나는 필요합니다.' 
      });
    }

    // 장치 권한 확인
    if (Database && typeof Database.query === 'function') {
      try {
        const device = await Database.query(
          'SELECT id FROM devices WHERE device_id = $1 AND registered_by = $2',
          [deviceId, req.user.id]
        );
        if (!device?.length) {
          return res.status(404).json({ success: false, error: '장치를 찾을 수 없습니다.' });
        }
      } catch (e) {
        console.log('[DB] Device check failed, proceeding without validation');
      }
    }

    const payload = {};
    
    if (command) {
      const cmd = String(command).toUpperCase();
      // 관대한 명령어 검사: 알려진 명령어가 아니면 경고만 출력하고 진행
      if (!['START', 'STOP', 'STATUS', 'RUN', 'PAUSE', 'RESTART'].includes(cmd)) {
        console.log(`[NUTRIENT] Unknown command '${cmd}', proceeding anyway`);
      }
      payload.command = cmd;
    }

    if (settings) {
      console.log(`🔥 [NUTRIENT_API_DEBUG] settings 처리 시작`);
      console.log(`🔥 [NUTRIENT_API_DEBUG] 원본 settings.cycle_time: ${settings.cycle_time} (타입: ${typeof settings.cycle_time})`);
      console.log(`🔥 [NUTRIENT_API_DEBUG] 원본 settings.supply_time: ${settings.supply_time} (타입: ${typeof settings.supply_time})`);
      
      // STOP 명령일 때만 settings를 포함하지 않음
      if (command && String(command).toUpperCase() === 'STOP') {
        console.log(`🔥 [NUTRIENT_API_DEBUG] STOP 명령이므로 settings 제외`);
      } else {
        payload.settings = settings;
        console.log(`🔥 [NUTRIENT_API_DEBUG] settings 포함: supply_time=${settings.supply_time}, cycle_time=${settings.cycle_time}`);
      }
      
      // 설정을 데이터베이스에 저장 (STOP 명령이 아닐 때만)
      if (Database && typeof Database.query === 'function' && command && String(command).toUpperCase() !== 'STOP') {
        try {
          const dbCycleTime = Number(settings.cycle_time) || 4.0;
          const dbSupplyTime = Number(settings.supply_time) || 5.0;
          
          console.log(`🔥 [NUTRIENT_API_DEBUG] DB 저장할 값들:`);
          console.log(`   - cycle_time: ${dbCycleTime}`);
          console.log(`   - supply_time: ${dbSupplyTime}`);
          
          await Database.query('BEGIN');
          await Database.query('DELETE FROM nutrient_settings WHERE device_id = $1', [deviceId]);
          await Database.query(`
            INSERT INTO nutrient_settings (
              device_id, target_ph, target_ec, error_ph, error_ec, 
              supply_time, cycle_time, bed_a, bed_b, bed_c, bed_d, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          `, [
            deviceId,
            Number(settings.target_ph) || 6.5,
            Number(settings.target_ec) || 1.2,
            Number(settings.error_ph) || 5.0,
            Number(settings.error_ec) || 10.0,
            dbSupplyTime,
            dbCycleTime,
            Number(settings.bed_a) || 0,
            Number(settings.bed_b) || 0,
            Number(settings.bed_c) || 0,
            Number(settings.bed_d) || 0
          ]);
          await Database.query('COMMIT');
          console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ DB 저장 완료: cycle_time=${dbCycleTime}, supply_time=${dbSupplyTime}`);
        } catch (e) {
          await Database.query('ROLLBACK');
          console.error(`🔥 [NUTRIENT_API_DEBUG] ❌ DB 저장 실패:`, e);
        }
      } else if (command && String(command).toUpperCase() === 'STOP') {
        console.log(`🔥 [NUTRIENT_API_DEBUG] STOP 명령이므로 양액 사이클 관련 DB 삭제`);
        
        // 양액 사이클 관련 DB 완전 삭제
        if (Database && typeof Database.query === 'function') {
          try {
            await Database.query('BEGIN');
            
            // 양액 설정 삭제
            await Database.query('DELETE FROM nutrient_settings WHERE device_id = $1', [deviceId]);
            console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ nutrient_settings 삭제 완료: ${deviceId}`);
            
            // 양액 스케줄 삭제
            await Database.query('DELETE FROM nutrient_schedules WHERE device_id = $1', [deviceId]);
            console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ nutrient_schedules 삭제 완료: ${deviceId}`);
            
            await Database.query('COMMIT');
            console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ 양액 사이클 관련 DB 완전 삭제 완료: ${deviceId}`);
            
            // 메모리에서도 양액 상태 제거
            nutrientStatus.delete(deviceId);
            console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ 메모리에서 양액 상태 제거 완료: ${deviceId}`);
            
          } catch (e) {
            await Database.query('ROLLBACK');
            console.error(`🔥 [NUTRIENT_API_DEBUG] ❌ 양액 사이클 DB 삭제 실패:`, e);
          }
        }
      }
    }

    if (schedule) {
      payload.schedule = schedule;
      
      // 스케줄을 데이터베이스에 저장 (선택적)
      if (Database && typeof Database.query === 'function') {
        try {
          await Database.query('BEGIN');
          await Database.query('DELETE FROM nutrient_schedules WHERE device_id = $1', [deviceId]);
          await Database.query(`
            INSERT INTO nutrient_schedules (
              device_id, start_hour, start_minute, end_hour, end_minute,
              time_based_enabled, once_based_enabled, daily_based_enabled, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [
            deviceId,
            parseInt(schedule.start_hour) || 6,
            parseInt(schedule.start_minute) || 0,
            parseInt(schedule.end_hour) || 18,
            parseInt(schedule.end_minute) || 0,
            parseInt(schedule.time_based_enabled) || 0,
            parseInt(schedule.once_based_enabled) || 0,
            parseInt(schedule.daily_based_enabled) || 1
          ]);
          await Database.query('COMMIT');
          console.log(`[DB] Nutrient schedule saved for ${deviceId}`);
        } catch (e) {
          await Database.query('ROLLBACK');
          console.error('Nutrient schedule save error:', e);
        }
      }
    }
    // 시간 동기화 먼저 전송
    console.log(`🔥 [NUTRIENT_API_DEBUG] 시간 동기화 전송: ${deviceId}`);
    await sendTimeSync(deviceId);

    console.log(`🔥 [NUTRIENT_API_DEBUG] publishNutrientCommand 호출 전 최종 payload:`, JSON.stringify(payload, null, 2));
    const { command_id } = await publishNutrientCommand(deviceId, payload);
    
    let message = '양액 명령 전송';
    if (command) message += ` (${command})`;
    if (settings) message += ' + 설정 업데이트';
    if (schedule) message += ' + 스케줄 업데이트';

    console.log(`🔥 [NUTRIENT_API_DEBUG] ✅ API 응답 준비 완료: ${message}`);

    return res.json({ 
      success: true, 
      message, 
      command_id,
      deviceId 
    });
    
  } catch (e) {
    console.error('Nutrient command error:', e);
    return res.status(500).json({ 
      success: false, 
      error: '양액 명령 처리 중 오류가 발생했습니다.' 
    });
  }
});

// NPN 스케줄 저장
// NPN 스케줄 저장 라우트 수정 - 2번 반복 전송으로 손실 방지, 관대한 유효성 검사
router.post('/npn-schedules/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { schedules } = req.body;
    
    // 관대한 스케줄 배열 검사: 12개가 아니어도 처리
    if (!Array.isArray(schedules)) {
      return res.status(400).json({ 
        success: false, 
        error: '스케줄 배열이 필요합니다.' 
      });
    }
    
    // 12개보다 적으면 빈 스케줄로 채우기
    const normalizedSchedules = Array.from({ length: 12 }, (_, i) => 
      schedules[i] || { enabled: false, schedules: [] }
    );

    if (Database && typeof Database.query === 'function') {
      try {
        await Database.query('BEGIN');
        await Database.query('DELETE FROM npn_schedules WHERE device_id = $1', [deviceId]);

        let total = 0;
        for (let channel = 0; channel < 12; channel++) {
          const cfg = normalizedSchedules[channel] || {};
          const list = Array.isArray(cfg.schedules) ? cfg.schedules : [];
          const channelEnabled = cfg.enabled !== false;

          for (const s of list) {
            const st = s.start?.slice(0, 5);
            const et = s.end?.slice(0, 5);
            
            // 관대한 시간 형식 검사: 잘못된 형식은 건너뛰기만
            if (!/^\d{1,2}:\d{1,2}$/.test(st) || !/^\d{1,2}:\d{1,2}$/.test(et)) {
              console.log(`[SCHEDULE] Invalid time format for CH${channel}: ${st}-${et}, skipping`);
              continue;
            }
            
            // 시간 정규화 (한 자리 숫자도 허용)
            const normalizedStart = st.padStart(5, '0').slice(-5);
            const normalizedEnd = et.padStart(5, '0').slice(-5);
            
            await Database.query(`
              INSERT INTO npn_schedules (device_id, channel_number, start_time, end_time, enabled, channel_enabled)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [deviceId, channel, normalizedStart, normalizedEnd, s.enabled !== false, channelEnabled]);
            total++;
          }
        }

        await Database.query('COMMIT');
        console.log(`[DB] ${total} NPN schedules saved for ${deviceId}`);
        
        // 모든 채널을 자동 모드로 설정
        for (let channel = 0; channel < 12; channel++) {
          const channelKey = `${deviceId}_${channel}`;
          channelModes.set(channelKey, 'auto');
        }
        console.log(`[MODE] All channels for ${deviceId} set to AUTO mode`);
        
        // 스케줄 체크 (1회만, 깔끔하게)
        console.log(`[SCHEDULE] Starting schedule check for ${deviceId}`);
        
        // 1차 스케줄 체크 (1초 후)
        setTimeout(() => {
          if (scheduleEngine._running) {
            console.log(`[SCHEDULE] Schedule check for ${deviceId}`);
            scheduleEngine._tick();
          }
        }, 1000);

        return res.json({ 
          success: true, 
          message: `${total}개의 NPN 스케줄이 저장되었습니다.`,
          deviceId,
          totalSchedules: total
        });
      } catch (e) {
        await Database.query('ROLLBACK');
        throw e;
      }
    } else {
      console.log(`[SCHEDULE] NPN schedules received for ${deviceId} (DB not available)`);
      return res.json({ 
        success: true, 
        message: 'NPN 스케줄이 수신되었습니다.',
        deviceId 
      });
    }
  } catch (e) {
    console.error('Save NPN schedules error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// NPN 스케줄 조회
router.get('/npn-schedules/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (Database && typeof Database.query === 'function') {
      try {
        const rows = await Database.query(`
          SELECT channel_number, start_time, end_time, enabled, channel_enabled
          FROM npn_schedules
          WHERE device_id = $1
          ORDER BY channel_number, start_time
        `, [deviceId]);

        const schedules = Array.from({ length: 12 }, (_, i) => ({ 
          channel: i, 
          enabled: false, 
          schedules: [] 
        }));
        
        for (const r of rows) {
          const ch = r.channel_number;
          schedules[ch].enabled = r.channel_enabled;
          schedules[ch].schedules.push({
            start: r.start_time,
            end: r.end_time,
            enabled: r.enabled,
          });
        }
        
        return res.json({ success: true, schedules, deviceId });
      } catch (e) {
        console.error('DB query error:', e);
      }
    }
    
    // 기본 빈 스케줄 반환
    const schedules = Array.from({ length: 12 }, (_, i) => ({ 
      channel: i, 
      enabled: false, 
      schedules: [] 
    }));
    return res.json({ success: true, schedules, deviceId });
  } catch (e) {
    console.error('Get NPN schedules error:', e);
    return res.status(500).json({ success: false, error: 'NPN 스케줄 조회 실패' });
  }
});

// NPN 스케줄 전체 삭제
router.delete('/npn-schedules/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (Database && typeof Database.query === 'function') {
      try {
        const result = await Database.query('DELETE FROM npn_schedules WHERE device_id = $1', [deviceId]);
        const deletedCount = result.rowCount || 0;
        
        console.log(`[DB] ${deletedCount} NPN schedules deleted for ${deviceId}`);
        
        // 활성 스케줄도 정리
        for (const [key] of scheduleEngine._activeSchedules.entries()) {
          if (key.startsWith(deviceId + '_')) {
            const channel = parseInt(key.split('_').pop());
            if (!isNaN(channel)) {
              // 해당 채널 OFF 명령 전송
              await publishNPNCommand(deviceId, { command: 'OFF', channel });
            }
            scheduleEngine._activeSchedules.delete(key);
          }
        }
        
        return res.json({ 
          success: true, 
          message: `${deletedCount}개의 NPN 스케줄이 삭제되었습니다.`,
          deviceId,
          deletedCount
        });
      } catch (e) {
        console.error('Delete NPN schedules error:', e);
        return res.status(500).json({ success: false, error: e.message });
      }
    } else {
      return res.json({ 
        success: true, 
        message: 'NPN 스케줄 삭제 요청이 처리되었습니다.',
        deviceId 
      });
    }
  } catch (e) {
    console.error('Delete NPN schedules error:', e);
    return res.status(500).json({ success: false, error: 'NPN 스케줄 삭제 실패' });
  }
});

// 양액 상태 조회 (다른 라우터들과 함께 추가)
router.get('/nutrient-status/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const status = nutrientStatus.get(deviceId);
    
    if (!status) {
      return res.json({ 
        success: false, 
        error: '양액 상태 정보가 없습니다.',
        cycle: -1,
        status: 0,
        elapsedTime: 0,
        remainingTime: 0,
        currentPH: 6.5,
        currentEC: 1.2,
        isActive: false
      });
    }

    // 아두이노에서 보낸 데이터 구조에 맞게 매핑
    return res.json({ 
      success: true,
      cycle: status.cycle || -1,
      status: status.status || 0,
      elapsedTime: (status.rm || 0) * 60000 + (status.rs || 0) * 1000, // 분,초 -> ms
      remainingTime: ((status.rh || 0) * 3600 + (status.rm_wait || 0) * 60 + (status.rs_wait || 0)) * 1000, // 시,분,초 -> ms
      currentPH: status.sensors?.ph || 6.5,
      currentEC: status.sensors?.ec || 1.2,
      isActive: status.status === 1 || status.status === 2,
      receivedAt: status.receivedAt,
      deviceId
    });
  } catch (e) {
    console.error('Nutrient status error:', e);
    return res.status(500).json({ success: false, error: '양액 상태 조회 실패' });
  }
});

// router.get('/nutrient-status/:deviceId', (req, res) => {
//   const id = req.params.deviceId;
//   const s = nutrientStatus.get(id);
//   if (!s) {
//     return res.status(200).json({ success: true, exists: false });
//   }

//   // 프론트가 기대하는 스키마로 변환
//   const cycle = typeof s.cycle === 'number' ? s.cycle : -1;
//   const status = typeof s.status === 'number' ? s.status : 0;

//   // 남은 시간(ms): rm_wait/rs_wait가 초 단위이면 가장 큰 값을 사용
//   const waits = [s.rm_wait, s.rs_wait].filter(v => Number.isFinite(v));
//   const remainingTime = waits.length ? Math.max(...waits) * 1000 : 0;

//   // 경과 시간(ms): s.ts가 누적 ms라면 그대로, 아니면 0
//   const elapsedTime = Number.isFinite(s.ts) ? s.ts : 0;

//   const currentPH = s.sensors?.ph ?? 6.5;
//   const currentEC = s.sensors?.ec ?? 1.2;

//   // 활성 여부: MIXING(1), IRRIGATING(2)만 true로
//   const isActive = status === 1 || status === 2;

//   return res.json({
//     success: true,
//     cycle,
//     status,
//     elapsedTime,
//     remainingTime,
//     currentPH,
//     currentEC,
//     isActive,
//     raw: s, // 디버깅용(원치 않으면 제거)
//   });
// });

// 양액 설정 조회
router.get('/nutrient-settings/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    let settings = null;
    let schedule = null;
    
    // 데이터베이스에서 조회 시도
    if (Database && typeof Database.query === 'function') {
      try {
        const settingsResult = await Database.query(`
          SELECT target_ph, target_ec, error_ph, error_ec, supply_time, cycle_time,
                 bed_a, bed_b, bed_c, bed_d, updated_at
          FROM nutrient_settings
          WHERE device_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `, [deviceId]);

        const scheduleResult = await Database.query(`
          SELECT start_hour, start_minute, end_hour, end_minute,
                 time_based_enabled, once_based_enabled, daily_based_enabled, updated_at
          FROM nutrient_schedules
          WHERE device_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `, [deviceId]);

        settings = settingsResult[0] || null;
        schedule = scheduleResult[0] || null;
      } catch (e) {
        console.error('DB query error:', e);
      }
    }
    
    // 기본값 사용
    if (!settings) {
      settings = {
        target_ph: 6.5,
        target_ec: 1.2,
        error_ph: 5.0,
        error_ec: 10.0,
        supply_time: 5.0,
        cycle_time: 4.0,
        bed_a: 1,
        bed_b: 1,
        bed_c: 1,
        bed_d: 1
      };
    }

    if (!schedule) {
      schedule = {
        start_hour: 6,
        start_minute: 0,
        end_hour: 18,
        end_minute: 0,
        time_based_enabled: 0,
        once_based_enabled: 0,
        daily_based_enabled: 1
      };
    }

    return res.json({ 
      success: true, 
      settings, 
      schedule,
      deviceId 
    });
  } catch (e) {
    console.error('Get nutrient settings error:', e);
    return res.status(500).json({ success: false, error: '양액 설정 조회 실패' });
  }
});

// 활성 스케줄 조회
router.get('/active-schedules/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const activeSchedules = scheduleEngine.getActiveSchedules(deviceId);
    res.json({ 
      success: true, 
      activeSchedules, 
      deviceId,
      totalActive: activeSchedules.length 
    });
  } catch (e) {
    console.error('Active schedules error:', e);
    res.status(500).json({ success: false, error: '활성 스케줄 조회 실패' });
  }
});

// 응답 조회
router.get('/responses/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const response = lastResponses.get(deviceId) || null;
    const pending = Array.from(pendingCommands.values())
      .filter(x => x.deviceId === deviceId).length;
    
    return res.json({ 
      success: true, 
      latestResponse: response, 
      pendingCount: pending,
      deviceId 
    });
  } catch (e) {
    console.error('Responses error:', e);
    return res.status(500).json({ success: false, error: '응답 조회 실패' });
  }
});

// 대기 명령 조회
router.get('/pending/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const list = Array.from(pendingCommands.values())
      .filter(x => x.deviceId === deviceId);
    
    return res.json({ 
      success: true, 
      pending_commands: list,
      deviceId,
      count: list.length 
    });
  } catch (e) {
    console.error('Pending error:', e);
    return res.status(500).json({ success: false, error: '대기 명령 조회 실패' });
  }
});

// MQTT 상태 조회 (디버깅 강화)
router.get('/mqtt-status', (req, res) => {
  const now = new Date();
  const mqttStatus = {
    connected: mqttClient.connected,
    reconnecting: mqttClient.reconnecting || false,
    clientId: mqttClient.options?.clientId || 'unknown',
    url: MQTT_URL,
    options: {
      host: mqttClient.options?.host || 'unknown',
      port: mqttClient.options?.port || 'unknown',
      protocol: mqttClient.options?.protocol || 'unknown',
      keepalive: mqttClient.options?.keepalive || 'unknown',
      clean: mqttClient.options?.clean || 'unknown',
      connectTimeout: mqttClient.options?.connectTimeout || 'unknown'
    },
    lastError: mqttClient.stream?.destroyed ? 'stream destroyed' : null
  };
  
  console.log(`🔍 [MQTT_STATUS] 상태 조회 요청:`, JSON.stringify(mqttStatus, null, 2));
  
  res.json({
    success: true,
    mqtt: mqttStatus,
    serverTime: now.toISOString(),
    uptime: process.uptime(),
    pendingCommandsCount: pendingCommands.size,
    activeSchedulesCount: scheduleEngine._activeSchedules.size,
    topics: {
      commandPrefix: TOPIC_PREFIX,
      nutrientPrefix: 'nutrient',
      subscribeTopics: [
        RESP_TOPIC,
        NUTRIENT_RESP_TOPIC,
        NUTRIENT_STATUS_TOPIC
      ]
    }
  });
});

// 🔥 Arduino 연결 테스트 - 특정 deviceId로 테스트 메시지 전송
router.post('/test-device-connection/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!mqttClient.connected) {
      return res.status(503).json({ 
        success: false, 
        error: 'MQTT 브로커에 연결되지 않았습니다',
        mqttConnected: false
      });
    }
    
    // Arduino가 구독하는 토픽에 테스트 메시지 전송
    const testTopic = CMD_TOPIC(deviceId);
    const testMessage = {
      test: true,
      timestamp: Date.now(),
      message: 'Connection test from server'
    };
    
    console.log(`🧪 [MQTT_TEST] ${deviceId}에게 테스트 메시지 전송:`, testTopic);
    
    mqttClient.publish(testTopic, JSON.stringify(testMessage), { qos: 0 }, (err) => {
      if (err) {
        console.error(`❌ [MQTT_TEST] 전송 실패:`, err);
        return res.status(500).json({ 
          success: false, 
          error: '테스트 메시지 전송 실패',
          details: err.message
        });
      }
      
      console.log(`✅ [MQTT_TEST] 테스트 메시지 전송 성공`);
      res.json({
        success: true,
        message: '테스트 메시지 전송 완료',
        topic: testTopic,
        payload: testMessage,
        timestamp: new Date().toISOString()
      });
    });
  } catch (e) {
    console.error('❌ [MQTT_TEST] 오류:', e);
    res.status(500).json({ 
      success: false, 
      error: '테스트 실패',
      details: e.message
    });
  }
});

// 시스템 상태 조회 (디버깅용)
router.get('/system-status', authenticateToken, (req, res) => {
  res.json({
    success: true,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    },
    mqtt: {
      connected: mqttClient.connected,
      reconnecting: mqttClient.reconnecting,
      clientId: mqttClient.options.clientId
    },
    commands: {
      pending: pendingCommands.size,
      lastResponses: lastResponses.size
    },
    schedule: {
      running: scheduleEngine._running,
      activeSchedules: scheduleEngine._activeSchedules.size
    }
  });
});

// 테스트 엔드포인트
router.post('/test/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { message, topic } = req.body || {};
    
    const testTopic = topic || `test/${deviceId}`;
    const testMessage = message || JSON.stringify({ 
      test: true, 
      timestamp: new Date().toISOString(),
      from: 'api-server' 
    });
    
    mqttClient.publish(testTopic, testMessage, { qos: COMMAND_QOS });
    
    console.log(`[TEST] Message sent to ${testTopic}: ${testMessage}`);
    
    res.json({ 
      success: true, 
      message: '테스트 메시지 전송됨',
      topic: testTopic,
      payload: testMessage
    });
  } catch (e) {
    console.error('Test error:', e);
    res.status(500).json({ success: false, error: '테스트 실패' });
  }
});

// 채널 모드 조회 API 추가 (// 에러 핸들러 바로 위에 삽입)
router.get('/channel-modes/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const modes = {};
    
    for (let channel = 0; channel < 12; channel++) {
      const channelKey = `${deviceId}_${channel}`;
      modes[channel] = channelModes.get(channelKey) || 'auto';
    }
    
    return res.json({ 
      success: true, 
      modes,
      deviceId 
    });
  } catch (e) {
    console.error('Channel modes error:', e);
    return res.status(500).json({ success: false, error: '채널 모드 조회 실패' });
  }
});

// 🔥 다중 릴레이 제어 API 추가
router.post('/multi-relay/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { channels, action } = req.body; // channels: [0,1,2,3], action: "ON" | "OFF"
    
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ success: false, error: '채널 배열이 필요합니다' });
    }
    
    if (!['ON', 'OFF'].includes(action)) {
      return res.status(400).json({ success: false, error: '액션은 ON 또는 OFF여야 합니다' });
    }
    
    // 채널 유효성 검사
    const validChannels = channels.filter(ch => ch >= 0 && ch < 12);
    if (validChannels.length !== channels.length) {
      return res.status(400).json({ success: false, error: '채널은 0-11 범위여야 합니다' });
    }
    
    // 다중 릴레이 명령 생성
    const command_id = buildCommandId('multi_relay');
    const payload = {
      command_id,
      kind: 'MULTI_RELAY',
      action: action,
      channels: validChannels,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[MULTI_RELAY] ${action} channels ${validChannels.join(',')} for ${deviceId}`);
    
    // MQTT 전송
    mqttClient.publish(CMD_TOPIC(deviceId), JSON.stringify(payload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error(`[MULTI_RELAY] Publish error:`, err);
        return res.status(500).json({ success: false, error: '명령 전송 실패' });
      }
      
      res.json({ 
        success: true, 
        message: `다중 릴레이 ${action} 명령 전송됨`,
        command_id,
        channels: validChannels,
        action
      });
    });
    
  } catch (e) {
    console.error('[MULTI_RELAY] Error:', e);
    res.status(500).json({ success: false, error: '다중 릴레이 제어 실패' });
  }
});

// 🔥 NPN 다중 제어 API (비트연산 방식)
router.post('/multi-npn/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { channels, action } = req.body; // channels: [0,1,2,3], action: "ON" | "OFF"
    
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ success: false, error: '채널 배열이 필요합니다' });
    }
    
    if (!['ON', 'OFF'].includes(action)) {
      return res.status(400).json({ success: false, error: '액션은 ON 또는 OFF여야 합니다' });
    }
    
    // 채널 유효성 검사 (NPN은 0-11 채널)
    const validChannels = channels.filter(ch => ch >= 0 && ch < 12);
    if (validChannels.length !== channels.length) {
      return res.status(400).json({ success: false, error: '채널은 0-11 범위여야 합니다' });
    }
    
    // 비트마스크 생성
    let bitmask = 0;
    for (const channel of validChannels) {
      bitmask |= (1 << channel);
    }
    
    // NPN 다중 제어 명령 생성
    const command_id = buildCommandId('multi_npn');
    const payload = {
      command_id,
      kind: 'MULTI_NPN',
      action: action,
      channels: validChannels,
      bitmask: bitmask,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[MULTI_NPN] ${action} channels ${validChannels.join(',')} (bitmask: 0x${bitmask.toString(16)}) for ${deviceId}`);
    
    // MQTT 전송
    mqttClient.publish(CMD_TOPIC(deviceId), JSON.stringify(payload), { qos: COMMAND_QOS }, (err) => {
      if (err) {
        console.error(`[MULTI_NPN] Publish error:`, err);
        return res.status(500).json({ success: false, error: '명령 전송 실패' });
      }
      
      res.json({ 
        success: true, 
        message: `NPN 다중 제어 ${action} 명령 전송됨`,
        command_id,
        channels: validChannels,
        bitmask: `0x${bitmask.toString(16)}`,
        action
      });
    });
    
  } catch (e) {
    console.error('[MULTI_NPN] Error:', e);
    res.status(500).json({ success: false, error: 'NPN 다중 제어 실패' });
  }
});

// 자동 모드 복귀 API 추가 (최적화된 버전)
router.post('/auto-mode/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 모든 채널을 자동 모드로 설정
    for (let channel = 0; channel < 12; channel++) {
      const channelKey = `${deviceId}_${channel}`;
      channelModes.set(channelKey, 'auto');
    }
    
    console.log(`[MODE] All channels for ${deviceId} set to AUTO mode`);
    
    // 기존 활성 스케줄 정리 (먹통 방지)
    const activeSchedulesToRemove = [];
    for (const [key, _] of scheduleEngine._activeSchedules.entries()) {
      if (key.startsWith(deviceId + '_')) {
        activeSchedulesToRemove.push(key);
      }
    }
    
    activeSchedulesToRemove.forEach(key => {
      scheduleEngine._activeSchedules.delete(key);
    });
    
    if (activeSchedulesToRemove.length > 0) {
      console.log(`[SCHEDULE] Cleared ${activeSchedulesToRemove.length} active schedules for ${deviceId}`);
    }
    
    // 즉시 스케줄 체크 (1회만)
    setTimeout(() => {
      if (scheduleEngine._running) {
        console.log(`[SCHEDULE] Auto mode check for ${deviceId}`);
        scheduleEngine._tick();
      }
    }, 1000);
    
    return res.json({ 
      success: true, 
      message: '모든 채널이 자동 모드로 설정되었습니다',
      deviceId,
      clearedSchedules: activeSchedulesToRemove.length
    });
  } catch (e) {
    console.error('Auto mode error:', e);
    return res.status(500).json({ success: false, error: '자동 모드 설정 실패' });
  }
});

// 에러 핸들러
router.use((error, req, res, next) => {
  console.error('[COMMANDS] Route error:', error);
  res.status(500).json({ 
    success: false, 
    error: '서버 내부 오류가 발생했습니다.' 
  });
});

console.log('[COMMANDS] All routes initialized');
module.exports = router;