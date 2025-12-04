// components/SensorDashboard.tsx - 오프라인 상태 대응
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import { FlexibleSensorTabContent } from './sensor/FlexibleSensorTabContent';
import GreenhouseFloorPlan from './greenhouse/GreenhouseFloorPlan';
import HomeGreenhouseViewer from './greenhouse/HomeGreenhouseViewer';
import { WeatherWidget } from './weather/WeatherWidget';
import ImprovedMultiGridViewer from './ImprovedMultiGridViewer';
import AlertSettings from './alert/AlertSettings';
import { mqttService } from '../services/mqttService';
import { FlexibleSensorData, ChartDataPoint } from '../types/sensor.types';
import { validateSensorData, convertLegacyToFlexible } from '../types/sensor.types';
import { useWeatherData } from '../hooks/useWeatherData';
import { useDevices } from '../contexts/DeviceContext';

// 타입 정의
type TabType = 'sensor' | 'notifications';

interface StreamData {
  id: string | number;
  stream_name: string;
  rtsp_url: string;
  description?: string;
  is_active: boolean;
}

interface DeviceConnectionData {
  stream_id: string | number;
  stream_name: string;
  rtsp_url: string;
  description?: string;
  is_active: boolean;
  connected_devices?: any[];
}

interface ConnectionsResponse {
  success: boolean;
  connections?: DeviceConnectionData[];
  error?: string;
}

const SensorDashboard: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();

  // Context 훅 사용
  const { devices } = useDevices();

  // 센서 관련 상태
  const [latestData, setLatestData] = useState<FlexibleSensorData | null>(null);
  const [historyData, setHistoryData] = useState<FlexibleSensorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'offline' | 'no_data'>('unknown');

  // 오프라인 대응 상태 추가
  const [cachedData, setCachedData] = useState<FlexibleSensorData | null>(null);
  const [cachedHistoryData, setCachedHistoryData] = useState<FlexibleSensorData[]>([]);
  const [lastConnectedTime, setLastConnectedTime] = useState<string | null>(null);
  const [showConnectionAlert, setShowConnectionAlert] = useState(true);

  // UI 상태
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('sensor');
  const [isGreenhouseExpanded, setIsGreenhouseExpanded] = useState(false);
  const [isBottomGreenhouseExpanded, setIsBottomGreenhouseExpanded] = useState(false);

  // 스트림 관련 상태 - 타입 수정
  const [allStreams, setAllStreams] = useState<StreamData[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);

  // 연결 상태 확인
  const isDeviceConnected = connectionStatus === 'connected';

  // 🔥 장치 온라인 상태 확인 함수 (먼저 정의)
  const isDeviceOnline = useCallback((deviceId: string): boolean => {
    const device = devices.find(d => d.device_id === deviceId);
    if (!device) return false;
    
    // 1. 디바이스 상태 필드 확인
    if (device.status === 'online') {
      return true;
    }
    
    // 2. last_seen_at 확인 (5분 이내로 완화 - 네트워크 지연 고려)
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
      return diffMinutes < 5;
    }
    
    return false;
  }, [devices]);

  // 🔥 장치 온라인 상태 확인
  const deviceOnline = useMemo(() => {
    if (!deviceId) return false;
    return isDeviceOnline(deviceId);
  }, [deviceId, isDeviceOnline]);

  // 표시할 데이터 결정 (오프라인일 때도 latestData 표시 - 데이터가 있으면 항상 표시)
  const displayData = useMemo(() => {
    // 🔥 데이터가 있으면 항상 표시 (오프라인 상태여도 데이터는 표시)
    // 🔥 우선순위: latestData > cachedData > historyData > cachedHistoryData
    if (latestData) return latestData;
    if (cachedData) return cachedData;
    if (historyData.length > 0) return historyData[historyData.length - 1];
    if (cachedHistoryData.length > 0) return cachedHistoryData[cachedHistoryData.length - 1];
    return null;
  }, [latestData, cachedData, historyData, cachedHistoryData]);
  
  const displayHistoryData = historyData.length > 0 ? historyData : cachedHistoryData;

  // 날씨 데이터 훅 사용
  const {
    weatherData,
    weatherLoading,
    weatherError,
    weatherForecast,
    selectedRegion,
    loadWeatherData,
    changeRegion,
    refreshWeather
  } = useWeatherData();

  // 온실 평면도용 데이터 준비
  const stableGreenhouseData = useMemo(() => {
    if (!displayData) {
      return { data: [], key: 'empty' };
    }

    const deviceData = {
      device_id: deviceId!,
      device_name: `센서 ${deviceId}`,
      group_id: deviceId!,
      flexibleData: displayData
    };

    return {
      data: [deviceData],
      key: `${deviceId}-${displayData.timestamp}-${displayData.sensor_count}`
    };
  }, [deviceId, displayData?.timestamp, displayData?.sensor_count]);

  // HomeGreenhouseViewer용 데이터 준비
  const stableHomeGreenhouseData = useMemo(() => {
    if (!displayData) {
      return { data: [], key: 'empty' };
    }

    const deviceData = {
      device_id: deviceId!,
      device_name: `센서 ${deviceId}`,
      group_id: deviceId!,
      flexibleData: displayData
    };

    return {
      data: [deviceData],
      key: `${deviceId}-${displayData.timestamp}-${displayData.sensor_count}`
    };
  }, [deviceId, displayData?.timestamp, displayData?.sensor_count]);

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

  // 타입 안전한 ID 변환 함수
  const safeStringify = (id: string | number | undefined | null): string => {
    if (id === undefined || id === null) return '';
    return String(id);
  };

  // 데이터 캐싱 함수
  const cacheCurrentData = () => {
    if (latestData) {
      setCachedData(latestData);
      setLastConnectedTime(new Date().toISOString());
      // 로컬 스토리지에도 캐시 (선택사항)
      try {
        localStorage.setItem(`cached_sensor_data_${deviceId}`, JSON.stringify({
          data: latestData,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        // 로컬 스토리지 실패는 무시
      }
    }

    if (historyData.length > 0) {
      setCachedHistoryData(historyData);
      try {
        localStorage.setItem(`cached_history_data_${deviceId}`, JSON.stringify({
          data: historyData,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        // 로컬 스토리지 실패는 무시
      }
    }
  };

  // 캐시된 데이터 로드
  const loadCachedData = () => {
    try {
      const cachedSensorData = localStorage.getItem(`cached_sensor_data_${deviceId}`);
      if (cachedSensorData) {
        const parsed = JSON.parse(cachedSensorData);
        setCachedData(parsed.data);
        setLastConnectedTime(parsed.timestamp);
      }

      const cachedHistory = localStorage.getItem(`cached_history_data_${deviceId}`);
      if (cachedHistory) {
        const parsed = JSON.parse(cachedHistory);
        setCachedHistoryData(parsed.data);
      }
    } catch (e) {
      // 캐시 로드 실패는 무시
    }
  };

  // 전체 스트림 목록 조회 (fallback용)
  const fetchAllStreams = async () => {
    setStreamLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_BASE}/api/stream-devices`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.success) {
        setAllStreams(data.streams || []);
      } else {
        console.warn('전체 스트림 조회 실패:', data.error);
        setAllStreams([]);
      }
    } catch (error) {
      console.error('전체 스트림 조회 실패:', error);
      setAllStreams([]);
    } finally {
      setStreamLoading(false);
    }
  };

  // 특정 장치의 연결된 스트림 조회 - 타입 수정
  const fetchDeviceStreams = async (deviceId: string | number) => {
    if (!deviceId) {
      console.warn('유효하지 않은 deviceId:', deviceId);
      return;
    }

    setStreamLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const safeDeviceId = safeStringify(deviceId);

      const response = await fetch(`${API_BASE}/api/device-streams/connections/overview`, {
        headers: getAuthHeaders()
      });
      const data: ConnectionsResponse = await response.json();

      if (data.success) {
        const deviceConnections: StreamData[] = [];
        data.connections?.forEach((stream: DeviceConnectionData) => {
          const deviceConnection = stream.connected_devices?.find((device: any) =>
            String(device.device_id) === String(safeDeviceId)
          );

          if (deviceConnection) {
            deviceConnections.push({
              id: stream.stream_id,
              stream_name: stream.stream_name,
              rtsp_url: stream.rtsp_url,
              description: stream.description,
              is_active: stream.is_active
            });
          }
        });

        setAllStreams(deviceConnections);
        console.log(`장치 ${safeDeviceId}에 연결된 스트림 ${deviceConnections.length}개 조회 완료`);

        if (deviceConnections.length === 0) {
          console.log(`장치 ${safeDeviceId}에 연결된 스트림이 없습니다.`);
        }
      } else {
        console.warn('연결된 스트림 조회 실패:', data.error);
        setAllStreams([]);
      }
    } catch (error) {
      console.error('연결된 스트림 조회 실패:', error);
      await fetchAllStreams();
    } finally {
      setStreamLoading(false);
    }
  };

  // 날씨 새로고침
  const onWeatherRefresh = (region?: string) => {
    if (region) {
      changeRegion(region);
    } else {
      refreshWeather();
    }
  };

  // 지역 변경
  const onRegionChange = (region: string) => {
    changeRegion(region);
  };

  // 스트림 데이터 로드
  useEffect(() => {
    if (deviceId) {
      console.log('장치에 연결된 스트림 조회:', deviceId);
      fetchDeviceStreams(deviceId);
    }
  }, [deviceId]);

  // 스트림 새로고침 함수
  const refreshStreams = () => {
    if (deviceId) {
      console.log('스트림 새로고침:', deviceId);
      fetchDeviceStreams(deviceId);
    }
  };

  // 연결 상태 경고 컴포넌트
  const renderConnectionAlert = () => {
    if (isDeviceConnected || !showConnectionAlert || !displayData) return null;

    const formatLastConnected = (timeString?: string | null) => {
      if (!timeString) return '알 수 없음';
      try {
        const date = new Date(timeString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return '방금 전';
        if (diffMins < 60) return `${diffMins}분 전`;
        if (diffHours < 24) return `${diffHours}시간 전`;
        return `${diffDays}일 전`;
      } catch {
        return timeString;
      }
    };

    return (
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
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
              디바이스 연결이 끊어졌습니다
            </h3>
            <div className="mt-1 text-sm text-amber-700">
              <p className="mb-1">
                <span className="font-medium">디바이스 {deviceId}</span>이(가) 현재 오프라인 상태입니다.
              </p>
              {lastConnectedTime && (
                <p className="text-xs">
                  마지막 연결: {formatLastConnected(lastConnectedTime)}
                </p>
              )}
              <p className="text-xs mt-2 text-amber-600">
                아래 데이터는 마지막으로 수신된 정보입니다. 모든 기능은 계속 사용 가능합니다.
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex space-x-2">
            <button
              onClick={refreshData}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 transition-colors"
            >
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

  // 스트림 뷰어 렌더링
  const renderStreamViewer = () => {
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
            <p className="text-sm">연결된 스트림 로딩 중...</p>
          </div>
        </div>
      );
    }

    if (allStreams.length > 0) {
      return (
        <div style={containerStyle}>
          <ImprovedMultiGridViewer
            streams={allStreams.map(stream => ({
              id: typeof stream.id === 'number' ? stream.id : parseInt(String(stream.id), 10),
              stream_name: stream.stream_name,
              rtsp_url: stream.rtsp_url,
              description: stream.description,
              is_active: stream.is_active,
              created_at: ''
            }))}
            maxWidth="100%"
            maxHeight="100%"
            showFilters={false}
            onClose={() => { }}
          />
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 overflow-hidden">
          <div className="mb-3">
            <img src="/cctv.png" alt="CCTV" className="w-12 h-12" />
          </div>
          <h3 className="text-lg font-medium mb-2">연결된 카메라가 없습니다</h3>
          <p className="text-sm text-center mb-4 px-2">
            디바이스 {deviceId}에 연결된 CCTV 스트림이 없습니다.
          </p>
          <button
            onClick={refreshStreams}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <img src="/refresh.png" alt="새로고침" className="w-4 h-4" />
            다시 확인
          </button>
        </div>
      );
    }
  };

  // 모바일 환경 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 최신 센서 데이터 조회 (오프라인 대응)
  const fetchLatestData = async () => {
    if (!deviceId) return;

    // 🔥 항상 API를 호출하여 실제 데이터 수신 여부 확인
    // isDeviceOnline 체크를 제거하고, 실제 데이터로 온라인/오프라인 판단
    try {
      const result = await mqttService.getRealtimeSensorData(deviceId);

      // 🔥 404 에러는 조용히 처리 (센서 데이터 없음)
      // 🔥 하지만 캐시된 데이터가 있으면 오프라인 상태로 처리하여 캐시 데이터 표시
      if (!result.success && result.error === '센서 데이터 없음') {
        // 🔥 캐시된 데이터가 있으면 오프라인 상태로 설정 (캐시 데이터 표시)
        if (cachedData || historyData.length > 0) {
          console.log(`📴 장치 ${deviceId} 센서 데이터 없음 (404) - 캐시 데이터 사용`);
          setConnectionStatus('offline');
          // 🔥 latestData는 null로 유지하되, 캐시 데이터는 표시됨
        } else {
          console.log(`📴 장치 ${deviceId} 센서 데이터 없음 (404) - 데이터 없음`);
          setLatestData(null);
          setConnectionStatus('no_data');
        }
        return;
      }
      
      if (result.success && result.data) {
        let sensorData = result.data;

        // 타임스탬프 검증 및 수정 (원본 타임스탬프 유지)
        if (sensorData.timestamp) {
          if (typeof sensorData.timestamp === 'number' && sensorData.timestamp < 1000000000000) {
            // 잘못된 타임스탬프만 현재 시각으로 수정
            sensorData.timestamp = Date.now();
          }
          else if (typeof sensorData.timestamp === 'string') {
            sensorData.timestamp = new Date(sensorData.timestamp).getTime();
          }
          // 🔥 유효한 타임스탬프는 그대로 유지 (현재 시각으로 변경하지 않음)
        } else {
          sensorData.timestamp = Date.now();
        }

        if (!sensorData.receivedAt) {
          sensorData.receivedAt = new Date().toISOString();
        }

        if (!sensorData.device_id && deviceId) {
          sensorData.device_id = deviceId;
        }

        // 데이터 유효성 검사
        const validation = validateSensorData(sensorData);
        if (validation.valid) {
          // 🔥 데이터 타임스탬프가 최근 15분 이내인지 확인 (네트워크 지연 및 간헐적 수신 고려)
          const dataTime = typeof sensorData.timestamp === 'string' 
            ? new Date(sensorData.timestamp).getTime()
            : sensorData.timestamp;
          const now = Date.now();
          const diffMinutes = (now - dataTime) / (1000 * 60);
          
          // 🔥 데이터를 항상 설정하되, 최근성에 따라 상태만 구분
          setLatestData(sensorData);
          
          if (diffMinutes < 5) {
            // 최근 데이터 (5분 이내): 실시간 연결 상태
            setConnectionStatus('connected');
          } else if (diffMinutes < 15) {
            // 약간 오래된 데이터 (5-15분): 오프라인 상태로 표시하되 데이터는 표시
            console.log(`⚠️ 장치 ${deviceId} 데이터가 약간 오래됨 (${diffMinutes.toFixed(1)}분 전) - 오프라인 상태로 표시`);
            setConnectionStatus('offline');
          } else {
            // 매우 오래된 데이터 (15분 이상): 오프라인 상태로 표시하되 데이터는 표시
            console.log(`⚠️ 장치 ${deviceId} 데이터가 매우 오래됨 (${diffMinutes.toFixed(1)}분 전) - 오프라인 상태로 표시`);
            setConnectionStatus('offline');
          }

          // 성공적으로 데이터를 받았을 때 캐싱
          cacheCurrentData();

          // 히스토리 데이터에 추가
          setHistoryData(prev => {
            const newHistory = [...prev, sensorData];
            return newHistory.slice(-30);
          });
        } else {
          setLatestData(null);
          setConnectionStatus('no_data');
        }
      } else {
        // 데이터가 없지만 이전에 캐시된 데이터가 있으면 오프라인 상태로 설정
        setLatestData(null); // 🔥 오프라인일 때는 latestData를 null로 설정
        if (cachedData) {
          setConnectionStatus('offline');
        } else {
          setConnectionStatus('no_data');
        }
      }
    } catch (error: any) {
      // 다른 에러는 기존대로 처리
      console.error('❌ 센서 데이터 조회 오류:', error);
      setLatestData(null);
      setConnectionStatus('offline');
    }
  };

  // 히스토리 데이터 조회
  const fetchHistoryData = async () => {
    if (!deviceId) return;

    try {
      const historyResult = await mqttService.getSensorHistory(deviceId, 100, 24);

      // 🔥 404 에러는 정상적인 상황 (센서 데이터 없음)이므로 조용히 처리
      if (historyResult.success && historyResult.data && historyResult.data.length > 0) {
        const processedData = historyResult.data.map((item: any) => {
          if (!item.device_id && deviceId) {
            item.device_id = deviceId;
          }

          if ('temperature' in item && 'humidity' in item) {
            return convertLegacyToFlexible(item);
          }
          return item;
        }).filter((item: FlexibleSensorData) => {
          const validation = validateSensorData(item);
          return validation.valid;
        });

        setHistoryData(processedData);
      } else {
        // 404 에러가 아닌 경우에만 초기 히스토리 생성 시도
        if (historyResult.error !== '센서 데이터 없음') {
          await generateInitialHistoryFromCurrent();
        } else {
          // 404 에러는 빈 배열로 설정 (정상적인 상황)
          setHistoryData([]);
        }
      }
    } catch (error) {
      // 🔥 404 에러가 아닌 경우에만 초기 히스토리 생성 시도
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('404') && !errorMessage.includes('센서 데이터 없음')) {
        await generateInitialHistoryFromCurrent();
      } else {
        // 404 에러는 빈 배열로 설정 (정상적인 상황)
        setHistoryData([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // 현재 데이터로 히스토리 생성
  const generateInitialHistoryFromCurrent = async () => {
    if (!deviceId) return;
    
    // 🔥 장치가 오프라인이면 히스토리 생성하지 않음
    // 🔥 항상 API를 호출하여 실제 데이터 수신 여부 확인
    // isDeviceOnline 체크를 제거하고, 실제 데이터로 온라인/오프라인 판단
    try {
      const currentResult = await mqttService.getRealtimeSensorData(deviceId);

      if (currentResult.success && currentResult.data) {
        let currentData = currentResult.data;

        if (currentData.c && currentData.d && currentData.s) {
          currentData = decompressData(currentData);
        }

        // 🔥 원본 타임스탬프 유지 (현재 시각으로 변경하지 않음)
        if (currentData.timestamp) {
          if (typeof currentData.timestamp === 'number' && currentData.timestamp < 1000000000000) {
            // 잘못된 타임스탬프만 현재 시각으로 수정
            currentData.timestamp = Date.now();
          } else if (typeof currentData.timestamp === 'string') {
            currentData.timestamp = new Date(currentData.timestamp).getTime();
          }
          // 유효한 타임스탬프는 그대로 유지
        } else {
          currentData.timestamp = Date.now();
        }

        if (!currentData.device_id && deviceId) {
          currentData.device_id = deviceId;
        }

        // 🔥 원본 타임스탬프를 기준으로 히스토리 생성 (현재 시각이 아님)
        const baseTimestamp = currentData.timestamp;
        const initialHistory: FlexibleSensorData[] = [];

        for (let i = 9; i >= 0; i--) {
          const historicalData: FlexibleSensorData = {
            ...currentData,
            timestamp: baseTimestamp - (i * 60000), // 🔥 원본 타임스탬프 기준으로 과거 데이터 생성
            receivedAt: new Date(baseTimestamp - (i * 60000)).toISOString()
          };
          initialHistory.push(historicalData);
        }

        setHistoryData(initialHistory);
        setLatestData(currentData);
      } else {
        setHistoryData([]);
      }
    } catch (error) {
      setHistoryData([]);
    }
  };

  // 압축 데이터 해제
  const decompressData = (compressed: any): FlexibleSensorData => {
    const sensorTypeNames = {
      1: '온습도센서',
      2: '조도센서',
      3: '수질센서',
      4: '대기질센서',
      5: '온도센서',
      11: '무선환경센서',
      12: '압력센서',
      13: '유량센서',
      14: '릴레이',
      15: '전력센서'
    };

    const sensorTypes = {
      1: { name: '온습도센서', protocol: 'i2c', values: ['온도', '습도'] },
      2: { name: '조도센서', protocol: 'i2c', values: ['조도'] },
      3: { name: '수질센서', protocol: 'i2c', values: ['전압0', '전압1', 'pH', 'EC', '온도'] },
      4: { name: '대기질센서', protocol: 'i2c', values: ['CO2', '온도', '습도'] },
      5: { name: '온도센서', protocol: 'i2c', values: ['온도'] }
    };

    // 🔥 먼저 모든 센서를 파싱하고, 동종 센서에 대해 채널 재계산
    // 🔥 압축 데이터 구조: [sensorId, type, slaveId(Combined ID), channel(UNO_ID), ...values]
    const rawSensors = compressed.s.map((s: number[]) => {
      const typeInfo = sensorTypes[s[1] as keyof typeof sensorTypes] || {
        name: 'UNKNOWN',
        protocol: 'unknown',
        values: []
      };
      const slaveId = s[2]; // Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
      const channel = s[3]; // CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
      // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)
      const values = s.slice(4).map(v => v / 100);
      const friendlyName = sensorTypeNames[s[1] as keyof typeof sensorTypeNames] || 'UNKNOWN';

      return {
        sensor_id: s[0],
        type: s[1],
        protocol: typeInfo.protocol,
        channel: channel, // 🔥 UNO_ID를 CH로 직접 사용
        slaveId: slaveId, // 🔥 Combined ID 저장
        status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
        active: true,
        values: values,
        value_names: typeInfo.values.slice(0, values.length),
        _tempForChannelRecalc: true // 🔥 채널 재계산 플래그
      };
    });

    // 🔥 동종 센서에 대해 채널 번호 1,2,3... 재할당
    const channelCounters: Record<number, number> = {};
    rawSensors.forEach((sensor: any) => {
      if (sensor._tempForChannelRecalc) {
        const typeKey = sensor.type;
        if (!channelCounters[typeKey]) {
          channelCounters[typeKey] = 0;
        }
        channelCounters[typeKey]++;
        sensor.channel = channelCounters[typeKey]; // 🔥 실제 채널 번호 할당
        delete sensor._tempForChannelRecalc;
      }
    });

    // 🔥 센서 이름 생성 (재할당된 채널 번호 사용)
    rawSensors.forEach((sensor: any) => {
      const friendlyName = sensorTypeNames[sensor.type as keyof typeof sensorTypeNames] || 'UNKNOWN';
      sensor.name = `${friendlyName}_CH${sensor.channel}`;
    });

    return {
      device_id: deviceId || compressed.d,
      timestamp: Date.now(),
      sensor_count: compressed.c,
      sensors: rawSensors
    };
  };

  // 차트 데이터 준비 (캐시 데이터 포함)
  const prepareChartData = (): ChartDataPoint[] => {
    const dataToUse = displayHistoryData;
    if (!dataToUse.length) return [];

    return dataToUse.slice(-30).map(data => {
      const chartPoint: ChartDataPoint = {
        time: new Date(data.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      data.sensors?.forEach(sensor => {
        if (sensor.active && sensor.values.length > 0) {
          sensor.values.forEach((value, index) => {
            let label = '';
            switch (sensor.type) {
              case 1:
                if (index === 0) label = `${sensor.name.replace('_CH', '')}_온도`;
                else if (index === 1) label = `${sensor.name.replace('_CH', '')}_습도`;
                break;
              case 2:
                label = `${sensor.name.replace('_CH', '')}_조도`;
                break;
              case 3:
                const labels = ['수온', 'EC', 'pH', '예비'];
                label = `${sensor.name.replace('_CH', '')}_${labels[index] || `값${index}`}`;
                break;
              case 4:
                const scd30Labels = ['CO2', '온도', '습도'];
                label = `${sensor.name.replace('_CH', '')}_${scd30Labels[index] || `값${index}`}`;
                break;
              case 5:
                label = `${sensor.name.replace('_CH', '')}_온도`;
                break;
              case 19: // 토양센서 (pH, EC, 온도, 습도 순서)
                const soilLabels = ['pH', 'EC', '온도', '습도'];
                label = `${sensor.name.replace('_CH', '')}_${soilLabels[index] || `값${index}`}`;
                break;
              default:
                label = `${sensor.name}_값${index}`;
            }

            if (typeof value === 'number' && !isNaN(value)) {
              chartPoint[label] = Number(value.toFixed(2));
            }
          });
        }
      });

      return chartPoint;
    });
  };

  // 차트 데이터 캐시 준비 (타입 수정)
  const prepareChartDataFromCache = (): ChartDataPoint[] => {
    if (!cachedHistoryData.length) return [];

    return cachedHistoryData.slice(-30).map(data => {
      const chartPoint: ChartDataPoint = {
        time: new Date(data.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      data.sensors?.forEach(sensor => {
        if (sensor.active && sensor.values.length > 0) {
          sensor.values.forEach((value, index) => {
            let label = '';
            switch (sensor.type) {
              case 1:
                if (index === 0) label = `${sensor.name.replace('_CH', '')}_온도`;
                else if (index === 1) label = `${sensor.name.replace('_CH', '')}_습도`;
                break;
              case 2:
                label = `${sensor.name.replace('_CH', '')}_조도`;
                break;
              case 3:
                const labels = ['수온', 'EC', 'pH', '예비'];
                label = `${sensor.name.replace('_CH', '')}_${labels[index] || `값${index}`}`;
                break;
              case 4:
                const scd30Labels = ['CO2', '온도', '습도'];
                label = `${sensor.name.replace('_CH', '')}_${scd30Labels[index] || `값${index}`}`;
                break;
              case 5:
                label = `${sensor.name.replace('_CH', '')}_온도`;
                break;
              case 19: // 토양센서 (pH, EC, 온도, 습도 순서)
                const soilLabels = ['pH', 'EC', '온도', '습도'];
                label = `${sensor.name.replace('_CH', '')}_${soilLabels[index] || `값${index}`}`;
                break;
              default:
                label = `${sensor.name}_값${index}`;
            }

            if (typeof value === 'number' && !isNaN(value)) {
              chartPoint[label] = Number(value.toFixed(2));
            }
          });
        }
      });

      return chartPoint;
    });
  };

  // 데이터 새로고침
  const refreshData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchLatestData(), fetchHistoryData()]);
    } finally {
      setLoading(false);
    }
  };

  // 초기 데이터 로딩 (캐시 로드 포함)
  useEffect(() => {
    if (deviceId) {
      // 먼저 캐시된 데이터 로드
      loadCachedData();

      fetchLatestData();
      fetchHistoryData();
      loadWeatherData();

      const interval = setInterval(fetchLatestData, 6000);
      return () => clearInterval(interval);
    }
  }, [deviceId, loadWeatherData]);

  // 연결 상태 정보
  const getConnectionStatusInfo = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          status: 'connected',
          message: '실시간 연결됨',
          color: 'bg-green-400 animate-pulse',
          canShowDashboard: true
        };
      case 'offline':
        return {
          status: 'offline',
          message: '일시적 연결 문제',
          color: 'bg-yellow-400',
          canShowDashboard: true
        };
      case 'no_data':
        return {
          status: 'no_data',
          message: '센서 데이터 없음',
          color: 'bg-gray-400',
          canShowDashboard: true
        };
      default:
        return {
          status: 'unknown',
          message: '연결 상태 확인 중...',
          color: 'bg-gray-300',
          canShowDashboard: false
        };
    }
  };

  // 디바이스 ID 없음 처리
  if (!deviceId) {
    return (
      <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
        <div className="flex items-center justify-center min-h-96">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">디바이스 ID 없음</h2>
            <p className="text-gray-600 mb-4">유효한 디바이스 ID가 필요합니다.</p>
            <button
              onClick={() => navigate('/devices')}
              className="inline-block w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              ← 장치 목록으로
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // 로딩 상태
  if (loading && !displayData) {
    return (
      <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
        <div className="flex items-center justify-center min-h-96">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700">센서 데이터 로딩 중...</h2>
            <p className="text-gray-500 mt-2">디바이스 연결을 확인하고 있습니다.</p>
            <p className="text-sm text-gray-400 mt-1">디바이스 ID: {deviceId}</p>
          </div>
        </div>
      </Layout>
    );
  }

  const chartData = prepareChartData();

  return (
    <Layout maxWidth="wide" padding={isMobile ? "sm" : "md"} background="gray">
      <div className="h-full overflow-hidden">
        {/* 연결 상태 경고 */}
        {renderConnectionAlert()}

        {/* 탭 네비게이션 */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="grid grid-cols-2 gap-0">
            <button
              onClick={() => setActiveTab('sensor')}
              className={`px-2 sm:px-4 py-3 text-center font-medium rounded-l-lg transition-colors flex items-center justify-center space-x-1 sm:space-x-2 ${activeTab === 'sensor'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              <img
                src="/chart.png"
                alt="센서 차트"
                className="w-4 h-4 sm:w-5 sm:h-5"
              />
              <span className="text-xs sm:text-base">센서</span>
              {/* 오프라인 상태 표시 */}
              {!isDeviceConnected && displayData && (
                <span className="ml-1 w-2 h-2 bg-amber-400 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`px-2 sm:px-4 py-3 text-center font-medium rounded-r-lg transition-colors flex items-center justify-center space-x-1 sm:space-x-2 ${activeTab === 'notifications'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              <img
                src="/bell.png"
                alt="알림 벨"
                className="w-4 h-4 sm:w-5 sm:h-5"
              />
              <span className="text-xs sm:text-base">알림</span>
            </button>
          </div>
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'sensor' ? (
          /* 센서 대시보드 내용 */
          <div className={`${isMobile ? 'space-y-6 h-full flex flex-col' : 'grid grid-cols-10 gap-6 h-full'}`}>

            {/* 좌측: 센서 데이터 영역 (데스크톱 7/10 = 70%, 모바일 전체) */}
            <div className={`${isMobile ? 'flex-1 min-h-0' : 'col-span-7 h-full'} flex flex-col`}>
              <div className="flex-1 min-h-0">
                {/* 데이터가 아예 없는 경우 (캐시 데이터도 없고, 히스토리 데이터도 없고, 로딩 중이 아니고, 실제로 데이터가 없는 경우만) */}
                {!loading && !displayData && !cachedData && historyData.length === 0 && cachedHistoryData.length === 0 && connectionStatus === 'no_data' && !latestData ? (
                  <div className="bg-white rounded-lg shadow p-6 sm:p-8 text-center">
                    <div className="text-6xl mb-4">📡</div>
                    <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-800">센서 데이터 없음</h3>
                    <p className="text-gray-500 mb-6 text-sm sm:text-base">
                      이 디바이스는 아직 센서 데이터를 전송하지 않았습니다.
                    </p>
                    <div className="space-y-3 text-xs sm:text-sm text-gray-600">
                      <p>• 디바이스가 전원에 연결되어 있는지 확인하세요</p>
                      <p>• Wi-Fi 또는 네트워크 연결을 확인하세요</p>
                      <p>• MQTT 설정이 올바른지 확인하세요</p>
                    </div>
                    <button
                      onClick={refreshData}
                      className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm sm:text-base"
                    >
                      연결 재시도
                    </button>
                  </div>
                ) : (
                  /* 센서 데이터 컴포넌트 - 캐시 데이터와 오프라인 상태 정보 전달 */
                  <FlexibleSensorTabContent
                    latestData={displayData}
                    chartData={chartData}
                    isMobile={isMobile}
                    historyData={displayHistoryData}
                    deviceId={deviceId}
                    hideSensorInfo={true}
                    hideDataManagement={false}
                    hideAlerts={true}
                    // 오프라인 대응 props 추가
                    isDeviceConnected={isDeviceConnected}
                    cachedData={latestData ? null : cachedData}
                    cachedChartData={historyData.length > 0 ? [] : prepareChartDataFromCache()}
                    lastDataUpdateTime={lastConnectedTime}
                  />
                )}
              </div>
            </div>

            {/* 우측: 스트림 뷰어 + 날씨 + 평면도 (데스크톱만 3/10 = 30%) */}
            {!isMobile && (
              <div className="col-span-3 h-full space-y-4 overflow-hidden flex flex-col">
                {/* 스트림 뷰어 */}
                <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0 flex flex-col">
                  <div className="p-3 border-b bg-white flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800 flex items-center text-sm">
                        <img src="/cctv.png" alt="CCTV" className="w-4 h-4 mr-1" />
                        연결된 CCTV
                        {streamLoading && (
                          <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                        )}
                        {/* 오프라인 상태 표시 */}
                        {!isDeviceConnected && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                            오프라인
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <div className="text-xs text-gray-500">
                          {allStreams.length}개
                        </div>
                        <button
                          onClick={refreshStreams}
                          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                          title="스트림 새로고침"
                        >
                          <img src="/refresh.png" alt="새로고침" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {renderStreamViewer()}
                  </div>
                </div>

                {/* 날씨 위젯 */}
                <div className="bg-white rounded-lg shadow flex-shrink-0">
                  <div className="p-3 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
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

                {/* 홈 온실 평면도 - 컴팩트 버전 (데스크톱만) */}
                <div className="bg-white rounded-lg shadow flex-shrink-0">
                  <div className="p-3 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
                      <img src="/home.png" alt="홈" className="w-5 h-5" />
                      <h3 className="text-sm font-semibold text-gray-900">센서 배치도</h3>
                      {/* 데이터 상태 표시 */}
                      {!isDeviceConnected && displayData && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          마지막 데이터
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-2 h-64">
                    <HomeGreenhouseViewer
                      groupId={deviceId!}
                      groupData={stableHomeGreenhouseData.data}
                      compactMode={true}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 모바일용 스트림 뷰어, 날씨, 평면도 */}
            {isMobile && (
              <>
                {/* 모바일 스트림 뷰어 */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="p-4 border-b bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800 flex items-center">
                        연결된 CCTV ({allStreams.length}개)
                        {streamLoading && (
                          <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        )}
                        {!isDeviceConnected && (
                          <span className="ml-2 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded">
                            오프라인
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={refreshStreams}
                        className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        새로고침
                      </button>
                    </div>
                  </div>
                  <div className="h-80 overflow-hidden">
                    {renderStreamViewer()}
                  </div>
                </div>

                {/* 모바일 날씨 위젯 */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
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
                <div className="bg-white rounded-lg shadow">
                  {!isGreenhouseExpanded && (
                    <div
                      className="hidden sm:block p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
                      onClick={() => setIsGreenhouseExpanded(true)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">🏠</span>
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
                            <img src="/home.png" alt="홈" className="w-5 h-5" />
                            <h3 className="text-lg font-semibold text-gray-900">센서 배치도</h3>
                            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              디바이스 {deviceId}
                            </span>
                            {!isDeviceConnected && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                                마지막 데이터
                              </span>
                            )}
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
                            groupId={deviceId!}
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
        ) : (
          /* 알림 탭 컨텐츠 */
          <div className="w-full overflow-hidden">
            <AlertSettings
              deviceId={deviceId!}
              latestSensorData={displayData || undefined}
            />
          </div>
        )}

        {/* 온실 평면도 - 최하단 (데스크톱/모바일 공통) - 접기/펼치기 기능 */}
        {displayData && activeTab === 'sensor' && (
          <div className="bg-white rounded-lg shadow mt-6">
            {!isBottomGreenhouseExpanded && (
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
                onClick={() => setIsBottomGreenhouseExpanded(true)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <img src="/home.png" alt="홈" className="w-5 h-5" />
                    <div>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-800">센서 배치도</h3>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {!isDeviceConnected && (
                          <span className="ml-2 text-amber-600">(마지막 데이터)</span>
                        )}
                      </p>
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

            {isBottomGreenhouseExpanded && (
              <>
                <div className="p-4 lg:p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img src="/home.png" alt="홈" className="w-5 h-5" />
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800">센서 배치도</h3>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {!isDeviceConnected && (
                            <span className="ml-2 text-amber-600">(마지막 데이터)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsBottomGreenhouseExpanded(false)}
                      className="flex items-center space-x-1 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      <span>접기</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="p-4 lg:p-6" style={{ height: '700px' }}>
                  <GreenhouseFloorPlan
                    groupId={deviceId!}
                    groupData={stableGreenhouseData.data}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SensorDashboard;