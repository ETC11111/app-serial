// components/StreamViewer.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MultiStreamViewer from '../components/MultiStreamViewer';
import ImprovedMultiGridViewer from '../components/ImprovedMultiGridViewer';

interface GroupStream {
    stream_id: number;
    stream_name: string;
    description?: string;
    rtsp_url: string;
    stream_active: boolean;
    connected_devices: {
        device_id: string;
        device_name: string;
        connection_id: number;
        display_order: number;
    }[];
}

interface StreamsByDevice {
    device_id: string;
    device_name: string;
    streams: any[];
}

interface StreamViewerProps {
    groupStreams: any[];
    streamLoading: boolean;
    group: any;
    groupId?: string;
}

export const StreamViewer: React.FC<StreamViewerProps> = ({
    groupStreams,
    streamLoading,
    group,
    groupId
}) => {
    const [uniqueStreams, setUniqueStreams] = useState<GroupStream[]>([]);
    const [streamsByDevice, setStreamsByDevice] = useState<StreamsByDevice[]>([]);
    const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
    const [showGridViewer, setShowGridViewer] = useState(false);
    const [internalLoading, setInternalLoading] = useState(false);
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

    // 그룹의 모든 스트림 조회 (groupId가 있을 때만)
    const fetchGroupStreams = async () => {
        if (!groupId) return;
        
        setInternalLoading(true);
        setError(null);
        
        try {
            console.log(`📹 그룹 ${groupId}의 스트림 조회 중...`);
            
            const response = await fetch(`${API_BASE}/api/device-streams/group/${groupId}/streams`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            console.log('📡 그룹 스트림 조회 응답:', data);

            if (data.success) {
                setUniqueStreams(data.uniqueStreams);
                setStreamsByDevice(data.streamsByDevice);
                
                console.log(`✅ 그룹 ${group?.group_name}:`);
                console.log(`  - 고유 스트림: ${data.uniqueStreams.length}개`);
                console.log(`  - 연결된 장치: ${data.streamsByDevice.length}개`);
                
                // 스트림 개수에 따른 자동 뷰 모드 결정
                if (data.uniqueStreams.length === 1) {
                    setViewMode('single');
                    setSelectedStreamId(data.uniqueStreams[0].stream_id);
                } else if (data.uniqueStreams.length >= 2) {
                    setShowGridViewer(true);
                    setViewMode('grid');
                }
                
            } else {
                setError(data.error || '그룹 스트림 조회 실패');
            }
        } catch (error) {
            console.error('그룹 스트림 조회 실패:', error);
            setError('그룹 스트림 조회 중 오류가 발생했습니다.');
        } finally {
            setInternalLoading(false);
        }
    };

    // groupId가 있으면 새로운 로직, 없으면 기존 props 사용
    useEffect(() => {
        if (groupId) {
            fetchGroupStreams();
        } else {
            // 기존 props 기반 로직
            const processedStreams = groupStreams.map(stream => ({
                stream_id: stream.id || stream.stream_id,
                stream_name: stream.stream_name || stream.name,
                description: stream.description,
                rtsp_url: stream.rtsp_url,
                stream_active: stream.is_active || stream.stream_active,
                connected_devices: []
            }));
            
            setUniqueStreams(processedStreams);
            
            if (processedStreams.length === 1) {
                setViewMode('single');
                setSelectedStreamId(processedStreams[0].stream_id);
            } else if (processedStreams.length >= 2) {
                setShowGridViewer(true);
                setViewMode('grid');
            }
        }
    }, [groupId, groupStreams]);

    // 컨테이너 스타일
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

    const renderStreamSelector = () => (
        <div style={{
            backgroundColor: '#f8f9fa',
            padding: '12px 16px',
            borderBottom: '1px solid #dee2e6',
            flexShrink: 0
        }}>
            {/* 뷰 모드 선택 */}
            <div style={{ marginBottom: '12px' }}>
                <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '12px'
                }}>
                    🎛️ 보기 모드:
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => {
                            setViewMode('single');
                            setShowGridViewer(false);
                        }}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: viewMode === 'single' && !showGridViewer ? '#007bff' : 'white',
                            color: viewMode === 'single' && !showGridViewer ? 'white' : '#495057',
                            border: '1px solid #007bff',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}
                    >
                        🎥 단일 뷰
                    </button>
                    <button
                        onClick={() => setShowGridViewer(true)}
                        disabled={uniqueStreams.length === 0}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: showGridViewer ? '#28a745' : uniqueStreams.length === 0 ? '#6c757d' : 'white',
                            color: showGridViewer || uniqueStreams.length === 0 ? 'white' : '#495057',
                            border: `1px solid ${uniqueStreams.length === 0 ? '#6c757d' : '#28a745'}`,
                            borderRadius: '4px',
                            cursor: uniqueStreams.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '11px',
                            fontWeight: '500'
                        }}
                    >
                        📺 그리드 뷰 ({uniqueStreams.length}개)
                    </button>
                </div>
            </div>

            {/* 단일 뷰 모드일 때만 스트림 선택 표시 */}
            {viewMode === 'single' && !showGridViewer && (
                <div>
                    <label style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontWeight: '600',
                        color: '#495057',
                        fontSize: '12px'
                    }}>
                        📹 스트림 선택:
                    </label>
                    <select
                        value={selectedStreamId || ''}
                        onChange={(e) => setSelectedStreamId(Number(e.target.value))}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                    >
                        <option value="">스트림을 선택하세요</option>
                        {uniqueStreams.map(stream => (
                            <option key={stream.stream_id} value={stream.stream_id}>
                                📹 {stream.stream_name} 
                                {stream.connected_devices.length > 1 && 
                                    ` (${stream.connected_devices.length}개 장치에 연결됨)`
                                }
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );

    const isLoading = streamLoading || internalLoading;
    const currentStreams = groupId ? uniqueStreams : groupStreams;

    // 로딩 상태
    if (isLoading) {
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
                    {group ? `그룹 "${group.group_name}"의 스트림 로딩 중...` : '스트림 로딩 중...'}
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

    // 에러 상태
    if (error) {
        return (
            <div style={{
                ...containerStyle,
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #f5c6cb',
                textAlign: 'center',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️</div>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                    스트림 조회 오류
                </div>
                <div style={{ marginBottom: '15px' }}>{error}</div>
                <button
                    onClick={fetchGroupStreams}
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

    // 스트림이 있는 경우 - 새로운 로직 적용
    if (currentStreams.length > 0) {
        return (
            <div style={containerStyle}>
                {/* 컨트롤 패널 - 그리드 뷰가 아닐 때만 */}
                {!showGridViewer && renderStreamSelector()}
                
                {/* 뷰 모드별 컨텐츠 */}
                <div style={{ 
                    flex: 1,
                    overflow: 'hidden',
                    width: '100%',
                    minWidth: 0,
                    minHeight: 0
                }}>
                    {showGridViewer ? (
                        <ImprovedMultiGridViewer 
                            streams={uniqueStreams.map(stream => ({
                                id: stream.stream_id,
                                stream_name: stream.stream_name,
                                rtsp_url: stream.rtsp_url,
                                description: stream.description,
                                is_active: stream.stream_active,
                                created_at: ''
                            }))}
                            onClose={() => setShowGridViewer(false)}
                            maxWidth="100%"
                            maxHeight="100%"
                            showFilters={false}
                        />
                    ) : viewMode === 'single' && selectedStreamId ? (
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
                            textAlign: 'center',
                            flexDirection: 'column'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎥</div>
                            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
                                스트림을 선택하거나 그리드 뷰를 사용해보세요
                            </div>
                            <div style={{ fontSize: '14px' }}>
                                위에서 보기 모드를 선택할 수 있습니다
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    } 
    
    // 스트림이 없는 경우 - 기존 로직 유지
    else {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
                <div className="text-4xl mb-3">📹</div>
                <h3 className="text-lg font-medium mb-2">등록된 스트림이 없습니다</h3>
                <p className="text-sm text-center mb-4">
                    {group ? `${group.group_name} 그룹에 연결된 CCTV 스트림이 없습니다.` : '그룹에 연결된 CCTV 스트림이 없습니다.'}
                </p>
                <Link to="/device-setup" className="text-blue-600 hover:text-blue-800 text-sm underline">
                    스트림 관리하기
                </Link>
            </div>
        );
    }
};

export default StreamViewer;