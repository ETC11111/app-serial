// components/GroupSensorDashboard/GroupSensorDashboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Device } from '../types/device.types';

// GroupSensorDashboardContent 컴포넌트 import
import { GroupSensorDashboardContent } from '../components/home/GroupSensorDashboardContent';

// 커스텀 훅들
import { useGroupSensorData } from '../hooks/useGroupSensorData';
import { useWeatherData } from '../hooks/useWeatherData';

const GroupSensorDashboard: React.FC = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const [isMobile, setIsMobile] = useState(false);

    // 기존 그룹 센서 데이터 훅 사용
    const {
        group,
        devices,
        deviceSensorData,
        loading,
        error,
        fetchGroupData,
    } = useGroupSensorData(groupId);

    // 날씨 데이터 훅 - 올바른 함수명 사용
    const {
        weatherData,
        weatherLoading,
        weatherError,
        weatherForecast,
        selectedRegion,
        refreshWeather,
        changeRegion
    } = useWeatherData();

    // 디바이스 상태 함수들 - deviceSensorData 타입을 올바르게 처리
    const getDeviceStatus = useMemo(() => {
        return (device: Device): 'online' | 'offline' | 'pending' => {
            if (!device || !deviceSensorData) return 'offline';
            
            // deviceSensorData가 배열인지 확인하고 해당 디바이스 찾기
            const deviceData = deviceSensorData.find(d => d.device.device_id === device.device_id);
            
            if (deviceData && deviceData.sensorData && deviceData.isOnline) {
                return 'online';
            }
            
            return 'offline';
        };
    }, [devices, deviceSensorData]);

    const isDeviceOnline = useMemo(() => {
        return (device: Device): boolean => {
            return getDeviceStatus(device) === 'online';
        };
    }, [getDeviceStatus]);

    const getLastConnectedTime = useMemo(() => {
        return (device: Device): string | null => {
            if (!device || !deviceSensorData) return null;
            
            // device.last_seen_at이 있으면 사용
            if (device.last_seen_at) {
                return new Date(device.last_seen_at).toLocaleString('ko-KR');
            }
            
            // deviceSensorData에서 해당 디바이스의 센서 데이터 찾기
            const deviceData = deviceSensorData.find(d => d.device.device_id === device.device_id);
            if (deviceData && deviceData.sensorData && deviceData.sensorData.timestamp) {
                return new Date(deviceData.sensorData.timestamp).toLocaleString('ko-KR');
            }
            
            return null;
        };
    }, [devices, deviceSensorData]);

    // 모바일 감지
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // GroupSensorDashboardContent에 전달할 그룹 디바이스 변환 - 타입 호환성 수정
    const groupDevices = useMemo((): Device[] => {
        return devices.map(device => ({
            ...device, // 원본 device 속성들 유지
            status: getDeviceStatus(device), // 올바른 타입으로 반환
            last_seen: new Date().toISOString(),
        }));
    }, [devices, getDeviceStatus]);

    // 선택된 그룹 객체 변환
    const selectedGroup = useMemo(() => {
        if (!group) return null;
        return {
            group_id: group.group_id,
            group_name: group.group_name,
            description: group.description || '',
            created_at: group.created_at || new Date().toISOString(),
        };
    }, [group]);

    // 날씨 관련 핸들러 - 올바른 함수 호출
    const handleWeatherRefresh = () => {
        refreshWeather(); // refreshWeather는 매개변수 없이 호출
    };

    const handleRegionChange = (region: string) => {
        changeRegion(region); // changeRegion 함수 사용
    };

    // 그룹 ID가 없는 경우
    if (!groupId) {
        return (
            <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
                <div className="flex items-center justify-center min-h-96">
                    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
                        <div className="text-6xl mb-4">❌</div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">그룹 ID가 없습니다</h2>
                        <p className="text-gray-600 mb-4">유효한 그룹 ID가 필요합니다.</p>
                        <Link to="/devices" className="inline-block w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                            ← 장치 목록으로
                        </Link>
                    </div>
                </div>
            </Layout>
        );
    }

    // 로딩 상태
    if (loading) {
        return (
            <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
                <div className="flex items-center justify-center min-h-96">
                    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <h2 className="text-xl font-semibold text-gray-700">그룹 센서 데이터 로딩 중...</h2>
                        <p className="text-gray-500 mt-2">디바이스 연결을 확인하고 있습니다.</p>
                    </div>
                </div>
            </Layout>
        );
    }

    // 에러 상태
    if (error || !group || !selectedGroup) {
        return (
            <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <div className="text-6xl mb-4">⚠️</div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">그룹 로딩 오류</h2>
                        <p className="text-gray-600 mb-4">{error || '그룹 정보를 찾을 수 없습니다.'}</p>
                        <div className="space-y-2">
                            <button onClick={fetchGroupData} className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                                🔄 다시 시도
                            </button>
                            <Link to="/devices" className="block w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
                                ← 장치 목록으로
                            </Link>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
            <GroupSensorDashboardContent
                selectedGroup={selectedGroup}
                groupDevices={groupDevices}
                isMobile={isMobile}
                weatherData={weatherData}
                weatherLoading={weatherLoading}
                weatherError={weatherError}
                weatherForecast={weatherForecast}
                selectedRegion={selectedRegion}
                onWeatherRefresh={handleWeatherRefresh}
                onRegionChange={handleRegionChange}
                devices={devices}
                getDeviceStatus={getDeviceStatus}
                isDeviceOnline={isDeviceOnline}
                getLastConnectedTime={getLastConnectedTime}
            />
        </Layout>
    );
};

export default GroupSensorDashboard;