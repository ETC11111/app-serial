// components/home/GroupSensorDashboardContent.tsx - 그룹 선택 시 자동 디바이스 전환 방지
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Device } from '../../types/device.types';
import { FlexibleSensorData } from '../../types/sensor.types';
import { FlexibleSensorTabContent } from '../sensor/FlexibleSensorTabContent';
import { WeatherWidget } from '../weather/WeatherWidget';
import HomeGreenhouseViewer from '../greenhouse/HomeGreenhouseViewer';
import CSVDownloadSection from '../CSVDownloadSection';
import GroupStreamViewer from '../GroupStreamViewer';
import { mqttService } from '../../services/mqttService';
import { validateSensorData, convertLegacyToFlexible } from '../../utils/sensorUtils';

interface GroupSensorDashboardContentProps {
  selectedGroup: any;
  groupDevices: Device[];
  isMobile: boolean;
  weatherData: any;
  weatherLoading: boolean;
  weatherError: any;
  weatherForecast: any;
  selectedRegion: string;
  onWeatherRefresh: (region?: string) => void;
  onRegionChange: (region: string) => void;
  devices: Device[];
  // 🔥 디바이스 상태 판단 함수들 추가
  getDeviceStatus: (device: Device) => 'online' | 'offline' | 'pending';
  isDeviceOnline: (device: Device) => boolean;
  getLastConnectedTime: (device: Device) => string | null;
}

// 🔥 개별 디바이스용 센서 데이터 훅 (오프라인 지원)
const useDeviceSensorDataWithStatus = (
  device: Device | null,
  getDeviceStatus: (device: Device) => 'online' | 'offline' | 'pending',
  isDeviceOnline: (device: Device) => boolean
) => {
  const [latestData, setLatestData] = useState<FlexibleSensorData | null>(null);
  const [historyData, setHistoryData] = useState<FlexibleSensorData[]>([]);
  const [sensorLoading, setSensorLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'offline' | 'no_data'>('unknown');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [cachedData, setCachedData] = useState<FlexibleSensorData | null>(null);

  // 중복 요청 방지
  const isLoadingRef = useRef(false);
  const currentDeviceRef = useRef<string | null>(null);

  // 센서 타입별 친숙한 이름 매핑
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

  // 압축 데이터 해제
  const decompressData = useCallback((compressed: any): FlexibleSensorData => {
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
      device_id: compressed.d,
      timestamp: Date.now(),
      sensor_count: compressed.c,
      sensors: rawSensors
    };
  }, [sensorTypeNames]);

  // 🔥 최신 데이터 가져오기 (오프라인 상태 고려)
  const fetchLatestData = useCallback(async (targetDevice: Device) => {
    try {
      // 1. 디바이스 상태 먼저 확인
      const deviceStatus = getDeviceStatus(targetDevice);
      const isOnline = isDeviceOnline(targetDevice);

      console.log(`🔍 디바이스 ${targetDevice.device_name} 상태 확인:`, {
        deviceStatus,
        isOnline,
        last_seen_at: targetDevice.last_seen_at
      });

      // 2. 센서 데이터 조회 시도 (오프라인이어도 마지막 데이터가 있을 수 있음)
      const result = await mqttService.getRealtimeSensorData(targetDevice.device_id);

      if (result.success && result.data) {
        let sensorData = result.data;

        // 타임스탬프 검증 및 수정
        if (sensorData.timestamp) {
          if (typeof sensorData.timestamp === 'number' && sensorData.timestamp < 1000000000000) {
            sensorData.timestamp = Date.now();
          } else if (typeof sensorData.timestamp === 'string') {
            sensorData.timestamp = new Date(sensorData.timestamp).getTime();
          }
        } else {
          sensorData.timestamp = Date.now();
        }

        if (!sensorData.receivedAt) {
          sensorData.receivedAt = new Date().toISOString();
        }

        // 압축된 데이터 처리
        if (sensorData.c && sensorData.d && sensorData.s) {
          sensorData = decompressData(sensorData);
        }

        // 데이터 유효성 검사
        const validation = validateSensorData(sensorData);

        if (validation.valid) {
          // 🔥 데이터 타임스탬프가 최근 1분 이내인지 확인
          const dataTime = typeof sensorData.timestamp === 'string' 
            ? new Date(sensorData.timestamp).getTime()
            : sensorData.timestamp;
          const now = Date.now();
          const diffMinutes = (now - dataTime) / (1000 * 60);
          
          // 🔥 디바이스 상태와 데이터 타임스탬프를 모두 확인
          if (isOnline && diffMinutes < 1) {
            // 온라인 상태이고 최근 데이터: 실시간 데이터
            setLatestData(sensorData);
            setConnectionStatus('connected');
            setLastUpdateTime(new Date());
            console.log(`✅ 온라인 디바이스 ${targetDevice.device_name} 실시간 데이터 수신`);
            
            // 히스토리 데이터에 추가
            setHistoryData(prev => {
              const newHistory = [...prev, sensorData];
              return newHistory.slice(-30);
            });
          } else {
            // 오프라인 상태이거나 오래된 데이터: 캐시 데이터로 처리
            setLatestData(null); // 실시간 데이터 없음
            setCachedData(sensorData); // 캐시 데이터로 보관
            setConnectionStatus('offline');
            if (!isOnline) {
              console.log(`📋 오프라인 디바이스 ${targetDevice.device_name} 캐시 데이터 사용`);
            } else {
              console.log(`⚠️ 디바이스 ${targetDevice.device_name} 데이터가 오래됨 (${diffMinutes.toFixed(1)}분 전) - 오프라인 처리`);
            }
          }
        } else {
          setLatestData(null);
          setConnectionStatus(isOnline ? 'no_data' : 'offline');
        }
      } else {
        // 센서 데이터가 없는 경우
        if (isOnline) {
          setConnectionStatus('no_data');
        } else {
          setConnectionStatus('offline');
        }
        console.log(`⚠️ 디바이스 ${targetDevice.device_name} 센서 데이터 없음 (상태: ${deviceStatus})`);
      }
    } catch (error) {
      console.error(`❌ 디바이스 ${targetDevice.device_name} 센서 데이터 가져오기 실패:`, error);
      const isOnline = isDeviceOnline(targetDevice);
      setConnectionStatus(isOnline ? 'no_data' : 'offline');
    }
  }, [decompressData, getDeviceStatus, isDeviceOnline]);

  // 히스토리 데이터 가져오기
  const fetchHistoryData = useCallback(async (targetDevice: Device) => {
    try {
      const historyResult = await mqttService.getSensorHistory(targetDevice.device_id, 100, 24);

      if (historyResult.success && historyResult.data && historyResult.data.length > 0) {
        const processedData = historyResult.data.map((item: any) => {
          if ('temperature' in item && 'humidity' in item) {
            return convertLegacyToFlexible(item);
          }
          return item;
        }).filter((item: FlexibleSensorData) => {
          const validation = validateSensorData(item as any);
          return validation.valid;
        });

        setHistoryData(processedData);
        console.log(`📊 디바이스 ${targetDevice.device_name} 히스토리 데이터 ${processedData.length}개 로드`);
      } else {
        await generateInitialHistoryFromCurrent(targetDevice);
      }
    } catch (error) {
      console.error(`❌ 디바이스 ${targetDevice.device_name} 히스토리 데이터 가져오기 실패:`, error);
      await generateInitialHistoryFromCurrent(targetDevice);
    }
  }, []);

  // 현재 데이터로 즉시 히스토리 생성
  const generateInitialHistoryFromCurrent = useCallback(async (targetDevice: Device) => {
    try {
      const currentResult = await mqttService.getRealtimeSensorData(targetDevice.device_id);

      if (currentResult.success && currentResult.data) {
        let currentData = currentResult.data;

        if (currentData.c && currentData.d && currentData.s) {
          currentData = decompressData(currentData);
        }

        if (currentData.timestamp && currentData.timestamp < 1000000000000) {
          currentData.timestamp = Date.now();
        }

        const initialHistory: FlexibleSensorData[] = [];
        const now = Date.now();

        for (let i = 9; i >= 0; i--) {
          const historicalData: FlexibleSensorData = {
            ...currentData,
            timestamp: now - (i * 60000),
            receivedAt: new Date(now - (i * 60000)).toISOString()
          };
          initialHistory.push(historicalData);
        }

        setHistoryData(initialHistory);
        console.log(`📈 디바이스 ${targetDevice.device_name} 즉시 히스토리 ${initialHistory.length}개 생성`);
      } else {
        setHistoryData([]);
      }
    } catch (error) {
      console.error(`❌ 디바이스 ${targetDevice.device_name} 즉시 히스토리 생성 실패:`, error);
      setHistoryData([]);
    }
  }, [decompressData]);

  // 차트 데이터 준비
  const prepareChartData = useCallback(() => {
    if (!historyData.length) return [];

    return historyData.slice(-30).map(data => {
      const chartPoint: any = {
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
              case 1: // 온습도센서
                if (index === 0) label = `${sensor.name.replace('_CH', '')}_온도`;
                else if (index === 1) label = `${sensor.name.replace('_CH', '')}_습도`;
                break;
              case 2: // 조도센서
                label = `${sensor.name.replace('_CH', '')}_조도`;
                break;
              case 3: // 수질센서
                const labels = ['수온', 'EC', 'pH', '예비'];
                label = `${sensor.name.replace('_CH', '')}_${labels[index] || `값${index}`}`;
                break;
              case 4: // CO2센서
                const scd30Labels = ['CO2', '온도', '습도'];
                label = `${sensor.name.replace('_CH', '')}_${scd30Labels[index] || `값${index}`}`;
                break;
              case 5: // 온도센서
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
  }, [historyData]);

  const refreshData = useCallback(async () => {
    if (!device) return;

    setSensorLoading(true);
    currentDeviceRef.current = null;
    try {
      await Promise.all([
        fetchLatestData(device),
        fetchHistoryData(device)
      ]);
    } finally {
      setSensorLoading(false);
    }
  }, [device, fetchLatestData, fetchHistoryData]);

  // 디바이스 변경 시 데이터 로드
  useEffect(() => {
    if (device && device.device_id !== currentDeviceRef.current && !isLoadingRef.current) {
      isLoadingRef.current = true;
      currentDeviceRef.current = device.device_id;
      setSensorLoading(true);

      // 🔥 기존 데이터 클리어
      setLatestData(null);
      setCachedData(null);
      setHistoryData([]);
      setConnectionStatus('unknown');

      Promise.all([
        fetchLatestData(device),
        fetchHistoryData(device)
      ]).finally(() => {
        setSensorLoading(false);
        isLoadingRef.current = false;
      });
    }
  }, [device?.device_id, fetchLatestData, fetchHistoryData]);

  return {
    latestData,
    historyData,
    sensorLoading,
    connectionStatus,
    lastUpdateTime,
    cachedData, // 🔥 캐시 데이터 추가
    refreshData,
    prepareChartData,
  };
};

export const GroupSensorDashboardContent: React.FC<GroupSensorDashboardContentProps> = ({
  selectedGroup,
  groupDevices,
  isMobile,
  weatherData,
  weatherLoading,
  weatherError,
  weatherForecast,
  selectedRegion,
  onWeatherRefresh,
  onRegionChange,
  devices,
  getDeviceStatus,
  isDeviceOnline,
  getLastConnectedTime
}) => {
  // 🔥 자동 선택 방지: null로 시작 (사용자가 명시적으로 선택할 때까지 기다림)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [isGreenhouseExpanded, setIsGreenhouseExpanded] = useState(false);

  // 🔥 선택된 디바이스 객체 (null일 수 있음)
  const selectedDevice = selectedDeviceId
    ? groupDevices.find(d => d.device_id === selectedDeviceId)
    : null;

  // 🔥 상태 정보를 포함한 센서 데이터 훅 사용 (선택된 디바이스가 있을 때만)
  const {
    latestData,
    historyData,
    sensorLoading,
    connectionStatus,
    lastUpdateTime,
    cachedData,
    refreshData,
    prepareChartData,
  } = useDeviceSensorDataWithStatus(selectedDevice || null, getDeviceStatus, isDeviceOnline);

  // 🔥 자동 디바이스 선택 제거: 사용자가 명시적으로 선택할 때만 디바이스 설정
  // useEffect 제거하여 자동 선택 방지

  const handleDeviceClick = useCallback((device: Device) => {
    console.log('🔄 디바이스 선택:', {
      deviceName: device.device_name,
      deviceId: device.device_id,
      status: getDeviceStatus(device),
      isOnline: isDeviceOnline(device)
    });
    setSelectedDeviceId(device.device_id);
  }, [getDeviceStatus, isDeviceOnline]);

  const handleExportData = useCallback(() => {
    if (!selectedDevice?.device_id) {
      alert('디바이스가 선택되지 않았습니다.');
      return;
    }
    setShowCSVModal(true);
  }, [selectedDevice]);

  // 🔥 디바이스 상태 기반 색상 및 텍스트
  const getDeviceStatusColor = useCallback((device: Device) => {
    const status = getDeviceStatus(device);
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'offline':
      default:
        return 'bg-red-100 text-red-800';
    }
  }, [getDeviceStatus]);

  const getDeviceStatusText = useCallback((device: Device) => {
    const status = getDeviceStatus(device);
    switch (status) {
      case 'online':
        return '온라인';
      case 'pending':
        return '대기중';
      case 'offline':
      default:
        return '오프라인';
    }
  }, [getDeviceStatus]);

  // 🔥 그룹 전체 상태 요약 계산
  const groupStatusSummary = React.useMemo(() => {
    const total = groupDevices.length;
    const online = groupDevices.filter(device => isDeviceOnline(device)).length;
    const offline = total - online;
    
    return {
      total,
      online,
      offline,
      onlinePercentage: total > 0 ? Math.round((online / total) * 100) : 0
    };
  }, [groupDevices, isDeviceOnline]);

  // 홈 화면용 온실 평면도 데이터 준비
  const stableHomeGreenhouseData = React.useMemo(() => {
    if (!groupDevices.length) {
      return { data: [], key: 'empty' };
    }

    const groupData = groupDevices.map(device => ({
      device_id: device.device_id,
      device_name: device.device_name,
      group_id: selectedGroup.group_id,
      // 🔥 선택된 디바이스만 센서 데이터 표시, 나머지는 null
      flexibleData: selectedDevice?.device_id === device.device_id ? (latestData || cachedData || undefined) : undefined
    }));

    return {
      data: groupData,
      key: `group-${selectedGroup.group_id}-${groupDevices.length}-${selectedDeviceId}-${(latestData || cachedData)?.timestamp || 'no-data'}`
    };
  }, [selectedGroup.group_id, groupDevices.length, selectedDeviceId, latestData?.timestamp, cachedData?.timestamp]);

  // 스트림 뷰어 렌더링
  const renderStreamViewer = useCallback(() => {
    if (!selectedGroup?.group_id) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-3">📹</div>
            <h3 className="text-lg font-medium mb-2">그룹이 선택되지 않았습니다</h3>
            <p className="text-sm">유효한 그룹을 선택해주세요.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-hidden">
        <GroupStreamViewer
          groupId={selectedGroup.group_id}
          groupName={selectedGroup.group_name}
        />
      </div>
    );
  }, [selectedGroup?.group_id, selectedGroup?.group_name]);

  const chartData = prepareChartData();
  const activeSensors = (latestData || cachedData)?.sensors?.filter((sensor: any) => sensor.active) || [];
  
  // 🔥 현재 선택된 디바이스의 연결 정보
  const deviceConnectionInfo = React.useMemo(() => {
    if (!selectedDevice) {
      return {
        isConnected: false,
        lastConnectedTime: null,
        deviceStatus: 'offline' as const
      };
    }

    return {
      isConnected: isDeviceOnline(selectedDevice),
      lastConnectedTime: getLastConnectedTime(selectedDevice),
      deviceStatus: getDeviceStatus(selectedDevice)
    };
  }, [selectedDevice, isDeviceOnline, getLastConnectedTime, getDeviceStatus]);

  // 🔥 그룹 개요 화면 렌더링 (디바이스 선택 전)
  const renderGroupOverview = () => {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">👥</div>
          <h3 className="text-2xl font-semibold mb-2 text-gray-800">{selectedGroup.group_name} 그룹</h3>
          <p className="text-gray-500 mb-6">
            그룹에 속한 디바이스들의 상태를 확인하고 개별 디바이스를 선택하여 상세 정보를 확인하세요.
          </p>
        </div>

        {/* 그룹 상태 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{groupStatusSummary.total}</div>
            <div className="text-sm text-blue-800">전체 디바이스</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{groupStatusSummary.online}</div>
            <div className="text-sm text-green-800">온라인</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{groupStatusSummary.offline}</div>
            <div className="text-sm text-red-800">오프라인</div>
          </div>
        </div>

        {/* 그룹 상태 바 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">그룹 상태</span>
            <span className="text-sm text-gray-600">{groupStatusSummary.onlinePercentage}% 온라인</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-green-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${groupStatusSummary.onlinePercentage}%` }}
            ></div>
          </div>
        </div>

        {/* 디바이스 선택 안내 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-gray-600 mb-2">
            <strong>상세 정보를 보려면:</strong>
          </div>
          <p className="text-sm text-gray-500">
            위의 디바이스 탭 중 하나를 클릭하여 해당 디바이스의 센서 데이터와 차트를 확인하세요.
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {showCSVModal && (
        <CSVDownloadSection
          deviceId={selectedDevice?.device_id || ''}
          availableSensors={activeSensors}
          historyData={historyData}
          isModal={true}
          onClose={() => setShowCSVModal(false)}
        />
      )}

      <div className={`space-y-4 h-full flex flex-col ${isMobile ? 'mx-4' : ''}`} >
        {/* 그룹 헤더 및 디바이스 선택 탭 */}
        <div className="bg-white rounded-lg shadow mt-5">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  {selectedGroup.group_name}
                  <span className="ml-3 text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                    {groupStatusSummary.online}/{groupStatusSummary.total} 온라인
                  </span>
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                {/* 🔥 선택된 디바이스가 있을 때만 새로고침 버튼 활성화 */}
                <button
                  onClick={refreshData}
                  disabled={!selectedDevice || sensorLoading}
                  className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center ${
                    selectedDevice 
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <img
                    src="/refresh.png"
                    alt="새로고침"
                    className={`w-4 h-4 mr-2 ${sensorLoading ? 'animate-spin' : ''}`}
                  />
                  {sensorLoading ? '로딩중...' : '새로고침'}
                </button>
              </div>
            </div>
          </div>

          {/* 🔥 디바이스 선택 탭 (상태 정보 포함) */}
          <div className="p-4">
            <div className="flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide">
              {groupDevices.map((device) => {
                const isSelected = selectedDevice?.device_id === device.device_id;
                const deviceStatus = getDeviceStatus(device);
                const isOnline = isDeviceOnline(device);
                
                return (
                  <button
                    key={device.device_id}
                    onClick={() => handleDeviceClick(device)}
                    disabled={sensorLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 shrink-0 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span 
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      ></span>
                      <span>{device.device_name}</span>
                      {!isOnline && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          isSelected 
                            ? 'bg-red-500 bg-opacity-20 text-white' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          오프라인
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 메인 컨텐츠 영역 */}
        <div className={`${isMobile ? 'space-y-6 flex-1 flex flex-col ' : 'grid grid-cols-10 gap-6 flex-1'}`}>
          {/* 좌측: 센서 데이터 영역 또는 그룹 개요 */}
          <div className={`${isMobile ? 'flex-1 min-h-0' : 'col-span-7 h-full'} flex flex-col`}>
            {selectedDevice ? (
              // 🔥 디바이스가 선택된 경우: 기존 로직
              sensorLoading ? (
                <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <h2 className="text-xl font-semibold text-gray-700">센서 데이터 로딩 중...</h2>
                    <p className="text-gray-500 mt-2">{selectedDevice.device_name} 연결을 확인하고 있습니다.</p>
                  </div>
                </div>
              ) : (latestData || cachedData) ? (
                <div className="flex-1 min-h-0">
                  {/* 🔥 실제 디바이스 상태 정보와 함께 FlexibleSensorTabContent 호출 */}
                  <FlexibleSensorTabContent
                    latestData={latestData} // 실시간 데이터 (온라인인 경우)
                    chartData={chartData}
                    isMobile={isMobile}
                    historyData={historyData}
                    deviceId={selectedDevice.device_id}
                    hideSensorInfo={true}
                    hideDataManagement={false}
                    hideAlerts={true}
                    // 🔥 실제 연결 상태 정보 전달
                    isDeviceConnected={deviceConnectionInfo.isConnected}
                    cachedData={cachedData} // 오프라인시 표시할 캐시 데이터
                    cachedChartData={chartData} // 차트용 캐시 데이터
                    lastDataUpdateTime={deviceConnectionInfo.lastConnectedTime}
                  />
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="text-6xl mb-4">📡</div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">센서 데이터 없음</h3>
                  <p className="text-gray-500 mb-6">
                    {selectedDevice.device_name}에서 아직 센서 데이터를 전송하지 않았습니다.
                  </p>
                  <div className="space-y-3 text-sm text-gray-600 mb-6">
                    <p>• 디바이스 상태: <span className={`px-2 py-1 rounded text-xs font-medium ${getDeviceStatusColor(selectedDevice)}`}>
                      {getDeviceStatusText(selectedDevice)}
                    </span></p>
                    <p>• 디바이스가 MQTT 브로커에 연결되어 있는지 확인하세요</p>
                    <p>• Wi-Fi 또는 네트워크 연결을 확인하세요</p>
                    <p>• MQTT 설정이 올바른지 확인하세요</p>
                  </div>
                  <button
                    onClick={refreshData}
                    className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    🔄 연결 재시도
                  </button>
                </div>
              )
            ) : (
              // 🔥 디바이스가 선택되지 않은 경우: 그룹 개요 표시
              renderGroupOverview()
            )}
          </div>

          {/* 우측: 스트림 뷰어 + 날씨 + 평면도 */}
          {!isMobile && (
            <div className="col-span-3 h-full space-y-4 overflow-hidden flex flex-col">
              {/* 스트림 뷰어 */}
              <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0 flex flex-col mt-3">
                <div className="p-3 border-b bg-white flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center">
                      <img src="/cctv.png" alt="CCTV" className="w-5 h-5 mr-2" />
                      그룹 CCTV ({selectedGroup?.group_name || 'N/A'})
                    </h3>
                    <div className="text-xs text-gray-500">
                      {selectedGroup?.group_name || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden bg-white">
                  {renderStreamViewer()}
                </div>
              </div>

              {/* 날씨 위젯 */}
              <div className="bg-white rounded-lg shadow flex-shrink-0">
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

              {/* 그룹 평면도 */}
              <div className="bg-white rounded-lg shadow flex-shrink-0">
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <span>
                      <img src="/home.png" alt="홈 아이콘" className="inline-block w-5 h-5 align-middle" />
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900">센서 배치도</h3>
                  </div>
                </div>
                <div className="p-2 h-64">
                  <HomeGreenhouseViewer
                    groupId={selectedGroup.group_id}
                    groupData={stableHomeGreenhouseData.data}
                    compactMode={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 모바일용 추가 컨텐츠 */}
          {isMobile && (
            <>
              {/* 모바일용 스트림 뷰어 */}
              <div className="bg-white rounded-lg shadow overflow-hidden p-4">
                <div className="p-4 border-b bg-white">
                  <h3 className="font-semibold text-gray-800 flex items-center">
                    <img src="/cctv.png" alt="CCTV" className="w-5 h-5 mr-2" />
                    그룹 CCTV ({selectedGroup?.group_name || 'N/A'})
                  </h3>
                </div>
                <div className="h-80 overflow-hidden">
                  {renderStreamViewer()}
                </div>
              </div>

              {/* 날씨 위젯 */}
              <div className="bg-white rounded-lg shadow">
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

              {/* 그룹 평면도 */}
              <div className="bg-white rounded-lg shadow">
                {!isGreenhouseExpanded && (
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-200"
                    onClick={() => setIsGreenhouseExpanded(true)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span>
                          <img src="/home.png" alt="홈 아이콘" className="inline-block w-6 h-6 align-middle" />
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">센서 배치도</h3>
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
                          <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded">
                            {selectedGroup.group_name}
                          </span>
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
                          groupId={selectedGroup.group_id}
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