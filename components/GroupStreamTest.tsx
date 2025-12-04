// components/GroupStreamTest.tsx
import React, { useState, useEffect } from 'react';
import GroupStreamViewer from './GroupStreamViewer';

interface Group {
    group_id: string;
    group_name: string;
    description?: string;
    color: string;
    created_at: string;
    device_ids: string[];
}

const GroupStreamTest: React.FC = () => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
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

    // 그룹 목록 조회
    const fetchGroups = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`${API_BASE}/api/devices/groups`, {
                headers: getAuthHeaders()
            });

            const data = await response.json();
            if (data.success) {
                setGroups(data.groups);
                console.log('👥 그룹 목록 로드:', data.groups);
            } else {
                setError(data.error || '그룹 목록 조회 실패');
            }
        } catch (error) {
            console.error('그룹 조회 실패:', error);
            setError('그룹 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups();
    }, []);

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
                    borderTop: '4px solid #28a745',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginRight: '16px'
                }} />
                그룹 목록 로딩 중...
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '30px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
                    👥 그룹별 스트림 테스트
                </h1>
                <p style={{ color: '#666', fontSize: '16px' }}>
                    장치 그룹을 선택하여 연결된 모든 카메라 스트림을 확인하세요
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

            <div style={{ display: 'grid', gap: '30px', gridTemplateColumns: selectedGroup ? '400px 1fr' : '1fr' }}>
                {/* 그룹 목록 */}
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
                        👥 내 장치 그룹 ({groups.length}개)
                    </h3>

                    {groups.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#6c757d'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                            <div>생성된 그룹이 없습니다.</div>
                            <div style={{ fontSize: '14px', marginTop: '8px' }}>
                                장치 관리에서 그룹을 생성해보세요.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {groups.map(group => {
                                const isSelected = selectedGroup?.group_id === group.group_id;
                                
                                return (
                                    <div
                                        key={group.group_id}
                                        onClick={() => setSelectedGroup(group)}
                                        style={{
                                            padding: '16px',
                                            border: `2px solid ${isSelected ? '#28a745' : '#e9ecef'}`,
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#f0f8f0' : 'white',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = '#28a745';
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
                                            alignItems: 'center',
                                            marginBottom: '8px'
                                        }}>
                                            <div 
                                                style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    backgroundColor: group.color,
                                                    borderRadius: '50%',
                                                    marginRight: '12px'
                                                }}
                                            />
                                            <div style={{
                                                fontWeight: '600',
                                                fontSize: '16px',
                                                color: '#343a40',
                                                flex: 1
                                            }}>
                                                {group.group_name}
                                            </div>
                                            <div style={{
                                                backgroundColor: '#e9ecef',
                                                color: '#495057',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: '600'
                                            }}>
                                                {group.device_ids?.length || 0}개 장치
                                            </div>
                                        </div>
                                        
                                        {group.description && (
                                            <div style={{
                                                fontSize: '14px',
                                                color: '#6c757d',
                                                marginBottom: '8px'
                                            }}>
                                                {group.description}
                                            </div>
                                        )}
                                        
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#adb5bd',
                                            fontFamily: 'monospace'
                                        }}>
                                            생성일: {new Date(group.created_at).toLocaleDateString('ko-KR')}
                                        </div>
                                        
                                        {isSelected && (
                                            <div style={{
                                                marginTop: '12px',
                                                padding: '8px',
                                                backgroundColor: '#d4edda',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                color: '#155724',
                                                fontWeight: '500'
                                            }}>
                                                👆 선택됨 - 오른쪽에서 그룹 스트림을 확인하세요
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 선택된 그룹의 스트림 뷰어 */}
                {selectedGroup && (
                    <div>
                        <GroupStreamViewer
                            groupId={selectedGroup.group_id}
                            groupName={selectedGroup.group_name}
                            onClose={() => setSelectedGroup(null)}
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

export default GroupStreamTest;