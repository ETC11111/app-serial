// hooks/useStreamData.ts
import { useState, useEffect } from 'react';
import { Device } from '../types/device.types';

export const useStreamData = (groupId: string | undefined, devices: Device[]) => {
    const [groupStreams, setGroupStreams] = useState([]);
    const [streamLoading, setStreamLoading] = useState(false);

    // API 헤더
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

    // 스트림 데이터 조회
    const fetchGroupStreams = async () => {
        if (!groupId) return;
        
        setStreamLoading(true);
        console.log('🎥 그룹 스트림 조회 시작 - groupId:', groupId);
        
        try {
            const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
            
            // 그룹 스트림 API 시도
            const groupUrl = `${API_BASE}/api/groups/${groupId}/streams`;
            let response = await fetch(groupUrl, {
                headers: getAuthHeaders()
            });
            
            let data = await response.json();
            
            if (data.success && data.streams && data.streams.length > 0) {
                console.log('✅ 그룹 스트림 발견:', data.streams.length + '개');
                setGroupStreams(data.streams);
            } else {
                console.log('❌ 그룹 스트림 없음, 전체 스트림 조회');
                
                // 전체 스트림 조회
                const allStreamsUrl = `${API_BASE}/api/stream-devices`;
                response = await fetch(allStreamsUrl, {
                    headers: getAuthHeaders()
                });
                
                data = await response.json();
                
                if (data.success && data.streams) {
                    console.log('⚠️ 스트림에 device_id가 없어서 모든 스트림을 표시합니다');
                    setGroupStreams(data.streams);
                } else {
                    setGroupStreams([]);
                }
            }
        } catch (error) {
            console.error('🎥 스트림 조회 실패:', error);
            setGroupStreams([]);
        } finally {
            setStreamLoading(false);
        }
    };

    useEffect(() => {
        if (groupId && devices.length > 0) {
            fetchGroupStreams();
        }
    }, [groupId, devices]);

    return {
        groupStreams,
        streamLoading,
        fetchGroupStreams
    };
};