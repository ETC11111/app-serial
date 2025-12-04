// components/weather/WeatherDemo.tsx - 장치 기반 날씨 조회 데모

import React, { useState } from 'react';
import { useDeviceWeather } from '../../hooks/useDeviceWeather';
import DeviceWeatherWidget from './DeviceWeatherWidget';

const WeatherDemo: React.FC = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [autoDetect, setAutoDetect] = useState(true);

  const {
    weather,
    loading,
    error,
    deviceId,
    deviceName,
    region,
    isAutoDetected,
    devices,
    status,
    refreshWeather,
    changeDevice
  } = useDeviceWeather(selectedDeviceId, {
    autoDetect,
    refreshInterval: 30,
    fallbackToUserIP: true
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          🌤️ 장치 기반 날씨 조회 데모
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 설정 패널 */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-700">설정</h2>
            
            {/* 자동 감지 토글 */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="autoDetect"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="autoDetect" className="text-sm font-medium text-gray-700">
                자동 장치 감지
              </label>
            </div>

            {/* 장치 선택 */}
            {!autoDetect && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  장치 선택
                </label>
                <select
                  value={selectedDeviceId || ''}
                  onChange={(e) => setSelectedDeviceId(e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">장치를 선택하세요</option>
                  {devices.map((device) => (
                    <option key={device.device_id} value={device.device_id}>
                      {device.device_name || device.device_id} 
                      ({device.status === 'online' ? '온라인' : '오프라인'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 상태 정보 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">현재 상태</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">로딩:</span>
                  <span className={loading ? 'text-blue-600' : 'text-gray-500'}>
                    {loading ? '로딩 중...' : '완료'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">에러:</span>
                  <span className={error ? 'text-red-600' : 'text-green-600'}>
                    {error ? '있음' : '없음'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">장치:</span>
                  <span className="text-gray-800">
                    {deviceName || '없음'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">지역:</span>
                  <span className="text-gray-800">
                    {region || '없음'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">자동 감지:</span>
                  <span className={isAutoDetected ? 'text-green-600' : 'text-gray-500'}>
                    {isAutoDetected ? '예' : '아니오'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">데이터 나이:</span>
                  <span className="text-gray-800">
                    {status.dataAge ? `${status.dataAge}분` : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="space-y-2">
              <button
                onClick={refreshWeather}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '새로고침 중...' : '새로고침'}
              </button>
              
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                  <strong>에러:</strong> {error}
                </div>
              )}
            </div>
          </div>

          {/* 날씨 위젯 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">날씨 정보</h2>
            <DeviceWeatherWidget
              deviceId={selectedDeviceId}
              autoDetect={autoDetect}
              showDeviceInfo={true}
              className="h-full"
            />
          </div>
        </div>

        {/* 장치 목록 */}
        {devices.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">
              사용 가능한 장치 ({devices.length}개)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {devices.map((device) => (
                <div
                  key={device.device_id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    device.device_id === deviceId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => changeDevice(device.device_id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">
                        {device.device_name || device.device_id}
                      </div>
                      <div className="text-sm text-gray-500">
                        {device.device_id}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${
                        device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                      <span className="text-xs text-gray-500">
                        {device.status === 'online' ? '온라인' : '오프라인'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeatherDemo;