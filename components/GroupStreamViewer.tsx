// components/GroupStreamViewer.tsx - CCTV 화면만 표시하도록 수정
import React, { useState, useEffect } from 'react';
import MultiStreamViewer from './MultiStreamViewer';
import ImprovedMultiGridViewer from './ImprovedMultiGridViewer';

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

interface GroupStreamViewerProps {
    groupId: string;
    groupName: string;
    onClose?: () => void;
}

const GroupStreamViewer: React.FC<GroupStreamViewerProps> = ({
    groupId,
    groupName,
    onClose
}) => {
    const [uniqueStreams, setUniqueStreams] = useState<GroupStream[]>([]);
    const [streamsByDevice, setStreamsByDevice] = useState<StreamsByDevice[]>([]);
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

    // 그룹의 모든 스트림 조회
    const fetchGroupStreams = async () => {
        setLoading(true);
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

                console.log(`✅ 그룹 ${groupName}:`);
                console.log(`  - 고유 스트림: ${data.uniqueStreams.length}개`);
                console.log(`  - 연결된 장치: ${data.streamsByDevice.length}개`);
                console.log(`  - 총 연결: ${data.totalConnections}개`);

            } else {
                setError(data.error || '그룹 스트림 조회 실패');
            }
        } catch (error) {
            console.error('그룹 스트림 조회 실패:', error);
            setError('그룹 스트림 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroupStreams();
    }, [groupId]);

    // 🔥 완전한 컨테이너 스타일 - CCTV 화면만 표시
    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        position: 'relative'
    };

    // 로딩 상태
    if (loading) {
        return (
            <div style={{
                ...containerStyle,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        border: '3px solid #e9ecef',
                        borderTop: '3px solid #007bff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <div style={{
                        fontSize: '14px',
                        color: '#6c757d',
                        textAlign: 'center'
                    }}>
                        CCTV 로딩 중...
                    </div>
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
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ffffff',
                color: '#6c757d'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'center',
                    padding: '20px'
                }}>
                    <div style={{ fontSize: '32px' }}>⚠️</div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>
                        스트림 연결 오류
                    </div>
                    <div style={{ fontSize: '12px' }}>
                        {error}
                    </div>
                    <button
                        onClick={fetchGroupStreams}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        <img
                            src="/refresh.png"
                            alt="다시 시도"
                            style={{ width: '16px', height: '16px', marginRight: '6px' }}
                        />
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    // 스트림이 없는 경우
    if (uniqueStreams.length === 0) {
        return (
            <div style={{
                ...containerStyle,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ffffff',
                color: '#6c757d'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'center',
                    padding: '20px'
                }}>
                    <div style={{ fontSize: '32px' }}>📹</div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>
                        연결된 CCTV가 없습니다
                    </div>
                    <div style={{ fontSize: '12px' }}>
                        그룹에 연결된 카메라 스트림이 없습니다
                    </div>
                </div>
            </div>
        );
    }

    // 🔥 CCTV 화면만 표시 - 컨트롤 패널 및 헤더 제거
    return (
        <div style={containerStyle}>
            {/* 스트림 개수에 따른 자동 뷰 결정 */}
            {uniqueStreams.length === 1 ? (
                // 단일 스트림: MultiStreamViewer 사용
                <MultiStreamViewer
                    streamId={uniqueStreams[0].stream_id}
                    onClose={onClose || (() => { })}
                />
            ) : (
                // 다중 스트림: ImprovedMultiGridViewer 사용
                <ImprovedMultiGridViewer
                    streams={uniqueStreams.map(stream => ({
                        id: stream.stream_id,
                        stream_name: stream.stream_name,
                        rtsp_url: stream.rtsp_url,
                        description: stream.description,
                        is_active: stream.stream_active,
                        created_at: ''
                    }))}
                    onClose={onClose || (() => { })}
                    maxWidth="100%"
                    maxHeight="100%"
                    showFilters={false}  // 필터 숨기기
                />
            )}
        </div>
    );
};

export default GroupStreamViewer;