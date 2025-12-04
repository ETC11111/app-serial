// routes/kakao.js - seriallog 템플릿 + 다중(2개) 번호 + 키값 규격 반영 버전
const express = require('express');
const router = express.Router();

// 환경/기본 설정
const KAKAO_CONFIG = {
  userid: process.env.KAKAO_USERID || 'etcom262',
  profile: process.env.KAKAO_PROFILE || 'd3393e690b02911e022c8e305920de8a3b6520f2',
  smsSender: process.env.KAKAO_SMS_SENDER || '01022957774',
  apiUrl: process.env.KAKAO_API_URL || 'https://alimtalk-api.bizmsg.kr/v2/sender/send',
  baseUrl: process.env.APP_URL || process.env.FRONTEND_URL || 'https://seriallog.com',
};

// 유틸: 전화번호 정규화(숫자만)
function normalizePhone(p) {
  if (!p) return null;
  const n = String(p).replace(/[^\d]/g, '');
  if (n.length < 9) return null;
  return n;
}

// 유틸: 템플릿 텍스트 정의 (정확히 제시된 규격)
const SERIALLOG_TEMPLATES = {
  seriallog1: 
`#{사용자명}님의 #{시스템 종류} #{장치명} 모니터링 시작


장치위치: #{location}
장치상태 : #{연결상태}
시작시간: #{timestamp}


시리얼로거 데이터로거 장치 모니터링을 시작합니다.`,
  seriallog2:
`#{사용자명}님의 #{시스템 종류} #{장치명} 통신 중단


장치위치: #{location}
장치상태 : #{연결상태}
최종 통신 시간: #{timestamp}


장치 통신에 에러가 발생하였습니다.
현장에서 장치 연결 상태, 네트워크상태 등을 확인해주세요.`
};

// 유틸: 플레이스홀더 치환
function fillPlaceholders(tmplText, vars = {}) {
  // vars 예시:
  // { '사용자명': '홍길동', '시스템 종류': '시리얼로거 데이터로거', '장치명': 'DEVICE-01',
  //   location: 'A동 101', '연결상태': '온라인', timestamp: '2025-08-25 10:30' }
  return tmplText.replace(/#\{([^}]+)\}/g, (_, key) => {
    const v = vars[key] ?? vars[key.trim()];
    return (v !== undefined && v !== null) ? String(v) : `#{${key}}`;
  });
}

// 유틸: 템플릿 객체 생성 (seriallog1 = 버튼 1개, seriallog2 = 버튼 없음)
function generateSeriallogTemplate(tmplId, variables = {}, deviceId) {
  const systemType = variables['시스템 종류'] || '시리얼로거 데이터로거';
  const baseUrl = KAKAO_CONFIG.baseUrl;
  const deviceUrl = deviceId ? `${baseUrl}/devices/${encodeURIComponent(deviceId)}` : baseUrl;

  if (tmplId === 'seriallog1') {
    const message = fillPlaceholders(SERIALLOG_TEMPLATES.seriallog1, variables);

    // kakao1 스타일: button1만 전송
    const button1 = {
      name: '장치 보기',
      type: 'WL',
      url_mobile: deviceUrl,
      url_pc: deviceUrl
    };

    return { tmplId: 'seriallog1', title: '(안내)', message, button1 };
  }

  // 기본: seriallog2
  const message = fillPlaceholders(SERIALLOG_TEMPLATES.seriallog2, variables);
  return { tmplId: 'seriallog2', title: '(안내)', message };
}

/**
 * 신규 형식 입력 (추천)
 * POST /kakao/send
 * {
 *   "phone1": "010-1111-2222",
 *   "phone2": "010-3333-4444",        // (옵션)
 *   "tmplId": "seriallog1" | "seriallog2",
 *   "variables": {
 *      "사용자명": "홍길동",
 *      "시스템 종류": "시리얼로거 데이터로거",
 *      "장치명": "DEVICE-01",
 *      "location": "A동 101",
 *      "연결상태": "온라인", // or 오프라인
 *      "timestamp": "2025-08-25 10:30:00"
 *   },
 *   "deviceId": "DEVICE-01",          // (옵션: 버튼 링크용)
 *   "profile": "overrideProfile"      // (옵션)
 * }
 *
 * 구버전 호환 입력
 * POST /kakao/send
 * [
 *   {
 *     "message_type": "AT",
 *     "phn": "01012345678",
 *     "profile": "...",
 *     "tmplId": "seriallog1",
 *     "msg": "...",
 *     "smsKind": "L",
 *     "msgSms": "...",
 *     "smsSender": "01022957774",
 *     "smsLmsTit": "(안내)",
 *     "reserveDt": "00000000000000",
 *     "button1": { ... } // (옵션)
 *   }
 * ]
 */
router.post('/send', async (req, res) => {
  try {
    const useridHeader = req.headers.userid;
    const userid = useridHeader || KAKAO_CONFIG.userid;

    // 1) 신규 형식 (object)
    if (!Array.isArray(req.body)) {
      const {
        phone1,
        phone2,
        tmplId,
        variables = {},
        deviceId,
        profile
      } = req.body || {};

      if (!tmplId || !SERIALLOG_TEMPLATES[tmplId]) {
        return res.status(400).json({ error: '유효한 tmplId가 필요합니다. (seriallog1 | seriallog2)' });
      }

      const p1 = normalizePhone(phone1);
      const p2 = normalizePhone(phone2);
      const phones = Array.from(new Set([p1, p2].filter(Boolean)));

      if (phones.length === 0) {
        return res.status(400).json({ error: '최소 1개의 유효한 전화번호가 필요합니다.' });
      }

      // 템플릿/버튼 생성
      const t = generateSeriallogTemplate(tmplId, variables, deviceId);

      // Bizmsg payload(전화번호 수만큼 확장)
      const payload = phones.map(phn => ({
        message_type: 'AT',
        phn,
        profile: profile || KAKAO_CONFIG.profile,
        tmplId: t.tmplId,
        msg: t.message,
        smsKind: 'L',
        msgSms: t.message,
        smsSender: KAKAO_CONFIG.smsSender,
        smsLmsTit: t.title,
        reserveDt: '00000000000000',
        ...(t.button1 ? { button1: t.button1 } : {})
      }));

      // 전송
      const response = await fetch(KAKAO_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'userid': userid
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch {
        return res.status(500).json({ error: 'API 응답 파싱 오류', rawResponse: text });
      }

      if (!response.ok) {
        return res.status(response.status).json({ error: '카카오 API 호출 실패', details: result });
      }

      return res.json(result);
    }

    // 2) 구버전 호환: 배열 그대로 전달
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '잘못된 요청 데이터입니다. 배열이 필요합니다.' });
    }

    // 필수 필드 검증 (첫 번째 항목 기준)
    const messageData = data[0];
    const required = ['message_type', 'phn', 'profile', 'tmplId', 'msg'];
    for (const f of required) {
      if (!messageData[f]) {
        return res.status(400).json({ error: `필수 필드 누락: ${f}` });
      }
    }

    // 그대로 전송
    const response = await fetch(KAKAO_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'userid': userid },
      body: JSON.stringify(data)
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch {
      return res.status(500).json({ error: 'API 응답 파싱 오류', rawResponse: text });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: '카카오 API 호출 실패', details: result });
    }

    return res.json(result);

  } catch (error) {
    console.error('카카오 알림톡 발송 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.', message: error.message });
  }
});

// =====================
// 아래는 기존 테스트/부가 라우트 유지(필요 시 사용)
// =====================

// SMS 인증번호 발송 API (유지)
router.post('/send-verification', async (req, res) => {
  try {
    console.log('SMS 인증번호 발송 요청:', req.body);
    const { tel } = req.body;
    if (!tel) return res.status(400).json({ error: '전화번호가 필요합니다.' });

    const smstel = normalizePhone(tel);
    if (!smstel) return res.status(400).json({ error: '유효한 전화번호가 아닙니다.' });

    // 4자리 코드
    const pass = Math.floor(Math.random() * (9999 - 1111 + 1)) + 1111;
    const message = `[시리얼팜] 인증번호는 : ${pass} 입니다.`;

    const smsData = {
      phn: smstel,
      profile: KAKAO_CONFIG.profile,
      reserveDt: '00000000000000',
      smsOnly: 'Y',
      smsKind: 'S',
      msgSms: message,
      smsSender: KAKAO_CONFIG.smsSender
    };

    const response = await fetch(KAKAO_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'userid': KAKAO_CONFIG.userid },
      body: JSON.stringify([smsData])
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch {
      return res.status(500).json({ error: 'API 응답 파싱 오류', rawResponse: text });
    }

    // 테스트 편의를 위해 pass 반환(운영시 제거 권장)
    res.json({ success: true, pass, tel: smstel, apiResponse: result });
  } catch (error) {
    console.error('SMS 인증번호 발송 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.', message: error.message });
  }
});

// SMS 인증번호 확인 API (유지)
router.post('/verify-sms', async (req, res) => {
  try {
    const { tel, code, originalPass } = req.body;
    if (!tel || !code || !originalPass) {
      return res.status(400).json({ success: false, message: '필수 정보가 누락되었습니다.' });
    }
    const searchTel = normalizePhone(tel);
    const ok = String(code) === String(originalPass);
    res.json({
      success: ok,
      message: ok ? '인증이 완료되었습니다.' : '인증번호가 일치하지 않습니다.',
      tel: searchTel
    });
  } catch (error) {
    console.error('SMS 인증번호 확인 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.', message: error.message });
  }
});

// 템플릿 목록 조회: seriallog 규격
router.get('/templates', (req, res) => {
  const templates = [
    {
      id: 'seriallog1',
      name: '장치 모니터링 시작(버튼1개)',
      tmplId: 'seriallog1',
      hasButton1: true,
      description: '장치 시작/온라인 알림. button1 포함.'
    },
    {
      id: 'seriallog2',
      name: '장치 통신 중단(버튼없음)',
      tmplId: 'seriallog2',
      hasButton1: false,
      description: '장치 중단/오프라인 알림. 버튼 없음.'
    }
  ];
  res.json({ templates, total: templates.length });
});

// (옵션) 개발용 테스트 라우트 유지
router.post('/test', async (req, res) => {
  try {
    console.log('카카오 알림톡 테스트 요청:', req.body);
    const mock = [
      { code: 'success', message: '테스트 발송 완료', msgId: 'test_' + Date.now(), timestamp: new Date().toISOString() }
    ];
    console.log('테스트 모드 - 실제 발송하지 않음');
    res.json(mock);
  } catch (error) {
    console.error('카카오 알림톡 테스트 오류:', error);
    res.status(500).json({ error: '테스트 중 오류가 발생했습니다.', message: error.message });
  }
});

// (옵션) 테스트 사용자 정보
router.get('/test-user', (req, res) => {
  const testUser = {
    idx: 1,
    email: 'test@test.com',
    phone: '01012345678',
    name: '홍길동',
    kakao_alarm: 1,
    created_at: '2024-01-01'
  };
  res.json({ success: true, user: testUser, message: '테스트 사용자 정보 (하드코딩)' });
});

module.exports = router;
