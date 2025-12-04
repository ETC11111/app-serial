// components/StreamDiagnostics.tsx
import React, { useState } from 'react';

interface StreamDiagnosticsProps {
    streamId: number;
    onClose: () => void;
}

interface DiagnosisResult {
    streamId: number;
    streamName: string;
    rtspUrl: string;
    format?: any;
    streams?: any[];
    recommendations: string[];
    error?: string;
}

const StreamDiagnostics: React.FC<StreamDiagnosticsProps> = ({ streamId, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const getAuthToken = () => {
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

    const runDiagnosis = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/stream/diagnose/${streamId}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            if (data.success || data.diagnosis) {
                setDiagnosis(data.diagnosis);
            } else {
                setDiagnosis({
                    streamId,
                    streamName: '알 수 없음',
                    rtspUrl: '알 수 없음',
                    error: data.error,
                    recommendations: ['진단에 실패했습니다.']
                });
            }
        } catch (err: any) {
            setDiagnosis({
                streamId,
                streamName: '알 수 없음',
                rtspUrl: '알 수 없음',
                error: err.message,
                recommendations: ['네트워크 오류가 발생했습니다.']
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80%',
                overflow: 'auto',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}>
                    <h2 style={{ margin: 0, color: '#343a40' }}>
                        🔍 스트림 진단 (ID: {streamId})
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: '1px solid #dc3545',
                            color: '#dc3545',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            cursor: 'pointer'
                        }}
                    >
                        ✕ 닫기
                    </button>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <button
                        onClick={runDiagnosis}
                        disabled={loading}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: loading ? '#6c757d' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        {loading ? '🔄 진단 중...' : '🚀 진단 시작'}
                    </button>
                </div>

                {diagnosis && (
                    <div>
                        <div style={{
                            backgroundColor: '#f8f9fa',
                            border: '1px solid #dee2e6',
                            borderRadius: '6px',
                            padding: '16px',
                            marginBottom: '16px'
                        }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>기본 정보</h4>
                            <p><strong>스트림 이름:</strong> {diagnosis.streamName}</p>
                            <p><strong>RTSP URL:</strong> <code>{diagnosis.rtspUrl}</code></p>
                        </div>

                        {diagnosis.error ? (
                            <div style={{
                                backgroundColor: '#f8d7da',
                                border: '1px solid #f5c6cb',
                                borderRadius: '6px',
                                padding: '16px',
                                marginBottom: '16px'
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', color: '#721c24' }}>❌ 오류</h4>
                                <p style={{ color: '#721c24' }}>{diagnosis.error}</p>
                            </div>
                        ) : (
                            <>
                                {diagnosis.format && (
                                    <div style={{
                                        backgroundColor: '#d4edda',
                                        border: '1px solid #c3e6cb',
                                        borderRadius: '6px',
                                        padding: '16px',
                                        marginBottom: '16px'
                                    }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: '#155724' }}>✅ 포맷 정보</h4>
                                        <p><strong>컨테이너:</strong> {diagnosis.format.format_name}</p>
                                        <p><strong>총 시간:</strong> {diagnosis.format.duration || 'N/A'}</p>
                                        <p><strong>비트레이트:</strong> {diagnosis.format.bit_rate || 'N/A'}</p>
                                    </div>
                                )}

                                {diagnosis.streams && diagnosis.streams.length > 0 && (
                                    <div style={{
                                        backgroundColor: '#d1ecf1',
                                        border: '1px solid #bee5eb',
                                        borderRadius: '6px',
                                        padding: '16px',
                                        marginBottom: '16px'
                                    }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: '#0c5460' }}>📊 스트림 정보</h4>
                                        {diagnosis.streams.map((stream, index) => (
                                            <div key={index} style={{ marginBottom: '12px' }}>
                                                <strong>{stream.codec_type.toUpperCase()} #{index}:</strong>
                                                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                                    <li>코덱: {stream.codec_name}</li>
                                                    {stream.codec_type === 'video' && (
                                                        <>
                                                            <li>해상도: {stream.width}x{stream.height}</li>
                                                            <li>프레임레이트: {stream.r_frame_rate}</li>
                                                            <li>픽셀 포맷: {stream.pix_fmt}</li>
                                                        </>
                                                    )}
                                                    {stream.codec_type === 'audio' && (
                                                        <>
                                                            <li>채널: {stream.channels}</li>
                                                            <li>샘플레이트: {stream.sample_rate}</li>
                                                        </>
                                                    )}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        <div style={{
                            backgroundColor: '#fff3cd',
                            border: '1px solid #ffeeba',
                            borderRadius: '6px',
                            padding: '16px'
                        }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#856404' }}>💡 권장사항</h4>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                {diagnosis.recommendations.map((rec, index) => (
                                    <li key={index} style={{ color: '#856404' }}>{rec}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StreamDiagnostics;