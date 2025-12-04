// routes/arduino-test.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();

/* =========================
 * 고정 RTSP 설정
 * ========================= */
const RTSP_URL = 'rtsp://admin1:admin1@221.159.164.177:8890/stream2';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const SEGMENT_TIME = Number(process.env.SEGMENT_TIME || 1800); // 기본 30분
const REENCODE = process.env.REENCODE === '1'; // 1이면 재인코딩 저장

/* =========================
 * 경로/유틸
 * ========================= */
const MEDIA_ROOT = path.resolve(process.cwd(), 'media');
const RECORD_DIR = path.join(MEDIA_ROOT, 'recordings');   // 세그먼트 저장
const SNAPSHOT_DIR = path.join(MEDIA_ROOT, 'snapshots');  // 스냅샷 저장

for (const p of [MEDIA_ROOT, RECORD_DIR, SNAPSHOT_DIR]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const stats = {
  bootedAt: new Date(),
  pingCount: 0,
  echoCount: 0,
  lastPingAt: null,
  lastEchoAt: null,
  lastEchoPayloadPreview: null
};

function pad2(n){ return String(n).padStart(2,'0'); }
function nowIso(){ return new Date().toISOString(); }
function uptimeMs(){ return Date.now() - stats.bootedAt.getTime(); }
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function previewPayload(x){
  try {
    if (x == null) return null;
    if (typeof x === 'string') return x.slice(0,256);
    if (Buffer.isBuffer(x)) return x.toString('utf8',0,256);
    return JSON.stringify(x).slice(0,256);
  } catch { return '<unserializable>'; }
}

function runFFmpeg(args, expectPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d.toString());
    p.on('exit', code => {
      if (code === 0 && (!expectPath || fs.existsSync(expectPath))) resolve({ ok: true, err });
      else reject(new Error(`ffmpeg failed (code=${code})\n${err}`));
    });
    p.on('error', reject);
  });
}

/* =========================
 * 30분 세그먼트 녹화기 (MKV + copy)
 * ========================= */
class SegmentRecorder {
  constructor(rtspUrl, outRoot) {
    this.rtspUrl = rtspUrl;
    this.root = outRoot;
    this.proc = null;
    this.startedAt = null;
    this.stderrTail = '';
  }

  _dateDir(d = new Date()) {
    const dir = path.join(this.root, `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`);
    ensureDir(dir);
    return dir;
  }

  isRunning(){ return !!this.proc; }

  start() {
    if (this.proc) {
      return { ok: true, message: 'already running', running: true, startedAt: this.startedAt?.toISOString() };
    }
    const outDir = this._dateDir();
    const pattern = path.join(outDir, 'seg-%Y%m%d-%H%M%S.mkv'); // 30분 단위 파일

    const common = [
      '-rtsp_transport','tcp',
      '-rtsp_flags','prefer_tcp',
      '-i', this.rtspUrl,
      '-nostdin',
      '-fflags', '+genpts',
      '-use_wallclock_as_timestamps','1',
      '-an'
    ];

    const mux = [
      '-f','segment',
      '-segment_time', String(SEGMENT_TIME),
      '-reset_timestamps','1',
      '-strftime','1',
      pattern
    ];

    const args = REENCODE
      ? [...common, '-c:v','libx264','-preset','veryfast','-crf','23', ...mux]
      : [...common, '-c','copy','-rtbufsize','16M', ...mux];

    this.stderrTail = `[spawn] ffmpeg ${args.join(' ')}\n`;
    const p = spawn(FFMPEG, args, { stdio: ['ignore','ignore','pipe'] });
    this.proc = p;
    this.startedAt = new Date();

    p.stderr.on('data', d => {
      this.stderrTail += d.toString();
      if (this.stderrTail.length > 12000) this.stderrTail = this.stderrTail.slice(-12000);
    });
    p.on('exit', (code, sig) => {
      this.proc = null;
      this.stderrTail += `\n[ffmpeg exit] code=${code} sig=${sig}`;
      // 자동 재시작(5초 후) — 원치 않으면 주석 처리
      setTimeout(() => { try { this.start(); } catch {} }, 5000);
    });

    return { ok: true, message: 'recording started', running: true, startedAt: this.startedAt.toISOString() };
    }

  stop() {
    if (!this.proc) return { ok: true, message: 'not running', running: false };
    this.proc.kill('SIGTERM');
    const s = this.startedAt ? this.startedAt.toISOString() : null;
    this.proc = null;
    this.startedAt = null;
    return { ok: true, message: 'recording stopped', running: false, startedAt: s };
  }

  status() {
    return {
      ok: true,
      running: this.isRunning(),
      file: null, // 세그먼트 방식이라 단일 파일 경로는 의미 없음
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      stderrTail: this.stderrTail
    };
  }

  /* 이벤트 시각이 포함된 세그먼트 파일 찾기 */
  findSegmentFor(dateObj) {
    const dirsToTry = [
      this._dateDir(dateObj),
      this._dateDir(new Date(dateObj.getTime() - 86400000)),  // -1 day
      this._dateDir(new Date(dateObj.getTime() + 86400000))   // +1 day (경계안전)
    ];
    const rx = /seg-(\d{8})-(\d{6})\.mkv$/;

    let candidates = [];
    for (const dir of dirsToTry) {
      if (!fs.existsSync(dir)) continue;
      const list = fs.readdirSync(dir).filter(f => rx.test(f));
      for (const f of list) {
        const m = f.match(rx);
        if (!m) continue;
        const y = Number(m[1].slice(0,4));
        const mo = Number(m[1].slice(4,6));
        const d  = Number(m[1].slice(6,8));
        const hh = Number(m[2].slice(0,2));
        const mm = Number(m[2].slice(2,4));
        const ss = Number(m[2].slice(4,6));
        const start = new Date(y, mo-1, d, hh, mm, ss); // 서버 로컬TZ 기준
        candidates.push({ file: path.join(dir, f), start });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a,b) => a.start - b.start);

    let chosen = null;
    for (const c of candidates) {
      if (c.start <= dateObj) chosen = c;
      else break;
    }
    if (!chosen) return null;

    // 완료 추정: 파일 크기 > 0, 그리고 "마지막 세그먼트"는 아직 열려있을 수 있음
    const end = new Date(chosen.start.getTime() + SEGMENT_TIME*1000);
    try {
      const st = fs.statSync(chosen.file);
      if (st.size <= 0) return null;
    } catch { return null; }

    const last = candidates[candidates.length-1];
    const isLast = last.file === chosen.file;
    return { ...chosen, end, isPossiblyOpen: isLast };
  }
}

const recorder = new SegmentRecorder(RTSP_URL, RECORD_DIR);
// 라우터 로드시 자동 시작
recorder.start();

/* =========================
 * 스냅샷 (라이브 / 세그먼트 파일)
 * ========================= */
// 진행 중 MKV에서 바로 시도 (기존과 동일: 입력 뒤 -ss)
async function snapshotFromSegmentLoose(segmentFile, eventDate, segmentStart, SNAPSHOT_DIR, runFFmpeg) {
  const offsetSec = Math.max(0, Math.floor((eventDate.getTime() - segmentStart.getTime())/1000));
  const out = path.join(SNAPSHOT_DIR, `snap-file-${eventDate.toISOString().replace(/[:.]/g,'')}.jpg`);
  const args = [
    '-i', segmentFile,
    '-ss', String(offsetSec),
    '-frames:v','1',
    '-q:v','2',
    '-y', out
  ];
  await runFFmpeg(args, out);
  return { ok: true, method: 'file', file: out, offsetSec, segmentFile };
}

// 진행 중 MKV가 인덱스 불안정할 때: 해당 구간 5초를 TS로 재래핑 → 그 조각에서 캡처
async function snapshotFromOpenSegmentWithTemp(segmentFile, eventDate, segmentStart, SNAPSHOT_DIR, runFFmpeg) {
  const base = eventDate.toISOString().replace(/[:.]/g,'');
  const tmpTs  = path.join(SNAPSHOT_DIR, `tmp-${base}.ts`);
  const outJpg = path.join(SNAPSHOT_DIR, `snap-open-${base}.jpg`);

  const offsetSec = Math.max(0, Math.floor((eventDate.getTime() - segmentStart.getTime())/1000));
  const startCut  = Math.max(0, offsetSec - 2);   // 이벤트 앞 2초부터
  const dur       = 5;                             // 5초 조각

  // 1) MKV -> TS 5초 구간 복사 (Annex-B로 비트스트림 정규화)
  const remuxArgs = [
    '-ss', String(startCut),
    '-i', segmentFile,
    '-t', String(dur),
    '-c', 'copy',
    '-bsf:v', 'h264_mp4toannexb',
    '-y', tmpTs
  ];
  await runFFmpeg(remuxArgs, tmpTs);

  // 2) 그 TS 조각에서 정확 오프셋(= 2초 지점) 프레임 추출
  const seekInChunk = offsetSec - startCut; // 보통 2초 부근
  const snapArgs = [
    '-ss', String(Math.max(0, seekInChunk)),
    '-i', tmpTs,
    '-frames:v', '1',
    '-q:v', '2',
    '-y', outJpg
  ];
  await runFFmpeg(snapArgs, outJpg);

  // 청소는 선택사항(장기적으로 cron 청소 권장)
  try { fs.unlinkSync(tmpTs); } catch {}

  return { ok: true, method: 'file-open-chunk', file: outJpg, offsetSec, segmentFile };
}


async function snapshotFromLive() {
  const t = new Date();
  const out = path.join(SNAPSHOT_DIR, `snap-live-${t.toISOString().replace(/[:.]/g,'')}.jpg`);
  const args = [
    '-rtsp_transport','tcp',
    '-rtsp_flags','prefer_tcp',
    '-i', RTSP_URL,
    '-frames:v','1',
    '-q:v','2',
    '-y', out
  ];
  await runFFmpeg(args, out);
  return { ok: true, method: 'rtsp', file: out };
}

async function snapshotFromSegment(segmentFile, eventDate, segmentStart) {
  const offsetSec = Math.max(0, Math.floor((eventDate.getTime() - segmentStart.getTime())/1000));
  const out = path.join(SNAPSHOT_DIR, `snap-file-${eventDate.toISOString().replace(/[:.]/g,'')}.jpg`);
  // 인덱스 불완전 대비: 입력 뒤 -ss(느린 시킹)
  const args = [
    '-i', segmentFile,
    '-ss', String(offsetSec),
    '-frames:v','1',
    '-q:v','2',
    '-y', out
  ];
  await runFFmpeg(args, out);
  return { ok: true, method: 'file', file: out, offsetSec, segmentFile };
}

/* =========================
 * 엔드포인트
 * ========================= */
// 기본 테스트
router.get('/ping', (req,res) => {
  stats.pingCount += 1;
  stats.lastPingAt = nowIso();
  res.json({ ok: true, message: 'pong', serverTime: stats.lastPingAt, uptimeMs: uptimeMs() });
});

router.post('/echo', (req,res) => {
  let payload = req.body;
  if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
  stats.echoCount += 1;
  stats.lastEchoAt = nowIso();
  stats.lastEchoPayloadPreview = previewPayload(payload);
  res.json({ ok: true, received: payload, serverTime: stats.lastEchoAt });
});

router.get('/status', (req,res) => {
  res.json({
    ok: true,
    bootedAt: stats.bootedAt.toISOString(),
    uptimeMs: uptimeMs(),
    pingCount: stats.pingCount,
    echoCount: stats.echoCount,
    lastPingAt: stats.lastPingAt,
    lastEchoAt: stats.lastEchoAt,
    lastEchoPayloadPreview: stats.lastEchoPayloadPreview
  });
});

// 녹화 제어/상태
router.get('/recording/status', (req,res) => res.json(recorder.status()));
router.post('/recording/start', (req,res) => res.json(recorder.start()));
router.post('/recording/stop',  (req,res) => res.json(recorder.stop()));

// 라이브 스냅샷(헬스체크)
router.get('/snapshot/now', async (req,res) => {
  try {
    const r = await snapshotFromLive();
    res.json({
      ok: true,
      message: 'snapshot saved (live RTSP)',
      snapshotFile: path.relative(process.cwd(), r.file),
      method: r.method
    });
  } catch(e) {
    res.status(500).json({ ok:false, message:'snapshot failed', error: String(e) });
  }
});

// 이벤트 스냅샷: 세그먼트 파일 우선 → 진행중/미발견 시 라이브 폴백
/**
 * Body:
 * { "captureEvent": 1, "eventAt": "2025-10-15T07:32:26.460Z" } // 또는 epoch ms 숫자, 생략 시 서버받은 시각
 */
router.post('/event', async (req,res) => {
  try {
    const capture = Number(req?.body?.captureEvent) === 1;
    if (!capture) return res.status(400).json({ ok:false, message:'captureEvent !== 1' });

    let eventDate;
    const raw = req?.body?.eventAt;
    if (raw == null) eventDate = new Date();
    else if (typeof raw === 'number') eventDate = new Date(raw);
    else eventDate = new Date(String(raw));
    if (isNaN(eventDate.getTime())) eventDate = new Date();

    // 1) 완료된 세그먼트 찾기
    // 1) 완료된 세그먼트 찾기
const seg = recorder.findSegmentFor(eventDate);

if (seg) {
  try {
    if (!seg.isPossiblyOpen) {
      // 완료된 파일: 바로 추출
      const r = await snapshotFromSegment(seg.file, eventDate, seg.start);
      return res.json({
        ok: true,
        message: 'capture snapshot success (from recording segment)',
        snapshotFile: path.relative(process.cwd(), r.file),
        segmentFile: path.relative(process.cwd(), r.segmentFile),
        offsetSec: r.offsetSec,
        segmentStart: seg.start.toISOString(),
        segmentEnd: seg.end.toISOString(),
        serverTime: nowIso()
      });
    } else {
      // 진행 중 파일: 1) 느린시킹으로 먼저 시도 → 2) 실패 시 TS 조각으로 재래핑 후 시도
      try {
        const r1 = await snapshotFromSegmentLoose(seg.file, eventDate, seg.start, SNAPSHOT_DIR, runFFmpeg);
        return res.json({
          ok: true,
          message: 'capture snapshot success (from OPEN segment, loose seek)',
          snapshotFile: path.relative(process.cwd(), r1.file),
          segmentFile: path.relative(process.cwd(), r1.segmentFile),
          offsetSec: r1.offsetSec,
          segmentStart: seg.start.toISOString(),
          segmentEnd: seg.end.toISOString(),
          serverTime: nowIso()
        });
      } catch (e1) {
        const r2 = await snapshotFromOpenSegmentWithTemp(seg.file, eventDate, seg.start, SNAPSHOT_DIR, runFFmpeg);
        return res.json({
          ok: true,
          message: 'capture snapshot success (from OPEN segment via temp TS chunk)',
          snapshotFile: path.relative(process.cwd(), r2.file),
          segmentFile: path.relative(process.cwd(), r2.segmentFile),
          offsetSec: r2.offsetSec,
          segmentStart: seg.start.toISOString(),
          segmentEnd: seg.end.toISOString(),
          serverTime: nowIso()
        });
      }
    }
  } catch(eSeg) {
    // 아래로 폴백
  }
}

// 2) 세그먼트를 못 찾았거나 모두 실패 → 라이브 폴백
const live = await snapshotFromLive();
return res.json({
  ok: true,
  message: 'capture snapshot success (fallback to live RTSP)',
  snapshotFile: path.relative(process.cwd(), live.file),
  segmentFound: !!seg,
  segmentWasPossiblyOpen: seg ? seg.isPossiblyOpen : null,
  serverTime: nowIso()
});


  } catch(e) {
    res.status(500).json({ ok:false, message:'snapshot failed', error: String(e) });
  }
});

// 루트 안내
router.get('/', (req,res) => {
  res.json({
    ok: true,
    message: 'Arduino HTTP Test + RTSP 30-min segments & snapshot',
    rtspUrlInUse: RTSP_URL,
    segmentTimeSec: SEGMENT_TIME,
    reencode: REENCODE,
    endpoints: {
      ping: '/api/arduino-test/ping',
      echo: '/api/arduino-test/echo',
      status: '/api/arduino-test/status',
      recording: {
        status: '/api/arduino-test/recording/status',
        start:  '/api/arduino-test/recording/start',
        stop:   '/api/arduino-test/recording/stop'
      },
      snapshot: {
        now: '/api/arduino-test/snapshot/now',
        event: '/api/arduino-test/event'
      }
    }
  });
});

module.exports = router;
