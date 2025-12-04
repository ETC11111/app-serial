// components/DeviceStreamViewer.tsx - 크기 제한 수정
import React, { useState, useEffect } from 'react';
import MultiStreamViewer from './MultiStreamViewer';

interface DeviceStream {
    stream_id: number;
    stream_name: string;
    description?: string;
    rtsp_url: string;
    stream_active: boolean;
    display_order: number;
    connected_at: string;
}

interface DeviceStreamViewerProps {
    deviceId: string;
    deviceName: string;
    onClose?: () => void;
}

const DeviceStreamViewer: React.FC<DeviceStreamViewerProps> = ({ 
    deviceId, 
    deviceName, 
    onClose 
}) => {
    const [streams, setStreams] = useState<DeviceStream[]>([]);
    const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    // 장치에 연결된 스트림 조회
    const fetchDeviceStreams = async () => {
        setLoading(true);
        setError(null);
        
        try {
            console.log(`📹 장치 ${deviceId}의 스트림 조회 중...`);
            
            const response = await fetch(`${API_BASE}/api/device-streams/device/${deviceId}/streams`, {
                headers: getAuthHeaders()
            });

            const data = await response.json();
            console.log('📡 스트림 조회 응답:', data);

            if (data.success) {
                setStreams(data.streams);
                console.log(`✅ 장치 ${deviceName}에 ${data.streams.length}개 스트림 연결됨`);
                
                // 첫 번째 스트림을 자동 선택
                if (data.streams.length > 0) {
                    setSelectedStreamId(data.streams[0].stream_id);
                }
            } else {
                setError(data.error || '스트림 조회 실패');
            }
        } catch (error) {
            console.error('장치 스트림 조회 실패:', error);
            setError('스트림 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeviceStreams();
    }, [deviceId]);

    // ✅ 컨테이너 스타일 - 크기 완전 제한
    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0
    };

    if (loading) {
        return (
            <div style={{
                ...containerStyle,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #007bff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '20px'
                }} />
                <div style={{ fontSize: '16px', color: '#495057' }}>
                    장치 "{deviceName}"의 스트림 로딩 중...
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
    }

    if (error) {
        return (
            <div style={{
                ...containerStyle,
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #f5c6cb',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️</div>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                    스트림 조회 오류
                </div>
                <div style={{ marginBottom: '15px' }}>{error}</div>
                <button
                    onClick={fetchDeviceStreams}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#721c24',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    다시 시도
                </button>
            </div>
        );
    }

    if (streams.length === 0) {
        return (
            <div style={{
                ...containerStyle,
                backgroundColor: 'white',
                padding: '40px 20px',
                borderRadius: '12px',
                border: '2px dashed #dee2e6',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📹</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#495057', marginBottom: '8px' }}>
                    연결된 스트림이 없습니다
                </div>
                <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '20px' }}>
                    장치 "{deviceName}"에 연결된 카메라 스트림이 없습니다.
                </div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>
                    스트림 관리에서 카메라를 연결해보세요.
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {/* ✅ 헤더 - onClose가 있을 때만 표시 */}
            {onClose && (
                <div style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600' }}>
                            📱 {deviceName} - 연결된 스트림
                        </h3>
                        <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                            {streams.length}개 스트림 사용 가능
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

            {/* ✅ 스트림 선택 - 여러 스트림이 있을 때만 표시 */}
            {streams.length > 1 && (
                <div style={{ 
                    backgroundColor: '#f8f9fa', 
                    padding: '16px 20px',
                    borderBottom: '1px solid #dee2e6',
                    flexShrink: 0
                }}>
                    <label style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontWeight: '600',
                        color: '#495057'
                    }}>
                        📹 스트림 선택:
                    </label>
                    <select
                        value={selectedStreamId || ''}
                        onChange={(e) => setSelectedStreamId(Number(e.target.value))}
                        style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            fontSize: '14px'
                        }}
                    >
                        {streams.map(stream => (
                            <option key={stream.stream_id} value={stream.stream_id}>
                                {stream.stream_name} {stream.description ? `(${stream.description})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* ✅ 스트림 뷰어 - 남은 공간 모두 차지 (절대 위치 제거) */}
            <div style={{ 
                flex: 1,
                overflow: 'hidden',
                width: '100%',
                minWidth: 0,
                minHeight: 0
            }}>
                {selectedStreamId ? (
                    <MultiStreamViewer 
                        streamId={selectedStreamId}
                        onClose={() => setSelectedStreamId(null)}
                    />
                ) : (
                    <div style={{ 
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6c757d',
                        textAlign: 'center'
                    }}>
                        스트림을 선택해주세요.
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeviceStreamViewer;