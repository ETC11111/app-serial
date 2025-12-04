// contexts/DeviceContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Device, DeviceStats } from '../types/device.types';
import { FlexibleSensorData } from '../types/sensor.types';

// DeviceContext 타입 정의
export interface DeviceContextType {
  devices: Device[];
  deviceStats: DeviceStats;
  loading: boolean;
  error: string | null;
  refreshDevices: () => Promise<void>;
  toggleFavorite: (deviceId: string) => Promise<boolean>;
  favoriteTogglingDevices: Set<string>;
  clearError: () => void;
  deviceLatestDataMap: Record<string, FlexibleSensorData | null>;
}
import { deviceService } from '../services/deviceService';
import { mqttService } from '../services/mqttService';

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStats>({
    total: 0,
    online: 0,
    favorites: 0
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null); // error 상태 추가
  const [favoriteTogglingDevices, setFavoriteTogglingDevices] = useState<Set<string>>(new Set());
  const [deviceLatestDataMap, setDeviceLatestDataMap] = useState<Record<string, FlexibleSensorData | null>>({});

  // 실시간 센서 데이터 수집
  const fetchAllDeviceSensorData = useCallback(async (deviceList: Device[]): Promise<Record<string, FlexibleSensorData | null>> => {
    const dataMap: Record<string, FlexibleSensorData | null> = {};
    
    // 모든 장치의 센서 데이터를 병렬로 수집
    const promises = deviceList.map(async (device) => {
      try {
        const result = await mqttService.getRealtimeSensorData(device.device_id);
        // 🔥 404 에러는 정상적인 상황 (센서 데이터 없음)이므로 조용히 처리
        if (result.success && result.data) {
          dataMap[device.device_id] = result.data;
        } else {
          // 404 에러는 로그를 남기지 않음 (정상적인 상황)
          if (result.error !== '센서 데이터 없음') {
            console.warn(`장치 ${device.device_name} 센서 데이터 수집 실패:`, result.error);
          }
          dataMap[device.device_id] = null;
        }
      } catch (error) {
        // 🔥 404 에러가 아닌 경우에만 경고 로그 출력
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('404') && !errorMessage.includes('센서 데이터 없음')) {
          console.warn(`장치 ${device.device_name} 센서 데이터 수집 실패:`, error);
        }
        dataMap[device.device_id] = null;
      }
    });
    
    await Promise.all(promises);
    setDeviceLatestDataMap(dataMap);
    return dataMap; // 🔥 데이터 맵을 반환하여 즉시 사용 가능하도록 함
  }, []);

  const refreshDevices = async (showLoading: boolean = true): Promise<void> => {
    try {
      // 🔥 수동 새로고침일 때만 로딩 상태 표시
      if (showLoading) {
        setLoading(true);
      }
      setError(null); // 에러 상태 초기화
      
      const result = await deviceService.getDevicesWithFavorites();
      
      if (result.success) {
        const { devices = [], stats = { total: 0, online: 0, favorites: 0 } } = result;
        const devicesList = Array.isArray(devices) ? devices : [];
        
        setDevices(devicesList);
        setDeviceStats(stats);
        setError(null); // 성공 시 에러 상태 클리어
        
        // 실시간 센서 데이터 수집
        await fetchAllDeviceSensorData(devicesList);
      } else {
        const errorMessage = result.error || '장치 데이터를 불러올 수 없습니다.';
        setError(errorMessage); // 에러 상태 설정
        setDevices([]);
        setDeviceStats({ total: 0, online: 0, favorites: 0 });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage); // 에러 상태 설정
      setDevices([]);
      setDeviceStats({ total: 0, online: 0, favorites: 0 });
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const toggleFavorite = async (deviceId: string): Promise<boolean> => {
    if (favoriteTogglingDevices.has(deviceId)) {
      // console.log('⚠️ DeviceContext: 이미 처리 중인 디바이스:', deviceId);
      return false;
    }

    try {
      setFavoriteTogglingDevices(prev => new Set([...prev, deviceId]));
      
      // console.log('🔄 DeviceContext: 즐겨찾기 토글 중...', deviceId);
      const result = await deviceService.toggleDeviceFavorite(deviceId);
      
      if (result.success) {
        // 즉시 로컬 상태 업데이트
        setDevices(prevDevices => {
          const updatedDevices = prevDevices.map(device => 
            device.device_id === deviceId 
              ? { ...device, is_favorite: result.isFavorite }
              : device
          );
          
          // 통계도 즉시 업데이트
          const newFavoriteCount = updatedDevices.filter(d => d.is_favorite).length;
          setDeviceStats(prev => ({
            ...prev,
            favorites: newFavoriteCount
          }));
          
          return updatedDevices;
        });
        
        // console.log(`✅ DeviceContext: 즐겨찾기 ${result.isFavorite ? '추가' : '제거'} 완료:`, deviceId);
        return true;
      } else {
        // console.error('🔥 DeviceContext: 즐겨찾기 토글 실패:', result.error);
        return false;
      }
    } catch (error) {
      // console.error('DeviceContext: 즐겨찾기 토글 오류:', error);
      return false;
    } finally {
      setFavoriteTogglingDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
    }
  };

  // 에러 클리어 함수 추가 (선택사항)
  const clearError = (): void => {
    setError(null);
  };

  // 🔥 온라인/오프라인 상태만 빠르게 업데이트하는 함수
  const updateDeviceStatusOnly = async (): Promise<void> => {
    try {
      // 🔥 실시간 센서 데이터만 업데이트 (가장 빠름)
      const currentDevices = devices;
      if (currentDevices.length > 0) {
        // 🔥 fetchAllDeviceSensorData가 반환하는 최신 데이터를 직접 사용
        const latestDataMap = await fetchAllDeviceSensorData(currentDevices);
        
        // 🔥 간단한 상태 업데이트 (실시간 데이터 기반) - 최신 데이터 맵 사용
        setDevices(prevDevices => 
          prevDevices.map(device => {
            const latestData = latestDataMap[device.device_id];
            if (latestData) {
              const dataTime = typeof latestData.timestamp === 'string' 
                ? new Date(latestData.timestamp).getTime()
                : latestData.timestamp;
              const now = Date.now();
              const diffMinutes = (now - dataTime) / (1000 * 60);
              
              // 1분 이내 데이터가 있으면 온라인으로 간주
              const newStatus = diffMinutes < 1 ? 'online' : 'offline';
              
              if (device.status !== newStatus) {
                return {
                  ...device,
                  status: newStatus,
                  last_seen_at: new Date(dataTime).toISOString()
                };
              }
            }
            return device;
          })
        );
        
        // 통계 업데이트 - 최신 데이터 맵 사용
        setDeviceStats(prevStats => {
          const onlineCount = currentDevices.filter(d => {
            const latestData = latestDataMap[d.device_id];
            if (latestData) {
              const dataTime = typeof latestData.timestamp === 'string' 
                ? new Date(latestData.timestamp).getTime()
                : latestData.timestamp;
              const now = Date.now();
              const diffMinutes = (now - dataTime) / (1000 * 60);
              return diffMinutes < 1;
            }
            return d.status === 'online';
          }).length;
          
          return {
            ...prevStats,
            online: onlineCount
          };
        });
      }
      
    } catch (error) {
      console.warn('장치 상태 업데이트 실패:', error);
      // 상태 업데이트 실패는 조용히 처리 (사용자에게 방해하지 않음)
    }
  };

  useEffect(() => {
    refreshDevices();
    
    // 🔥 빠른 상태 업데이트: 온라인/오프라인 상태만 10초마다
    const statusInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        updateDeviceStatusOnly(); // 온라인/오프라인 상태만 업데이트
      }
    }, 10000); // 10초마다 상태 업데이트
    
    // 🔥 전체 데이터 새로고침: 30초마다
    const fullRefreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        refreshDevices(false); // 전체 데이터 새로고침 (로딩 없음)
      }
    }, 30000); // 30초마다 전체 새로고침
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(fullRefreshInterval);
    };
  }, []);

  return (
    <DeviceContext.Provider value={{
      devices,
      deviceStats,
      loading,
      error, // error 속성 추가
      refreshDevices,
      toggleFavorite,
      favoriteTogglingDevices,
      clearError, // 에러 클리어 함수 추가 (선택사항)
      deviceLatestDataMap // 실시간 데이터 맵 추가
    }}>
      {children}
    </DeviceContext.Provider>
  );
};

export const useDevices = (): DeviceContextType => {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error('useDevices must be used within a DeviceProvider');
  }
  return context;
};

// 🔥 Fast Refresh를 위한 컴포넌트 이름 명시
DeviceProvider.displayName = 'DeviceProvider';