// components/MultiStreamViewer.tsx - 크기 제한 수정
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface MultiStreamViewerProps {
    streamId: number;
    onClose?: () => void; // optional로 변경
}

interface StreamInfo {
    id: number;
    name: string;
    description?: string;
    status: 'stopped' | 'starting' | 'running' | 'error' | 'restarting';
    isRunning: boolean;
    playlistExists: boolean;
    playlistUrl: string | null;
    createdAt: string;
}

const MultiStreamViewer: React.FC<MultiStreamViewerProps> = ({ streamId, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [bufferHealth, setBufferHealth] = useState<number>(0);
    const [loadingProgress, setLoadingProgress] = useState<string>('준비 중...');

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const getAuthToken = (): string | null => {
        const token = document.cookie
            .split('; ')
            .find(row => row.startsWith('accessToken='))
            ?.split('=')[1];
        return token || localStorage.getItem('accessToken');
    };

    const getAuthHeaders = () => {
        const token = getAuthToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const waitForHLSFile = async (maxAttempts: number = 30, interval: number = 2000): Promise<boolean> => {
        return new Promise((resolve) => {
            let attempts = 0;
            
            const checkFile = async () => {
                attempts++;
                const playlistUrl = `${API_BASE}/hls/stream_${streamId}/playlist.m3u8`;
                
                setLoadingProgress(`HLS 파일 생성 대기 중... (${attempts}/${maxAttempts})`);
                
                try {
                    const response = await fetch(playlistUrl, { 
                        method: 'HEAD',
                        cache: 'no-cache' 
                    });
                    
                    if (response.ok) {
                        setLoadingProgress('HLS 파일 발견! 로딩 중...');
                        setTimeout(() => resolve(true), 1000);
                        return;
                    }
                } catch (err) {
                    console.log(`❌ ${attempts}번째 시도 실패:`, err);
                }
                
                if (attempts >= maxAttempts) {
                    setLoadingProgress('타임아웃 - HLS 파일 생성 실패');
                    resolve(false);
                    return;
                }
                
                setTimeout(checkFile, interval);
            };
            
            checkFile();
        });
    };

    const checkStreamStatus = async (retries: number = 3): Promise<StreamInfo | null> => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(`${API_BASE}/api/stream/status/${streamId}`, {
                    headers: getAuthHeaders()
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.success) {
                    setStreamInfo(data.stream);
                    return data.stream;
                }
            } catch (err) {
                if (i === retries - 1) {
                    setError('스트림 상태 확인에 실패했습니다.');
                }
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        return null;
    };

    const startStream = async (): Promise<void> => {
        setIsLoading(true);
        setError(null);
        setLoadingProgress('스트림 시작 요청 중...');

        try {
            const response = await fetch(`${API_BASE}/api/stream/start/${streamId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                setStreamInfo((prev: StreamInfo | null) => 
                    prev ? { ...prev, status: data.status } : null
                );
                
                setLoadingProgress('FFmpeg 시작 중...');
                
                const isH265Stream = streamInfo?.description?.includes('8889') || 
                                   streamInfo?.name?.includes('1번');
                const maxWaitTime = isH265Stream ? 60 : 30;
                
                const hlsReady = await waitForHLSFile(maxWaitTime, 2000);
                
                if (hlsReady) {
                    loadHLS();
                } else {
                    setError('HLS 파일 생성 시간이 초과되었습니다. 스트림을 재시작해보세요.');
                }
            } else {
                setError(data.error || '스트림 시작에 실패했습니다.');
            }
        } catch (err: any) {
            setError(`스트림 시작 실패: ${err.message}`);
        } finally {
            setIsLoading(false);
            setLoadingProgress('준비 중...');
        }
    };

    const loadHLS = async (): Promise<void> => {
        if (!videoRef.current) return;

        const playlistUrl = `${API_BASE}/hls/stream_${streamId}/playlist.m3u8`;

        try {
            const response = await fetch(playlistUrl, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Playlist HTTP ${response.status}`);
            }

            const playlistContent = await response.text();
            if (playlistContent.length < 50 || !playlistContent.includes('#EXTM3U')) {
                throw new Error('Playlist 내용이 불완전합니다');
            }

            loadHLSPlayer(playlistUrl);

        } catch (err: any) {
            setError(`HLS 로드 실패: ${err.message}`);
            
            setTimeout(() => {
                loadHLS();
            }, 5000);
        }
    };

    const loadHLSPlayer = (playlistUrl: string): void => {
        if (!videoRef.current) return;

        if (Hls.isSupported()) {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }

            hlsRef.current = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 30,
                maxBufferLength: 60,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 10,
                manifestLoadingTimeOut: 30000,
                levelLoadingTimeOut: 30000,
                fragLoadingTimeOut: 30000,
                manifestLoadingMaxRetry: 10,
                levelLoadingMaxRetry: 10,
                fragLoadingMaxRetry: 10
            });

            hlsRef.current.loadSource(playlistUrl);
            hlsRef.current.attachMedia(videoRef.current);

            hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
                setError(null);
                setLoadingProgress('재생 준비 완료');
                
                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.muted = true;
                        videoRef.current.play().catch(err => {
                            setError('자동 재생이 차단되었습니다. 재생 버튼을 클릭해주세요.');
                        });
                    }
                }, 1000);
            });

            hlsRef.current.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            setError('네트워크 오류 발생 - 재연결 중...');
                            setTimeout(() => {
                                if (hlsRef.current) {
                                    hlsRef.current.startLoad();
                                }
                            }, 3000);
                            break;
                            
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            setError('미디어 오류 발생 - 복구 중...');
                            setTimeout(() => {
                                if (hlsRef.current) {
                                    hlsRef.current.recoverMediaError();
                                }
                            }, 2000);
                            break;
                            
                        default:
                            setError(`스트림 오류: ${data.details} - 5초 후 재시도`);
                            setTimeout(() => {
                                loadHLS();
                            }, 5000);
                            break;
                    }
                }
            });

        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = playlistUrl;
            videoRef.current.load();
        } else {
            setError('이 브라우저에서는 HLS 스트리밍이 지원되지 않습니다.');
        }
    };

    const stopStream = async (): Promise<void> => {
        try {
            const response = await fetch(`${API_BASE}/api/stream/stop/${streamId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (data.success) {
                setStreamInfo((prev: StreamInfo | null) => 
                    prev ? { ...prev, status: 'stopped', isRunning: false } : null
                );
                setIsPlaying(false);
                setLoadingProgress('준비 중...');
                
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                    hlsRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.src = '';
                }
            }
        } catch (err: any) {
            setError(`스트림 정지 실패: ${err.message}`);
        }
    };

    const updateBufferHealth = (): void => {
        if (videoRef.current) {
            const buffered = videoRef.current.buffered;
            const currentTime = videoRef.current.currentTime;
            
            if (buffered.length > 0) {
                let bufferLength = 0;
                for (let i = 0; i < buffered.length; i++) {
                    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                        bufferLength = buffered.end(i) - currentTime;
                        break;
                    }
                }
                setBufferHealth(Math.round(bufferLength * 10) / 10);
            } else {
                setBufferHealth(0);
            }
        }
    };

    useEffect(() => {
        checkStreamStatus().then((status: StreamInfo | null) => {
            if (status?.isRunning && status?.playlistExists) {
                setLoadingProgress('기존 스트림 감지 - 연결 중...');
                loadHLS();
            }
        });

        const video = videoRef.current;
        if (video) {
            const handlePlaying = (): void => {
                setIsPlaying(true);
                setLoadingProgress('재생 중');
            };
            const handleWaiting = (): void => setIsPlaying(false);
            const handleTimeUpdate = (): void => updateBufferHealth();

            video.addEventListener('playing', handlePlaying);
            video.addEventListener('waiting', handleWaiting);
            video.addEventListener('timeupdate', handleTimeUpdate);

            return () => {
                video.removeEventListener('playing', handlePlaying);
                video.removeEventListener('waiting', handleWaiting);
                video.removeEventListener('timeupdate', handleTimeUpdate);
            };
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, [streamId]);

    useEffect(() => {
        if (streamInfo?.isRunning) {
            const interval = setInterval(() => {
                checkStreamStatus();
            }, 10000);
            return () => clearInterval(interval);
        }
    }, [streamId, streamInfo?.isRunning]);

    const getStatusColor = (status: string): string => {
        switch (status) {
            case 'running': return '#28a745';
            case 'starting': case 'restarting': return '#ffc107';
            case 'stopped': return '#6c757d';
            case 'error': return '#dc3545';
            default: return '#17a2b8';
        }
    };

    const getStatusText = (status: string): string => {
        switch (status) {
            case 'running': return '실행 중';
            case 'starting': return '시작 중';
            case 'restarting': return '재시작 중';
            case 'stopped': return '정지됨';
            case 'error': return '오류';
            default: return '알 수 없음';
        }
    };

    // ✅ 컨테이너 스타일 - 반응형 크기 완전 제한
    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        border: onClose ? '2px solid #007bff' : 'none',
        borderRadius: onClose ? '12px' : '0',
        boxShadow: onClose ? '0 8px 25px rgba(0, 123, 255, 0.15)' : 'none',
        minWidth: 0,
        minHeight: 0
    };

    return (
        <div style={containerStyle}>
            {/* ✅ 헤더 - onClose가 있을 때만 표시 */}
            {onClose && (
                <div style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    padding: '15px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <div>
                        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: '600' }}>
                            🎥 {streamInfo?.name || `스트림 ${streamId}`}
                        </h3>
                        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                            {streamInfo?.description || 'RTSP 라이브 스트림'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            color: 'white',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        ✕ 닫기
                    </button>
                </div>
            )}

            {/* ✅ 컨트롤 패널 - 더 컴팩트하게 */}
            <div style={{ 
                padding: onClose ? '16px' : '8px',
                flexShrink: 0
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '10px'
                }}>
                    <button
                        onClick={startStream}
                        disabled={isLoading || streamInfo?.status === 'running'}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: isLoading || streamInfo?.status === 'running' ? '#ccc' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading || streamInfo?.status === 'running' ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            fontSize: '12px'
                        }}
                    >
                        ▶️ 시작
                    </button>

                    <button
                        onClick={stopStream}
                        disabled={streamInfo?.status === 'stopped'}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: streamInfo?.status === 'stopped' ? '#ccc' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: streamInfo?.status === 'stopped' ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            fontSize: '12px'
                        }}
                    >
                        ⏹️ 정지
                    </button>

                    <button
                        onClick={() => checkStreamStatus()}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            fontSize: '12px'
                        }}
                    >
                        🔍 상태확인
                    </button>
                </div>

                {/* ✅ 상태 정보 - 더 컴팩트하게 */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '10px',
                    fontSize: '12px'
                }}>
                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: getStatusColor(streamInfo?.status || 'stopped'),
                        color: 'white',
                        borderRadius: '10px',
                        fontWeight: '600'
                    }}>
                        {getStatusText(streamInfo?.status || 'stopped')}
                    </span>

                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: isPlaying ? '#28a745' : '#6c757d',
                        color: 'white',
                        borderRadius: '10px',
                        fontWeight: '600'
                    }}>
                        {isPlaying ? '재생 중' : '정지'}
                    </span>

                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: bufferHealth > 2 ? '#28a745' : bufferHealth > 1 ? '#ffc107' : '#dc3545',
                        color: 'white',
                        borderRadius: '10px',
                        fontWeight: '600'
                    }}>
                        버퍼: {bufferHealth}초
                    </span>
                </div>

                {/* 로딩 진행상황 */}
                {isLoading && (
                    <div style={{
                        backgroundColor: '#e3f2fd',
                        border: '1px solid #90caf9',
                        borderRadius: '6px',
                        padding: '8px',
                        marginBottom: '10px',
                        fontSize: '12px',
                        color: '#1565c0'
                    }}>
                        🔄 {loadingProgress}
                    </div>
                )}

                {/* 오류 메시지 */}
                {error && (
                    <div style={{
                        color: '#721c24',
                        backgroundColor: '#f8d7da',
                        border: '1px solid #f5c6cb',
                        borderRadius: '6px',
                        padding: '8px',
                        marginBottom: '10px',
                        fontSize: '12px'
                    }}>
                        ⚠️ {error}
                    </div>
                )}
            </div>

            {/* ✅ 비디오 플레이어 - 반응형 크기 완전 제한 (절대 위치 제거) */}
            <div style={{
                flex: 1,
                overflow: 'hidden',
                backgroundColor: '#000',
                borderRadius: onClose ? '0 0 8px 8px' : '0',
                width: '100%',
                minHeight: 0,
                minWidth: 0,
                display: 'flex'
            }}>
                <video
                    ref={videoRef}
                    controls
                    muted
                    playsInline
                    preload="none"
                    style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        display: 'block',
                        minWidth: 0,
                        minHeight: 0
                    }}
                >
                    브라우저에서 비디오를 지원하지 않습니다.
                </video>

                {/* 로딩 오버레이 */}
                {isLoading && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px'
                    }}>
                        <div style={{
                            width: '30px',
                            height: '30px',
                            border: '3px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '3px solid white',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '12px'
                        }} />
                        <div>{loadingProgress}</div>
                    </div>
                )}
            </div>

            <style>
                {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}
            </style>
        </div>
    );
};

export default MultiStreamViewer;