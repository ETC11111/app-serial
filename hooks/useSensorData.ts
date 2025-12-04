// hooks/useSensorData.ts - 오프라인 시 데이터 수집 중단 기능 추가

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Device } from '../types/device.types';
import { FlexibleSensorData, ChartDataPoint, DetectedSensor } from '../types/sensor.types';
import { mqttService } from '../services/mqttService';
import { validateSensorData, convertLegacyToFlexible } from '../utils/sensorUtils';

// 🔥 개선된 useSensorData 훅 - 오프라인 지원
export const useSensorData = () => {
  // 🔥 모든 useState를 맨 위에 모아서 순서 고정
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [latestData, setLatestData] = useState<FlexibleSensorData | null>(null);
  const [historyData, setHistoryData] = useState<FlexibleSensorData[]>([]);
  const [sensorLoading, setSensorLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'offline' | 'no_data'>('unknown');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [isDataCollectionPaused, setIsDataCollectionPaused] = useState(false);
  const [cachedLatestData, setCachedLatestData] = useState<FlexibleSensorData | null>(null);
  const [cachedHistoryData, setCachedHistoryData] = useState<FlexibleSensorData[]>([]);

  // 센서 타입별 친숙한 이름 매핑
  const sensorTypeNames = {
    1: '온습도센서',
    2: '조도센서', 
    3: '양액센서',
    4: '대기질센서',
    5: '온도센서',
    11: '무선환경센서',
    12: '압력센서',
    13: '유량센서',
    14: '릴레이',
    15: '전력센서'
  };

  // 🔥 디바이스 온라인 상태 판단 로직 (1분 기준)
  const isDeviceOnline = useCallback((device: Device | null): boolean => {
    if (!device) return false;
    
    // 1. 최근 데이터가 있으면 온라인
    if (latestData) {
      const dataTime = typeof latestData.timestamp === 'string' 
        ? new Date(latestData.timestamp).getTime()
        : latestData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      if (diffMinutes < 1) {
        return true;
      }
    }
    
    // 2. 디바이스 상태 필드 확인
    if (device.status === 'online') {
      return true;
    }
    
    // 3. last_seen_at 확인
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
      return diffMinutes < 1;
    }
    
    return false;
  }, [latestData]);

  // 🔥 데이터 수집 상태 제어 로직
  useEffect(() => {
    const deviceOnline = isDeviceOnline(selectedDevice);
    
    if (!deviceOnline && !isDataCollectionPaused) {
      // 오프라인으로 전환: 현재 데이터를 캐시에 저장하고 수집 중단
      if (latestData) {
        setCachedLatestData({ ...latestData });
      }
      if (historyData.length > 0) {
        setCachedHistoryData([...historyData]);
      }
      setIsDataCollectionPaused(true);
      setConnectionStatus('offline');
      console.log('🔴 데이터 수집 중단됨 (디바이스 오프라인)');
      
    } else if (deviceOnline && isDataCollectionPaused) {
      // 온라인으로 복귀: 데이터 수집 재개
      setIsDataCollectionPaused(false);
      setConnectionStatus('connected');
      console.log('🟢 데이터 수집 재개됨 (디바이스 온라인)');
    }
  }, [selectedDevice, latestData, isDataCollectionPaused, isDeviceOnline]);

  // 압축 데이터 해제
  const decompressData = useCallback((compressed: any): FlexibleSensorData => {
    const sensorTypes = {
      1: { name: '온습도센서', protocol: 'i2c', values: ['온도', '습도'] },
      2: { name: '조도센서', protocol: 'i2c', values: ['조도'] },
      3: { name: '양액센서', protocol: 'i2c', values: ['pH', 'EC'] },
      4: { name: '대기질센서', protocol: 'i2c', values: ['CO2', '온도', '습도'] },
      5: { name: '온도센서', protocol: 'i2c', values: ['온도'] }
    };

    // 🔥 압축 데이터 구조: [sensorId, type, slaveId(Combined ID), channel(UNO_ID), ...values]
    const rawSensors = compressed.s.map((s: number[]) => {
      const typeInfo = sensorTypes[s[1] as keyof typeof sensorTypes] || { 
        name: 'UNKNOWN', 
        protocol: 'unknown', 
        values: [] 
      };
      const values = s.slice(4).map(v => Number((v / 100).toFixed(2)));
      const friendlyName = sensorTypeNames[s[1] as keyof typeof sensorTypeNames] || 'UNKNOWN';
      const slaveId = s[2]; // Combined ID (하위 5비트=타입코드, 상위 3비트=UNO_ID)
      const channel = s[3]; // CH = UNO_ID (1~6, Mega에서 할당한 물리적 순서)
      // 🔥 status 필드 제거됨 (Mega에서 전송하지 않음)
      
      return {
        sensor_id: s[0],
        type: s[1],
        protocol: typeInfo.protocol,
        channel: channel, // 🔥 UNO_ID를 CH로 직접 사용 (Mega에서 할당한 물리적 순서)
        slaveId: slaveId, // 🔥 Combined ID 저장
        status: 1, // 항상 활성 (Mega에서 active 센서만 전송)
        active: true,
        values: values,
        value_names: typeInfo.values.slice(0, values.length)
      };
    });

    // 🔥 센서 이름 생성 (UNO_ID를 CH로 사용)
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

  // 센서 데이터 타입 정규화 함수
  const normalizeSensorData = useCallback((data: FlexibleSensorData): FlexibleSensorData => {
    return {
      ...data,
      sensors: data.sensors?.map((sensor: DetectedSensor) => ({
        ...sensor,
        values: sensor.values.map((v: string | number) => 
          typeof v === 'string' ? parseFloat(v) || 0 : Number(v)
        )
      })) || []
    };
  }, []);

  // 최신 데이터 가져오기
  const fetchLatestData = useCallback(async (deviceId: string) => {
    // 🔥 데이터 수집이 중단된 상태면 요청하지 않음
    if (isDataCollectionPaused) {
      console.log('⏸️ 데이터 수집이 중단된 상태 - API 호출 건너뛰기');
      return;
    }

    try {
      const result = await mqttService.getRealtimeSensorData(deviceId);

      if (result.success && result.data) {
        let sensorData = result.data;
        
        // 타임스탬프 검증 및 수정 (원본 타임스탬프 유지)
        if (sensorData.timestamp) {
          if (typeof sensorData.timestamp === 'number' && sensorData.timestamp < 1000000000000) {
            // 잘못된 타임스탬프만 현재 시각으로 수정
            sensorData.timestamp = Date.now();
          } else if (typeof sensorData.timestamp === 'string') {
            sensorData.timestamp = new Date(sensorData.timestamp).getTime();
          }
          // 🔥 유효한 타임스탬프는 그대로 유지 (현재 시각으로 변경하지 않음)
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
        
        // 센서 데이터 타입 정규화
        sensorData = normalizeSensorData(sensorData);
        
        // 데이터 유효성 검사
        const validation = validateSensorData(sensorData as any);
        
        if (validation.valid) {
          // 🔥 데이터 타임스탬프가 최근 1분 이내인지 확인
          const dataTime = typeof sensorData.timestamp === 'string' 
            ? new Date(sensorData.timestamp).getTime()
            : sensorData.timestamp;
          const now = Date.now();
          const diffMinutes = (now - dataTime) / (1000 * 60);
          
          if (diffMinutes < 1) {
            // 최근 데이터: 실시간 데이터로 설정
            setLatestData(sensorData);
            setLastUpdateTime(new Date());
            setConnectionStatus('connected');

            // 히스토리 데이터에 추가
            setHistoryData(prev => {
              const newHistory = [...prev, sensorData];
              return newHistory.slice(-30);
            });
          } else {
            // 오래된 데이터: 오프라인으로 처리
            console.log(`⚠️ 장치 ${deviceId} 데이터가 오래됨 (${diffMinutes.toFixed(1)}분 전) - 오프라인 처리`);
            setLatestData(null); // 🔥 오래된 데이터는 latestData로 설정하지 않음
            setConnectionStatus('offline');
          }
        } else {
          setLatestData(null);
          setConnectionStatus('no_data');
        }
      } else {
        // 데이터가 없으면 오프라인 상태로 설정
        setLatestData(null); // 🔥 데이터가 없으면 latestData를 null로 설정
        setConnectionStatus('offline');
      }
    } catch (error) {
      console.error('최신 센서 데이터 가져오기 실패:', error);
      setLatestData(null); // 🔥 에러 발생 시 latestData를 null로 설정
      setConnectionStatus('offline');
    }
  }, [decompressData, normalizeSensorData, isDataCollectionPaused]);

  // 히스토리 데이터 가져오기
  const fetchHistoryData = useCallback(async (deviceId: string) => {
    // 🔥 데이터 수집이 중단된 상태면 요청하지 않음
    if (isDataCollectionPaused) {
      console.log('⏸️ 데이터 수집이 중단된 상태 - 히스토리 API 호출 건너뛰기');
      return;
    }

    try {
      const historyResult = await mqttService.getSensorHistory(deviceId, 100, 24);
      
      // 🔥 404 에러는 정상적인 상황 (센서 데이터 없음)이므로 조용히 처리
      if (historyResult.success && historyResult.data && historyResult.data.length > 0) {
        const processedData = historyResult.data.map((item: any) => {
          let processedItem;
          
          if ('temperature' in item && 'humidity' in item) {
            processedItem = convertLegacyToFlexible(item);
          } else {
            processedItem = item;
          }
          
          return normalizeSensorData(processedItem);
          
        }).filter((item: FlexibleSensorData) => {
          const validation = validateSensorData(item as any);
          return validation.valid;
        });
        
        setHistoryData(processedData);
      } else {
        // 404 에러가 아닌 경우에만 초기 히스토리 생성 시도
        if (historyResult.error !== '센서 데이터 없음') {
          await generateInitialHistoryFromCurrent(deviceId);
        } else {
          // 404 에러는 빈 배열로 설정 (정상적인 상황)
          setHistoryData([]);
        }
      }
    } catch (error) {
      // 🔥 404 에러가 아닌 경우에만 에러 로그 출력
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('404') && !errorMessage.includes('센서 데이터 없음')) {
        console.error('센서 데이터 이력 가져오기 실패:', error);
        await generateInitialHistoryFromCurrent(deviceId);
      } else {
        // 404 에러는 빈 배열로 설정 (정상적인 상황)
        setHistoryData([]);
      }
    }
  }, [normalizeSensorData, isDataCollectionPaused]);

  // 현재 데이터로 즉시 히스토리 생성
  const generateInitialHistoryFromCurrent = useCallback(async (deviceId: string) => {
    if (isDataCollectionPaused) return;

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
        
        currentData = normalizeSensorData(currentData);
        
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
      } else {
        setHistoryData([]);
      }
    } catch (error) {
      console.error('즉시 히스토리 생성 실패:', error);
      setHistoryData([]);
    }
  }, [decompressData, normalizeSensorData, isDataCollectionPaused]);

  // 차트 데이터 준비
  const prepareChartData = useCallback((): ChartDataPoint[] => {
    // 🔥 오프라인일 때는 캐시된 히스토리 데이터 사용
    const dataToUse = isDataCollectionPaused ? cachedHistoryData : historyData;
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
                const labels = ['pH', 'EC'];
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
  }, [historyData, cachedHistoryData, isDataCollectionPaused]);

  // 장치 선택 핸들러
  const handleDeviceSelect = useCallback(async (device: Device) => {
    setSelectedDevice(device);
    setSensorLoading(true);
    setConnectionStatus('unknown');
    setIsDataCollectionPaused(false); // 새 디바이스 선택 시 수집 재개
    
    try {
      await Promise.all([
        fetchLatestData(device.device_id),
        fetchHistoryData(device.device_id)
      ]);
    } finally {
      setSensorLoading(false);
    }
  }, [fetchLatestData, fetchHistoryData]);

  // 데이터 새로고침
  const refreshData = useCallback(async () => {
    if (!selectedDevice) return;
    
    // 🔥 오프라인 상태에서 수동 새로고침 시 데이터 수집 재개 시도
    if (isDataCollectionPaused) {
      console.log('🔄 수동 새로고침 - 데이터 수집 재개 시도');
      setIsDataCollectionPaused(false);
    }
    
    setSensorLoading(true);
    try {
      await Promise.all([
        fetchLatestData(selectedDevice.device_id),
        fetchHistoryData(selectedDevice.device_id)
      ]);
    } finally {
      setSensorLoading(false);
    }
  }, [selectedDevice, fetchLatestData, fetchHistoryData, isDataCollectionPaused]);

  // 🔥 실시간 업데이트 (10초마다) - 데이터 수집 상태에 따라 제어
  useEffect(() => {
    if (selectedDevice && !isDataCollectionPaused) {
      console.log('🟢 실시간 업데이트 시작 (10초 간격)');
      
      const interval = setInterval(() => {
        if (!isDataCollectionPaused) {
          fetchLatestData(selectedDevice.device_id);
        } else {
          console.log('⏸️ 데이터 수집 중단 상태 - 실시간 업데이트 건너뛰기');
        }
      }, 10000);

      return () => {
        console.log('🔴 실시간 업데이트 중지');
        clearInterval(interval);
      };
    } else if (selectedDevice && isDataCollectionPaused) {
      console.log('⏸️ 데이터 수집이 중단되어 실시간 업데이트 비활성화');
    }
  }, [selectedDevice, fetchLatestData, isDataCollectionPaused]);

  // 연결 상태 정보
  const getConnectionStatusInfo = useCallback(() => {
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
          message: isDataCollectionPaused ? '오프라인 (데이터 수집 중단)' : '일시적 연결 문제', 
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
  }, [connectionStatus, isDataCollectionPaused]);

  // 🔥 표시할 데이터 반환 (오프라인 시 캐시 데이터 사용)
  const getDisplayData = useCallback(() => {
    return {
      latestData: isDataCollectionPaused ? cachedLatestData : latestData,
      historyData: isDataCollectionPaused ? cachedHistoryData : historyData,
      chartData: prepareChartData(),
      isDeviceConnected: !isDataCollectionPaused,
      cachedLatestData,
      cachedHistoryData: cachedHistoryData.slice(-30).map(data => ({
        time: new Date(data.timestamp).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        ...data
      }))
    };
  }, [latestData, historyData, cachedLatestData, cachedHistoryData, isDataCollectionPaused, prepareChartData]);

  // 🔥 표시할 데이터 결정 (오프라인일 때는 latestData를 표시하지 않음)
  const displayLatestData = useMemo(() => {
    // 데이터 수집이 중단된 상태면 캐시 데이터 사용
    if (isDataCollectionPaused) {
      return cachedLatestData;
    }
    // 최신 데이터가 있지만 오래된 데이터면 null 반환
    if (latestData) {
      const dataTime = typeof latestData.timestamp === 'string' 
        ? new Date(latestData.timestamp).getTime()
        : latestData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      // 1분 이내 데이터만 표시
      if (diffMinutes < 1) {
        return latestData;
      } else {
        // 오래된 데이터는 표시하지 않음
        return null;
      }
    }
    return null;
  }, [latestData, cachedLatestData, isDataCollectionPaused]);

  return {
    selectedDevice,
    latestData: displayLatestData, // 🔥 오래된 데이터는 표시하지 않음
    historyData: isDataCollectionPaused ? cachedHistoryData : historyData,
    sensorLoading,
    connectionStatus,
    lastUpdateTime,
    handleDeviceSelect,
    refreshData,
    prepareChartData,
    getConnectionStatusInfo,
    // 🔥 새로운 반환 값들
    isDataCollectionPaused,
    isDeviceConnected: !isDataCollectionPaused,
    cachedLatestData,
    getDisplayData
  };
};

// 간단한 센서 상태 관리 훅 (기존과 동일)
export const useSimpleSensorData = (latestData: FlexibleSensorData | null, deviceId?: string) => {
  const [selectedSensorTypes, setSelectedSensorTypes] = useState<Set<number>>(new Set());
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [animatingCards, setAnimatingCards] = useState<Set<string>>(new Set());
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  // 디바이스 ID 설정 로직
  useEffect(() => {
    let resolvedDeviceId = '';

    if (deviceId) {
      resolvedDeviceId = deviceId;
    } else if (typeof window !== 'undefined') {
      const urlParams = window.location.pathname.split('/');
      const sensorsIndex = urlParams.findIndex(param => param === 'sensors');
      if (sensorsIndex !== -1 && urlParams[sensorsIndex + 1]) {
        resolvedDeviceId = urlParams[sensorsIndex + 1];
      } else {
        const deviceIndex = urlParams.findIndex(param => param === 'devices' || param === 'device');
        if (deviceIndex !== -1 && urlParams[deviceIndex + 1]) {
          resolvedDeviceId = urlParams[deviceIndex + 1];
        }
      }
    } else if (latestData?.device_id) {
      resolvedDeviceId = latestData.device_id;
    } else if ((latestData as any)?.deviceId) {
      resolvedDeviceId = (latestData as any).deviceId;
    } else if (typeof window !== 'undefined') {
      const savedDeviceId = localStorage.getItem('selectedDeviceId');
      if (savedDeviceId) {
        resolvedDeviceId = savedDeviceId;
      }
    } else {
      resolvedDeviceId = 'SERIAL_FARM_001';
    }

    setCurrentDeviceId(resolvedDeviceId);

    if (typeof window !== 'undefined' && resolvedDeviceId && resolvedDeviceId !== 'SERIAL_FARM_001') {
      localStorage.setItem('selectedDeviceId', resolvedDeviceId);
    }
  }, [deviceId, latestData]);

  // 애니메이션 처리
  useEffect(() => {
    if (latestData) {
      const newUpdateTime = Date.now();
      setLastUpdateTime(newUpdateTime);

      const activeCardIds = latestData.sensors
        ?.filter(sensor => sensor.active)
        .map(sensor => sensor.sensor_id?.toString() || sensor.name) || [];

      setAnimatingCards(new Set(activeCardIds));

      setTimeout(() => {
        setAnimatingCards(new Set());
      }, 1000);
    }
  }, [latestData]);

  const handleSensorTypeToggle = (sensorType: number) => {
    const newSelected = new Set(selectedSensorTypes);
    if (newSelected.has(sensorType)) {
      newSelected.delete(sensorType);
    } else {
      newSelected.add(sensorType);
    }
    setSelectedSensorTypes(newSelected);
  };

  return {
    selectedSensorTypes,
    setSelectedSensorTypes,
    lastUpdateTime,
    animatingCards,
    currentDeviceId,
    handleSensorTypeToggle
  };
};