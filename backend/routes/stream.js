// routes/stream.js
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Database = require('../lib/database'); // 기존 Database 클래스 사용

const HLS_OUTPUT_DIR = path.join(__dirname, '..', 'public', 'hls');
// 뷰어 추적 시스템 (전역 변수로 추가)
global.streamViewers = global.streamViewers || new Map();
global.viewerHeartbeats = global.viewerHeartbeats || new Map();

// 뷰어 ID 생성
function generateViewerId() {
    return `viewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 스트림 정보 진단 함수
async function probeStream(rtspUrl) {
    return new Promise((resolve, reject) => {
        const ffprobeProcess = spawn('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-rtsp_transport', 'tcp',
            '-analyzeduration', '10000000',
            '-probesize', '10000000',
            rtspUrl
        ]);

        let output = '';
        let errorOutput = '';

        ffprobeProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        ffprobeProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ffprobeProcess.on('close', (code) => {
            if (code === 0 && output) {
                try {
                    const info = JSON.parse(output);
                    resolve(info);
                } catch (e) {
                    reject(new Error(`JSON 파싱 실패: ${e.message}`));
                }
            } else {
                reject(new Error(`ffprobe 실패 (코드: ${code}): ${errorOutput}`));
            }
        });

        ffprobeProcess.on('error', (err) => {
            reject(new Error(`ffprobe 프로세스 오류: ${err.message}`));
        });
    });
}

// 최적화된 FFmpeg 설정 생성
// H.265 및 고해상도 스트림 최적화 FFmpeg 설정
function getOptimizedFFmpegArgs(rtspUrl, streamId, streamInfo = null) {
    const streamOutputDir = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`);
    
    let args = [
        '-y',
        '-fflags', '+genpts+igndts+discardcorrupt',
        '-rtsp_transport', 'tcp',
        '-allowed_media_types', 'video+audio',
        '-stimeout', '20000000',        // 20초 타임아웃
        '-use_wallclock_as_timestamps', '1',
        '-avoid_negative_ts', 'make_zero',
        '-analyzeduration', '10000000',  // 분석 시간 증가
        '-probesize', '10000000'         // 프로브 크기 증가
    ];

    // 스트림 정보 기반 최적화
    let isH265 = false;
    let isHighRes = false;
    let inputWidth = 0;
    let inputHeight = 0;

    if (streamInfo) {
        const videoStream = streamInfo.streams?.find(s => s.codec_type === 'video');
        if (videoStream) {
            isH265 = videoStream.codec_name === 'hevc' || videoStream.codec_name === 'h265';
            inputWidth = parseInt(videoStream.width) || 0;
            inputHeight = parseInt(videoStream.height) || 0;
            isHighRes = inputWidth > 1920 || inputHeight > 1080;
            
            console.log(`📊 스트림 ${streamId} - 코덱: ${videoStream.codec_name}, 해상도: ${inputWidth}x${inputHeight}, H.265: ${isH265}, 고해상도: ${isHighRes}`);
        }
    }

    // H.265 감지 시 특별 처리
    if (isH265) {
        console.log(`🎯 H.265 스트림 감지 - 최적화 적용`);
        args.push(
            '-hwaccel', 'auto',           // 하드웨어 가속 시도
            '-thread_queue_size', '1024'   // 스레드 큐 크기 증가
        );
    }

    // RTSP 입력
    args.push('-i', rtspUrl);

    // 해상도별 스케일링 설정
    let scaleFilter = 'scale=640:360';
    let videoBitrate = '400k';
    let maxBitrate = '500k';
    
    if (isHighRes) {
        // 고해상도의 경우 더 적극적인 다운스케일링
        if (inputWidth > 2000 || inputHeight > 2000) {
            scaleFilter = 'scale=480:270';  // 더 작게
            videoBitrate = '300k';
            maxBitrate = '400k';
            console.log(`📐 초고해상도 감지 - 480p로 다운스케일`);
        } else {
            scaleFilter = 'scale=640:360';
            videoBitrate = '350k';
            maxBitrate = '450k';
            console.log(`📐 고해상도 감지 - 360p로 다운스케일`);
        }
    }

    // H.265 및 고해상도용 특별 설정
    if (isH265 || isHighRes) {
        console.log(`🔧 H.265/고해상도 최적화 설정 적용`);
        args.push(
            // 비디오 설정 - H.265 최적화
            '-c:v', 'libx264',
            '-preset', 'superfast',       // 가장 빠른 인코딩
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-level', '3.1',
            '-pix_fmt', 'yuv420p',        // 명시적 픽셀 포맷
            
            // 스케일링 및 필터
            '-vf', `${scaleFilter}:force_original_aspect_ratio=decrease:eval=frame,pad=${scaleFilter.split(':')[1]}:${scaleFilter.split(':')[2]}:(ow-iw)/2:(oh-ih)/2:black,fps=10`, // FPS도 줄임
            
            // 비트레이트 설정 - 더 낮게
            '-b:v', videoBitrate,
            '-maxrate', maxBitrate,
            '-bufsize', videoBitrate,
            '-r', '10',                   // 10fps로 제한
            '-g', '20',                   // GOP 크기 감소
            '-keyint_min', '10',
            '-sc_threshold', '0',
            '-refs', '1',                 // 참조 프레임 최소화
            '-bf', '0',                   // B-frame 비활성화
            '-threads', '4',              // 스레드 수 제한
            
            // 오디오 설정 - 단순화
            '-c:a', 'aac',
            '-ac', '1',                   // 모노로 변환
            '-ar', '22050',               // 낮은 샘플레이트
            '-ab', '32k',                 // 낮은 비트레이트
            
            // HLS 설정 - 안정성 우선
            '-f', 'hls',
            '-hls_time', '4',             // 긴 세그먼트
            '-hls_list_size', '4',        // 작은 플레이리스트
            '-hls_flags', 'delete_segments+append_list+program_date_time+independent_segments+round_durations+split_by_time',
            '-hls_segment_type', 'mpegts',
            '-hls_allow_cache', '0',
            '-start_number', '0',
            '-segment_time_metadata', '1'
        );
    } else {
        // 일반 설정 (H.264, 낮은 해상도)
        console.log(`🎯 일반 스트림 설정 적용`);
        args.push(
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-vf', 'scale=640:360',
            '-b:v', '400k',
            '-maxrate', '500k',
            '-bufsize', '400k',
            '-r', '15',
            '-g', '30',
            '-keyint_min', '15',
            '-sc_threshold', '0',
            
            '-c:a', 'aac',
            '-ac', '2',
            '-ar', '44100',
            '-ab', '64k',
            
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '6',
            '-hls_flags', 'delete_segments+append_list+program_date_time+independent_segments',
            '-hls_segment_type', 'mpegts',
            '-start_number', '0'
        );
    }

    // 출력 경로
    args.push(
        '-hls_segment_filename', `${streamOutputDir}/segment_%03d.ts`,
        `${streamOutputDir}/playlist.m3u8`
    );

    return args;
}

// 향상된 FFmpeg 시작 함수
// 향상된 FFmpeg 시작 함수
async function startFfmpeg(rtspUrl, streamId) {
    const streamOutputDir = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`);
    
    // 🔥 RTSP URL 충돌 검사
    const activeStreams = Array.from(global.activeStreams.values());
    const conflictingStream = activeStreams.find(stream => 
        stream.streamDevice && stream.streamDevice.rtsp_url === rtspUrl
    );
    
    if (conflictingStream) {
        console.warn(`⚠️ 스트림 ${streamId}: RTSP URL 충돌 감지 - ${rtspUrl}`);
        console.warn(`   충돌하는 스트림: ${conflictingStream.streamDevice?.stream_name || 'unknown'}`);
    }
    
    // 출력 디렉토리 생성
    if (!fs.existsSync(streamOutputDir)) {
        fs.mkdirSync(streamOutputDir, { recursive: true });
    }
    
    // 기존 세그먼트 파일 정리
    try {
        const files = fs.readdirSync(streamOutputDir);
        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                fs.unlinkSync(path.join(streamOutputDir, file));
            }
        }
        console.log(`스트림 ${streamId}: 이전 HLS 파일들을 정리했습니다.`);
    } catch (err) {
        console.error(`스트림 ${streamId}: HLS 파일 정리 중 오류:`, err);
    }

    // 스트림 정보 진단
    let streamInfo = null;
    try {
        console.log(`🔍 스트림 ${streamId} 정보 분석 중...`);
        streamInfo = await probeStream(rtspUrl);
        console.log(`✅ 스트림 ${streamId} 분석 완료`);
    } catch (err) {
        console.warn(`⚠️ 스트림 ${streamId} 분석 실패, 기본 설정 사용:`, err.message);
    }

    // 최적화된 FFmpeg 인수 생성
    const ffmpegArgs = getOptimizedFFmpegArgs(rtspUrl, streamId, streamInfo);
    
    console.log(`🎬 스트림 ${streamId} FFmpeg 시작:`, ffmpegArgs.join(' '));
    
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FFREPORT: 'file=ffmpeg-%t.log:level=32' }
    });
    
    // 연결 타임아웃 설정 (H.265는 더 오래)
    const timeoutDuration = streamInfo?.streams?.find(s => s.codec_name === 'hevc') ? 60000 : 30000;
    const connectionTimeout = setTimeout(() => {
        console.error(`❌ 스트림 ${streamId}: 연결 타임아웃 (${timeoutDuration/1000}초)`);
        ffmpegProcess.kill('SIGKILL');
    }, timeoutDuration);

    let isConnected = false;
    let segmentCount = 0;
    
    ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.trim()) {
            console.log(`스트림 ${streamId} stdout:`, output.trim());
        }
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // 연결 성공 감지
        if (!isConnected && (
            output.includes('Stream mapping') || 
            output.includes('Output #0') ||
            output.includes('Opening \'') ||
            output.includes('muxer does not support')
        )) {
            isConnected = true;
            clearTimeout(connectionTimeout);
            console.log(`✅ 스트림 ${streamId}: 연결 성공 감지`);
            
            // 스트림 상태 업데이트
            const streamInfo = global.activeStreams.get(streamId);
            if (streamInfo) {
                streamInfo.status = 'running';
            }
        }
        
        // 세그먼트 생성 감지
        if (output.includes('segment:')) {
            segmentCount++;
            console.log(`📦 스트림 ${streamId}: 세그먼트 ${segmentCount} 생성됨`);
            
            // 첫 번째 세그먼트 생성 시 running 상태로 변경
            if (segmentCount === 1) {
                const streamInfo = global.activeStreams.get(streamId);
                if (streamInfo) {
                    streamInfo.status = 'running';
                }
                console.log(`🎯 스트림 ${streamId}: 첫 세그먼트 생성 - 재생 준비 완료`);
            }
        }
        
        // 에러 감지
        if (output.includes('Error') || output.includes('Failed') || output.includes('Invalid')) {
            console.error(`❌ 스트림 ${streamId} FFmpeg 오류:`, output.trim());
        } else if (output.trim()) {
            console.log(`스트림 ${streamId} FFmpeg:`, output.trim());
        }
    });
    
    ffmpegProcess.on('close', (code) => {
        clearTimeout(connectionTimeout);
        console.log(`❌ 스트림 ${streamId}: FFmpeg 프로세스 종료 (코드: ${code})`);
        global.activeStreams.delete(streamId);
    });
    
    ffmpegProcess.on('error', (err) => {
        clearTimeout(connectionTimeout);
        console.error(`❌ 스트림 ${streamId}: FFmpeg 프로세스 오류:`, err);
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo) {
            streamInfo.status = 'error';
        }
    });
    
    return ffmpegProcess;
}
// 🔥 뷰어 참가 엔드포인트 추가
router.post('/viewer/join/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        const viewerId = generateViewerId();
        
        console.log(`👥 뷰어 참가 요청: 사용자 ${userId}, 스트림 ${streamId}`);
        
        // 사용자의 스트림인지 확인
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const streamDevice = streams[0];
        
        // 뷰어 등록
        if (!global.streamViewers.has(streamId)) {
            global.streamViewers.set(streamId, new Set());
        }
        
        global.streamViewers.get(streamId).add(viewerId);
        global.viewerHeartbeats.set(viewerId, Date.now());
        
        const viewerCount = global.streamViewers.get(streamId).size;
        console.log(`👥 스트림 ${streamId}: 뷰어 ${viewerId} 참가 (총 ${viewerCount}명)`);
        
        // 첫 번째 뷰어이면 스트림 시작
        let streamStarted = false;
        if (viewerCount === 1) {
            console.log(`🚀 스트림 ${streamId}: 첫 뷰어 참가 - 스트림 시작`);
            
            try {
                const ffmpegProcess = await startFfmpeg(streamDevice.rtsp_url, streamId);
                global.activeStreams.set(streamId, {
                    process: ffmpegProcess,
                    status: 'starting',
                    streamDevice: streamDevice,
                    userId: userId,
                    startedAt: Date.now()
                });
                streamStarted = true;
            } catch (error) {
                console.error(`❌ 스트림 ${streamId} 시작 실패:`, error);
                // 뷰어 제거
                global.streamViewers.get(streamId).delete(viewerId);
                global.viewerHeartbeats.delete(viewerId);
                
                return res.status(500).json({
                    success: false,
                    error: '스트림 시작에 실패했습니다.',
                    details: error.message
                });
            }
        }
        
        res.json({
            success: true,
            message: '뷰어 등록 완료',
            viewerId: viewerId,
            viewerCount: viewerCount,
            streamStarted: streamStarted,
            playlistUrl: `/hls/stream_${streamId}/playlist.m3u8`,
            streamName: streamDevice.stream_name
        });
        
    } catch (error) {
        console.error('뷰어 등록 오류:', error);
        res.status(500).json({
            success: false,
            error: '뷰어 등록에 실패했습니다.',
            details: error.message
        });
    }
});

// 🔥 뷰어 해제 엔드포인트 추가
router.post('/viewer/leave/:streamId/:viewerId', async (req, res) => {
    try {
        const streamId = req.params.streamId;
        const viewerId = req.params.viewerId;
        
        console.log(`👤 뷰어 해제 요청: 스트림 ${streamId}, 뷰어 ${viewerId}`);
        
        // 뷰어 제거
        if (global.streamViewers.has(streamId)) {
            global.streamViewers.get(streamId).delete(viewerId);
            global.viewerHeartbeats.delete(viewerId);
            
            const viewerCount = global.streamViewers.get(streamId).size;
            console.log(`👤 스트림 ${streamId}: 뷰어 ${viewerId} 퇴장 (남은 ${viewerCount}명)`);
            
            // 뷰어가 0명이 되면 스트림 중지
            if (viewerCount === 0) {
                console.log(`🛑 스트림 ${streamId}: 모든 뷰어 퇴장 - 스트림 중지`);
                
                const streamInfo = global.activeStreams.get(streamId);
                if (streamInfo && streamInfo.process) {
                    streamInfo.process.kill('SIGKILL');
                    global.activeStreams.delete(streamId);
                }
                
                // 빈 뷰어 Set 제거
                global.streamViewers.delete(streamId);
            }
            
            res.json({
                success: true,
                message: '뷰어 해제 완료',
                viewerCount: viewerCount,
                streamStopped: viewerCount === 0
            });
        } else {
            res.json({
                success: true,
                message: '이미 해제된 뷰어입니다.',
                viewerCount: 0
            });
        }
        
    } catch (error) {
        console.error('뷰어 해제 오류:', error);
        res.status(500).json({
            success: false,
            error: '뷰어 해제에 실패했습니다.'
        });
    }
});

// 🔥 하트비트 엔드포인트 추가
router.post('/viewer/heartbeat/:viewerId', (req, res) => {
    const viewerId = req.params.viewerId;
    
    if (global.viewerHeartbeats.has(viewerId)) {
        global.viewerHeartbeats.set(viewerId, Date.now());
        res.json({ success: true, message: 'Heartbeat received' });
    } else {
        res.status(404).json({ success: false, error: 'Viewer not found' });
    }
});
// 첫 세그먼트 생성 상태 API
router.get('/ready/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        // 사용자의 스트림인지 확인
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        // 파일 시스템에서 실제 확인
        const playlistPath = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`, 'playlist.m3u8');
        const segmentDir = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`);
        
        let playlistExists = false;
        let segmentCount = 0;
        let playlistContent = '';
        
        try {
            if (fs.existsSync(playlistPath)) {
                playlistExists = true;
                playlistContent = fs.readFileSync(playlistPath, 'utf8');
                
                // 세그먼트 파일 개수 확인
                const files = fs.readdirSync(segmentDir);
                segmentCount = files.filter(file => file.endsWith('.ts')).length;
            }
        } catch (err) {
            console.error('파일 확인 오류:', err);
        }
        
        const streamInfo = global.activeStreams.get(streamId);
        const isReady = playlistExists && segmentCount >= 1 && playlistContent.includes('.ts');
        
        res.json({
            success: true,
            ready: isReady,
            details: {
                playlistExists,
                segmentCount,
                contentLength: playlistContent.length,
                hasSegmentReference: playlistContent.includes('.ts'),
                streamStatus: streamInfo?.status || 'unknown',
                playlistUrl: isReady ? `/hls/stream_${streamId}/playlist.m3u8` : null
            }
        });
        
    } catch (error) {
        console.error('스트림 준비 상태 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 준비 상태 확인에 실패했습니다.'
        });
    }
});

// 스트림 진단 API 추가
router.get('/diagnose/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const streamDevice = streams[0];
        
        try {
            console.log(`🔍 스트림 ${streamId} 진단 시작`);
            const streamInfo = await probeStream(streamDevice.rtsp_url);
            
            res.json({
                success: true,
                message: '스트림 진단 완료',
                diagnosis: {
                    streamId: streamId,
                    streamName: streamDevice.stream_name,
                    rtspUrl: streamDevice.rtsp_url,
                    format: streamInfo.format,
                    streams: streamInfo.streams,
                    recommendations: generateRecommendations(streamInfo)
                }
            });
        } catch (err) {
            res.json({
                success: false,
                error: `스트림 진단 실패: ${err.message}`,
                diagnosis: {
                    streamId: streamId,
                    streamName: streamDevice.stream_name,
                    rtspUrl: streamDevice.rtsp_url,
                    error: err.message,
                    recommendations: [
                        '네트워크 연결 확인',
                        'RTSP URL 형식 확인',
                        '카메라 설정 확인',
                        '방화벽 설정 확인'
                    ]
                }
            });
        }
    } catch (error) {
        console.error('스트림 진단 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 진단에 실패했습니다.'
        });
    }
});

// 진단 결과 기반 추천사항 생성
function generateRecommendations(streamInfo) {
    const recommendations = [];
    
    const videoStream = streamInfo.streams?.find(s => s.codec_type === 'video');
    const audioStream = streamInfo.streams?.find(s => s.codec_type === 'audio');
    
    if (videoStream) {
        if (videoStream.codec_name === 'hevc' || videoStream.codec_name === 'h265') {
            recommendations.push('H.265 코덱 감지 - 호환성을 위해 H.264로 변환 권장');
        }
        
        const width = parseInt(videoStream.width);
        const height = parseInt(videoStream.height);
        if (width > 1920 || height > 1080) {
            recommendations.push('고해상도 감지 - 성능을 위해 해상도 다운스케일 권장');
        }
        
        const fps = eval(videoStream.r_frame_rate);
        if (fps > 30) {
            recommendations.push('높은 프레임레이트 감지 - 성능을 위해 프레임레이트 제한 권장');
        }
    }
    
    if (!audioStream) {
        recommendations.push('오디오 스트림 없음 - 비디오 전용 설정 적용');
    }
    
    if (recommendations.length === 0) {
        recommendations.push('스트림 설정이 최적화되어 있습니다');
    }
    
    return recommendations;
}

// 스트림 시작
// 기존 스트림 시작 엔드포인트 수정
router.post('/start/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const streamDevice = streams[0];
        
        if (global.activeStreams.has(streamId)) {
            return res.json({
                success: true,
                message: '스트림이 이미 실행 중입니다.',
                status: 'running',
                playlistUrl: `/hls/stream_${streamId}/playlist.m3u8`
            });
        }
        
        const ffmpegProcess = await startFfmpeg(streamDevice.rtsp_url, streamId);
        global.activeStreams.set(streamId, {
            process: ffmpegProcess,
            status: 'starting',
            streamDevice: streamDevice,
            userId: userId
        });
        
        res.json({
            success: true,
            message: '스트림을 시작했습니다.',
            status: 'starting',
            playlistUrl: `/hls/stream_${streamId}/playlist.m3u8`,
            streamName: streamDevice.stream_name
        });
    } catch (error) {
        console.error('스트림 시작 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 시작에 실패했습니다.',
            details: error.message
        });
    }
});

// FFmpeg 프로세스 시작 함수
function startFfmpeg(rtspUrl, streamId) {
    const streamOutputDir = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`);
    
    // 출력 디렉토리 생성
    if (!fs.existsSync(streamOutputDir)) {
        fs.mkdirSync(streamOutputDir, { recursive: true });
    }
    
    // 기존 세그먼트 파일 정리
    try {
        const files = fs.readdirSync(streamOutputDir);
        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
                fs.unlinkSync(path.join(streamOutputDir, file));
            }
        }
        console.log(`스트림 ${streamId}: 이전 HLS 파일들을 정리했습니다.`);
    } catch (err) {
        console.error(`스트림 ${streamId}: HLS 파일 정리 중 오류:`, err);
    }
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-y',
        '-fflags', '+genpts',
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-vf', 'scale=640:360',
        '-b:v', '400k',
        '-maxrate', '500k',
        '-bufsize', '400k',
        '-r', '15',
        '-g', '30',
        '-keyint_min', '15',
        '-sc_threshold', '0',
        '-hls_time', '1',
        '-hls_list_size', '6',
        '-hls_flags', 'delete_segments+append_list+program_date_time+independent_segments',
        '-hls_segment_type', 'mpegts',
        '-start_number', '0',
        '-f', 'hls',
        '-hls_segment_filename', `${streamOutputDir}/segment_%03d.ts`,
        `${streamOutputDir}/playlist.m3u8`
    ]);
    
    console.log(`🎥 스트림 ${streamId}: FFmpeg 프로세스 시작됨 (RTSP: ${rtspUrl})`);
    
    // 스트림 상태 업데이트
    setTimeout(() => {
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo) {
            streamInfo.status = 'running';
            console.log(`✅ 스트림 ${streamId}: 실행 상태로 변경됨`);
        }
    }, 3000); // 3초 후 running 상태로 변경
    
    ffmpegProcess.stdout.on('data', (data) => {
        // console.log(`스트림 ${streamId} FFmpeg stdout: ${data}`);
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
        // console.log(`스트림 ${streamId} FFmpeg stderr: ${data}`);
    });
    
    ffmpegProcess.on('close', (code) => {
        console.log(`❌ 스트림 ${streamId}: FFmpeg 프로세스 종료 (코드: ${code})`);
        global.activeStreams.delete(streamId);
    });
    
    ffmpegProcess.on('error', (err) => {
        console.error(`❌ 스트림 ${streamId}: FFmpeg 프로세스 오류:`, err);
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo) {
            streamInfo.status = 'error';
        }
    });
    
    return ffmpegProcess;
}

// 스트림 정지
router.post('/stop/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        // 사용자의 스트림인지 확인
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo && streamInfo.process) {
            streamInfo.process.kill('SIGKILL');
            global.activeStreams.delete(streamId);
            console.log(`🛑 스트림 ${streamId}: 사용자 요청으로 정지됨`);
            
            res.json({
                success: true,
                message: '스트림을 정지했습니다.',
                status: 'stopped'
            });
        } else {
            res.json({
                success: true,
                message: '스트림이 이미 정지되어 있습니다.',
                status: 'stopped'
            });
        }
    } catch (error) {
        console.error('스트림 정지 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 정지에 실패했습니다.'
        });
    }
});

// 🔥 기존 엔드포인트들을 더 유연하게 수정
// routes/stream.js - 스트림 상태 조회 엔드포인트 개선
router.get('/status', async (req, res) => {
    try {
        // 🔥 게스트 사용자 처리 개선
        if (!req.user || req.user.isGuest) {
            return res.json({
                success: true,
                streams: [],
                activeCount: 0,
                message: '로그인이 필요합니다.',
                isGuest: true
            });
        }
        
        const userId = req.user.id;
        
        // 🔥 사용자의 스트림 조회
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
            [userId]
        );
        
        // 🔥 스트림이 없는 경우 빈 배열 반환
        if (streams.length === 0) {
            return res.json({
                success: true,
                streams: [],
                activeCount: 0,
                message: '등록된 스트림이 없습니다.',
                hasStreams: false
            });
        }
        
        const streamStatus = streams.map(stream => {
            const streamInfo = global.activeStreams.get(stream.id.toString());
            const playlistPath = path.join(HLS_OUTPUT_DIR, `stream_${stream.id}`, 'playlist.m3u8');
            
            return {
                id: stream.id,
                name: stream.stream_name,
                description: stream.description,
                status: streamInfo ? streamInfo.status : 'stopped',
                isRunning: !!streamInfo,
                playlistExists: fs.existsSync(playlistPath),
                playlistUrl: fs.existsSync(playlistPath) ? `/hls/stream_${stream.id}/playlist.m3u8` : null,
                createdAt: stream.created_at
            };
        });
        
        res.json({
            success: true,
            streams: streamStatus,
            activeCount: global.activeStreams.size,
            hasStreams: true
        });
        
    } catch (error) {
        console.error('스트림 상태 조회 오류:', error);
        
        // 🔥 에러 발생 시에도 빈 배열 반환하여 프론트엔드가 정상 동작하도록
        res.status(200).json({
            success: false,
            streams: [],
            activeCount: 0,
            error: '스트림 상태 조회에 실패했습니다.',
            hasStreams: false
        });
    }
});

// 특정 스트림 상태 조회
router.get('/status/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        // 사용자의 스트림인지 확인
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const stream = streams[0];
        const streamInfo = global.activeStreams.get(streamId);
        const playlistPath = path.join(HLS_OUTPUT_DIR, `stream_${streamId}`, 'playlist.m3u8');
        
        res.json({
            success: true,
            stream: {
                id: stream.id,
                name: stream.stream_name,
                description: stream.description,
                status: streamInfo ? streamInfo.status : 'stopped',
                isRunning: !!streamInfo,
                playlistExists: fs.existsSync(playlistPath),
                playlistUrl: fs.existsSync(playlistPath) ? `/hls/stream_${streamId}/playlist.m3u8` : null,
                createdAt: stream.created_at
            }
        });
    } catch (error) {
        console.error('스트림 상태 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 상태 조회에 실패했습니다.'
        });
    }
});

// 스트림 재시작
router.post('/restart/:streamId', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.streamId;
        
        // 사용자의 스트림인지 확인
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        const streamDevice = streams[0];
        
        // 기존 프로세스 정지
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo && streamInfo.process) {
            streamInfo.process.kill('SIGKILL');
            global.activeStreams.delete(streamId);
            console.log(`🔄 스트림 ${streamId}: 재시작을 위해 기존 프로세스 정지`);
        }
        
        // 잠시 대기 후 재시작
        setTimeout(() => {
            const ffmpegProcess = startFfmpeg(streamDevice.rtsp_url, streamId);
            global.activeStreams.set(streamId, {
                process: ffmpegProcess,
                status: 'starting',
                streamDevice: streamDevice,
                userId: userId
            });
            console.log(`🔄 스트림 ${streamId}: 재시작됨`);
        }, 1000);
        
        res.json({
            success: true,
            message: '스트림을 재시작했습니다.',
            status: 'restarting'
        });
    } catch (error) {
        console.error('스트림 재시작 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 재시작에 실패했습니다.'
        });
    }
});

// 모든 스트림 정지 (사용자의)
router.post('/stop-all', async (req, res) => {
    try {
        const userId = req.user.id;
        let stoppedCount = 0;
        
        // 해당 사용자의 모든 활성 스트림 정지
        for (const [streamId, streamInfo] of global.activeStreams) {
            if (streamInfo.userId === userId) {
                streamInfo.process.kill('SIGKILL');
                global.activeStreams.delete(streamId);
                stoppedCount++;
                console.log(`🛑 스트림 ${streamId}: 전체 정지 요청으로 정지됨`);
            }
        }
        
        res.json({
            success: true,
            message: `${stoppedCount}개의 스트림을 정지했습니다.`,
            stoppedCount: stoppedCount
        });
    } catch (error) {
        console.error('전체 스트림 정지 오류:', error);
        res.status(500).json({
            success: false,
            error: '전체 스트림 정지에 실패했습니다.'
        });
    }
});

module.exports = router;