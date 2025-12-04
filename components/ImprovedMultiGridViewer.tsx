// components/ImprovedMultiGridViewer.tsx - 여백 문제 완전 해결
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GridStreamCell from './GridStreamCell';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

interface ImprovedMultiGridViewerProps {
    streams: Stream[];
    onClose: () => void;
    maxWidth?: string;
    maxHeight?: string;
    showFilters?: boolean;
}

type GridConfig = {
    rows: number;
    cols: number;
    maxStreams: number;
};

const ImprovedMultiGridViewer: React.FC<ImprovedMultiGridViewerProps> = ({ 
    streams, 
    onClose,
    maxWidth = "100%",
    maxHeight = "100%",
    showFilters = true
}) => {
    const [filteredStreams, setFilteredStreams] = useState<Stream[]>(streams);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [focusedStream, setFocusedStream] = useState<number | null>(null);
    const [globalMute, setGlobalMute] = useState(true);
    const [activeViewers, setActiveViewers] = useState<Set<number>>(new Set());

    // 스트림 개수에 따른 자동 그리드 크기 결정
    const getOptimalGridConfig = (streamCount: number): GridConfig => {
        if (streamCount <= 1) return { rows: 1, cols: 1, maxStreams: 1 };
        if (streamCount <= 2) return { rows: 1, cols: 2, maxStreams: 2 };
        if (streamCount <= 4) return { rows: 2, cols: 2, maxStreams: 4 };
        if (streamCount <= 6) return { rows: 2, cols: 3, maxStreams: 6 };
        if (streamCount <= 9) return { rows: 3, cols: 3, maxStreams: 9 };
        if (streamCount <= 12) return { rows: 3, cols: 4, maxStreams: 12 };
        return { rows: 4, cols: 4, maxStreams: 16 };
    };

    // 현재 그리드 설정
    const currentConfig = useMemo(() => 
        getOptimalGridConfig(filteredStreams.length), 
        [filteredStreams.length]
    );

    // 자동으로 모든 필터된 스트림 선택
    const selectedStreams = useMemo(() => 
        filteredStreams.slice(0, currentConfig.maxStreams), 
        [filteredStreams, currentConfig.maxStreams]
    );

    // 필터링 로직
    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredStreams(streams);
        } else {
            const filtered = streams.filter(stream =>
                stream.stream_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (stream.description && stream.description.toLowerCase().includes(searchTerm.toLowerCase()))
            );
            setFilteredStreams(filtered);
        }
    }, [streams, searchTerm]);

    // 전체화면 토글
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            const element = document.getElementById('improved-multi-grid-viewer');
            if (element?.requestFullscreen) {
                element.requestFullscreen();
                setIsFullscreen(true);
            }
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    // 전체화면 변경 감지
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // 스트림 포커스
    const handleStreamFocus = (streamId: number | null) => {
        setFocusedStream(streamId);
    };

    // 활성 뷰어 추적
    const handleViewerStateChange = (streamId: number, isActive: boolean) => {
        setActiveViewers(prev => {
            const newSet = new Set(prev);
            if (isActive) {
                newSet.add(streamId);
            } else {
                newSet.delete(streamId);
            }
            return newSet;
        });
    };

    // 그리드 셀 생성
    const renderGridCells = () => {
        const cells = [];
        const totalCells = currentConfig.rows * currentConfig.cols;

        for (let i = 0; i < totalCells; i++) {
            const stream = selectedStreams[i];
            const isFocused = focusedStream === stream?.id;

            cells.push(
                <div
                    key={i}
                    style={{
                        position: 'relative',
                        backgroundColor: '#000',
                        border: isFocused ? '2px solid #007bff' : '0.5px solid #333', // ✅ border 최소화
                        borderRadius: isFocused ? '6px' : '3px',
                        overflow: 'hidden',
                        cursor: stream ? 'pointer' : 'default',
                        transition: 'all 0.3s ease',
                        width: '100%',
                        height: '100%',
                        minWidth: 0,
                        minHeight: 0,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        boxSizing: 'border-box'
                    }}
                    onClick={() => stream && handleStreamFocus(isFocused ? null : stream.id)}
                >
                    {stream ? (
                        <GridStreamCell
                            key={stream.id}
                            stream={stream}
                            isFocused={isFocused}
                            isMuted={globalMute && !isFocused}
                            onViewerStateChange={handleViewerStateChange}
                            autoStart={true}
                        />
                    ) : (
                        <div style={{
                            height: '100%',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#666',
                            fontSize: isFullscreen ? '20px' : '14px',
                            backgroundColor: '#1a1a1a',
                            boxSizing: 'border-box'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: isFullscreen ? '48px' : '32px', marginBottom: '8px' }}>📹</div>
                                <div>빈 슬롯</div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return cells;
    };

    // ✅ 컨테이너 스타일 - border 조건부 적용
    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        maxWidth: isFullscreen ? '100vw' : maxWidth,
        maxHeight: isFullscreen ? '100vh' : maxHeight,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        backgroundColor: isFullscreen ? '#000' : 'white',
        zIndex: isFullscreen ? 1000 : 'auto',
        // ✅ border와 borderRadius를 showFilters에 따라 조건부 적용
        border: isFullscreen ? 'none' : (showFilters ? '2px solid #007bff' : 'none'),
        borderRadius: isFullscreen ? '0' : (showFilters ? '12px' : '0'),
        boxShadow: isFullscreen ? 'none' : (showFilters ? '0 8px 25px rgba(0, 123, 255, 0.15)' : 'none'),
        minWidth: 0,
        minHeight: 0,
        boxSizing: 'border-box'
    };

    // 포커스 모드 또는 전체화면 렌더링
    if (focusedStream || isFullscreen) {
        const focusedStreamData = selectedStreams.find(s => s.id === focusedStream);
        
        // ✅ 전체화면 모드 - Layout을 완전히 무시하고 화면 전체 차지
        return (
            <div
                id="improved-multi-grid-viewer"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: '#000',
                    zIndex: 9999, // ✅ Layout보다 높은 z-index
                    width: '100vw',
                    height: '100vh',
                    maxWidth: '100vw',
                    maxHeight: '100vh',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                }}
            >
                {/* ✅ 전체화면 헤더 - 포커스 모드와 그리드 모드 구분 */}
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    right: '20px',
                    zIndex: 10001,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ color: 'white', fontSize: '18px', fontWeight: '600' }}>
                        {focusedStream ? (
                            <>🎯 {focusedStreamData?.stream_name || `스트림 ${focusedStream}`}</>
                        ) : (
                            <>📺 다중 CCTV 모니터링 ({currentConfig.rows}×{currentConfig.cols})</>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {focusedStream && (
                            <button
                                onClick={() => setFocusedStream(null)}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                ⬅️ 그리드로 돌아가기
                            </button>
                        )}
                        {isFullscreen && !focusedStream && (
                            <button
                                onClick={() => setGlobalMute(!globalMute)}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: globalMute ? 'rgba(255, 255, 255, 0.2)' : 'rgba(40, 167, 69, 0.8)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                {globalMute ? '🔇 음소거' : '🔊 음성'}
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (focusedStream) {
                                    setFocusedStream(null);
                                }
                                if (isFullscreen) {
                                    document.exitFullscreen();
                                }
                                onClose();
                            }}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: 'rgba(220, 53, 69, 0.8)',
                                color: 'white',
                                border: '1px solid rgba(220, 53, 69, 0.6)',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            ✕ 닫기
                        </button>
                    </div>
                </div>
                
                {/* ✅ 컨텐츠 영역 - 포커스 모드와 그리드 모드 구분 */}
                <div style={{ 
                    height: '100%', 
                    width: '100%',
                    paddingTop: '80px',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                }}>
                    {focusedStream ? (
                        // 단일 스트림 포커스 모드
                        <GridStreamCell
                            stream={focusedStreamData!}
                            isFocused={true}
                            isMuted={false}
                            onViewerStateChange={handleViewerStateChange}
                            fullSize={true}
                            autoStart={true}
                        />
                    ) : (
                        // 전체화면 그리드 모드
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${currentConfig.cols}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${currentConfig.rows}, minmax(0, 1fr))`,
                            gap: '3px',
                            padding: '8px',
                            height: '100%',
                            width: '100%',
                            backgroundColor: '#000',
                            overflow: 'hidden',
                            boxSizing: 'border-box'
                        }}>
                            {renderGridCells()}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            id="improved-multi-grid-viewer"
            style={containerStyle}
        >
            {/* ✅ 헤더 - showFilters에 따라 조건부 렌더링 */}
            {showFilters && (
                <div style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    padding: isFullscreen ? '12px 16px' : '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    flexShrink: 0,
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ flex: '1', minWidth: 0 }}>
                        <h3 style={{ 
                            margin: '0 0 2px 0', 
                            fontSize: isFullscreen ? '16px' : '14px', 
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            📺 다중 CCTV 모니터링 
                            <span style={{ fontSize: isFullscreen ? '14px' : '12px', opacity: 0.9, marginLeft: '8px' }}>
                                ({currentConfig.rows}×{currentConfig.cols})
                            </span>
                        </h3>
                        <p style={{ 
                            margin: 0, 
                            fontSize: isFullscreen ? '12px' : '10px', 
                            opacity: 0.9 
                        }}>
                            {selectedStreams.length}개 스트림 활성 • {activeViewers.size}개 재생 중
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                        {!isFullscreen && (
                            <button
                                onClick={toggleFullscreen}
                                style={{
                                    padding: '3px 6px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                }}
                            >
                                🔍 전체화면
                            </button>
                        )}
                        <button
                            onClick={() => setGlobalMute(!globalMute)}
                            style={{
                                padding: '3px 6px',
                                backgroundColor: globalMute ? 'rgba(255, 255, 255, 0.2)' : 'rgba(40, 167, 69, 0.8)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '10px'
                            }}
                        >
                            {globalMute ? '🔇' : '🔊'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '3px 6px',
                                backgroundColor: 'rgba(220, 53, 69, 0.8)',
                                color: 'white',
                                border: '1px solid rgba(220, 53, 69, 0.6)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '10px'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ✅ 그리드 - 핵심 수정: flex: 1 → height: 100% */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${currentConfig.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${currentConfig.rows}, minmax(0, 1fr))`,
                gap: isFullscreen ? '1px' : '2px', // ✅ gap 최소화
                padding: isFullscreen ? '2px' : '4px', // ✅ padding 최소화
                height: showFilters ? 'calc(100% - 60px)' : '100%', // ✅ flex: 1 대신 height 계산
                backgroundColor: isFullscreen ? '#000' : '#f8f9fa',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '100%',
                maxHeight: '100%',
                minWidth: 0,
                minHeight: 0,
                boxSizing: 'border-box'
            }}>
                {renderGridCells()}
            </div>

            {/* ✅ 상태 정보 - showFilters에 따라 조건부 렌더링 */}
            {showFilters && !isFullscreen && selectedStreams.length > 0 && (
                <div style={{
                    padding: '6px 12px',
                    backgroundColor: '#e3f2fd',
                    fontSize: '11px',
                    color: '#1565c0',
                    textAlign: 'center',
                    flexShrink: 0,
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                }}>
                    💡 스트림을 클릭하면 전체화면으로 볼 수 있습니다
                    {filteredStreams.length > currentConfig.maxStreams && (
                        <span style={{ marginLeft: '10px', color: '#f57c00' }}>
                            ⚠️ {filteredStreams.length - currentConfig.maxStreams}개 스트림이 숨겨졌습니다
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default ImprovedMultiGridViewer;