// components/DeviceStreamTest.tsx
import React, { useState, useEffect } from 'react';
import DeviceStreamViewer from './DeviceStreamViewer';

interface Device {
    device_id: string;
    device_name: string;
    admin_name?: string;
    device_location?: string;
    last_seen_at?: string;
    is_favorite: boolean;
}

const DeviceStreamTest: React.FC = () => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
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

    // 장치 목록 조회
    const fetchDevices = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`${API_BASE}/api/devices/with-favorites`, {
                headers: getAuthHeaders()
            });

            const data = await response.json();
            if (data.success) {
                setDevices(data.devices);
                console.log('📱 장치 목록 로드:', data.devices);
            } else {
                setError(data.error || '장치 목록 조회 실패');
            }
        } catch (error) {
            console.error('장치 조회 실패:', error);
            setError('장치 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, []);

    const getDeviceStatus = (lastSeenAt?: string) => {
        if (!lastSeenAt) return { text: '알 수 없음', color: '#6c757d' };
        
        const now = new Date();
        const lastSeen = new Date(lastSeenAt);
        const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
        
        if (diffMinutes <= 5) {
            return { text: '온라인', color: '#28a745' };
        } else if (diffMinutes <= 30) {
            return { text: '최근 활동', color: '#ffc107' };
        } else {
            return { text: '오프라인', color: '#dc3545' };
        }
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '60px',
                fontSize: '16px',
                color: '#495057'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #007bff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginRight: '16px'
                }} />
                장치 목록 로딩 중...
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '30px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                    🎥 장치별 스트림 테스트
                </h1>
                <p style={{ color: '#666', fontSize: '16px' }}>
                    장치를 선택하여 연결된 카메라 스트림을 확인하세요
                </p>
            </div>

            {error && (
                <div style={{
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    border: '1px solid #f5c6cb'
                }}>
                    ⚠️ {error}
                </div>
            )}

            <div style={{ display: 'grid', gap: '30px', gridTemplateColumns: selectedDevice ? '400px 1fr' : '1fr' }}>
                {/* 장치 목록 */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '24px',
                    borderRadius: '12px',
                    border: '1px solid #dee2e6',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <h3 style={{ 
                        margin: '0 0 20px 0', 
                        fontSize: '20px', 
                        fontWeight: '600',
                        color: '#495057'
                    }}>
                        📱 내 장치 목록 ({devices.length}개)
                    </h3>

                    {devices.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#6c757d'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
                            <div>등록된 장치가 없습니다.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {devices.map(device => {
                                const status = getDeviceStatus(device.last_seen_at);
                                const isSelected = selectedDevice?.device_id === device.device_id;
                                
                                return (
                                    <div
                                        key={device.device_id}
                                        onClick={() => setSelectedDevice(device)}
                                        style={{
                                            padding: '16px',
                                            border: `2px solid ${isSelected ? '#007bff' : '#e9ecef'}`,
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#f0f8ff' : 'white',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = '#007bff';
                                                e.currentTarget.style.backgroundColor = '#f8f9fa';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = '#e9ecef';
                                                e.currentTarget.style.backgroundColor = 'white';
                                            }
                                        }}
                                    >
                                        <div style={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontWeight: '600',
                                                    fontSize: '16px',
                                                    color: '#343a40',
                                                    marginBottom: '4px'
                                                }}>
                                                    {device.is_favorite && '⭐ '}
                                                    {device.device_name}
                                                </div>
                                                {device.device_location && (
                                                    <div style={{
                                                        fontSize: '14px',
                                                        color: '#6c757d',
                                                        marginBottom: '4px'
                                                    }}>
                                                        📍 {device.device_location}
                                                    </div>
                                                )}
                                                {device.admin_name && (
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: '#6c757d'
                                                    }}>
                                                        👤 {device.admin_name}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div style={{
                                                padding: '4px 8px',
                                                backgroundColor: status.color,
                                                color: 'white',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: '600'
                                            }}>
                                                {status.text}
                                            </div>
                                        </div>
                                        
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#adb5bd',
                                            fontFamily: 'monospace'
                                        }}>
                                            ID: {device.device_id}
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
                                                👆 선택됨 - 오른쪽에서 스트림을 확인하세요
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 선택된 장치의 스트림 뷰어 */}
                {selectedDevice && (
                    <div>
                        <DeviceStreamViewer
                            deviceId={selectedDevice.device_id}
                            deviceName={selectedDevice.device_name}
                            onClose={() => setSelectedDevice(null)}
                        />
                    </div>
                )}
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
};

export default DeviceStreamTest;