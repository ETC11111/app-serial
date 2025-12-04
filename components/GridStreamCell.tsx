// components/GridStreamCell.tsx - 컨테이너 크기 제한 수정
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
}

interface GridStreamCellProps {
    stream: Stream;
    isFocused: boolean;
    isMuted: boolean;
    onViewerStateChange: (streamId: number, isActive: boolean) => void;
    fullSize?: boolean;
    autoStart?: boolean;
}

const GridStreamCell: React.FC<GridStreamCellProps> = ({
    stream,
    isFocused,
    isMuted,
    onViewerStateChange,
    fullSize = false,
    autoStart = true
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    const [viewerId, setViewerId] = useState<string | null>(null);
    const [isJoined, setIsJoined] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [connectionAttempts, setConnectionAttempts] = useState(0);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const getAuthHeaders = () => {
        const token = document.cookie
            .split('; ')
            .find(row => row.startsWith('accessToken='))
            ?.split('=')[1] || localStorage.getItem('accessToken');
        
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    // 뷰어 참가
    const joinAsViewer = useCallback(async () => {
        if (isJoined || isLoading) return;
        
        setIsLoading(true);
        setError(null);
        setConnectionAttempts(prev => prev + 1);

        try {
            const response = await fetch(`${API_BASE}/api/stream/viewer/join/${stream.id}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            const data = await response.json();

            if (data.success) {
                setViewerId(data.viewerId);
                setIsJoined(true);
                onViewerStateChange(stream.id, true);
                
                console.log(`👥 그리드 뷰어 참가: ${stream.stream_name}`);
                
                startHeartbeat(data.viewerId);
                
                const waitTime = data.streamStarted ? 5000 : 2000;
                setTimeout(() => {
                    loadHLS(data.playlistUrl);
                }, waitTime);
                
            } else {
                setError('연결 실패');
                onViewerStateChange(stream.id, false);
            }
        } catch (err: any) {
            console.error('그리드 뷰어 참가 실패:', err);
            setError('연결 오류');
            onViewerStateChange(stream.id, false);
        } finally {
            setIsLoading(false);
        }
    }, [stream.id, isJoined, isLoading, onViewerStateChange]);

    // 뷰어 퇴장
    const leaveAsViewer = useCallback(async () => {
        if (!isJoined || !viewerId) return;

        try {
            await fetch(`${API_BASE}/api/stream/viewer/leave/${stream.id}/${viewerId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            console.log(`👤 그리드 뷰어 퇴장: ${stream.stream_name}`);
            
            setIsJoined(false);
            setViewerId(null);
            setIsPlaying(false);
            onViewerStateChange(stream.id, false);
            
            stopHeartbeat();
            
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.src = '';
            }
            
        } catch (err) {
            console.error('그리드 뷰어 퇴장 실패:', err);
        }
    }, [stream.id, stream.stream_name, viewerId, isJoined, onViewerStateChange]);

    // 하트비트 시작
    const startHeartbeat = (vId: string) => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }
        
        heartbeatIntervalRef.current = setInterval(async () => {
            try {
                await fetch(`${API_BASE}/api/stream/viewer/heartbeat/${vId}`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
            } catch (err) {
                console.error('그리드 하트비트 실패:', err);
            }
        }, 20000);
    };

    // 하트비트 중지
    const stopHeartbeat = () => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
    };

    // HLS 로드
    const loadHLS = (playlistUrl: string) => {
        if (!videoRef.current) return;

        if (Hls.isSupported()) {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }

            hlsRef.current = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 20,
                maxBufferLength: 40,
                manifestLoadingTimeOut: 15000,
                levelLoadingTimeOut: 15000,
                fragLoadingTimeOut: 15000,
                manifestLoadingMaxRetry: 3,
                levelLoadingMaxRetry: 3,
                fragLoadingMaxRetry: 3
            });

            hlsRef.current.loadSource(playlistUrl);
            hlsRef.current.attachMedia(videoRef.current);

            hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
                setError(null);
                
                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.muted = isMuted;
                        videoRef.current.play().catch(err => {
                            console.warn(`그리드 자동 재생 실패 (${stream.stream_name}):`, err);
                        });
                    }
                }, 500);
            });

            hlsRef.current.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error(`그리드 HLS 오류 (${stream.stream_name}):`, data.details);
                    setError('재생 오류');
                    
                    if (connectionAttempts < 2) {
                        setTimeout(() => {
                            joinAsViewer();
                        }, 5000);
                    }
                }
            });

        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = playlistUrl;
            videoRef.current.muted = isMuted;
            videoRef.current.load();
        }
    };

    // 음소거 상태 업데이트
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // 컴포넌트 마운트 시 자동 연결
    useEffect(() => {
        if (autoStart) {
            joinAsViewer();
        }
        return () => {
            leaveAsViewer();
            stopHeartbeat();
        };
    }, []);

    // 비디오 이벤트 처리
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlaying = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleWaiting = () => setIsPlaying(false);

        video.addEventListener('playing', handlePlaying);
        video.addEventListener('pause', handlePause);
        video.addEventListener('waiting', handleWaiting);

        return () => {
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('waiting', handleWaiting);
        };
    }, []);

    // ✅ 컨테이너 스타일 - 반응형 크기 완전 제한
    const containerStyle: React.CSSProperties = {
        position: 'relative',
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: 0
    };

    return (
        <div style={containerStyle}>
            {/* 스트림 제목 */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: fullSize ? '12px' : '4px 6px',
                fontSize: fullSize ? '16px' : '10px',
                fontWeight: '600',
                zIndex: 10,
                borderRadius: fullSize ? '0' : '4px 4px 0 0'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '70%'
                    }}>
                        {stream.stream_name}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {isPlaying && (
                            <span style={{ color: '#28a745', fontSize: fullSize ? '14px' : '8px' }}>
                                ● LIVE
                            </span>
                        )}
                        {isMuted && (
                            <span style={{ fontSize: fullSize ? '14px' : '8px' }}>🔇</span>
                        )}
                        {isFocused && (
                            <span style={{ 
                                backgroundColor: '#007bff',
                                padding: '1px 4px',
                                borderRadius: '6px',
                                fontSize: fullSize ? '12px' : '6px'
                            }}>
                                FOCUS
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ✅ 비디오 - 반응형 크기 완전 제한 (절대 위치 제거) */}
            <video
                ref={videoRef}
                muted={isMuted}
                playsInline
                preload="none"
                style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    backgroundColor: '#000',
                    display: 'block',
                    minWidth: 0,
                    minHeight: 0,
                    flex: 1
                }}
            />

            {/* 상태 오버레이 */}
            {(isLoading || error) && (
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
                    fontSize: fullSize ? '16px' : '10px'
                }}>
                    {isLoading ? (
                        <>
                            <div style={{
                                width: fullSize ? '40px' : '20px',
                                height: fullSize ? '40px' : '20px',
                                border: `${fullSize ? '4px' : '2px'} solid rgba(255, 255, 255, 0.3)`,
                                borderTop: `${fullSize ? '4px' : '2px'} solid white`,
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                marginBottom: fullSize ? '12px' : '6px'
                            }} />
                            <div>연결 중...</div>
                            {connectionAttempts > 1 && (
                                <div style={{ fontSize: fullSize ? '12px' : '8px', opacity: 0.7 }}>
                                    시도 #{connectionAttempts}
                                </div>
                            )}
                        </>
                    ) : error ? (
                        <>
                            <div style={{ fontSize: fullSize ? '32px' : '20px', marginBottom: '6px' }}>⚠️</div>
                            <div style={{ textAlign: 'center', fontSize: fullSize ? '14px' : '9px' }}>
                                {error}
                            </div>
                            {connectionAttempts < 2 && (
                                <div style={{ fontSize: fullSize ? '12px' : '8px', opacity: 0.7, marginTop: '4px' }}>
                                    재시도 중...
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            )}

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

export default GridStreamCell;