// components/home/SensorDashboardContent.tsx - 간소화된 디바이스 상태 로직
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Device } from '../../types/device.types';
import { FlexibleSensorData } from '../../types/sensor.types';
import { FlexibleSensorTabContent } from '../sensor/FlexibleSensorTabContent';
import { WeatherWidget } from '../weather/WeatherWidget';
import HomeGreenhouseViewer from '../greenhouse/HomeGreenhouseViewer';
import CSVDownloadSection from '../CSVDownloadSection';
import ImprovedMultiGridViewer from '../ImprovedMultiGridViewer';

interface SensorDashboardContentProps {
  selectedDevice: Device | null;
  latestData: FlexibleSensorData | null;
  sensorLoading: boolean;
  chartData: any;
  historyData: any;
  isMobile: boolean;
  devices: Device[];
  weatherData: any;
  weatherLoading: boolean;
  weatherError: any;
  weatherForecast: any;
  selectedRegion: string;
  onRefresh: () => void;
  onWeatherRefresh: (region?: string) => void;
  onRegionChange: (region: string) => void;
  deviceId?: string;
  selectedFavoriteType?: string;
  selectedFavoriteId?: string | number;
  selectedGroup?: any;
  groups?: any[];
  // 디바이스 상태 정보 (선택적)
  isDeviceConnected?: boolean;
  lastConnectedTime?: string | null;
  cachedData?: FlexibleSensorData | null;
}

export const SensorDashboardContent: React.FC<SensorDashboardContentProps> = ({
  selectedDevice,
  latestData,
  sensorLoading,
  chartData,
  historyData,
  isMobile,
  devices,
  weatherData,
  weatherLoading,
  weatherError,
  weatherForecast,
  selectedRegion,
  onRefresh,
  onWeatherRefresh,
  onRegionChange,
  deviceId,
  selectedFavoriteType,
  selectedFavoriteId,
  selectedGroup,
  groups = [],
  isDeviceConnected,
  lastConnectedTime,
  cachedData
}) => {
  const [isGreenhouseExpanded, setIsGreenhouseExpanded] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showConnectionAlert, setShowConnectionAlert] = useState(true);

  // 스트림 관련 상태
  const [deviceStreams, setDeviceStreams] = useState<any[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // 최종 deviceId 결정
  const finalDeviceId = deviceId || selectedDevice?.device_id || '';

  // 🔥 간소화된 디바이스 상태 확인 (온라인/오프라인만)
  const deviceConnectionStatus = React.useMemo(() => {
    if (!selectedDevice) {
      return {
        isConnected: false,
        statusText: '디바이스 없음',
        statusColor: 'gray' as const
      };
    }

    // 1순위: 최근 센서 데이터가 있으면 온라인
    if (latestData) {
      const dataTime = typeof latestData.timestamp === 'string' 
        ? new Date(latestData.timestamp).getTime()
        : latestData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      // 최근 5분 이내 데이터가 있으면 온라인
    if (diffMinutes < 1) {
        console.log('📍 디바이스 온라인 (최근 데이터 존재):', {
          deviceName: selectedDevice.device_name,
          dataAge: `${diffMinutes.toFixed(1)}분 전`
        });
        return {
          isConnected: true,
          statusText: '온라인',
          statusColor: 'green' as const
        };
      }
    }

    // 2순위: 전달받은 연결 상태 정보 사용
    if (isDeviceConnected !== undefined) {
      console.log('📍 전달받은 연결 상태 사용:', {
        deviceName: selectedDevice.device_name,
        isConnected: isDeviceConnected
      });
      return {
        isConnected: isDeviceConnected,
        statusText: isDeviceConnected ? '온라인' : '오프라인',
        statusColor: isDeviceConnected ? 'green' as const : 'red' as const
      };
    }

    // 3순위: 디바이스 상태 필드 확인
    if (selectedDevice.status === 'online') {
      return {
        isConnected: true,
        statusText: '온라인',
        statusColor: 'green' as const
      };
    }

    // 기본값: 오프라인
    console.log('📍 디바이스 오프라인 (기본값):', selectedDevice.device_name);
    return {
      isConnected: false,
      statusText: '오프라인',
      statusColor: 'red' as const
    };
  }, [selectedDevice, latestData, isDeviceConnected]);

  // 표시할 데이터 결정 (오프라인일 때는 latestData를 표시하지 않음)
  const displayData = React.useMemo(() => {
    // 🔥 장치가 오프라인이면 latestData를 표시하지 않음
    if (!deviceConnectionStatus.isConnected && latestData) {
      // 오프라인일 때는 실시간 데이터를 표시하지 않고 캐시 데이터만 표시
      return cachedData || null;
    }
    // 온라인일 때만 실시간 데이터 표시
    return latestData || (deviceConnectionStatus.isConnected ? null : cachedData);
  }, [latestData, cachedData, deviceConnectionStatus.isConnected]);
  
  const displayChartData = chartData && chartData.length > 0 ? chartData : [];

  // API 헤더 공통 함수
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

  // 특정 디바이스에 연결된 스트림만 조회
  const fetchDeviceStreams = async (deviceId: string) => {
    if (!deviceId) {
      console.warn('유효하지 않은 deviceId:', deviceId);
      return;
    }

    setStreamLoading(true);
    setStreamError(null);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      const response = await fetch(`${API_BASE}/api/device-streams/connections/overview`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.success) {
        const deviceConnections: any[] = [];
        data.connections?.forEach((stream: any) => {
          const deviceConnection = stream.connected_devices?.find((device: any) =>
            String(device.device_id) === String(deviceId)
          );

          if (deviceConnection) {
            deviceConnections.push({
              id: stream.stream_id,
              stream_name: stream.stream_name,
              rtsp_url: stream.rtsp_url,
              description: stream.description,
              is_active: stream.is_active,
              created_at: stream.created_at || ''
            });
          }
        });

        setDeviceStreams(deviceConnections);
        console.log(`✅ 디바이스 ${deviceId}에 연결된 스트림 ${deviceConnections.length}개 조회 완료`);
      } else {
        setStreamError(data.error || '스트림 조회 실패');
        setDeviceStreams([]);
      }
    } catch (error) {
      console.error('디바이스 스트림 조회 실패:', error);
      setStreamError('스트림 조회 중 오류가 발생했습니다.');
      setDeviceStreams([]);
    } finally {
      setStreamLoading(false);
    }
  };

  // 디바이스 변경시 해당 디바이스의 스트림만 조회
  useEffect(() => {
    if (selectedDevice?.device_id) {
      console.log('🎯 디바이스 전용 스트림 조회:', selectedDevice.device_name, selectedDevice.device_id);
      fetchDeviceStreams(selectedDevice.device_id);
    } else {
      setDeviceStreams([]);
    }
  }, [selectedDevice?.device_id]);

  // 스트림 새로고침 함수
  const refreshStreams = () => {
    if (selectedDevice?.device_id) {
      console.log('🔄 디바이스 스트림 새로고침:', selectedDevice.device_id);
      fetchDeviceStreams(selectedDevice.device_id);
    }
  };

  // CSV 내보내기 핸들러
  const handleExportData = () => {
    if (!finalDeviceId) {
      alert('디바이스 ID가 설정되지 않았습니다.');
      return;
    }
    setShowCSVModal(true);
  };

  // 홈 화면용 온실 평면도 데이터 준비
  const stableHomeGreenhouseData = React.useMemo(() => {
    if (!selectedDevice || !displayData) {
      return { data: [], key: 'empty' };
    }

    const deviceData = {
      device_id: selectedDevice.device_id,
      device_name: selectedDevice.device_name,
      group_id: selectedDevice.device_id,
      flexibleData: displayData
    };

    return {
      data: [deviceData],
      key: `${selectedDevice.device_id}-${displayData.timestamp}-${displayData.sensor_count}`
    };
  }, [selectedDevice?.device_id, displayData?.timestamp, displayData?.sensor_count]);

  // 🔥 간소화된 연결 상태 경고 컴포넌트
  const renderConnectionAlert = () => {
    // 온라인이거나 경고를 닫았으면 표시하지 않음
    if (deviceConnectionStatus.isConnected || !showConnectionAlert || !selectedDevice) {
      return null;
    }

    // 캐시 데이터가 있으면 다른 메시지 표시
    const hasData = !!(latestData || cachedData);

    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-full">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-amber-800">
              📡 디바이스 오프라인
            </h3>
            <div className="mt-1 text-sm text-amber-700">
              <p className="mb-1">
                <span className="font-medium">{selectedDevice.device_name}</span>이(가) 현재 오프라인 상태입니다.
              </p>
              {hasData && (
                <p className="text-xs mt-2 text-amber-600">
                  💡 아래 데이터는 마지막으로 수신된 정보입니다. CSV 다운로드 등 기능은 계속 사용 가능합니다.
                </p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex space-x-2">
            <button
              onClick={onRefresh}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 transition-colors"
            >
              <img src="/refresh.png" alt="재연결 시도" className="w-4 h-4 mr-2" />
              재연결 시도
            </button>
            <button
              onClick={() => setShowConnectionAlert(false)}
              className="inline-flex items-center justify-center w-6 h-6 text-amber-400 hover:text-amber-600 transition-colors"
              title="알림 닫기"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 🔥 상태 표시 컴포넌트
  const DeviceStatusIndicator = () => {
    const { statusText, statusColor, isConnected } = deviceConnectionStatus;
    
    const colorClasses = {
      green: 'bg-green-100 text-green-800 border-green-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <div className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium ml-2 ${colorClasses[statusColor]}`}>
        <div className={`w-2 h-2 rounded-full mr-1 ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        {statusText}
      </div>
    );
  };

  // 디바이스 스트림 뷰어 렌더링
  const renderDeviceStreamViewer = () => {
    const containerStyle = {
      width: '100%',
      height: '100%',
      overflow: 'hidden' as const,
      display: 'flex' as const,
      flexDirection: 'column' as const,
      minWidth: 0,
      minHeight: 0,
      position: 'relative' as const,
      boxSizing: 'border-box' as const
    };

    if (streamLoading) {
      return (
        <div style={containerStyle} className="items-center justify-center">
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm">CCTV 연결 확인 중...</p>
          </div>
        </div>
      );
    }

    if (streamError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-medium mb-2">연결 오류</h3>
          <p className="text-sm text-center mb-4">{streamError}</p>
          <button
            onClick={refreshStreams}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center"
          >
            <img src="/refresh.png" alt="다시 시도" className="w-4 h-4 mr-2" />
            다시 시도
          </button>
        </div>
      );
    }

    if (deviceStreams.length > 0) {
      return (
        <div style={containerStyle}>
          <ImprovedMultiGridViewer
            streams={deviceStreams}
            maxWidth="100%"
            maxHeight="100%"
            showFilters={false}
            onClose={() => { }}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 overflow-hidden">
        <div className="mb-3">
          <img src="/cctv.png" alt="카메라 아이콘" className="w-10 h-10 mx-auto" />
        </div>
        <h3 className="text-lg font-medium mb-2">연결된 CCTV가 없습니다</h3>
        <p className="text-sm text-center mb-4 px-2">
          {selectedDevice ? (
            `${selectedDevice.device_name}에 연결된 CCTV 스트림이 없습니다.`
          ) : (
            '디바이스를 선택하면 연결된 CCTV를 확인할 수 있습니다.'
          )}
        </p>
        <div className="flex flex-col items-center space-y-2">
          <button
            onClick={refreshStreams}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center"
          >
            <img src="/refresh.png" alt="다시 확인" className="w-4 h-4 mr-2" />
            다시 확인
          </button>
          <Link
            to="/device-setup"
            className="text-blue-600 hover:text-blue-800 text-sm underline"
          >
            CCTV 연결 설정
          </Link>
        </div>
      </div>
    );
  };

  // 디바이스 미선택
  if (!selectedDevice) {
    return (
      <div className="bg-white rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">⭐</div>
        <h3 className="text-xl font-semibold mb-2">즐겨찾기를 선택하세요</h3>
        <p className="text-gray-500 mb-6">
          아래 즐겨찾기 목록에서 디바이스나 그룹을 클릭하면<br />
          실시간 센서 데이터와 차트를 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  // 로딩 중
  if (sensorLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700">센서 데이터 로딩 중...</h2>
          <p className="text-gray-500 mt-2">
            디바이스 연결을 확인하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  // 데이터가 아예 없는 경우 (실시간도 캐시도 없음)
  if (!displayData) {
    return (
      <div className="bg-white rounded-lg p-8 text-center">
        <div className="text-6xl mb-4">📡</div>
        <h3 className="text-xl font-semibold mb-2 text-gray-800">센서 데이터 없음</h3>
        <p className="text-gray-500 mb-6">
          이 디바이스는 아직 센서 데이터를 전송하지 않았습니다.
        </p>
        <div className="space-y-3 text-sm text-gray-600 mb-6">
          <p>• 디바이스 상태: <span className="font-medium text-red-600">{deviceConnectionStatus.statusText}</span></p>
          <p>• 디바이스가 전원에 연결되어 있는지 확인하세요</p>
          <p>• Wi-Fi 또는 네트워크 연결을 확인하세요</p>
          <p>• MQTT 설정이 올바른지 확인하세요</p>
        </div>
        <button
          onClick={onRefresh}
          className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
        >
          <img src="/refresh.png" alt="연결 재시도" className="w-5 h-5 mr-2" />
          연결 재시도
        </button>
      </div>
    );
  }

  const activeSensors = displayData.sensors?.filter(sensor => sensor.active) || [];

  return (
    <>
      {/* CSV 다운로드 모달 */}
      {showCSVModal && (
        <CSVDownloadSection
          deviceId={finalDeviceId}
          availableSensors={activeSensors}
          historyData={historyData}
          isModal={true}
          onClose={() => setShowCSVModal(false)}
        />
      )}

      <div className="space-y-4">
        {/* 연결 상태 경고 (오프라인일 때만) */}
        {renderConnectionAlert()}

        {/* 메인 레이아웃: 센서 데이터 + 디바이스 전용 CCTV/날씨/평면도 */}
        <div className={`${isMobile ? 'space-y-6 h-full flex flex-col mx-4' : 'grid grid-cols-10 gap-6 h-full'}`}>
          {/* 좌측: 센서 데이터 영역 (데스크톱 7/10 = 70%, 모바일 전체) */}
          <div className={`${isMobile ? 'flex-1 min-h-0' : 'col-span-7 h-full'} flex flex-col`}>
            <div className="flex-1 min-h-0">
              {/* 🔥 간소화된 연결 상태와 함께 FlexibleSensorTabContent 호출 */}
              <FlexibleSensorTabContent
                latestData={latestData} // 실시간 데이터는 항상 전달
                chartData={displayChartData}
                isMobile={isMobile}
                historyData={historyData}
                deviceId={finalDeviceId}
                hideSensorInfo={true}
                hideDataManagement={false}
                hideAlerts={true}
                // 🔥 간소화된 연결 상태 정보
                isDeviceConnected={deviceConnectionStatus.isConnected}
                cachedData={cachedData} // 캐시 데이터는 항상 전달
                lastDataUpdateTime={latestData?.timestamp?.toString()}
              />
            </div>
          </div>

          {/* 우측: 디바이스 전용 CCTV + 날씨 + 평면도 (데스크톱 3/10 = 30%) */}
          {!isMobile && (
            <div className="col-span-3 h-full space-y-4 overflow-hidden flex flex-col">
              {/* 디바이스 전용 CCTV 뷰어 */}
              <div className="bg-white rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col mt-3">
                <div className="p-3 border-b bg-white flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center text-sm">
                      <img src="/cctv.png" alt="CCTV" className="w-4 h-4 mr-2" />
                      디바이스 CCTV
                      {streamLoading && (
                        <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      )}

                    </h3>
                    <div className="flex items-center space-x-2">
                      <div className="text-xs text-gray-500">
                        {deviceStreams.length}개
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden bg-white">
                  {renderDeviceStreamViewer()}
                </div>
              </div>

              {/* 날씨 위젯 */}
              <div className="bg-white rounded-lg flex-shrink-0">
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <img src="/weather.png" alt="날씨" className="w-5 h-5 inline" />
                    <h3 className="text-sm font-semibold text-gray-900">날씨 정보</h3>
                  </div>
                </div>
                <div className="p-3">
                  <div className="h-full overflow-y-auto">
                    <WeatherWidget
                      weatherData={weatherData}
                      weatherLoading={weatherLoading}
                      weatherError={weatherError}
                      weatherForecast={weatherForecast}
                      onRefresh={onWeatherRefresh}
                      onRegionChange={onRegionChange}
                      selectedRegion={selectedRegion}
                    />
                  </div>
                </div>
              </div>

              {/* 온실 평면도 - 컴팩트 버전 */}
              <div className="bg-white rounded-lg flex-shrink-0">
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span>
                      <img src="/home.png" alt="홈 아이콘" className="inline-block w-5 h-5 align-middle" />
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900">센서 배치도</h3>
                    {/* 데이터 상태 표시 */}
                    {!deviceConnectionStatus.isConnected && displayData && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        마지막 데이터
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-2 h-64">
                  <HomeGreenhouseViewer
                    groupId={selectedDevice.device_id}
                    groupData={stableHomeGreenhouseData.data}
                    compactMode={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 모바일용 섹션들 */}
          {isMobile && (
            <>
              {/* 모바일 디바이스 전용 CCTV 뷰어 */}
              <div className="bg-white rounded-lg overflow-hidden p-4">
                <div className="p-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center">
                      <img src="/cctv.png" alt="CCTV 아이콘" className="w-5 h-5 mr-2" />
                      {selectedDevice.device_name} CCTV ({deviceStreams.length}개)
                      {streamLoading && (
                        <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                      <DeviceStatusIndicator />
                    </h3>
                  </div>
                </div>
                <div className="h-80 overflow-hidden">
                  {renderDeviceStreamViewer()}
                </div>
              </div>

              {/* 모바일 날씨 위젯 */}
              <div className="bg-white rounded-lg">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <img src="/weather.png" alt="날씨" className="w-5 h-5 inline" />
                    <h3 className="text-lg font-semibold text-gray-900">날씨 정보</h3>
                  </div>
                </div>
                <div className="p-4">
                  <div className="min-h-[300px] overflow-y-auto">
                    <WeatherWidget
                      weatherData={weatherData}
                      weatherLoading={weatherLoading}
                      weatherError={weatherError}
                      weatherForecast={weatherForecast}
                      onRefresh={onWeatherRefresh}
                      onRegionChange={onRegionChange}
                      selectedRegion={selectedRegion}
                    />
                  </div>
                </div>
              </div>

              {/* 모바일 온실 평면도 */}
              <div className="bg-white rounded-lg">
                {!isGreenhouseExpanded && (
                  <div
                    className="p-4 cursor-pointer hover:bg-white transition-colors border-b border-gray-200"
                    onClick={() => setIsGreenhouseExpanded(true)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span>
                          <img src="/home.png" alt="홈 아이콘" className="inline-block w-5 h-5 align-middle" />
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">온실 평면도</h3>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-blue-600">
                        <span className="text-sm font-medium">펼치기</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                {isGreenhouseExpanded && (
                  <>
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span>
                            <img src="/home.png" alt="홈 아이콘" className="inline-block w-5 h-5 align-middle" />
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900">센서 배치도</h3>
                        </div>
                        <button
                          onClick={() => setIsGreenhouseExpanded(false)}
                          className="flex items-center space-x-1 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          <span>접기</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="h-80">
                        <HomeGreenhouseViewer
                          groupId={selectedDevice.device_id}
                          groupData={stableHomeGreenhouseData.data}
                          compactMode={false}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};