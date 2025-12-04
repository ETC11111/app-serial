// components/weather/DeviceWeatherWidget.tsx - 장치 기반 날씨 위젯

import React, { useState, useEffect } from 'react';
import { useDeviceWeather } from '../../hooks/useDeviceWeather';
import { ProcessedWeatherData } from '../../services/weatherService';

interface DeviceWeatherWidgetProps {
  deviceId?: string;
  autoDetect?: boolean;
  showDeviceInfo?: boolean;
  className?: string;
  onWeatherChange?: (weather: ProcessedWeatherData | null) => void;
}

const DeviceWeatherWidget: React.FC<DeviceWeatherWidgetProps> = ({
  deviceId,
  autoDetect = true,
  showDeviceInfo = true,
  className = '',
  onWeatherChange
}) => {
  const {
    weather,
    loading,
    error,
    deviceId: currentDeviceId,
    deviceName,
    region,
    isAutoDetected,
    lastUpdated,
    devices,
    status,
    refreshWeather,
    changeDevice
  } = useDeviceWeather(deviceId, {
    autoDetect,
    refreshInterval: 30,
    fallbackToUserIP: true
  });

  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  // 날씨 데이터 변경 시 콜백 호출
  useEffect(() => {
    if (onWeatherChange) {
      onWeatherChange(weather);
    }
  }, [weather, onWeatherChange]);

  // 날씨 상태에 따른 아이콘 반환
  const getWeatherIcon = (skyCondition: string, precipitationType: string) => {
    if (precipitationType !== '없음') {
      if (precipitationType.includes('눈')) return '❄️';
      if (precipitationType.includes('비')) return '🌧️';
    }
    
    switch (skyCondition) {
      case '맑음': return '☀️';
      case '구름많음': return '⛅';
      case '흐림': return '☁️';
      default: return '🌤️';
    }
  };

  // 풍향을 방위로 변환
  const getWindDirection = (degree: number | null) => {
    if (degree === null) return '정온';
    
    const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const index = Math.round(degree / 45) % 8;
    return directions[index];
  };

  // 데이터 나이 표시
  const getDataAgeText = () => {
    if (!status.dataAge) return '';
    
    if (status.dataAge < 1) return '방금 전';
    if (status.dataAge < 60) return `${status.dataAge}분 전`;
    
    const hours = Math.floor(status.dataAge / 60);
    const minutes = status.dataAge % 60;
    return minutes > 0 ? `${hours}시간 ${minutes}분 전` : `${hours}시간 전`;
  };

  if (loading && !weather) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-gray-600">날씨 정보 로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-2">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">날씨 정보 오류</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={refreshWeather}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
        <div className="text-center">
          <div className="text-gray-400 text-4xl mb-2">🌤️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">날씨 정보 없음</h3>
          <p className="text-gray-600">날씨 데이터를 불러올 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-800">현재 날씨</h3>
          {isAutoDetected && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              자동 감지
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={refreshWeather}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          {devices.length > 1 && (
            <button
              onClick={() => setShowDeviceSelector(!showDeviceSelector)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="장치 선택"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 장치 정보 */}
      {showDeviceInfo && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {deviceName || '알 수 없는 장치'}
              </p>
              <p className="text-xs text-gray-500">
                {region} • {getDataAgeText()}
              </p>
            </div>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${status.hasData ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-xs text-gray-500">
                {status.hasData ? '연결됨' : '연결 안됨'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 장치 선택기 */}
      {showDeviceSelector && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-800 mb-2">장치 선택</h4>
          <div className="space-y-2">
            {devices.map((device) => (
              <button
                key={device.device_id}
                onClick={() => {
                  changeDevice(device.device_id);
                  setShowDeviceSelector(false);
                }}
                className={`w-full text-left p-2 rounded text-sm transition-colors ${
                  device.device_id === currentDeviceId
                    ? 'bg-blue-200 text-blue-800'
                    : 'hover:bg-blue-100 text-blue-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{device.device_name || device.device_id}</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${
                      device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-xs">
                      {device.status === 'online' ? '온라인' : '오프라인'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 날씨 정보 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 온도 */}
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-800">
            {weather.currentTemp !== null ? `${weather.currentTemp}°C` : '--'}
          </div>
          <div className="text-sm text-gray-600">
            {weather.feelsLike !== null && weather.currentTemp !== null && 
             Math.abs(weather.feelsLike - weather.currentTemp) > 1
              ? `체감 ${weather.feelsLike}°C`
              : '체감온도'
            }
          </div>
        </div>

        {/* 날씨 상태 */}
        <div className="text-center">
          <div className="text-4xl mb-1">
            {getWeatherIcon(weather.skyCondition, weather.precipitationType)}
          </div>
          <div className="text-sm text-gray-600">
            {weather.skyCondition}
          </div>
          {weather.precipitationType !== '없음' && (
            <div className="text-xs text-gray-500">
              {weather.precipitationType}
            </div>
          )}
        </div>
      </div>

      {/* 상세 정보 */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">습도:</span>
          <span className="font-medium">
            {weather.currentHumidity !== null ? `${weather.currentHumidity}%` : '--'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">풍속:</span>
          <span className="font-medium">
            {weather.windSpeed !== null ? `${weather.windSpeed}m/s` : '--'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">풍향:</span>
          <span className="font-medium">
            {weather.windDirection !== null ? getWindDirection(weather.windDirection) : '--'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">강수량:</span>
          <span className="font-medium">
            {weather.precipitation !== null ? `${weather.precipitation}mm` : '--'}
          </span>
        </div>
      </div>

      {/* 업데이트 시간 */}
      {lastUpdated && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            마지막 업데이트: {lastUpdated.toLocaleString('ko-KR')}
          </p>
        </div>
      )}
    </div>
  );
};

export default DeviceWeatherWidget;
