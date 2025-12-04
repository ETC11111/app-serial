// components/StreamList.tsx
import React from 'react';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

interface StreamStatus {
    id: number;
    name: string;
    status: 'stopped' | 'starting' | 'running' | 'error' | 'restarting';
    isRunning: boolean;
    playlistExists: boolean;
}

interface StreamListProps {
    streams: Stream[];
    streamStatuses: StreamStatus[];
    selectedStreamId: number | null;
    onSelectStream: (streamId: number) => void;
    onDeleteStream: (streamId: number) => void;
    onRefresh: () => void;
}

const StreamList: React.FC<StreamListProps> = ({
    streams,
    streamStatuses,
    selectedStreamId,
    onSelectStream,
    onDeleteStream,
    onRefresh
}) => {
    const getStreamStatus = (streamId: number) => {
        return streamStatuses.find(s => s.id === streamId);
    };

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

    if (streams.length === 0) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '2px dashed #dee2e6'
            }}>
                <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'center' }}>
                    <img
                        src="/cctv.png"
                        alt="카메라 아이콘"
                        style={{ width: '48px', height: '48px' }}
                    />
                </div>
                <h3 style={{ margin: '0 0 10px 0', color: '#6c757d' }}>
                    등록된 스트림이 없습니다
                </h3>
                <p style={{ margin: 0, color: '#adb5bd' }}>
                    '스트림 추가' 버튼을 클릭하여 RTSP 스트림을 추가해보세요
                </p>
            </div>
        );
    }

    return (
        <div>
            <h3 style={{
                margin: '0 0 15px 0',
                color: '#495057',
                fontSize: '18px',
                fontWeight: '600'
            }}>
                📋 내 스트림 목록 ({streams.length}개)
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {streams.map(stream => {
                    const status = getStreamStatus(stream.id);
                    const isSelected = selectedStreamId === stream.id;

                    return (
                        <div
                            key={stream.id}
                            style={{
                                border: `2px solid ${isSelected ? '#007bff' : '#dee2e6'}`,
                                borderRadius: '8px',
                                padding: '16px',
                                backgroundColor: isSelected ? '#f8f9fa' : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: isSelected ? '0 4px 12px rgba(0, 123, 255, 0.15)' : '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                            onClick={() => onSelectStream(stream.id)}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: '10px'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{
                                        margin: '0 0 5px 0',
                                        color: '#343a40',
                                        fontSize: '16px',
                                        fontWeight: '600'
                                    }}>
                                        {stream.stream_name}
                                    </h4>
                                    {stream.description && (
                                        <p style={{
                                            margin: '0 0 8px 0',
                                            color: '#6c757d',
                                            fontSize: '14px'
                                        }}>
                                            {stream.description}
                                        </p>
                                    )}
                                    <code style={{
                                        display: 'block',
                                        fontSize: '12px',
                                        color: '#495057',
                                        backgroundColor: '#e9ecef',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        wordBreak: 'break-all'
                                    }}>
                                        {stream.rtsp_url}
                                    </code>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteStream(stream.id);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: '1px solid #dc3545',
                                        color: '#dc3545',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        marginLeft: '10px'
                                    }}
                                    title="스트림 삭제"
                                >
                                    🗑️
                                </button>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        backgroundColor: getStatusColor(status?.status || 'stopped'),
                                        color: 'white',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: '600'
                                    }}>
                                        {getStatusText(status?.status || 'stopped')}
                                    </span>

                                    {status?.isRunning && (
                                        <span style={{
                                            color: '#28a745',
                                            fontSize: '12px',
                                            fontWeight: '500'
                                        }}>
                                            ● 라이브
                                        </span>
                                    )}
                                </div>

                                <span style={{
                                    fontSize: '12px',
                                    color: '#adb5bd'
                                }}>
                                    ID: {stream.id}
                                </span>
                            </div>

                            {isSelected && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '8px',
                                    backgroundColor: '#e3f2fd',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    color: '#1976d2',
                                    fontWeight: '500'
                                }}>
                                    👆 선택됨 - 오른쪽에서 스트림을 시청하세요
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default StreamList;