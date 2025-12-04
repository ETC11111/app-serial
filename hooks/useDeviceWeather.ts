// hooks/useDeviceWeather.ts - 장치 기반 날씨 조회 훅

import { useState, useEffect, useCallback } from 'react';
import { locationService } from '../services/locationService';
import { weatherService, ProcessedWeatherData } from '../services/weatherService';

interface DeviceWeatherState {
  data: ProcessedWeatherData | null;
  loading: boolean;
  error: string | null;
  deviceId: string | null;
  deviceName: string | null;
  region: string | null;
  isAutoDetected: boolean;
  lastUpdated: Date | null;
}

interface DeviceWeatherOptions {
  autoDetect?: boolean; // 자동 감지 여부
  refreshInterval?: number; // 자동 새로고침 간격 (분)
  fallbackToUserIP?: boolean; // 장치 실패 시 사용자 IP 사용 여부
}

export const useDeviceWeather = (deviceId?: string, options: DeviceWeatherOptions = {}) => {
  const {
    autoDetect = true,
    refreshInterval = 30,
    fallbackToUserIP = true
  } = options;

  const [weather, setWeather] = useState<DeviceWeatherState>({
    data: null,
    loading: false,
    error: null,
    deviceId: null,
    deviceName: null,
    region: null,
    isAutoDetected: false,
    lastUpdated: null
  });

  const [devices, setDevices] = useState<any[]>([]);

  // 🔥 장치 목록 로드
  const loadDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/devices', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.devices) {
          setDevices(data.devices);
          return data.devices;
        }
      }
      return [];
    } catch (error) {
      console.error('❌ 장치 목록 로드 실패:', error);
      return [];
    }
  }, []);

  // 🔥 특정 장치의 날씨 조회
  const loadWeatherByDevice = useCallback(async (targetDeviceId: string) => {
    setWeather(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log(`🌤️ 장치 ${targetDeviceId}의 날씨 조회 시작...`);
      
      const weatherData = await locationService.getWeatherByDevice(targetDeviceId);
      
      if (weatherData) {
        setWeather({
          data: weatherData,
          loading: false,
          error: null,
          deviceId: targetDeviceId,
          deviceName: weatherData.deviceName || '알 수 없음',
          region: weatherData.region || '익산',
          isAutoDetected: false,
          lastUpdated: new Date()
        });
        
        console.log(`✅ 장치 ${targetDeviceId} 날씨 조회 성공: ${weatherData.region}`);
      } else {
        throw new Error('날씨 데이터를 받을 수 없습니다');
      }
    } catch (error) {
      console.error(`❌ 장치 ${targetDeviceId} 날씨 조회 실패:`, error);
      
      // 폴백: 사용자 IP 기반 날씨 조회
      if (fallbackToUserIP) {
        try {
          console.log('🔄 사용자 IP 기반 날씨로 대체 시도...');
          const userRegion = await locationService.getCurrentUserRegion();
          const fallbackWeather = await weatherService.getCurrentWeather(userRegion);
          
          if (fallbackWeather) {
            setWeather({
              data: fallbackWeather,
              loading: false,
              error: null,
              deviceId: targetDeviceId,
              deviceName: '사용자 위치',
              region: userRegion,
              isAutoDetected: true,
              lastUpdated: new Date()
            });
            return;
          }
        } catch (fallbackError) {
          console.error('❌ 폴백 날씨 조회도 실패:', fallbackError);
        }
      }
      
      setWeather(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '날씨 정보를 가져올 수 없습니다'
      }));
    }
  }, [fallbackToUserIP]);

  // 🔥 자동 감지된 장치의 날씨 조회
  const loadAutoDetectedWeather = useCallback(async () => {
    if (devices.length === 0) {
      console.warn('⚠️ 장치 목록이 비어있습니다');
      return;
    }

    setWeather(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('🎯 자동 감지된 장치로 날씨 조회 시작...');
      
      const weatherData = await locationService.getAutoDetectedWeather(devices);
      
      if (weatherData) {
        setWeather({
          data: weatherData,
          loading: false,
          error: null,
          deviceId: weatherData.deviceId || 'auto',
          deviceName: weatherData.deviceName || '자동 감지',
          region: weatherData.region || '익산',
          isAutoDetected: true,
          lastUpdated: new Date()
        });
        
        console.log(`✅ 자동 감지 날씨 조회 성공: ${weatherData.region}`);
      } else {
        throw new Error('자동 감지된 날씨 데이터를 받을 수 없습니다');
      }
    } catch (error) {
      console.error('❌ 자동 감지 날씨 조회 실패:', error);
      
      // 폴백: 사용자 IP 기반 날씨 조회
      if (fallbackToUserIP) {
        try {
          console.log('🔄 사용자 IP 기반 날씨로 대체 시도...');
          const userRegion = await locationService.getCurrentUserRegion();
          const fallbackWeather = await weatherService.getCurrentWeather(userRegion);
          
          if (fallbackWeather) {
            setWeather({
              data: fallbackWeather,
              loading: false,
              error: null,
              deviceId: 'user-ip',
              deviceName: '사용자 위치',
              region: userRegion,
              isAutoDetected: true,
              lastUpdated: new Date()
            });
            return;
          }
        } catch (fallbackError) {
          console.error('❌ 폴백 날씨 조회도 실패:', fallbackError);
        }
      }
      
      setWeather(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '날씨 정보를 가져올 수 없습니다'
      }));
    }
  }, [devices, fallbackToUserIP]);

  // 🔥 날씨 새로고침
  const refreshWeather = useCallback(async () => {
    if (deviceId) {
      await loadWeatherByDevice(deviceId);
    } else if (autoDetect) {
      await loadAutoDetectedWeather();
    }
  }, [deviceId, autoDetect, loadWeatherByDevice, loadAutoDetectedWeather]);

  // 🔥 장치 변경
  const changeDevice = useCallback((newDeviceId: string) => {
    if (newDeviceId !== weather.deviceId) {
      loadWeatherByDevice(newDeviceId);
    }
  }, [weather.deviceId, loadWeatherByDevice]);

  // 🔥 초기 로드 (의존성 최소화)
  useEffect(() => {
    const initializeWeather = async () => {
      // 장치 목록 로드
      await loadDevices();
      
      // 날씨 조회
      if (deviceId) {
        await loadWeatherByDevice(deviceId);
      } else if (autoDetect) {
        await loadAutoDetectedWeather();
      }
    };

    initializeWeather();
  }, [deviceId, autoDetect]); // 의존성 최소화

  // 🔥 자동 새로고침 (별도 useEffect) - 빈도 줄임
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        // 데이터가 30분 이상 오래되었을 때만 새로고침
        if (weather.lastUpdated) {
          const age = Date.now() - weather.lastUpdated.getTime();
          if (age > 30 * 60 * 1000) { // 30분
            refreshWeather();
          }
        } else {
          refreshWeather();
        }
      }, refreshInterval * 60 * 1000); // 분을 밀리초로 변환

      return () => clearInterval(interval);
    }
  }, [refreshInterval, refreshWeather, weather.lastUpdated]);

  // 🔥 장치 목록이 변경되면 자동 감지 재실행 (의존성 최소화)
  useEffect(() => {
    if (autoDetect && !deviceId && devices.length > 0) {
      loadAutoDetectedWeather();
    }
  }, [devices.length, autoDetect, deviceId]); // devices.length만 사용

  // 🔥 상태 정보
  const getStatus = useCallback(() => {
    const now = new Date();
    const age = weather.lastUpdated ? 
      Math.floor((now.getTime() - weather.lastUpdated.getTime()) / 1000 / 60) : null;
    
    return {
      hasData: !!weather.data,
      isLoading: weather.loading,
      hasError: !!weather.error,
      dataAge: age, // 분 단위
      isStale: age ? age > 30 : true, // 30분 이상 오래됨
      isAutoDetected: weather.isAutoDetected,
      deviceCount: devices.length
    };
  }, [weather, devices.length]);

  return {
    // 상태
    weather: weather.data,
    loading: weather.loading,
    error: weather.error,
    deviceId: weather.deviceId,
    deviceName: weather.deviceName,
    region: weather.region,
    isAutoDetected: weather.isAutoDetected,
    lastUpdated: weather.lastUpdated,
    
    // 장치 정보
    devices,
    
    // 상태 정보
    status: getStatus(),
    
    // 액션
    refreshWeather,
    changeDevice,
    loadDevices,
    loadWeatherByDevice,
    loadAutoDetectedWeather
  };
};

export type { DeviceWeatherState, DeviceWeatherOptions };
