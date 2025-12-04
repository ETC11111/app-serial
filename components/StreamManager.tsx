// components/StreamManager.tsx
import React, { useEffect, useState } from 'react';
import StreamList from './StreamList';
import AddStreamForm from './AddStreamForm';
import MultiStreamViewer from './MultiStreamViewer';
import MultiGridViewer from './MultiGridViewer';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface StreamStatus {
    id: number;
    name: string;
    description?: string;
    status: 'stopped' | 'starting' | 'running' | 'error' | 'restarting';
    isRunning: boolean;
    playlistExists: boolean;
    playlistUrl: string | null;
    createdAt: string;
}

const StreamManager: React.FC = () => {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [streamStatuses, setStreamStatuses] = useState<StreamStatus[]>([]);
    const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showGridViewer, setShowGridViewer] = useState(false);


    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    // 인증 토큰 가져오기 (쿠키 또는 localStorage에서)
    const getAuthToken = () => {
        // 쿠키에서 accessToken 가져오기
        const token = document.cookie
            .split('; ')
            .find(row => row.startsWith('accessToken='))
            ?.split('=')[1];
        
        // 또는 localStorage에서 가져오기
        return token || localStorage.getItem('accessToken');
    };

    // API 요청 헤더
    const getAuthHeaders = () => {
        const token = getAuthToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    // 스트림 목록 조회
    const fetchStreams = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/api/stream-devices`, {
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                setStreams(data.streams);
                console.log('📋 스트림 목록 로드됨:', data.streams);
            } else {
                setError(data.error || '스트림 목록 조회 실패');
            }
        } catch (err: any) {
            console.error('스트림 목록 조회 오류:', err);
            setError(`스트림 목록 조회 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // 스트림 상태 조회
    const fetchStreamStatuses = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stream/status`, {
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                setStreamStatuses(data.streams);
                console.log('📊 스트림 상태 로드됨:', data.streams);
            }
        } catch (err: any) {
            console.error('스트림 상태 조회 오류:', err);
        }
    };

    // 스트림 삭제
    const handleDeleteStream = async (streamId: number) => {
        if (!confirm('정말로 이 스트림을 삭제하시겠습니까?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/stream-devices/${streamId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            const data = await response.json();
            if (data.success) {
                alert('스트림이 삭제되었습니다.');
                fetchStreams();
                fetchStreamStatuses();
                if (selectedStreamId === streamId) {
                    setSelectedStreamId(null);
                }
            } else {
                alert(`삭제 실패: ${data.error}`);
            }
        } catch (err: any) {
            console.error('스트림 삭제 오류:', err);
            alert(`삭제 실패: ${err.message}`);
        }
    };

    // 초기 로드
    useEffect(() => {
        fetchStreams();
        fetchStreamStatuses();

        // 주기적으로 상태 업데이트 (5초마다)
        const interval = setInterval(fetchStreamStatuses, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ 
                marginBottom: '30px', 
                paddingBottom: '20px', 
                borderBottom: '2px solid #dee2e6' 
            }}>
                <h1 style={{ 
                    margin: '0 0 10px 0', 
                    color: '#343a40',
                    fontSize: '28px',
                    fontWeight: '700'
                }}>
                    🎥 스트림 관리 대시보드
                </h1>
                <p style={{ 
                    margin: 0, 
                    color: '#6c757d',
                    fontSize: '16px'
                }}>
                    RTSP 스트림을 추가하고 관리하세요
                </p>
            </div>

            {error && (
                <div style={{
                    color: '#721c24',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span style={{ fontSize: '20px' }}>⚠️</span>
                    <span style={{ fontWeight: '500' }}>{error}</span>
                    <button 
                        onClick={() => setError(null)}
                        style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            cursor: 'pointer',
                            color: '#721c24'
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            <div style={{
                display: 'grid',
                gap: '30px',
                gridTemplateColumns: selectedStreamId ? '400px 1fr' : '1fr',
                alignItems: 'start'
            }}>
                {/* 스트림 목록 및 제어 패널 */}
                <div>
                    <div style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '20px',
                        flexWrap: 'wrap'
                    }}>
                        <button
                            onClick={() => setShowAddForm(!showAddForm)}
                            style={{
                                padding: '12px 20px',
                                backgroundColor: showAddForm ? '#dc3545' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '14px'
                            }}
                        >
                            {showAddForm ? '❌ 취소' : '➕ 스트림 추가'}
                        </button>

                        <button
                            onClick={() => {
                                fetchStreams();
                                fetchStreamStatuses();
                            }}
                            disabled={loading}
                            style={{
                                padding: '12px 20px',
                                backgroundColor: loading ? '#6c757d' : '#17a2b8',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px'
                            }}
                        >
                            {loading ? '🔄 로딩 중...' : '🔍 새로고침'}
                        </button>
                        // 버튼 추가 (스트림 목록 제어 패널에)
                        <button
                            onClick={() => setShowGridViewer(true)}
                            disabled={streams.length === 0}
                            style={{
                                padding: '12px 20px',
                                backgroundColor: streams.length === 0 ? '#6c757d' : '#6f42c1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: streams.length === 0 ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px'
                            }}
                        >
                            📺 그리드 뷰어
                        </button>
                    </div>

                    {/* 스트림 추가 폼 */}
                    {showAddForm && (
                        <AddStreamForm
                            onSuccess={() => {
                                setShowAddForm(false);
                                fetchStreams();
                                fetchStreamStatuses();
                            }}
                            onCancel={() => setShowAddForm(false)}
                        />
                    )}

                    {/* 스트림 목록 */}
                    <StreamList
                        streams={streams}
                        streamStatuses={streamStatuses}
                        selectedStreamId={selectedStreamId}
                        onSelectStream={setSelectedStreamId}
                        onDeleteStream={handleDeleteStream}
                        onRefresh={() => {
                            fetchStreams();
                            fetchStreamStatuses();
                        }}
                    />
                </div>

                {/* 스트림 뷰어 */}
                {selectedStreamId && (
                    <div>
                        <MultiStreamViewer 
                            streamId={selectedStreamId}
                            onClose={() => setSelectedStreamId(null)}
                        />
                    </div>
                )}

                // 그리드 뷰어 모달 추가 (컴포넌트 하단에)
                {showGridViewer && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}>
                        <div style={{ width: '95%', height: '95%', maxWidth: '1400px' }}>
                            <MultiGridViewer
                                streams={streams}
                                onClose={() => setShowGridViewer(false)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StreamManager;