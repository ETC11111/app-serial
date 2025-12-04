// components/StreamViewer.tsx
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface StreamViewerProps {
    autoStart?: boolean;
    className?: string;
}

const StreamViewer: React.FC<StreamViewerProps> = ({ autoStart = true, className }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamStatus, setStreamStatus] = useState<string>('unknown');
    const [isPlaying, setIsPlaying] = useState(false);
    const [bufferHealth, setBufferHealth] = useState<number>(0);

    // Vite 환경변수 사용
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    // 스트림 상태 확인
    const checkStreamStatus = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stream/status`);
            const data = await response.json();
            setStreamStatus(data.status);
            return data;
        } catch (err) {
            console.error('스트림 상태 확인 실패:', err);
            setError('스트림 상태 확인에 실패했습니다.');
            return null;
        }
    };

    // 스트림 시작
    const startStream = async () => {
        setIsLoading(true);
        setError(null);

        try {
            console.log('🚀 스트림 시작 요청:', `${API_BASE}/api/stream/start`);
            const response = await fetch(`${API_BASE}/api/stream/start`, {
                method: 'POST'
            });
            const data = await response.json();
            console.log('📝 스트림 시작 응답:', data);

            if (data.success) {
                setStreamStatus(data.status);
                // 잠시 대기 후 HLS 로드 시도
                setTimeout(() => {
                    console.log('⏰ 3초 대기 후 HLS 로드 시도');
                    loadHLS();
                }, 3000);
            } else {
                setError(data.error || '스트림 시작에 실패했습니다.');
            }
        } catch (err) {
            console.error('스트림 시작 실패:', err);
            setError('스트림 시작에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    // 스트림 정지
    const stopStream = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stream/stop`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                setStreamStatus(data.status);
                setIsPlaying(false);
                // HLS 정리
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                    hlsRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.src = '';
                }
            }
        } catch (err) {
            console.error('스트림 정지 실패:', err);
            setError('스트림 정지에 실패했습니다.');
        }
    };

    // 스트림 재시작
    const restartStream = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stream/restart`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                setStreamStatus('restarting');
                setIsPlaying(false);
                // HLS 정리
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                    hlsRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.src = '';
                }

                // 잠시 대기 후 HLS 로드 시도
                setTimeout(() => {
                    loadHLS();
                }, 4000);
            }
        } catch (err) {
            console.error('스트림 재시작 실패:', err);
            setError('스트림 재시작에 실패했습니다.');
        }
    };

    // 버퍼 상태 업데이트
    const updateBufferHealth = () => {
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
                setBufferHealth(Math.round(bufferLength * 10) / 10); // 소수점 1자리
            } else {
                setBufferHealth(0);
            }
        }
    };

    // HLS 스트림 로드
    const loadHLS = () => {
        if (!videoRef.current) return;

        const playlistUrl = `${API_BASE}/hls/playlist.m3u8`;
        console.log('📺 HLS 로드 시도:', playlistUrl);

        // 먼저 playlist 파일이 실제로 존재하는지 확인
        fetch(playlistUrl)
            .then(response => {
                console.log('📄 Playlist 응답 상태:', response.status);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(playlistContent => {
                console.log('📄 Playlist 내용 길이:', playlistContent.length);
                // 실제 HLS 로드
                loadHLSPlayer(playlistUrl);
            })
            .catch(err => {
                console.error('📄 Playlist 로드 실패:', err);
                setError(`플레이리스트를 찾을 수 없습니다: ${err.message}`);
            });
    };

    // 실제 HLS 플레이어 로드
    // StreamViewer.tsx - loadHLSPlayer 함수 수정
    // StreamViewer.tsx - loadHLSPlayer 함수 수정 (타입 오류 해결)
    // StreamViewer.tsx - loadHLSPlayer 함수의 이벤트 핸들러 수정
const loadHLSPlayer = (playlistUrl: string) => {
  if (!videoRef.current) return;

  if (Hls.isSupported()) {
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    hlsRef.current = new Hls({
      // 기본 설정
      enableWorker: true,
      lowLatencyMode: false,
      
      // 버퍼 관리 설정
      backBufferLength: 30,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 120 * 1000 * 1000,
      maxBufferHole: 1,
      
      // 라이브 스트림 설정
      liveBackBufferLength: 20,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      
      // 네트워크 타임아웃 설정
      manifestLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 5,
      levelLoadingTimeOut: 20000,
      levelLoadingMaxRetry: 5,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 5,
      
      // 재시도 타임아웃 설정
      fragLoadingMaxRetryTimeout: 120000,
      levelLoadingMaxRetryTimeout: 120000,
      manifestLoadingMaxRetryTimeout: 120000,
      
      // 기타 설정
      startLevel: -1,
      testBandwidth: false,
      progressive: true,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      
      // 적응형 비트레이트 설정
      abrEwmaFastLive: 3.0,
      abrEwmaSlowLive: 9.0,
      abrMaxWithRealBitrate: false,
      
      // 워치독 설정
      highBufferWatchdogPeriod: 2
    });

    hlsRef.current.loadSource(playlistUrl);
    hlsRef.current.attachMedia(videoRef.current);

    // 🔥 유효한 이벤트들만 사용
    hlsRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS manifest 로드됨');
      setError(null);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(err => {
            console.warn('자동 재생 실패:', err);
            setError('자동 재생이 차단되었습니다. 재생 버튼을 클릭해주세요.');
          });
        }
      }, 2000);
    });

    // 🔥 버퍼 관련 이벤트 (유효한 것들만)
    hlsRef.current.on(Hls.Events.BUFFER_APPENDED, () => {
      updateBufferHealth();
      console.log('📊 버퍼 추가됨');
    });

    hlsRef.current.on(Hls.Events.BUFFER_FLUSHED, () => {
      console.log('🧹 버퍼 정리됨');
    });

    // 🔥 추가 유용한 이벤트들
    hlsRef.current.on(Hls.Events.FRAG_LOADED, () => {
      console.log('📦 세그먼트 로드됨');
    });

    hlsRef.current.on(Hls.Events.LEVEL_LOADED, () => {
      console.log('📋 레벨 로드됨');
    });

    hlsRef.current.on(Hls.Events.AUDIO_TRACK_LOADED, () => {
      console.log('🔊 오디오 트랙 로드됨');
    });

    // 🔥 에러 처리
    hlsRef.current.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS 오류:', data);
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('🔄 네트워크 오류 - 복구 시도');
            setTimeout(() => {
              if (hlsRef.current) {
                hlsRef.current.startLoad();
              }
            }, 1000);
            break;
            
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('🔄 미디어 오류 - 복구 시도');
            setTimeout(() => {
              if (hlsRef.current) {
                hlsRef.current.recoverMediaError();
              }
            }, 1000);
            break;
            
          default:
            console.log('💥 치명적 오류 - 재시작 필요');
            setError(`스트림 재생 오류: ${data.details}`);
            break;
        }
      } else {
        // 비치명적 오류 처리
        if (data.details === 'bufferStalledError') {
          console.warn('⚠️ 버퍼 스톨링 감지 - 복구 시도');
          setTimeout(() => {
            if (hlsRef.current && videoRef.current) {
              hlsRef.current.startLoad();
              const currentTime = videoRef.current.currentTime;
              videoRef.current.currentTime = currentTime + 0.1;
            }
          }, 500);
        } else if (data.details === 'bufferAppendError') {
          console.warn('⚠️ 버퍼 추가 오류');
        } else {
          console.warn('⚠️ 비치명적 HLS 오류:', data.details);
        }
      }
    });

    // 🔥 추가 상태 이벤트들
    hlsRef.current.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('📺 미디어 연결됨');
    });

    hlsRef.current.on(Hls.Events.MEDIA_DETACHED, () => {
      console.log('📺 미디어 연결 해제됨');
    });

    hlsRef.current.on(Hls.Events.DESTROYING, () => {
      console.log('💥 HLS 인스턴스 파괴 중');
    });

  } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari 네이티브 HLS
    console.log('🍎 Safari 네이티브 HLS 사용');
    videoRef.current.src = playlistUrl;
    videoRef.current.load();
    setTimeout(() => {
      videoRef.current?.play().catch(err => {
        console.warn('자동 재생 실패:', err);
      });
    }, 2000);
  } else {
    setError('이 브라우저에서는 HLS 스트리밍이 지원되지 않습니다.');
  }
};

    // 비디오 이벤트 핸들러들
    // StreamViewer.tsx - handleVideoEvents 함수 수정
    const handleVideoEvents = () => {
        if (!videoRef.current) return;

        const video = videoRef.current;

        video.addEventListener('waiting', () => {
            console.log('⏳ 비디오 버퍼링 중...');
            setIsPlaying(false);
        });

        video.addEventListener('playing', () => {
            console.log('▶️ 비디오 재생 중');
            setIsPlaying(true);
        });

        video.addEventListener('pause', () => {
            console.log('⏸️ 비디오 일시정지');
            setIsPlaying(false);
        });

        // 🔥 스톨링 이벤트 처리 개선
        video.addEventListener('stalled', () => {
            console.log('⏸️ 비디오 스톨됨 - 버퍼 부족');
            setIsPlaying(false);

            // 🔥 더 적극적인 복구 시도
            setTimeout(() => {
                if (hlsRef.current && video) {
                    console.log('🔄 스톨링 복구 시도');
                    hlsRef.current.startLoad();

                    // 🔥 현재 시간을 살짝 앞으로 이동
                    const currentTime = video.currentTime;
                    video.currentTime = currentTime + 0.5;
                }
            }, 1000);
        });

        // 🔥 추가 이벤트 핸들러
        video.addEventListener('canplay', () => {
            console.log('✅ 비디오 재생 준비됨');
        });

        video.addEventListener('loadeddata', () => {
            console.log('📊 비디오 데이터 로드됨');
        });

        video.addEventListener('timeupdate', () => {
            updateBufferHealth();

            // 🔥 정기적으로 버퍼 상태 확인
            const buffered = video.buffered;
            const currentTime = video.currentTime;

            if (buffered.length > 0) {
                let bufferAhead = 0;
                for (let i = 0; i < buffered.length; i++) {
                    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                        bufferAhead = buffered.end(i) - currentTime;
                        break;
                    }
                }

                // 🔥 버퍼가 부족하면 로드 재시작
                if (bufferAhead < 1 && hlsRef.current) {
                    console.warn('⚠️ 낮은 버퍼 감지, 로드 재시작');
                    hlsRef.current.startLoad();
                }
            }
        });
    };

    // 컴포넌트 마운트/언마운트 처리
    useEffect(() => {
        if (autoStart) {
            checkStreamStatus().then(status => {
                if (status?.isRunning && status?.playlistExists) {
                    loadHLS();
                } else {
                    startStream();
                }
            });
        }

        // 비디오 이벤트 핸들러 등록
        handleVideoEvents();

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
        };
    }, [autoStart]);

    // 상태별 스타일링
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return '#28a745';
            case 'starting': case 'restarting': return '#ffc107';
            case 'stopped': return '#6c757d';
            case 'error': return '#dc3545';
            default: return '#17a2b8';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'running': return '실행 중';
            case 'starting': return '시작 중';
            case 'restarting': return '재시작 중';
            case 'stopped': return '정지됨';
            case 'error': return '오류';
            default: return '알 수 없음';
        }
    };

    return (
        <div className={`stream-viewer ${className || ''}`}>
            {/* 컨트롤 패널 */}
            <div style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                    marginBottom: '12px'
                }}>
                    <button
                        onClick={startStream}
                        disabled={isLoading || streamStatus === 'running'}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: isLoading || streamStatus === 'running' ? '#ccc' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading || streamStatus === 'running' ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        {isLoading ? '시작 중...' : '▶️ 스트림 시작'}
                    </button>

                    <button
                        onClick={stopStream}
                        disabled={streamStatus === 'stopped'}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: streamStatus === 'stopped' ? '#ccc' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: streamStatus === 'stopped' ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        ⏹️ 스트림 정지
                    </button>

                    <button
                        onClick={restartStream}
                        disabled={streamStatus === 'stopped'}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: streamStatus === 'stopped' ? '#ccc' : '#ffc107',
                            color: streamStatus === 'stopped' ? '#666' : '#000',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: streamStatus === 'stopped' ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        🔄 재시작
                    </button>

                    <button
                        onClick={checkStreamStatus}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        🔍 상태 확인
                    </button>
                </div>

                {/* 상태 정보 */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '15px',
                    fontSize: '14px'
                }}>
                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: 'white',
                        border: `2px solid ${getStatusColor(streamStatus)}`,
                        borderRadius: '4px',
                        fontWeight: '600'
                    }}>
                        상태: <span style={{ color: getStatusColor(streamStatus) }}>
                            {getStatusText(streamStatus)}
                        </span>
                    </span>

                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: 'white',
                        border: `2px solid ${isPlaying ? '#28a745' : '#6c757d'}`,
                        borderRadius: '4px',
                        fontWeight: '600'
                    }}>
                        재생: <span style={{ color: isPlaying ? '#28a745' : '#6c757d' }}>
                            {isPlaying ? '재생 중' : '정지'}
                        </span>
                    </span>

                    <span style={{
                        padding: '4px 8px',
                        backgroundColor: 'white',
                        border: `2px solid ${bufferHealth > 2 ? '#28a745' : bufferHealth > 1 ? '#ffc107' : '#dc3545'}`,
                        borderRadius: '4px',
                        fontWeight: '600'
                    }}>
                        버퍼: <span style={{
                            color: bufferHealth > 2 ? '#28a745' : bufferHealth > 1 ? '#ffc107' : '#dc3545'
                        }}>
                            {bufferHealth}초
                        </span>
                    </span>
                </div>
            </div>

            {/* 오류 메시지 */}
            {error && (
                <div style={{
                    color: '#721c24',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <span style={{ fontWeight: '500' }}>{error}</span>
                </div>
            )}

            {/* 비디오 플레이어 */}
            <div style={{
                position: 'relative',
                backgroundColor: '#000',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
            }}>
                <video
                    ref={videoRef}
                    controls
                    muted
                    playsInline
                    preload="none"
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        backgroundColor: '#000'
                    }}
                    onLoadStart={() => console.log('📺 비디오 로드 시작')}
                    onCanPlay={() => console.log('✅ 비디오 재생 가능')}
                    onError={(e) => console.error('❌ 비디오 오류:', e)}
                    onWaiting={() => console.log('⏳ 비디오 대기 중')}
                    onPlaying={() => console.log('▶️ 비디오 재생 중')}
                >
                    브라우저에서 비디오를 지원하지 않습니다.
                </video>

                {/* 로딩 오버레이 */}
                {(isLoading || streamStatus === 'starting' || streamStatus === 'restarting') && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '500'
                    }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '4px solid white',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '16px'
                        }} />
                        <div>
                            {streamStatus === 'starting' && '스트림 시작 중...'}
                            {streamStatus === 'restarting' && '스트림 재시작 중...'}
                            {isLoading && '로딩 중...'}
                        </div>
                    </div>
                )}
            </div>

            {/* CSS 애니메이션 */}
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

export default StreamViewer;