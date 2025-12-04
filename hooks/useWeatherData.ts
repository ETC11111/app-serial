// hooks/useWeatherData.ts
import { useState, useEffect, useCallback } from 'react';
import { weatherService, ProcessedWeatherData } from '../services/weatherService';

// 🔥 백엔드 응답 타입 정의
interface WeatherApiResponse {
  success: boolean;
  weather?: ProcessedWeatherData;
  error?: string;
  cached?: boolean;
  usedFallback?: boolean;
}

interface ForecastApiResponse {
  success: boolean;
  region?: string;
  baseWeather?: ProcessedWeatherData;
  forecasts?: ProcessedWeatherData[];
  error?: string;
  cached?: boolean;
  usedFallback?: boolean;
}

// 🔥 확장된 상태 타입
interface WeatherState {
  data: ProcessedWeatherData | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  usedFallback: boolean;
  lastUpdated: Date | null;
}

interface ForecastState {
  data: ProcessedWeatherData[];
  loading: boolean;
  error: string | null;
  cached: boolean;
  usedFallback: boolean;
  lastUpdated: Date | null;
}

export const useWeatherData = () => {
  // 🔥 개선된 상태 관리
  const [weather, setWeather] = useState<WeatherState>({
    data: null,
    loading: false,
    error: null,
    cached: false,
    usedFallback: false,
    lastUpdated: null
  });

  const [forecast, setForecast] = useState<ForecastState>({
    data: [],
    loading: false,
    error: null,
    cached: false,
    usedFallback: false,
    lastUpdated: null
  });

  const [selectedRegion, setSelectedRegion] = useState<string>('익산');
  const [serviceHealthy, setServiceHealthy] = useState<boolean>(true);

  // 🔥 서비스 헬스 체크
  const checkServiceHealth = useCallback(async () => {
    try {
      const isHealthy = await weatherService.checkHealth();
      setServiceHealthy(isHealthy);
      return isHealthy;
    } catch (error) {
      console.warn('⚠️ 날씨 서비스 헬스 체크 실패:', error);
      setServiceHealthy(false);
      return false;
    }
  }, []);

  // 🔥 현재 날씨 로드
  const loadCurrentWeather = useCallback(async (region?: string) => {
    const targetRegion = region || selectedRegion;
    
    setWeather(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      
      
      const currentWeather = await weatherService.getCurrentWeather(targetRegion);
      
      if (currentWeather) {
        setWeather({
          data: currentWeather,
          loading: false,
          error: null,
          cached: false, // weatherService에서 캐시 정보를 받을 수 있다면 수정
          usedFallback: currentWeather.isFallback || false,
          lastUpdated: new Date()
        });
        

      } else {
        throw new Error(`${targetRegion} 현재 날씨 정보를 불러올 수 없습니다`);
      }
    } catch (error) {
      console.error(`❌ ${targetRegion} 현재 날씨 로드 실패:`, error);
      setWeather(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      }));
    }
  }, [selectedRegion]);

  // 🔥 예보 데이터 로드
  const loadForecast = useCallback(async (region?: string) => {
    const targetRegion = region || selectedRegion;
    
    setForecast(prev => ({ ...prev, loading: true, error: null }));
    
    try {

      
      const forecastData = await weatherService.getForecast(targetRegion);
      
      setForecast({
        data: forecastData.slice(0, 6), // 6시간 예보
        loading: false,
        error: null,
        cached: false,
        usedFallback: false,
        lastUpdated: new Date()
      });
      

    } catch (error) {
      console.error(`❌ ${targetRegion} 예보 데이터 로드 실패:`, error);
      setForecast(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      }));
    }
  }, [selectedRegion]);

  // 🔥 전체 날씨 데이터 로드 (현재 날씨 + 예보)
  const loadWeatherData = useCallback(async (region?: string) => {
    const targetRegion = region || selectedRegion;
    

    
    // 서비스 헬스 체크
    const isHealthy = await checkServiceHealth();
    if (!isHealthy) {
      console.warn('⚠️ 날씨 서비스가 불안정한 상태입니다');
    }
    
    // 병렬로 현재 날씨와 예보 로드
    await Promise.allSettled([
      loadCurrentWeather(targetRegion),
      loadForecast(targetRegion)
    ]);
    

  }, [selectedRegion, checkServiceHealth, loadCurrentWeather, loadForecast]);

  // 🔥 지역 변경 핸들러
  const changeRegion = useCallback((region: string) => {
    if (region === selectedRegion) {

      return;
    }
    

    setSelectedRegion(region);
    
    // 지역 변경 시 즉시 데이터 로드
    loadWeatherData(region);
  }, [selectedRegion, loadWeatherData]);

  // 🔥 현재 지역 날씨 새로고침
  const refreshWeather = useCallback(async () => {

    await loadWeatherData(selectedRegion);
  }, [loadWeatherData, selectedRegion]);

  // 🔥 현재 날씨만 새로고침
  const refreshCurrentWeather = useCallback(async () => {

    await loadCurrentWeather(selectedRegion);
  }, [loadCurrentWeather, selectedRegion]);

  // 🔥 예보만 새로고침
  const refreshForecast = useCallback(async () => {

    await loadForecast(selectedRegion);
  }, [loadForecast, selectedRegion]);

  // 🔥 데이터 상태 체크 유틸리티
  const getDataStatus = useCallback(() => {
    const now = new Date();
    const currentWeatherAge = weather.lastUpdated ? 
      Math.floor((now.getTime() - weather.lastUpdated.getTime()) / 1000 / 60) : null;
    const forecastAge = forecast.lastUpdated ? 
      Math.floor((now.getTime() - forecast.lastUpdated.getTime()) / 1000 / 60) : null;
    
    return {
      hasCurrentWeather: !!weather.data,
      hasForecast: forecast.data.length > 0,
      currentWeatherAge: currentWeatherAge, // 분 단위
      forecastAge: forecastAge, // 분 단위
      isDataStale: currentWeatherAge ? currentWeatherAge > 30 : true, // 30분 이상 오래됨
      usingFallbackData: weather.usedFallback || forecast.usedFallback,
      serviceHealthy: serviceHealthy
    };
  }, [weather, forecast, serviceHealthy]);

  // 🔥 초기 로드 및 자동 업데이트
  useEffect(() => {

    
    // 초기 데이터 로드
    loadWeatherData(selectedRegion);
    
    // 30분마다 자동 업데이트
    const weatherInterval = setInterval(() => {

      loadWeatherData(selectedRegion);
    }, 30 * 60 * 1000);
    
    // 서비스 헬스 체크 (5분마다)
    const healthInterval = setInterval(() => {
      checkServiceHealth();
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(weatherInterval);
      clearInterval(healthInterval);

    };
  }, [selectedRegion, loadWeatherData, checkServiceHealth]);

  // 🔥 백워드 호환성을 위한 기존 인터페이스 유지
  return {
    // 기존 인터페이스 (백워드 호환성)
    weatherData: weather.data,
    weatherLoading: weather.loading || forecast.loading,
    weatherError: weather.error || forecast.error,
    weatherForecast: forecast.data,
    selectedRegion,
    
    // 새로운 상세 인터페이스
    weather: {
      data: weather.data,
      loading: weather.loading,
      error: weather.error,
      cached: weather.cached,
      usedFallback: weather.usedFallback,
      lastUpdated: weather.lastUpdated
    },
    
    forecast: {
      data: forecast.data,
      loading: forecast.loading,
      error: forecast.error,
      cached: forecast.cached,
      usedFallback: forecast.usedFallback,
      lastUpdated: forecast.lastUpdated
    },
    
    // 상태 및 유틸리티
    serviceHealthy,
    dataStatus: getDataStatus(),
    
    // 액션 함수들
    loadWeatherData,       // 전체 데이터 로드
    refreshWeather,        // 전체 새로고침
    refreshCurrentWeather, // 현재 날씨만 새로고침
    refreshForecast,       // 예보만 새로고침
    changeRegion,          // 지역 변경
    checkServiceHealth     // 서비스 상태 체크
  };
};

// 🔥 타입 내보내기
export type { WeatherState, ForecastState };

