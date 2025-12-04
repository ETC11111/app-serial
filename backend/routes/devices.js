const express = require('express');
const Database = require('../lib/database');
const QRCode = require('qrcode');
const { authenticateToken } = require('../middleware/auth');
const { cacheMiddleware, invalidateUserCache } = require('../middleware/cache');
const cache = require('../lib/cache');

const router = express.Router();

// 🔥 디바이스 상태 알림 설정 (sensors.js와 공유)
const DEVICE_STATUS_CONFIG = {
  ONLINE_THRESHOLD_MINUTES: 1,   // 5분 이내 = 온라인
  OFFLINE_THRESHOLD_MINUTES: 1, // 15분 이상 = 오프라인
  HYSTERESIS_MINUTES: 2          // 히스테리시스 (상태 변경을 위한 추가 시간)
};

// 🔥 카카오 알림톡 설정
const KAKAO_CONFIG = {
  userid: 'etcom262',
  profile: 'd3393e690b02911e022c8e305920de8a3b6520f2',
  smsSender: '01022957774',
  apiUrl: 'https://alimtalk-api.bizmsg.kr/v2/sender/send'
};
// === Loose IP match helpers ===
const IP_MATCH_OCTETS = Math.max(1, Math.min(3, Number(process.env.DEVICE_IP_MATCH_OCTETS || 2)));

function isIPv4(ip) {
  return typeof ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}
function ipv4Prefix(ip, octets) {
  if (!isIPv4(ip)) return null;
  const parts = ip.split('.');
  const n = Math.max(1, Math.min(3, Number(octets) || 2));
  return parts.slice(0, n).join('.');
}
/**
 * 일치 결과:
 *  - 'exact'         : 완전 일치
 *  - 'same-network'  : 지정 옥텟 프리픽스 일치
 *  - false           : 불일치
 */
function ipLooselyMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return 'exact';
  if (!isIPv4(a) || !isIPv4(b)) return false;
  return ipv4Prefix(a, IP_MATCH_OCTETS) === ipv4Prefix(b, IP_MATCH_OCTETS)
    ? 'same-network'
    : false;
}
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.headers['x-client-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip ||
         '127.0.0.1';
}

// 🔥 디바이스 상태 계산 함수 (sensors.js에서 호출용으로 내보내기)
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

    // 템플릿 생성 (기존 generateDeviceStatusTemplate 재사용)
    const template = generateDeviceStatusTemplate(newStatus, {
      deviceName: info.device.name,
      adminName: info.owner.adminName,
      ownerName: info.owner.name,
      deviceLocation: info.device.location,
      timestamp: ts,
      lastSeenAt: lastSeenText
    });

    // 각 번호에 병렬 발송
    const tasks = info.phones.map(async (phn) => {
      const payload = [{
        message_type: 'at',
        phn,
        profile: KAKAO_CONFIG.profile,
        tmplId: template.tmplId,
        msg: template.message,
        smsKind: 'L',
        msgSms: template.message,
        smsSender: KAKAO_CONFIG.smsSender,
        smsLmsTit: template.title,
        reserveDt: '00000000000000',
        ...(template.button1 ? { button1: template.button1 } : {})
      }];

      try {
        const resp = await fetch(KAKAO_CONFIG.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'userid': KAKAO_CONFIG.userid },
          body: JSON.stringify(payload)
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


// 🔥 디바이스 상태 템플릿 생성 (kakao1 스타일: button1만 사용)
function generateDeviceStatusTemplate(newStatus, data) {
  const systemType = data.systemType || '시리얼로거 데이터로거';
  const userName   = data.ownerName || data.adminName || '사용자';
  const deviceName = data.deviceName || '장치';
  const location   = data.deviceLocation || '위치 정보 없음';

  const baseUrl =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    'https://seriallog.com';

  const deviceUrl = data.deviceId
    ? `${baseUrl}/devices/${encodeURIComponent(data.deviceId)}`
    : baseUrl;

  if (newStatus === 'online') {
    // ✅ seriallog1: 버튼 1개만
    const message =
`${userName}님의 ${systemType} ${deviceName} 모니터링 시작


장치위치: ${location}
장치상태 : 온라인
시작시간: ${data.timestamp}


시리얼로거 데이터로거 장치 모니터링을 시작합니다.`;

    const button1 = {
      name: '장치 보기',
      type: 'WL',
      url_mobile: deviceUrl,
      url_pc: deviceUrl
    };

    return {
      tmplId: 'seriallog1',
      title: '(안내)',
      message,
      button1
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

// 등록 상태 확인 API
// GET /check/:deviceId
router.get('/check/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const clientIP = getClientIP(req); // 기존 함수 사용

    // deviceId로 조회 (rows 겸용 처리)
    const result = await Database.query(
      'SELECT device_id, device_name, last_seen_ip FROM devices WHERE device_id = $1 LIMIT 1',
      [deviceId]
    );
    const rows = Array.isArray(result) ? result : (result?.rows || []);

    if (rows.length === 0) {
      return res.json({
        success: true,
        registered: false,
        ipMatches: false,
        ipMatchMode: 'none',
        message: 'Device is not registered',
        currentIP: clientIP
      });
    }

    const device = rows[0];
    const lastKnownIP = device.last_seen_ip;

    // lastKnownIP가 비어있으면 최초 갱신 후 통과
    if (!lastKnownIP) {
      await Database.query(
        'UPDATE devices SET last_seen_ip = $1, last_seen_at = NOW() WHERE device_id = $2',
        [clientIP, deviceId]
      );
      return res.json({
        success: true,
        registered: true,
        ipMatches: true,
        ipMatchMode: 'exact', // 최초 세팅으로 간주
        matchOctets: undefined,
        deviceName: device.device_name,
        currentIP: clientIP,
        lastKnownIP: clientIP,
        message: 'Device registered and IP initialized'
      });
    }

    const match = ipLooselyMatches(lastKnownIP, clientIP);
    const ipMatches = !!match;

    // 같은 네트워크(또는 완전일치)면 최신 IP로 갱신
    if (ipMatches) {
      await Database.query(
        'UPDATE devices SET last_seen_ip = $1, last_seen_at = NOW() WHERE device_id = $2',
        [clientIP, deviceId]
      );
    }

    return res.json({
      success: true,
      registered: true,
      ipMatches,
      ipMatchMode: ipMatches ? match : 'none',      // 'exact' | 'same-network' | 'none'
      matchOctets: ipMatches && match === 'same-network' ? IP_MATCH_OCTETS : undefined,
      deviceName: device.device_name,
      currentIP: clientIP,
      lastKnownIP,
      message: ipMatches
        ? (match === 'exact'
            ? 'Device registered and IP matches (exact)'
            : `Device registered and same network (first ${IP_MATCH_OCTETS} octets match)`)
        : 'Device registered but IP changed'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'CHECK_FAILED' });
  }
});


// device_id 기반 등록 API
// POST /register  — 느슨 IP 매칭 + pending_devices 유지
router.post('/register', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  try {
    const { deviceId, deviceName, localIP } = req.body;
    const clientIP = getClientIP(req);

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'MISSING_DEVICE_ID' });
    }

    // 기존 등록 장치 조회
    const existing = await Database.query(
      'SELECT id, device_id, device_name, registered_by, last_seen_ip FROM devices WHERE device_id = $1 LIMIT 1',
      [deviceId]
    );

    if (existing.length > 0) {
      const row = existing[0];
      const match = ipLooselyMatches(row.last_seen_ip, clientIP);

      if (match) {
        // 같은 위치로 판단(완전 일치 or 같은 네트워크) → 최신 IP 갱신 후 alreadyRegistered 반환
        await Database.query(
          'UPDATE devices SET last_seen_ip = $1, last_seen_at = NOW(), device_name = COALESCE($3, device_name) WHERE device_id = $2',
          [clientIP, deviceId, deviceName || null]
        );

        return res.json({
          success: true,
          alreadyRegistered: true,
          sameLocation: true,
          ipMatchMode: match, // 'exact' | 'same-network'
          matchOctets: match === 'same-network' ? IP_MATCH_OCTETS : undefined,
          message: match === 'exact'
            ? '동일 IP에서 이미 등록된 장치입니다.'
            : `같은 네트워크(앞 ${IP_MATCH_OCTETS} 옥텟 일치)에서 이미 등록된 장치입니다.`,
          registrationUrl: null,
          qrCode: null
        });
      }
      // 기존 레코드가 있지만 IP가 다른 경우 → 아래 pending_devices 로 저장(재승인/연결 단계)
    }

    // pending_devices 에 임시 저장(24시간 유효) — upsert
    await Database.query(
      `INSERT INTO pending_devices (device_id, device_name, local_ip, public_ip)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_id) DO UPDATE SET
         device_name = $2, local_ip = $3, public_ip = $4,
         created_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'`,
      [deviceId, deviceName || null, localIP || null, clientIP]
    );

    // 캐시 무효화(있을 때만)
    if (cache?.del) {
      await Promise.all([
        cache.del(`pending_devices:${clientIP}`),
        cache.del(`pending_devices:list`),
        cache.del(`device_registration:${deviceId}`)
      ]);
    }

    // 프론트 등록 페이지 URL 반환
    const frontendUrl = `https://seriallog.com/device-setup?device_id=${encodeURIComponent(deviceId)}&auto=true`;

    return res.json({
      success: true,
      alreadyRegistered: false,
      locationChanged: existing.length > 0,
      deviceId,
      registrationUrl: frontendUrl
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Device registration error:`, error);
    return res.status(500).json({ success: false, error: 'REGISTER_FAILED' });
  }
});

// 🔥 그룹 즐겨찾기 토글 API
router.post('/groups/:groupId/toggle-favorite', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    console.log(`⭐ 그룹 즐겨찾기 토글: 사용자 ${req.user.email}, 그룹 ${groupId}`);
    
    // 사용자가 소유한 그룹인지 확인
    const groupCheck = await Database.query(
      'SELECT group_id, group_name FROM device_groups WHERE group_id = $1 AND created_by = $2',
      [groupId, userId]
    );
    
    if (groupCheck.length === 0) {
      return res.status(403).json({
        success: false,
        error: '해당 그룹에 대한 권한이 없습니다.'
      });
    }
    
    // 현재 즐겨찾기 상태 확인
    const favoriteCheck = await Database.query(
      'SELECT id FROM user_group_favorites WHERE user_id = $1 AND group_id = $2',
      [userId, groupId]
    );
    
    let isFavorite;
    
    if (favoriteCheck.length > 0) {
      // 즐겨찾기에서 제거
      await Database.query(
        'DELETE FROM user_group_favorites WHERE user_id = $1 AND group_id = $2',
        [userId, groupId]
      );
      isFavorite = false;
      console.log(`❌ 그룹 즐겨찾기 제거: ${groupId}`);
    } else {
      // 즐겨찾기에 추가
      await Database.query(
        'INSERT INTO user_group_favorites (user_id, group_id) VALUES ($1, $2)',
        [userId, groupId]
      );
      isFavorite = true;
      console.log(`✅ 그룹 즐겨찾기 추가: ${groupId}`);
    }
    
    // 즉시 캐시 무효화
    await Promise.all([
      invalidateUserCache(req.user.id, 'groups*'),
      cache.del && cache.del(`groups:list:${req.user.id}`),
      cache.del && cache.del(`groups:favorites:${req.user.id}`)
    ].filter(Boolean));
    
    res.json({
      success: true,
      isFavorite,
      message: isFavorite ? '그룹이 즐겨찾기에 추가되었습니다.' : '그룹이 즐겨찾기에서 제거되었습니다.',
      groupName: groupCheck[0].group_name
    });
    
  } catch (error) {
    console.error('Toggle group favorite error:', error);
    res.status(500).json({
      success: false,
      error: '그룹 즐겨찾기 설정 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 즐겨찾기 포함 그룹 목록 조회 API (기존 API 수정)
router.get('/groups-with-favorites', authenticateToken, cacheMiddleware(60, (req) => `groups:favorites:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`📂 즐겨찾기 포함 그룹 목록 조회: user ${req.user.email}`);
    
    const groupsQuery = `
      SELECT 
        dg.group_id,
        dg.group_name,
        dg.description,
        dg.color,
        dg.created_at,
        dg.updated_at,
        ARRAY_AGG(dgm.device_id ORDER BY dgm.added_at) as device_ids,
        CASE WHEN ugf.group_id IS NOT NULL THEN true ELSE false END as is_favorite
      FROM device_groups dg
      LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
      LEFT JOIN user_group_favorites ugf ON dg.group_id = ugf.group_id AND ugf.user_id = $1
      WHERE dg.created_by = $1
      GROUP BY dg.group_id, dg.group_name, dg.description, dg.color, dg.created_at, dg.updated_at, ugf.group_id
      ORDER BY dg.created_at DESC
    `;
    
    const groupsResult = await Database.query(groupsQuery, [userId]);
    
    // device_ids에서 null 제거
    const groups = groupsResult.map(group => ({
      ...group,
      device_ids: group.device_ids.filter(id => id !== null)
    }));
    
    // 통계 계산
    const stats = {
      total: groups.length,
      favorites: groups.filter(g => g.is_favorite).length
    };
    
    console.log(`📂 그룹 개수: ${groups.length}, 즐겨찾기: ${stats.favorites}`);
    
    res.json({
      success: true,
      groups: groups,
      stats: stats
    });
    
  } catch (error) {
    console.error('Get groups with favorites error:', error);
    res.status(500).json({
      success: false,
      error: '그룹 목록 조회 중 오류가 발생했습니다.',
      groups: [],
      stats: { total: 0, favorites: 0 }
    });
  }
});

// 🔥 즐겨찾기된 그룹만 조회 API
router.get('/groups/favorites-only', authenticateToken, cacheMiddleware(60, (req) => `groups:favoritesonly:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`⭐ 즐겨찾기된 그룹만 조회: user ${req.user.email}`);
    
    const favoriteGroupsQuery = `
      SELECT 
        dg.group_id,
        dg.group_name,
        dg.description,
        dg.color,
        dg.created_at,
        dg.updated_at,
        ARRAY_AGG(dgm.device_id ORDER BY dgm.added_at) as device_ids,
        true as is_favorite
      FROM device_groups dg
      INNER JOIN user_group_favorites ugf ON dg.group_id = ugf.group_id AND ugf.user_id = $1
      LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
      WHERE dg.created_by = $1
      GROUP BY dg.group_id, dg.group_name, dg.description, dg.color, dg.created_at, dg.updated_at
      ORDER BY ugf.created_at DESC
    `;
    
    const favoriteGroupsResult = await Database.query(favoriteGroupsQuery, [userId]);
    
    // device_ids에서 null 제거
    const favoriteGroups = favoriteGroupsResult.map(group => ({
      ...group,
      device_ids: group.device_ids.filter(id => id !== null)
    }));
    
    console.log(`⭐ 즐겨찾기된 그룹 개수: ${favoriteGroups.length}`);
    
    res.json({
      success: true,
      groups: favoriteGroups,
      count: favoriteGroups.length
    });
    
  } catch (error) {
    console.error('Get favorite groups error:', error);
    res.status(500).json({
      success: false,
      error: '즐겨찾기 그룹 조회 중 오류가 발생했습니다.',
      groups: [],
      count: 0
    });
  }
});
// 대기 중인 장치 목록
router.get('/pending-devices', authenticateToken, async (req, res) => {
  try {
    const userIP = req.user.last_ip;
    
    //console.log(`🔍 장치 검색: 사용자 ${req.user.email}의 IP ${userIP}에서 검색`);
    
    const pendingDevices = await Database.query(
      `SELECT device_id, device_name, local_ip, created_at
       FROM pending_devices 
       WHERE public_ip = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userIP]
    );
    
    //console.log(`📱 발견된 장치: ${pendingDevices.length}개`);
    
    res.json({
      success: true,
      pendingDevices: pendingDevices,
      userIP: userIP
    });
    
  } catch (error) {
    console.error('Get pending devices error:', error);
    res.status(500).json({ success: false, error: '장치 검색 실패' });
  }
});
router.post('/invalidate-cache', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { cacheTypes = ['devices', 'groups'] } = req.body;
    
    console.log(`🧹 캐시 무효화 요청: ${req.user.email} - ${cacheTypes.join(', ')}`);
    
    const cachePromises = [];
    
    if (cacheTypes.includes('devices')) {
      cachePromises.push(
        invalidateUserCache(userId, 'devices*'),
        cache.del && cache.del(`devices:favorites:${userId}`),
        cache.del && cache.del(`devices:list:${userId}`)
      );
    }
    
    if (cacheTypes.includes('groups')) {
      cachePromises.push(
        invalidateUserCache(userId, 'groups*'),
        cache.del && cache.del(`groups:list:${userId}`)
      );
    }
    
    await Promise.all(cachePromises.filter(Boolean));
    
    console.log(`✅ 캐시 무효화 완료: ${cachePromises.length}개 항목`);
    
    res.json({
      success: true,
      message: '캐시가 성공적으로 무효화되었습니다.',
      invalidatedTypes: cacheTypes
    });
    
  } catch (error) {
    console.error('Cache invalidation error:', error);
    res.status(500).json({
      success: false,
      error: '캐시 무효화 중 오류가 발생했습니다.'
    });
  }
});
// Device ID 중복 검사 API
router.post('/check-device-id', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user.id;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID가 필요합니다.'
      });
    }
    
    //console.log(`🔍 Device ID 중복 검사: ${deviceId} by user ${req.user.email}`);
    
    // 등록된 장치에서 중복 확인
    const existingDevice = await Database.query(
      'SELECT device_id, device_name, registered_by FROM devices WHERE device_id = $1',
      [deviceId]
    );
    
    if (existingDevice.length > 0) {
      const device = existingDevice[0];
      
      if (device.registered_by === userId) {
        return res.json({
          success: true,
          available: false,
          isOwnDevice: true,
          message: '이미 등록된 본인 소유의 장치입니다.',
          deviceName: device.device_name
        });
      } else {
        return res.json({
          success: true,
          available: false,
          isOwnDevice: false,
          message: '다른 사용자가 이미 등록한 장치입니다.'
        });
      }
    }
    
    // 대기 중인 장치 검사
    const pendingDevice = await Database.query(
      'SELECT device_id, device_name, public_ip FROM pending_devices WHERE device_id = $1 AND expires_at > NOW()',
      [deviceId]
    );
    
    if (pendingDevice.length > 0) {
      return res.json({
        success: true,
        available: true,
        isPending: true,
        message: '등록 대기 중인 장치입니다. 등록 가능합니다.',
        deviceName: pendingDevice[0].device_name,
        devicePublicIP: pendingDevice[0].public_ip
      });
    }
    
    res.json({
      success: true,
      available: true,
      isPending: false,
      message: '사용 가능한 Device ID입니다.'
    });
    
  } catch (error) {
    console.error('Check device ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Device ID 확인 중 오류가 발생했습니다.'
    });
  }
});

// 장치 연결 API
router.post('/link-pending-device', authenticateToken, async (req, res) => {
  try {
    const { deviceId, adminName, deviceLocation } = req.body; // 🔥 deviceLocation 추가
    const userId = req.user.id;
    const userIP = req.user.last_ip;
    
    //console.log(`🔗 장치 연결 시도: ${deviceId} by ${req.user.email}, adminName: ${adminName}`);
    
    // pending_devices에서 장치 찾기
    const pendingDevice = await Database.query(
      'SELECT * FROM pending_devices WHERE device_id = $1 AND expires_at > NOW()',
      [deviceId]
    );
    
    if (pendingDevice.length === 0) {
      return res.status(404).json({
        success: false,
        error: '대기 중인 장치를 찾을 수 없거나 만료되었습니다.'
      });
    }
    
    const device = pendingDevice[0];
    const deviceIP = device.public_ip;
    const isAutoDiscovery = deviceIP === userIP;
    
    //console.log(`📡 장치 정보:`, {
    //   deviceId: device.device_id,
    //   deviceName: device.device_name,
    //   deviceIP: deviceIP,
    //   userIP: userIP,
    //   isAutoDiscovery: isAutoDiscovery,
    //   adminName: adminName
    // });
    
    // devices 테이블에 저장
    await Database.query(
      `INSERT INTO devices (device_id, device_name, registered_by, last_seen_ip, last_seen_at, admin_name, device_location)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       ON CONFLICT (device_id) DO UPDATE SET 
         registered_by = $3, last_seen_ip = $4, last_seen_at = NOW(), admin_name = $5, device_location = $6`,
      [device.device_id, device.device_name, userId, deviceIP, adminName || null, deviceLocation || null]
    );
    // 여기에 추가 👇
    await Database.query(
      `INSERT INTO device_status_logs (device_id, status_change, message, created_at)
      VALUES ($1, $2, $3, NOW())`,
      [device.device_id, 'offline', '장치가 등록되었습니다.']
    );
    // pending_devices에서 삭제
    await Database.query('DELETE FROM pending_devices WHERE device_id = $1', [deviceId]);
    
    const registrationMethod = isAutoDiscovery ? '자동 검색' : '수동 입력';
    //console.log(`✅ 장치 등록 완료: ${device.device_id} (${registrationMethod})`);

    // 성공 시 사용자 캐시 무효화
    await invalidateUserCache(req.user.id, 'devices*');
    
    res.json({
      success: true,
      message: '장치가 성공적으로 등록되었습니다!',
      device: {
        deviceId: device.device_id,
        deviceName: device.device_name,
        adminName: adminName || req.user.name,
        deviceLocation: deviceLocation || null, // 🔥 추가
        registrationMethod: registrationMethod
      }
    });
    
  } catch (error) {
    console.error('Link pending device error:', error);
    res.status(500).json({ success: false, error: '장치 연결 실패' });
  }
});

// 🔥 with-favorites API (상태 계산만 유지, 추적은 sensors.js에서)
router.get('/with-favorites', authenticateToken, cacheMiddleware(60, (req) => `devices:favorites:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    //console.log(`📱 장치 목록과 즐겨찾기 조회: 사용자 ${req.user.email}`);
    
    const devicesQuery = `
      SELECT 
        d.device_id,
        d.device_name,
        d.created_at,
        d.last_seen_at,
        d.last_seen_ip,
        d.admin_name,
        d.device_location,
        CASE WHEN udf.device_id IS NOT NULL THEN true ELSE false END as is_favorite
      FROM devices d
      LEFT JOIN user_device_favorites udf ON d.device_id = udf.device_id AND udf.user_id = $1
      WHERE d.registered_by = $1
      ORDER BY d.created_at DESC
    `;
    
    const devicesResult = await Database.query(devicesQuery, [userId]);
    const devices = Array.isArray(devicesResult) ? devicesResult : 
                   (devicesResult.rows ? devicesResult.rows : []);
    
    //console.log(`📱 장치 개수: ${devices.length}`);
    
    // 통계 계산 (상태 계산만 하고 추적은 하지 않음)
    const now = new Date();
    const onlineDevices = devices.filter(d => {
      if (!d.last_seen_at) return false;
      const diffMinutes = (now - new Date(d.last_seen_at)) / (1000 * 60);
      return diffMinutes < DEVICE_STATUS_CONFIG.ONLINE_THRESHOLD_MINUTES;
    });
    
    const favoriteDevices = devices.filter(d => d.is_favorite);
    
    const stats = {
      total: devices.length,
      online: onlineDevices.length,
      favorites: favoriteDevices.length
    };
    
    //console.log(`📊 장치 통계:`, stats);
    
    res.json({
      success: true,
      devices: devices,
      stats: stats
    });
    
  } catch (error) {
    console.error('🔥 Fetch devices with favorites error:', error);
    
    res.status(500).json({
      success: false,
      error: '장치 정보를 가져오는 중 오류가 발생했습니다.',
      devices: [],
      stats: { total: 0, online: 0, favorites: 0 }
    });
  }
});

// 즐겨찾기 토글 API
router.post('/toggle-favorite', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user.id;
    
    //console.log(`⭐ 즐겨찾기 토글: 사용자 ${req.user.email}, 장치 ${deviceId}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(403).json({
        success: false,
        error: '해당 장치에 대한 권한이 없습니다.'
      });
    }
    
    // 현재 즐겨찾기 상태 확인
    const favoriteCheck = await Database.query(
      'SELECT id FROM user_device_favorites WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );
    
    let isFavorite;
    
    if (favoriteCheck.length > 0) {
      // 즐겨찾기에서 제거
      await Database.query(
        'DELETE FROM user_device_favorites WHERE user_id = $1 AND device_id = $2',
        [userId, deviceId]
      );
      isFavorite = false;
      //console.log(`❌ 즐겨찾기 제거: ${deviceId}`);
    } else {
      // 즐겨찾기에 추가
      await Database.query(
        'INSERT INTO user_device_favorites (user_id, device_id) VALUES ($1, $2)',
        [userId, deviceId]
      );
      isFavorite = true;
      //console.log(`✅ 즐겨찾기 추가: ${deviceId}`);
    }
    
    // 즉시 캐시 무효화
    await Promise.all([
      invalidateUserCache(req.user.id, 'devices*'),
      invalidateUserCache(req.user.id, 'groups*'),
      cache.del(`devices:favorites:${req.user.id}`),
      cache.del(`devices:list:${req.user.id}`),
      cache.del(`device:detail:${deviceId}:${req.user.id}`)
    ].filter(Boolean)); // null/undefined 값 제거
    
    res.json({
      success: true,
      isFavorite,
      message: isFavorite ? '즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 제거되었습니다.'
    });
    
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({
      success: false,
      error: '즐겨찾기 설정 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 그룹 생성 API (개선된 버전)
router.post('/groups', authenticateToken, async (req, res) => {
  try {
    const { groupName, description, deviceIds } = req.body;
    const userId = req.user.id;
    
    //console.log(`📂 그룹 생성: ${groupName} by ${req.user.email}, devices: ${deviceIds}`);
    
    // 유효성 검사
    if (!groupName?.trim()) {
      return res.status(400).json({
        success: false,
        error: '그룹 이름이 필요합니다.'
      });
    }
    
    if (!Array.isArray(deviceIds) || deviceIds.length < 2 || deviceIds.length > 6) {
      return res.status(400).json({
        success: false,
        error: '2~6개의 디바이스를 선택해야 합니다.'
      });
    }
    
    // 사용자 소유 디바이스인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = ANY($1) AND registered_by = $2',
      [deviceIds, userId]
    );
    
    if (deviceCheck.length !== deviceIds.length) {
      return res.status(403).json({
        success: false,
        error: '일부 디바이스에 대한 권한이 없습니다.'
      });
    }
    
    // 이미 그룹에 속한 디바이스 확인
    const groupedDevices = await Database.query(
      'SELECT device_id FROM device_group_members WHERE device_id = ANY($1)',
      [deviceIds]
    );
    
    if (groupedDevices.length > 0) {
      return res.status(400).json({
        success: false,
        error: '일부 디바이스가 이미 다른 그룹에 속해있습니다.'
      });
    }
    
    // 그룹 ID 생성
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 색상 랜덤 선택
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // 트랜잭션 시작
    await Database.query('BEGIN');
    
    try {
      // 그룹 생성
      await Database.query(
        'INSERT INTO device_groups (group_id, group_name, description, color, created_by) VALUES ($1, $2, $3, $4, $5)',
        [groupId, groupName.trim(), description?.trim() || '', randomColor, userId]
      );
      
      // 디바이스들을 그룹에 추가
      for (const deviceId of deviceIds) {
        await Database.query(
          'INSERT INTO device_group_members (group_id, device_id) VALUES ($1, $2)',
          [groupId, deviceId]
        );
      }
      
      await Database.query('COMMIT');
      
      // 기존 캐시 무효화 코드를 이렇게 수정
      const cachePromises = [
        invalidateUserCache(req.user.id, 'devices*'),
        invalidateUserCache(req.user.id, 'groups*'),
        // 기존 캐시들
        cache.del && cache.del(`devices:favorites:${req.user.id}`),
        cache.del && cache.del(`devices:list:${req.user.id}`),
        cache.del && cache.del(`groups:list:${req.user.id}`),
        // 🔥 그룹 즐겨찾기 캐시 추가
        cache.del && cache.del(`groups:favorites:${req.user.id}`),
        cache.del && cache.del(`groups:favoritesonly:${req.user.id}`)
      ].filter(Boolean);
      
      if (cache.del) {
        cachePromises.push(
          cache.del(`devices:favorites:${req.user.id}`),
          cache.del(`devices:list:${req.user.id}`),
          cache.del(`groups:list:${req.user.id}`)
        );
      }
      
      await Promise.all(cachePromises);
      
      // 🔥 생성된 그룹 정보 즉시 조회해서 반환
      const createdGroupQuery = `
        SELECT 
          dg.group_id,
          dg.group_name,
          dg.description,
          dg.color,
          dg.created_at,
          dg.updated_at,
          ARRAY_AGG(dgm.device_id ORDER BY dgm.added_at) as device_ids
        FROM device_groups dg
        LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
        WHERE dg.group_id = $1
        GROUP BY dg.group_id, dg.group_name, dg.description, dg.color, dg.created_at, dg.updated_at
      `;
      
      const createdGroupResult = await Database.query(createdGroupQuery, [groupId]);
      const createdGroup = createdGroupResult[0];
      
      //console.log(`✅ 그룹 생성 완료: ${groupId}`);
      
      res.json({
        success: true,
        message: '그룹이 성공적으로 생성되었습니다.',
        group: {
          ...createdGroup,
          device_ids: createdGroup.device_ids.filter(id => id !== null),
          deviceCount: deviceIds.length
        }
      });
      
    } catch (error) {
      await Database.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      error: '그룹 생성 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 그룹 목록 조회 API (캐시 시간 단축)
router.get('/groups', authenticateToken, cacheMiddleware(60, (req) => `groups:list:${req.user.id}`), async (req, res) => {
 try {
   const userId = req.user.id;
   
   //console.log(`📂 그룹 목록 조회: user ${req.user.email}`);
   
   const groupsQuery = `
     SELECT 
       dg.group_id,
       dg.group_name,
       dg.description,
       dg.color,
       dg.created_at,
       dg.updated_at,
       ARRAY_AGG(dgm.device_id ORDER BY dgm.added_at) as device_ids
     FROM device_groups dg
     LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
     WHERE dg.created_by = $1
     GROUP BY dg.group_id, dg.group_name, dg.description, dg.color, dg.created_at, dg.updated_at
     ORDER BY dg.created_at DESC
   `;
   
   const groupsResult = await Database.query(groupsQuery, [userId]);
   
   // device_ids에서 null 제거
   const groups = groupsResult.map(group => ({
     ...group,
     device_ids: group.device_ids.filter(id => id !== null)
   }));
   
   //console.log(`📂 그룹 개수: ${groups.length}`);
   
   res.json({
     success: true,
     groups: groups
   });
   
 } catch (error) {
   console.error('Get groups error:', error);
   res.status(500).json({
     success: false,
     error: '그룹 목록 조회 중 오류가 발생했습니다.',
     groups: []
   });
 }
});

// 🔥 그룹 수정 API (개선된 버전)
router.put('/groups/:groupId', authenticateToken, async (req, res) => {
 try {
   const { groupId } = req.params;
   const { groupName, description, deviceIds } = req.body;
   const userId = req.user.id;
   
   //console.log(`📝 그룹 수정: ${groupId} by ${req.user.email}`);
   
   // 그룹 소유자 확인
   const groupCheck = await Database.query(
     'SELECT group_id FROM device_groups WHERE group_id = $1 AND created_by = $2',
     [groupId, userId]
   );
   
   if (groupCheck.length === 0) {
     return res.status(404).json({
       success: false,
       error: '그룹을 찾을 수 없거나 권한이 없습니다.'
     });
   }
   
   // 유효성 검사
   if (!groupName?.trim()) {
     return res.status(400).json({
       success: false,
       error: '그룹 이름이 필요합니다.'
     });
   }
   
   if (!Array.isArray(deviceIds) || deviceIds.length < 2 || deviceIds.length > 6) {
     return res.status(400).json({
       success: false,
       error: '2~6개의 디바이스를 선택해야 합니다.'
     });
   }
   
   // 사용자 소유 디바이스인지 확인
   const deviceCheck = await Database.query(
     'SELECT device_id FROM devices WHERE device_id = ANY($1) AND registered_by = $2',
     [deviceIds, userId]
   );
   
   if (deviceCheck.length !== deviceIds.length) {
     return res.status(403).json({
       success: false,
       error: '일부 디바이스에 대한 권한이 없습니다.'
     });
   }
   
   // 다른 그룹에 속한 디바이스 확인 (현재 그룹 제외)
   const groupedDevices = await Database.query(
     'SELECT device_id FROM device_group_members WHERE device_id = ANY($1) AND group_id != $2',
     [deviceIds, groupId]
   );
   
   if (groupedDevices.length > 0) {
     return res.status(400).json({
       success: false,
       error: '일부 디바이스가 이미 다른 그룹에 속해있습니다.'
     });
   }
   
   // 트랜잭션 시작
   await Database.query('BEGIN');
   
   try {
     // 그룹 정보 업데이트
     await Database.query(
       'UPDATE device_groups SET group_name = $1, description = $2, updated_at = NOW() WHERE group_id = $3',
       [groupName.trim(), description?.trim() || '', groupId]
     );
     
     // 기존 멤버십 삭제
     await Database.query(
       'DELETE FROM device_group_members WHERE group_id = $1',
       [groupId]
     );
     
     // 새로운 디바이스들 추가
     for (const deviceId of deviceIds) {
       await Database.query(
         'INSERT INTO device_group_members (group_id, device_id) VALUES ($1, $2)',
         [groupId, deviceId]
       );
     }
     
     await Database.query('COMMIT');
     
     // 기존 캐시 무효화 코드를 이렇게 수정
    const cachePromises = [
      invalidateUserCache(req.user.id, 'devices*'),
      invalidateUserCache(req.user.id, 'groups*'),
      // 기존 캐시들
      cache.del && cache.del(`devices:favorites:${req.user.id}`),
      cache.del && cache.del(`devices:list:${req.user.id}`),
      cache.del && cache.del(`groups:list:${req.user.id}`),
      // 🔥 그룹 즐겨찾기 캐시 추가
      cache.del && cache.del(`groups:favorites:${req.user.id}`),
      cache.del && cache.del(`groups:favoritesonly:${req.user.id}`)
    ].filter(Boolean);
     
     if (cache.del) {
       cachePromises.push(
         cache.del(`devices:favorites:${req.user.id}`),
         cache.del(`devices:list:${req.user.id}`),
         cache.del(`groups:list:${req.user.id}`),
         cache.del(`group:sensors:${groupId}:${req.user.id}`)
       );
     }
     
     await Promise.all(cachePromises);
     
     // 🔥 수정된 그룹 정보 즉시 조회해서 반환
     const updatedGroupQuery = `
       SELECT 
         dg.group_id,
         dg.group_name,
         dg.description,
         dg.color,
         dg.created_at,
         dg.updated_at,
         ARRAY_AGG(dgm.device_id ORDER BY dgm.added_at) as device_ids
       FROM device_groups dg
       LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
       WHERE dg.group_id = $1
       GROUP BY dg.group_id, dg.group_name, dg.description, dg.color, dg.created_at, dg.updated_at
     `;
     
     const updatedGroupResult = await Database.query(updatedGroupQuery, [groupId]);
     const updatedGroup = updatedGroupResult[0];
     
     //console.log(`✅ 그룹 수정 완료: ${groupId}`);
     
     res.json({
       success: true,
       message: '그룹이 성공적으로 수정되었습니다.',
       group: {
         ...updatedGroup,
         device_ids: updatedGroup.device_ids.filter(id => id !== null)
       }
     });
     
   } catch (error) {
     await Database.query('ROLLBACK');
     throw error;
   }
   
 } catch (error) {
   console.error('Update group error:', error);
   res.status(500).json({
     success: false,
     error: '그룹 수정 중 오류가 발생했습니다.'
   });
 }
});

// 🔥 그룹 삭제 API (개선된 버전)
router.delete('/groups/:groupId', authenticateToken, async (req, res) => {
 try {
   const { groupId } = req.params;
   const userId = req.user.id;
   
   //console.log(`🗑️ 그룹 삭제: ${groupId} by ${req.user.email}`);
   
   // 🔥 삭제 전에 그룹에 속한 디바이스 목록 조회
   const groupDevicesQuery = `
     SELECT dgm.device_id
     FROM device_group_members dgm
     JOIN device_groups dg ON dgm.group_id = dg.group_id
     WHERE dg.group_id = $1 AND dg.created_by = $2
   `;
   
   const groupDevices = await Database.query(groupDevicesQuery, [groupId, userId]);
   const deviceIds = groupDevices.map(row => row.device_id);
   
   // 그룹 소유자 확인
   const groupCheck = await Database.query(
     'SELECT group_id, group_name FROM device_groups WHERE group_id = $1 AND created_by = $2',
     [groupId, userId]
   );
   
   if (groupCheck.length === 0) {
     return res.status(404).json({
       success: false,
       error: '그룹을 찾을 수 없거나 권한이 없습니다.'
     });
   }
   
   const group = groupCheck[0];
   
   // 트랜잭션으로 삭제
   await Database.query('BEGIN');
   
   try {
     // 멤버십 먼저 삭제
     await Database.query('DELETE FROM device_group_members WHERE group_id = $1', [groupId]);
     
     // 그룹 삭제
     await Database.query('DELETE FROM device_groups WHERE group_id = $1', [groupId]);
     
     await Database.query('COMMIT');
     
     // 기존 캐시 무효화 코드를 이렇게 수정
      const cachePromises = [
        invalidateUserCache(req.user.id, 'devices*'),
        invalidateUserCache(req.user.id, 'groups*'),
        // 기존 캐시들
        cache.del && cache.del(`devices:favorites:${req.user.id}`),
        cache.del && cache.del(`devices:list:${req.user.id}`),
        cache.del && cache.del(`groups:list:${req.user.id}`),
        // 🔥 그룹 즐겨찾기 캐시 추가
        cache.del && cache.del(`groups:favorites:${req.user.id}`),
        cache.del && cache.del(`groups:favoritesonly:${req.user.id}`)
      ].filter(Boolean);
     
     if (cache.del) {
       cachePromises.push(
         cache.del(`devices:favorites:${req.user.id}`),
         cache.del(`devices:list:${req.user.id}`),
         cache.del(`groups:list:${req.user.id}`),
         cache.del(`group:sensors:${groupId}:${req.user.id}`)
       );
     }
     
     await Promise.all(cachePromises);
     
     //console.log(`✅ 그룹 삭제 완료: ${group.group_name}`);
     
     res.json({
       success: true,
       message: `그룹 "${group.group_name}"이 성공적으로 삭제되었습니다.`,
       deletedGroupId: groupId,
       affectedDevices: deviceIds // 🔥 영향받은 디바이스 목록 반환
     });
     
   } catch (error) {
     await Database.query('ROLLBACK');
     throw error;
   }
   
 } catch (error) {
   console.error('Delete group error:', error);
   res.status(500).json({
     success: false,
     error: '그룹 삭제 중 오류가 발생했습니다.'
   });
 }
});

// 🔥 그룹별 센서 데이터 조회 API
router.get('/groups/:groupId/sensors', authenticateToken, cacheMiddleware(60, (req) => `group:sensors:${req.params.groupId}:${req.user.id}`), async (req, res) => {
 try {
   const { groupId } = req.params;
   const userId = req.user.id;
   
   //console.log(`📊 그룹 센서 데이터 조회: ${groupId} by ${req.user.email}`);
   
   // 그룹 소유자 확인 및 그룹 정보 가져오기
   const groupQuery = `
     SELECT 
       dg.group_id,
       dg.group_name,
       dg.description,
       dg.color,
       ARRAY_AGG(dgm.device_id) as device_ids
     FROM device_groups dg
     LEFT JOIN device_group_members dgm ON dg.group_id = dgm.group_id
     WHERE dg.group_id = $1 AND dg.created_by = $2
     GROUP BY dg.group_id, dg.group_name, dg.description, dg.color
   `;
   
   const groupResult = await Database.query(groupQuery, [groupId, userId]);
   
   if (groupResult.length === 0) {
     return res.status(404).json({
       success: false,
       error: '그룹을 찾을 수 없거나 권한이 없습니다.'
     });
   }
   
   const group = groupResult[0];
   const deviceIds = group.device_ids.filter(id => id !== null);
   
   if (deviceIds.length === 0) {
     return res.json({
       success: true,
       group: group,
       devices: [],
       message: '이 그룹에는 디바이스가 없습니다.'
     });
   }
   
   // 🔥 디바이스 정보 조회 추가
   const devicesQuery = `
     SELECT device_id, device_name, admin_name, created_at, last_seen_at, last_seen_ip
     FROM devices 
     WHERE device_id = ANY($1) AND registered_by = $2
     ORDER BY device_name
   `;
   
   const devices = await Database.query(devicesQuery, [deviceIds, userId]);
   
   //console.log(`📱 그룹에 속한 디바이스 ${devices.length}개 조회됨`);
   
   // 🔥 센서 데이터는 제거하고 기본 정보만 반환 (프론트엔드에서 개별 호출)
   res.json({
     success: true,
     group: {
       ...group,
       device_ids: deviceIds
     },
     devices: devices,
     sensors: {} // 빈 객체로 반환
   });
   
 } catch (error) {
   console.error('❌ Get group sensors error:', error);
   res.status(500).json({
     success: false,
     error: '그룹 센서 데이터 조회 중 오류가 발생했습니다.',
     details: process.env.NODE_ENV === 'development' ? error.message : undefined
   });
 }
});

// 🔥 장치 삭제 API
router.delete('/delete/:deviceId', authenticateToken, async (req, res) => {
 try {
   const { deviceId } = req.params;
   const userId = req.user.id;
   
   //console.log(`🗑️ 장치 삭제 요청: ${deviceId} by user ${req.user.email}`);
   
   // 사용자가 소유한 장치인지 확인
   const deviceCheck = await Database.query(
     'SELECT device_id, device_name, registered_by FROM devices WHERE device_id = $1 AND registered_by = $2',
     [deviceId, userId]
   );
   
   if (deviceCheck.length === 0) {
     return res.status(403).json({
       success: false,
       error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
     });
   }
   
   const device = deviceCheck[0];
   
   // 🔥 트랜잭션으로 관련 데이터 모두 삭제
   await Database.query('BEGIN');
   
   try {
     // 1. 그룹 멤버십 삭제
     await Database.query(
       'DELETE FROM device_group_members WHERE device_id = $1',
       [deviceId]
     );
     
     // 2. 즐겨찾기 삭제
     await Database.query(
       'DELETE FROM user_device_favorites WHERE device_id = $1',
       [deviceId]
     );
     
     // 3. 센서 데이터 삭제
     await Database.query(
       'DELETE FROM sensor_data WHERE device_id = $1',
       [deviceId]
     );
     
     // 4. 명령 로그 삭제
     await Database.query(
       'DELETE FROM command_logs WHERE device_id = $1',
       [deviceId]
     );
     
     // 5. 대기 중인 명령 삭제
     await Database.query(
       'DELETE FROM pending_commands WHERE device_id = $1',
       [deviceId]
     );
     
     // 6. 알림 로그 삭제
     await Database.query(
       'DELETE FROM alert_logs WHERE device_id = $1',
       [deviceId]
     );
     
     // 7. 알림 설정 삭제
     await Database.query(
       'DELETE FROM alert_settings WHERE device_id = $1',
       [deviceId]
     );
     
     // 8. 디바이스 상태 로그 삭제
     await Database.query(
       'DELETE FROM device_status_logs WHERE device_id = $1',
       [deviceId]
     );
     
     // 9. 마지막으로 장치 삭제
     await Database.query(
       'DELETE FROM devices WHERE device_id = $1',
       [deviceId]
     );
     
     await Database.query('COMMIT');
     
     //console.log(`✅ 장치 삭제 완료: ${device.device_name} (${deviceId})`);
     
     // 성공 시 관련 캐시 무효화
     // 기존 캐시 무효화 코드를 이렇게 수정
    const cachePromises = [
      invalidateUserCache(req.user.id, 'devices*'),
      invalidateUserCache(req.user.id, 'groups*'),
      // 기존 캐시들
      cache.del && cache.del(`devices:favorites:${req.user.id}`),
      cache.del && cache.del(`devices:list:${req.user.id}`),
      cache.del && cache.del(`groups:list:${req.user.id}`),
      // 🔥 그룹 즐겨찾기 캐시 추가
      cache.del && cache.del(`groups:favorites:${req.user.id}`),
      cache.del && cache.del(`groups:favoritesonly:${req.user.id}`)
    ].filter(Boolean);
     
     if (cache.del) {
       cachePromises.push(cache.del(`device:detail:${deviceId}:${req.user.id}`));
     }
     
     await Promise.all(cachePromises);
     
     res.json({
       success: true,
       message: `장치 "${device.device_name}"가 성공적으로 삭제되었습니다.`,
       deletedDevice: {
         deviceId: device.device_id,
         deviceName: device.device_name
       }
     });
     
   } catch (error) {
     await Database.query('ROLLBACK');
     throw error;
   }
   
 } catch (error) {
   console.error('Delete device error:', error);
   res.status(500).json({
     success: false,
     error: '장치 삭제 중 오류가 발생했습니다.'
   });
 }
});

// 🔥 장치 정보 수정 API
router.put('/update/:deviceId', authenticateToken, async (req, res) => {
 try {
   const { deviceId } = req.params;
   const { deviceName, adminName, deviceLocation } = req.body; // 🔥 여기서 deviceLocation 구조분해할당
   const userId = req.user.id;
   
   //console.log(`📝 장치 정보 수정 요청: ${deviceId} by user ${req.user.email}`);
   //console.log('수정 데이터:', { deviceName, adminName });
   
   // 입력 검증
   if (!deviceName || !deviceName.trim()) {
     return res.status(400).json({
       success: false,
       error: '장치 이름은 필수입니다.'
     });
   }
   
   if (deviceName.trim().length > 255) {
     return res.status(400).json({
       success: false,
       error: '장치 이름은 255자를 초과할 수 없습니다.'
     });
   }
   
   if (adminName && adminName.trim().length > 100) {
     return res.status(400).json({
       success: false,
       error: '관리자 이름은 100자를 초과할 수 없습니다.'
     });
   }

   // 🔥 위치 검증 추가
   if (deviceLocation && deviceLocation.trim().length > 255) {
     return res.status(400).json({
       success: false,
       error: '위치 정보는 255자를 초과할 수 없습니다.'
     });
   }
   
   // 사용자가 소유한 장치인지 확인
   const deviceCheck = await Database.query(
     'SELECT device_id, device_name, admin_name, device_location FROM devices WHERE device_id = $1 AND registered_by = $2',
     [deviceId, userId]
   );
   
   if (deviceCheck.length === 0) {
     return res.status(404).json({
       success: false,
       error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
     });
   }
   
   const oldDevice = deviceCheck[0];
   
   // 🔥 장치 정보 업데이트 (device_location 추가)
   await Database.query(
     'UPDATE devices SET device_name = $1, admin_name = $2, device_location = $3 WHERE device_id = $4',
     [deviceName.trim(), adminName ? adminName.trim() : null, deviceLocation ? deviceLocation.trim() : null, deviceId]
   );
   //console.log(`✅ 장치 정보 수정 완료: ${deviceId}`);
   //console.log(`변경사항: ${oldDevice.device_name} → ${deviceName.trim()}, ${oldDevice.admin_name || '없음'} → ${adminName?.trim() || '없음'}`);
   
   // 성공 시 관련 캐시 무효화
   // 기존 캐시 무효화 코드를 이렇게 수정
    const cachePromises = [
      invalidateUserCache(req.user.id, 'devices*'),
      invalidateUserCache(req.user.id, 'groups*'),
      // 기존 캐시들
      cache.del && cache.del(`devices:favorites:${req.user.id}`),
      cache.del && cache.del(`devices:list:${req.user.id}`),
      cache.del && cache.del(`groups:list:${req.user.id}`),
      // 🔥 그룹 즐겨찾기 캐시 추가
      cache.del && cache.del(`groups:favorites:${req.user.id}`),
      cache.del && cache.del(`groups:favoritesonly:${req.user.id}`)
    ].filter(Boolean);
   
   if (cache.del) {
     cachePromises.push(cache.del(`device:detail:${deviceId}:${req.user.id}`));
   }
   
   await Promise.all(cachePromises);
   
   res.json({
     success: true,
     message: '장치 정보가 성공적으로 수정되었습니다.',
     updatedDevice: {
       deviceId: deviceId,
       deviceName: deviceName.trim(),
       adminName: adminName ? adminName.trim() : null,
       deviceLocation: deviceLocation ? deviceLocation.trim() : null, // 🔥 추가
       oldDeviceName: oldDevice.device_name,
       oldAdminName: oldDevice.admin_name
     }
   });
   
 } catch (error) {
   console.error('Update device error:', error);
   res.status(500).json({
     success: false,
     error: '장치 정보 수정 중 오류가 발생했습니다.'
   });
 }
});

// 🔥 장치 상세 정보 조회 API
router.get('/detail/:deviceId', authenticateToken, cacheMiddleware(600, (req) => `device:detail:${req.params.deviceId}:${req.user.id}`), async (req, res) => {
 try {
   const { deviceId } = req.params;
   const userId = req.user.id;
   
   //console.log(`📋 장치 상세 정보 조회: ${deviceId} by user ${req.user.email}`);
   
   // 사용자가 소유한 장치인지 확인하면서 상세 정보 가져오기
   const deviceQuery = `
     SELECT 
       d.device_id,
       d.device_name,
       d.admin_name,
       d.device_location,
       d.created_at,
       d.last_seen_at,
       d.last_seen_ip,
       CASE WHEN udf.device_id IS NOT NULL THEN true ELSE false END as is_favorite
     FROM devices d
     LEFT JOIN user_device_favorites udf ON d.device_id = udf.device_id AND udf.user_id = $1
     WHERE d.device_id = $2 AND d.registered_by = $1
   `;
   
   const deviceResult = await Database.query(deviceQuery, [userId, deviceId]);
   
   if (deviceResult.length === 0) {
     return res.status(404).json({
       success: false,
       error: '장치를 찾을 수 없거나 접근 권한이 없습니다.'
     });
   }
   
   const device = deviceResult[0];
   
   res.json({
     success: true,
     device: device
   });
   
 } catch (error) {
   console.error('Get device detail error:', error);
   res.status(500).json({
     success: false,
     error: '장치 정보를 가져오는 중 오류가 발생했습니다.'
   });
 }
});

// 🔥 기본 장치 목록 API
router.get('/', authenticateToken, cacheMiddleware(180, (req) => `devices:list:${req.user.id}`), async (req, res) => {
 try {
   const devices = await Database.query(
     'SELECT device_id, device_name, admin_name, created_at, last_seen_at FROM devices WHERE registered_by = $1 ORDER BY created_at DESC',
     [req.user.id]
   );
   
   res.json({ success: true, devices: devices });
   
 } catch (error) {
   console.error('Get devices error:', error);
   res.status(500).json({ success: false, error: '장치 목록 조회 실패', devices: [] });
 }
});

// 🔥 내보내기: sensors.js에서 사용할 함수들
module.exports = router;
module.exports.getDeviceStatus = getDeviceStatus;
module.exports.sendDeviceStatusAlert = sendDeviceStatusAlert;
module.exports.DEVICE_STATUS_CONFIG = DEVICE_STATUS_CONFIG;