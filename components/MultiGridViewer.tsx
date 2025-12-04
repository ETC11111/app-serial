// components/MultiGridViewer.tsx
import React, { useState, useEffect, useCallback } from 'react';
import GridStreamCell from './GridStreamCell';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

interface MultiGridViewerProps {
    streams: Stream[];
    onClose: () => void;
}

type GridSize = '2x2' | '3x3' | '4x4' | '2x3';

const MultiGridViewer: React.FC<MultiGridViewerProps> = ({ streams, onClose }) => {
    const [gridSize, setGridSize] = useState<GridSize>('2x2');
    const [selectedStreams, setSelectedStreams] = useState<number[]>([]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [focusedStream, setFocusedStream] = useState<number | null>(null);
    const [globalMute, setGlobalMute] = useState(true);
    const [activeViewers, setActiveViewers] = useState<Set<number>>(new Set());

    const gridConfigs = {
        '2x2': { rows: 2, cols: 2, maxStreams: 4 },
        '3x3': { rows: 3, cols: 3, maxStreams: 9 },
        '4x4': { rows: 4, cols: 4, maxStreams: 16 },
        '2x3': { rows: 2, cols: 3, maxStreams: 6 }
    };

    const currentConfig = gridConfigs[gridSize];

    // 초기 스트림 선택 (최대 개수만큼)
    useEffect(() => {
        if (streams.length > 0 && selectedStreams.length === 0) {
            const initialStreams = streams
                .slice(0, currentConfig.maxStreams)
                .map(stream => stream.id);
            setSelectedStreams(initialStreams);
        }
    }, [streams, currentConfig.maxStreams, selectedStreams.length]);

    // 그리드 크기 변경 시 선택된 스트림 조정
    useEffect(() => {
        if (selectedStreams.length > currentConfig.maxStreams) {
            setSelectedStreams(prev => prev.slice(0, currentConfig.maxStreams));
        }
    }, [gridSize, currentConfig.maxStreams, selectedStreams.length]);

    // 스트림 선택/해제
    const toggleStreamSelection = (streamId: number) => {
        setSelectedStreams(prev => {
            if (prev.includes(streamId)) {
                return prev.filter(id => id !== streamId);
            } else if (prev.length < currentConfig.maxStreams) {
                return [...prev, streamId];
            }
            return prev;
        });
    };

    // 전체화면 토글
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            const element = document.getElementById('multi-grid-viewer');
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
            const streamId = selectedStreams[i];
            const stream = streamId ? streams.find(s => s.id === streamId) : null;
            const isFocused = focusedStream === streamId;

            cells.push(
                <div
                    key={i}
                    style={{
                        position: 'relative',
                        backgroundColor: '#000',
                        border: isFocused ? '3px solid #007bff' : '1px solid #333',
                        borderRadius: isFocused ? '8px' : '4px',
                        overflow: 'hidden',
                        cursor: stream ? 'pointer' : 'default',
                        transition: 'all 0.3s ease'
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
                        />
                    ) : (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#666',
                            fontSize: '16px',
                            backgroundColor: '#1a1a1a'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📹</div>
                                <div>빈 슬롯</div>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return cells;
    };

    if (focusedStream) {
        // 포커스 모드: 선택된 스트림 전체화면
        const focusedStreamData = streams.find(s => s.id === focusedStream);
        return (
            <div
                id="multi-grid-viewer"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: '#000',
                    zIndex: 1000
                }}
            >
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    right: '20px',
                    zIndex: 1001,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ color: 'white', fontSize: '18px', fontWeight: '600' }}>
                        🎯 {focusedStreamData?.stream_name || `스트림 ${focusedStream}`}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
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
                        <button
                            onClick={onClose}
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
                <div style={{ height: '100%', paddingTop: '80px' }}>
                    <GridStreamCell
                        stream={focusedStreamData!}
                        isFocused={true}
                        isMuted={false}
                        onViewerStateChange={handleViewerStateChange}
                        fullSize={true}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            id="multi-grid-viewer"
            style={{
                position: isFullscreen ? 'fixed' : 'relative',
                top: isFullscreen ? 0 : 'auto',
                left: isFullscreen ? 0 : 'auto',
                right: isFullscreen ? 0 : 'auto',
                bottom: isFullscreen ? 0 : 'auto',
                width: isFullscreen ? '100vw' : '100%',
                height: isFullscreen ? '100vh' : 'auto',
                backgroundColor: isFullscreen ? '#000' : 'white',
                zIndex: isFullscreen ? 1000 : 'auto',
                border: isFullscreen ? 'none' : '2px solid #007bff',
                borderRadius: isFullscreen ? '0' : '12px',
                overflow: 'hidden',
                boxShadow: isFullscreen ? 'none' : '0 8px 25px rgba(0, 123, 255, 0.15)'
            }}
        >
            {/* 헤더 */}
            <div style={{
                backgroundColor: '#007bff',
                color: 'white',
                padding: '15px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: '600' }}>
                        📺 다중 CCTV 모니터링
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                        {selectedStreams.length}개 스트림 선택됨 • {activeViewers.size}개 활성
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {!isFullscreen && (
                        <button
                            onClick={toggleFullscreen}
                            style={{
                                padding: '6px 12px',
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            🔍 전체화면
                        </button>
                    )}
                    <button
                        onClick={() => setGlobalMute(!globalMute)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: globalMute ? 'rgba(255, 255, 255, 0.2)' : 'rgba(40, 167, 69, 0.8)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        {globalMute ? '🔇 음소거' : '🔊 음성'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: 'rgba(220, 53, 69, 0.8)',
                            color: 'white',
                            border: '1px solid rgba(220, 53, 69, 0.6)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        ✕ 닫기
                    </button>
                </div>
            </div>

            {/* 컨트롤 패널 */}
            {!isFullscreen && (
                <div style={{
                    padding: '16px',
                    backgroundColor: '#f8f9fa',
                    borderBottom: '1px solid #dee2e6'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '15px'
                    }}>
                        {/* 그리드 크기 선택 */}
                        <div>
                            <label style={{ fontWeight: '600', marginRight: '10px', color: '#495057' }}>
                                그리드 크기:
                            </label>
                            {(['2x2', '3x3', '4x4', '2x3'] as GridSize[]).map(size => (
                                <button
                                    key={size}
                                    onClick={() => setGridSize(size)}
                                    style={{
                                        padding: '6px 12px',
                                        marginRight: '5px',
                                        backgroundColor: gridSize === size ? '#007bff' : 'white',
                                        color: gridSize === size ? 'white' : '#495057',
                                        border: '1px solid #007bff',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>

                        {/* 스트림 선택 */}
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label style={{ fontWeight: '600', marginRight: '10px', color: '#495057' }}>
                                스트림 선택 ({selectedStreams.length}/{currentConfig.maxStreams}):
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                                {streams.map(stream => (
                                    <button
                                        key={stream.id}
                                        onClick={() => toggleStreamSelection(stream.id)}
                                        disabled={!selectedStreams.includes(stream.id) && selectedStreams.length >= currentConfig.maxStreams}
                                        style={{
                                            padding: '4px 8px',
                                            backgroundColor: selectedStreams.includes(stream.id) ? '#28a745' : 'white',
                                            color: selectedStreams.includes(stream.id) ? 'white' : '#495057',
                                            border: '1px solid #28a745',
                                            borderRadius: '12px',
                                            cursor: (!selectedStreams.includes(stream.id) && selectedStreams.length >= currentConfig.maxStreams) ? 'not-allowed' : 'pointer',
                                            fontSize: '11px',
                                            opacity: (!selectedStreams.includes(stream.id) && selectedStreams.length >= currentConfig.maxStreams) ? 0.5 : 1
                                        }}
                                        title={stream.stream_name}
                                    >
                                        {stream.stream_name.length > 8 ? 
                                            stream.stream_name.substring(0, 8) + '...' : 
                                            stream.stream_name
                                        }
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 그리드 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${currentConfig.cols}, 1fr)`,
                gridTemplateRows: `repeat(${currentConfig.rows}, 1fr)`,
                gap: isFullscreen ? '2px' : '8px',
                padding: isFullscreen ? '4px' : '16px',
                height: isFullscreen ? 'calc(100vh - 80px)' : '600px',
                backgroundColor: isFullscreen ? '#000' : '#f8f9fa'
            }}>
                {renderGridCells()}
            </div>

            {/* 포커스 힌트 */}
            {!isFullscreen && selectedStreams.length > 0 && (
                <div style={{
                    padding: '12px 20px',
                    backgroundColor: '#e3f2fd',
                    fontSize: '14px',
                    color: '#1565c0',
                    textAlign: 'center'
                }}>
                    💡 스트림을 클릭하면 전체화면으로 볼 수 있습니다
                </div>
            )}
        </div>
    );
};

export default MultiGridViewer;