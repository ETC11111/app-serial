// components/sensor/SensorCharts.tsx - 완전한 코드 (오프라인 차트 제어 포함)

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { DetectedSensor, ChartDataPoint, SENSOR_METADATA } from '../../types/sensor.types';
import { SensorIcon } from './SensorIcon';
import { SENSOR_COLOR_PALETTE } from '../constants/sensorConstants';

interface SensorChartsProps {
  chartData: ChartDataPoint[];
  isMobile: boolean;
  selectedSensorTypes: Set<number>;
  setSelectedSensorTypes: React.Dispatch<React.SetStateAction<Set<number>>>;
  activeSensors: DetectedSensor[];
  deviceId: string;
  onExportData?: () => void;
  isDeviceConnected?: boolean;
  cachedChartData?: ChartDataPoint[];
  lastDataUpdateTime?: string;
  // 실시간 업데이트 제어를 위한 새로운 props
  onPauseUpdates?: () => void;
  onResumeUpdates?: () => void;
}

// API 인터페이스
interface FilterData {
  selectedSensorTypes?: number[];
  selectedBarValues?: string[];
  mobileChartTab?: 'line' | 'bar';
}

interface FilterResponse {
  success: boolean;
  hasFilter: boolean;
  filter?: FilterData;
}

// API 호출 함수들
const sensorChartAPI = {
  getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  },

  async loadFilters(deviceId: string): Promise<FilterResponse | null> {
    if (!deviceId) {
      console.warn('deviceId가 없어서 필터를 로드할 수 없습니다.');
      return null;
    }

    try {
      const response = await fetch(`/api/filters/${deviceId}/sensor-chart`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, hasFilter: false };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as FilterResponse;
    } catch (error) {
      console.error('필터 로드 실패:', error);
      return null;
    }
  },

  async saveFilters(deviceId: string, filterData: FilterData): Promise<any> {
    if (!deviceId) {
      console.warn('deviceId가 없어서 필터를 저장할 수 없습니다.');
      return null;
    }

    try {
      const response = await fetch(`/api/filters/${deviceId}/sensor-chart`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(filterData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('필터 저장 실패:', error);
      return null;
    }
  }
};

export const SensorCharts: React.FC<SensorChartsProps> = ({
  chartData,
  isMobile,
  selectedSensorTypes,
  setSelectedSensorTypes,
  activeSensors,
  deviceId,
  onExportData,
  isDeviceConnected = true,
  cachedChartData,
  lastDataUpdateTime,
  onPauseUpdates,
  onResumeUpdates
}) => {
  // 차트 업데이트 제어 상태
  const [isChartUpdatesPaused, setIsChartUpdatesPaused] = useState(!isDeviceConnected);
  const [frozenChartData, setFrozenChartData] = useState<ChartDataPoint[]>([]);
  const [lastOnlineChartData, setLastOnlineChartData] = useState<ChartDataPoint[]>([]);
  
  // 화면 크기 감지
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // 상태 관리
  const [mobileChartTab, setMobileChartTab] = useState<'line' | 'bar'>('line');
  const [selectedBarValues, setSelectedBarValues] = useState<Set<string>>(new Set());
  const [hasRestoredFromDB, setHasRestoredFromDB] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userClearedLineFilters, setUserClearedLineFilters] = useState(false); // 🔥 사용자가 명시적으로 선형 차트 필터를 해제했는지 추적
  
  // 🔥 기간별 보기 상태 관리
  const [viewMode, setViewMode] = useState<'realtime' | 'period'>('realtime');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('1week');
  const [periodData, setPeriodData] = useState<ChartDataPoint[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

  // 디바운스 타이머
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 🔥 기간별 데이터 가져오기 (min/max 범위 내에서 적절한 간격으로 샘플링)
  const fetchPeriodData = async (period: string) => {
    if (!deviceId) return;
    
    setPeriodLoading(true);
    setPeriodError(null);
    try {
      const now = new Date();
      let periodDuration: number; // 기간 길이 (밀리초)
      
      // 🔥 기간별 duration 계산
      switch (period) {
        case '1week':
          periodDuration = 7 * 24 * 60 * 60 * 1000;
          break;
        case '1month':
          periodDuration = 30 * 24 * 60 * 60 * 1000;
          break;
        case '3months':
          periodDuration = 90 * 24 * 60 * 60 * 1000;
          break;
        case '6months':
          periodDuration = 180 * 24 * 60 * 60 * 1000;
          break;
        case '1year':
          periodDuration = 365 * 24 * 60 * 60 * 1000;
          break;
        default:
          periodDuration = 7 * 24 * 60 * 60 * 1000;
      }

      const targetStartDate = new Date(now.getTime() - periodDuration);
      const targetEndDate = now;

      // 🔥 먼저 선택한 기간의 데이터를 시도 (limit을 크게 설정하여 모든 데이터 가져오기)
      // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
      const originalFetch = window.fetch;
      const response = await originalFetch(`/api/sensors/history/${deviceId}?start=${targetStartDate.toISOString()}&end=${targetEndDate.toISOString()}&limit=10000`, {
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('accessToken') && { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` })
        },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        let periodData = data.history || data.data || [];
        
        // 🔥 선택한 기간에 데이터가 있으면 사용
        if (periodData.length > 0) {
          // 🔥 데이터를 시간순으로 정렬 (오래된 것부터)
          periodData = periodData.sort((a: any, b: any) => {
            const timeA = new Date(a.timestamp || a.stored_at || a.time).getTime();
            const timeB = new Date(b.timestamp || b.stored_at || b.time).getTime();
            return timeA - timeB;
          });
          
          // 🔥 실제 데이터의 min/max 찾기
          const timestamps = periodData.map((d: any) => new Date(d.timestamp || d.stored_at || d.time).getTime());
          const actualMin = new Date(Math.min(...timestamps));
          const actualMax = new Date(Math.max(...timestamps));
          
          // 🔥 실제 데이터 범위가 목표 범위보다 작으면, 전체 데이터에서 더 가져오기 시도
          // 🔥 예: 11월 6일부터 데이터가 있는데, 11월 7일에 1주일 보기를 클릭하면 11월 6일부터 지금까지 모두 가져와야 함
          if (actualMin.getTime() > targetStartDate.getTime()) {
                console.log(`🔍 데이터가 목표 시작일(${targetStartDate.toISOString()})보다 늦게 시작함(${actualMin.toISOString()}). 더 오래된 데이터를 가져오기 시도...`);
                // 🔥 전체 데이터에서 목표 시작일부터 지금까지의 모든 데이터 가져오기
                // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
                const originalFetch = window.fetch;
                const extendedResponse = await originalFetch(`/api/sensors/history/${deviceId}?start=${targetStartDate.toISOString()}&end=${targetEndDate.toISOString()}&limit=10000`, {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(localStorage.getItem('accessToken') && { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` })
                  },
                  credentials: 'include'
                });
            if (extendedResponse.ok) {
              const extendedData = await extendedResponse.json();
              const extendedPeriodData = extendedData.history || extendedData.data || [];
              if (extendedPeriodData.length > 0) {
                // 🔥 기존 데이터와 병합하고 중복 제거
                const mergedData = [...extendedPeriodData, ...periodData];
                const uniqueData = mergedData.filter((item: any, index: number, self: any[]) => {
                  const timestamp = new Date(item.timestamp || item.stored_at || item.time).getTime();
                  return index === self.findIndex((t: any) => 
                    new Date(t.timestamp || t.stored_at || t.time).getTime() === timestamp
                  );
                });
                const sortedMerged = uniqueData.sort((a: any, b: any) => {
                  const timeA = new Date(a.timestamp || a.stored_at || a.time).getTime();
                  const timeB = new Date(b.timestamp || b.stored_at || b.time).getTime();
                  return timeA - timeB;
                });
                // 🔥 목표 범위 내의 데이터만 필터링
                const filteredMerged = sortedMerged.filter((d: any) => {
                  const timestamp = new Date(d.timestamp || d.stored_at || d.time).getTime();
                  return timestamp >= targetStartDate.getTime() && timestamp <= targetEndDate.getTime();
                });
                if (filteredMerged.length > 0) {
                  periodData = filteredMerged;
                  console.log(`🔍 확장된 데이터 범위: ${filteredMerged.length}개`);
                }
              }
            }
          }
          
          console.log(`🔍 기간 필터: ${period}, 목표 범위: ${targetStartDate.toISOString()} ~ ${targetEndDate.toISOString()}`);
          const finalTimestamps = periodData.map((d: any) => new Date(d.timestamp || d.stored_at || d.time).getTime());
          const finalMin = new Date(Math.min(...finalTimestamps));
          const finalMax = new Date(Math.max(...finalTimestamps));
          console.log(`🔍 실제 데이터 범위: ${finalMin.toISOString()} ~ ${finalMax.toISOString()} (${periodData.length}개)`);
          
          setPeriodData(periodData);
        } else {
          // 🔥 선택한 기간에 데이터가 없으면 전체 데이터에서 해당 기간 내 데이터 필터링
          console.log(`선택한 기간(${period})에 데이터가 없어서 전체 데이터에서 필터링합니다.`);
          // 🔥 httpInterceptor를 우회하여 직접 fetch 호출 (404 에러 로그 방지)
          const originalFetch = window.fetch;
          const fallbackResponse = await originalFetch(`/api/sensors/history/${deviceId}?limit=10000`, {
            headers: {
              'Content-Type': 'application/json',
              ...(localStorage.getItem('accessToken') && { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` })
            },
            credentials: 'include'
          });
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            const allData = fallbackData.history || fallbackData.data || [];
            
            if (allData.length > 0) {
              // 🔥 전체 데이터를 시간순으로 정렬
              const sortedData = allData.sort((a: any, b: any) => {
                const timeA = new Date(a.timestamp || a.stored_at || a.time).getTime();
                const timeB = new Date(b.timestamp || b.stored_at || b.time).getTime();
                return timeA - timeB;
              });
              
              // 🔥 목표 기간 내의 데이터 필터링
              const filteredData = sortedData.filter((d: any) => {
                const timestamp = new Date(d.timestamp || d.stored_at || d.time).getTime();
                return timestamp >= targetStartDate.getTime() && timestamp <= targetEndDate.getTime();
              });
              
              if (filteredData.length > 0) {
                // 🔥 필터링된 데이터의 min/max 찾기
                const timestamps = filteredData.map((d: any) => new Date(d.timestamp || d.stored_at || d.time).getTime());
                const actualMin = new Date(Math.min(...timestamps));
                const actualMax = new Date(Math.max(...timestamps));
                
                console.log(`🔍 필터링된 데이터 범위: ${actualMin.toISOString()} ~ ${actualMax.toISOString()} (${filteredData.length}개)`);
                setPeriodData(filteredData);
              } else {
                // 🔥 목표 기간 내 데이터가 없으면, 가장 최근 데이터를 max로 하고 그 이전 기간 내 데이터 사용
                // 🔥 하지만 최근 데이터가 목표 시작일보다 이전이면, 최근 데이터부터 목표 시작일까지의 모든 데이터를 가져와야 함
                const latestData = sortedData[sortedData.length - 1];
                const latestTime = new Date(latestData.timestamp || latestData.stored_at || latestData.time).getTime();
                
                // 🔥 최근 데이터가 목표 시작일보다 이전이면, 최근 데이터부터 지금까지
                // 🔥 최근 데이터가 목표 시작일 이후면, 목표 시작일부터 지금까지
                const actualStart = Math.max(targetStartDate.getTime(), sortedData[0] ? new Date(sortedData[0].timestamp || sortedData[0].stored_at || sortedData[0].time).getTime() : targetStartDate.getTime());
                const actualEnd = Math.min(targetEndDate.getTime(), latestTime);
                
                const fallbackFiltered = sortedData.filter((d: any) => {
                  const timestamp = new Date(d.timestamp || d.stored_at || d.time).getTime();
                  return timestamp >= actualStart && timestamp <= actualEnd;
                });
                
                if (fallbackFiltered.length > 0) {
                  const actualMin = new Date(Math.min(...fallbackFiltered.map((d: any) => new Date(d.timestamp || d.stored_at || d.time).getTime())));
                  const actualMax = new Date(Math.max(...fallbackFiltered.map((d: any) => new Date(d.timestamp || d.stored_at || d.time).getTime())));
                  console.log(`🔍 폴백 데이터 범위: ${actualMin.toISOString()} ~ ${actualMax.toISOString()} (${fallbackFiltered.length}개)`);
                  setPeriodData(fallbackFiltered);
                } else {
                  // 🔥 필터링된 데이터가 없으면, 최소한 최근 데이터라도 표시
                  if (sortedData.length > 0) {
                    console.log(`🔍 최근 데이터만 표시: ${sortedData.length}개`);
                    setPeriodData(sortedData);
                  } else {
                    console.log('전체 데이터도 없습니다.');
                    setPeriodData([]);
                  }
                }
              }
            } else {
              console.log('전체 데이터도 없습니다.');
              setPeriodData([]);
            }
          } else {
            console.error('전체 데이터 가져오기 실패:', fallbackResponse.statusText);
            setPeriodData([]);
          }
        }
      } else {
        console.error('기간별 데이터 가져오기 실패:', response.status, response.statusText);
        // 🔥 502 에러 등 서버 문제일 때 실시간 데이터로 폴백
        if (response.status >= 500) {
          console.log('서버 오류로 인해 실시간 데이터를 사용합니다.');
          setPeriodData(chartData);
          setPeriodError('서버 오류로 인해 실시간 데이터를 표시합니다.');
        } else {
          setPeriodData([]);
          setPeriodError('데이터를 가져올 수 없습니다.');
        }
      }
    } catch (error) {
      console.error('기간별 데이터 가져오기 오류:', error);
      setPeriodData([]);
      setPeriodError('네트워크 오류가 발생했습니다.');
    } finally {
      setPeriodLoading(false);
    }
  };

  // 🔥 기간 변경 핸들러
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    if (viewMode === 'period') {
      fetchPeriodData(period);
    }
  };

  // 🔥 보기 모드 변경 핸들러
  const handleViewModeChange = (mode: 'realtime' | 'period') => {
    setViewMode(mode);
    if (mode === 'period') {
      fetchPeriodData(selectedPeriod);
      // 기간별 보기일 때는 실시간 업데이트 일시정지
      if (onPauseUpdates) {
        onPauseUpdates();
      }
      // 🔥 기간별 보기로 전환할 때는 플래그 리셋 (자동 선택 허용)
      setUserClearedLineFilters(false);
    } else {
      // 실시간 보기로 돌아갈 때는 업데이트 재개
      if (onResumeUpdates) {
        onResumeUpdates();
      }
    }
  };


  // 🔥 기간별 데이터를 ChartDataPoint 형식으로 변환
  const convertPeriodDataToChartData = useMemo(() => {
    if (viewMode !== 'period' || periodData.length === 0) {
      return [];
    }

    console.log('🔍 기간별 데이터 변환 시작:', periodData.length, '개 데이터');
    if (periodData.length > 0 && periodData[0]) {
      console.log('🔍 첫 번째 원본 데이터:', periodData[0]);
      if (periodData[0].sensors) {
        console.log('🔍 첫 번째 데이터의 센서들:', periodData[0].sensors.map((s: any) => ({
          name: s.name,
          type: s.type,
          values: s.values,
          value_names: s.value_names,
          active: s.active
        })));
      }
    }

    return periodData.map((data, index) => {
      // 🔥 API에서 받은 데이터 구조에 따라 변환
      if (data.sensors && Array.isArray(data.sensors)) {
        // unified 형식의 데이터
        const chartPoint: ChartDataPoint = {
          time: (() => {
            const timestamp = data.timestamp || data.stored_at;
            if (typeof timestamp === 'number') {
              return new Date(timestamp).toISOString();
            }
            return timestamp || new Date().toISOString();
          })(),
          timestamp: data.timestamp || data.stored_at
        };

        // 센서 데이터를 차트 포인트로 변환 (실시간 데이터와 동일한 키 형식 사용)
        // 🔥 기간별 보기에서는 active 상태와 관계없이 모든 센서 데이터 포함 (센서 간 동기화)
        // 🔥 각 센서의 데이터 범위가 다를 수 있으므로, 모든 센서의 데이터를 포함
        data.sensors.forEach((sensor: any) => {
          // 🔥 values가 있고 배열이면 포함 (active 상태 무시)
          if (sensor.values && Array.isArray(sensor.values) && sensor.values.length > 0) {
            sensor.values.forEach((value: number, valueIndex: number) => {
              // 🔥 실시간 데이터와 동일한 키 형식으로 변환
              let label = '';
              // 🔥 sensor.name에서 _CH 뒤의 숫자를 제거 (예: TSL2591_CH2 → TSL2591, SHT20_CH3 → SHT20)
              // 🔥 정규식을 사용하여 _CH 뒤의 숫자까지 제거 (replace('_CH', '')는 TSL2591_CH2 → TSL25912로 잘못 변환됨)
              const sensorBaseName = sensor.name.replace(/_CH\d+$/, '').replace(/_CH$/, '');
              
              switch (sensor.type) {
                case 1: // SHT20 온습도센서
                  if (valueIndex === 0) label = `${sensorBaseName}_온도`;
                  else if (valueIndex === 1) label = `${sensorBaseName}_습도`;
                  break;
                case 2: // TSL2591 조도센서 (실제 센서 이름 사용)
                  // 🔥 TSL2591이 실제 센서 이름이므로 그대로 사용
                  label = `${sensorBaseName}_조도`;
                  break;
                case 3: // ADS1115 수질센서 (pH, EC, 수온) - 백엔드 순서: pH(0), EC(1), 수온(2)
                  if (valueIndex === 0) label = `${sensorBaseName}_pH`;
                  else if (valueIndex === 1) label = `${sensorBaseName}_EC`;
                  else if (valueIndex === 2) label = `${sensorBaseName}_수온`;
                  break;
                case 4: // SCD30 CO2센서
                  if (valueIndex === 0) label = `${sensorBaseName}_CO2`;
                  else if (valueIndex === 1) label = `${sensorBaseName}_온도`;
                  else if (valueIndex === 2) label = `${sensorBaseName}_습도`;
                  break;
                case 5: // DS18B20 온도센서
                  label = `${sensorBaseName}_온도`;
                  break;
                case 19: // 토양센서 (pH, EC, 토양온도, 토양습도)
                  if (valueIndex === 0) label = `${sensorBaseName}_pH`;
                  else if (valueIndex === 1) label = `${sensorBaseName}_EC`;
                  else if (valueIndex === 2) label = `${sensorBaseName}_온도`;
                  else if (valueIndex === 3) label = `${sensorBaseName}_습도`;
                  break;
                default:
                  // 영어 value_name을 한글로 변환 시도
                  const valueName = sensor.value_names?.[valueIndex];
                  if (valueName === 'temperature') label = `${sensorBaseName}_온도`;
                  else if (valueName === 'humidity') label = `${sensorBaseName}_습도`;
                  else if (valueName === 'light_level') label = `${sensorBaseName}_조도`;
                  else if (valueName === 'ph') label = `${sensorBaseName}_pH`;
                  else if (valueName === 'ec') label = `${sensorBaseName}_EC`;
                  else if (valueName === 'co2_ppm') label = `${sensorBaseName}_CO2`;
                  else if (valueName === 'soil_ph') label = `${sensorBaseName}_pH`;
                  else if (valueName === 'soil_ec') label = `${sensorBaseName}_EC`;
                  else if (valueName === 'soil_temperature') label = `${sensorBaseName}_온도`;
                  else if (valueName === 'soil_humidity') label = `${sensorBaseName}_습도`;
                  else label = `${sensorBaseName}_${valueName || `값${valueIndex}`}`;
              }
              
              if (label && typeof value === 'number' && !isNaN(value)) {
                chartPoint[label] = Number(value.toFixed(2));
              }
            });
          }
        });

        // 🔥 시간 포맷팅 개선 (실제 데이터의 timestamp 사용)
        if (chartPoint.timestamp) {
          const timeDate = new Date(chartPoint.timestamp);
          if (!isNaN(timeDate.getTime())) {
            // 시간을 읽기 쉬운 형식으로 변환 (실제 데이터의 시간 사용)
            chartPoint.time = timeDate.toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        } else if (chartPoint.time) {
          const timeDate = new Date(chartPoint.time);
          if (!isNaN(timeDate.getTime())) {
            // timestamp가 없으면 time을 사용
            chartPoint.time = timeDate.toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }

        if (index < 3) { // 처음 3개만 로그
          console.log(`🔍 변환된 차트 포인트 ${index}:`, chartPoint);
          console.log(`🔍 변환된 키 목록:`, Object.keys(chartPoint).filter(k => k !== 'time' && k !== 'timestamp'));
        }

        // 🔥 데이터가 있는 차트 포인트만 반환 (time, timestamp 제외한 키가 있어야 함)
        const dataKeys = Object.keys(chartPoint).filter(k => k !== 'time' && k !== 'timestamp');
        if (dataKeys.length > 0) {
          return chartPoint;
        } else {
          // 데이터가 없는 경우 null 반환 (나중에 필터링)
          return null;
        }
      } else if (data.time || data.timestamp) {
        // 이미 ChartDataPoint 형식인 경우
        const dataKeys = Object.keys(data).filter(k => k !== 'time' && k !== 'timestamp');
        if (dataKeys.length > 0) {
          return data as ChartDataPoint;
        }
        return null;
      } else {
        // 알 수 없는 형식
        console.warn('🔍 알 수 없는 데이터 형식:', data);
        return null;
      }
    }).filter((point): point is ChartDataPoint => point !== null); // null 제거
  }, [viewMode, periodData]);

  // 🔥 데이터 샘플링 (기간이 길 때 렌더링 최적화)
  const sampleDataForDisplay = useMemo(() => {
    if (viewMode !== 'period' || convertPeriodDataToChartData.length === 0) {
      return convertPeriodDataToChartData;
    }

    const dataLength = convertPeriodDataToChartData.length;
    let sampleInterval = 1;

    // 🔥 기간에 따라 샘플링 간격 조정
    switch (selectedPeriod) {
      case '1week':
        sampleInterval = Math.max(1, Math.floor(dataLength / 50)); // 최대 50개 포인트
        break;
      case '1month':
        sampleInterval = Math.max(1, Math.floor(dataLength / 100)); // 최대 100개 포인트
        break;
      case '3months':
        sampleInterval = Math.max(1, Math.floor(dataLength / 150)); // 최대 150개 포인트
        break;
      case '6months':
        sampleInterval = Math.max(1, Math.floor(dataLength / 200)); // 최대 200개 포인트
        break;
      case '1year':
        sampleInterval = Math.max(1, Math.floor(dataLength / 300)); // 최대 300개 포인트
        break;
      default:
        sampleInterval = 1;
    }

    console.log(`🔍 데이터 샘플링: ${dataLength}개 → ${Math.ceil(dataLength / sampleInterval)}개 (간격: ${sampleInterval})`);

    // 🔥 샘플링된 데이터 반환 (역순으로 정렬하여 최근 데이터가 오른쪽에 오도록)
    const sampled = convertPeriodDataToChartData.filter((_, index) => index % sampleInterval === 0);
    const reversed = sampled.reverse(); // 역순 정렬: 좌측이 예전값, 우측이 최근값
    
    // 🔥 역순 정렬 후 시간 포맷팅 다시 적용 (실제 timestamp 사용)
    return reversed.map(point => {
      if (point.timestamp) {
        const timeDate = new Date(point.timestamp);
        if (!isNaN(timeDate.getTime())) {
          point.time = timeDate.toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } else if (point.time) {
        const timeDate = new Date(point.time);
        if (!isNaN(timeDate.getTime())) {
          point.time = timeDate.toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }
      return point;
    });
  }, [viewMode, convertPeriodDataToChartData, selectedPeriod]);

  // 🔥 현재 사용할 차트 데이터 결정
  const currentChartData = useMemo(() => {
    if (viewMode === 'period') {
      const data = sampleDataForDisplay.length > 0 ? sampleDataForDisplay : convertPeriodDataToChartData;
      console.log('🔍 기간별 보기 - currentChartData:', data.length, '개 데이터 포인트');
      if (data.length > 0) {
        console.log('🔍 첫 번째 데이터 포인트 키:', Object.keys(data[0]).filter(k => k !== 'time' && k !== 'timestamp'));
      }
      return data;
    }
    return chartData;
  }, [viewMode, sampleDataForDisplay, convertPeriodDataToChartData, chartData]);

  // 🔥 기간별 지속 시간 계산 (밀리초) - 함수를 먼저 정의
  const getPeriodDuration = (period: string): number => {
    switch (period) {
      case '1week': return 7 * 24 * 60 * 60 * 1000;
      case '1month': return 30 * 24 * 60 * 60 * 1000;
      case '3months': return 90 * 24 * 60 * 60 * 1000;
      case '6months': return 180 * 24 * 60 * 60 * 1000;
      case '1year': return 365 * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  };

  // 🔥 기간별 보기에서 실제 데이터 범위 계산
  const getDataRangeInfo = useMemo(() => {
    if (viewMode !== 'period' || convertPeriodDataToChartData.length === 0) {
      return null;
    }

    // 🔥 변환된 차트 데이터에서 타임스탬프 추출
    const timestamps = convertPeriodDataToChartData.map(data => {
      const timestamp = data.timestamp || data.time;
      return new Date(timestamp);
    }).filter(date => !isNaN(date.getTime())); // 유효한 날짜만 필터링

    if (timestamps.length === 0) {
      return null;
    }

    const earliest = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const latest = new Date(Math.max(...timestamps.map(t => t.getTime())));
    
    const selectedPeriodDuration = getPeriodDuration(selectedPeriod);
    const actualDuration = latest.getTime() - earliest.getTime();
    const isFullPeriod = actualDuration >= selectedPeriodDuration * 0.8; // 80% 이상이면 충분한 데이터로 간주
    
    console.log('🔍 데이터 범위 정보:', {
      earliest: earliest.toISOString(),
      latest: latest.toISOString(),
      actualDays: Math.ceil(actualDuration / (1000 * 60 * 60 * 24)),
      isFullPeriod,
      selectedPeriod
    });
    
    return {
      earliest,
      latest,
      isFullPeriod,
      actualDays: Math.ceil(actualDuration / (1000 * 60 * 60 * 24))
    };
  }, [viewMode, convertPeriodDataToChartData, selectedPeriod]);

  // 디바이스 연결 상태가 변할 때 차트 업데이트 제어
  useEffect(() => {
    if (isDeviceConnected) {
      // 온라인 상태: 차트 업데이트 재개
      setIsChartUpdatesPaused(false);
      if (onResumeUpdates) {
        onResumeUpdates();
      }
      console.log('📊 차트 업데이트 재개됨 (디바이스 온라인)');
    } else {
      // 오프라인 상태: 현재 차트 데이터를 동결하고 업데이트 중단
      if (chartData && chartData.length > 0) {
        setLastOnlineChartData([...chartData]);
        setFrozenChartData([...chartData]);
      }
      setIsChartUpdatesPaused(true);
      if (onPauseUpdates) {
        onPauseUpdates();
      }
      console.log('📊 차트 업데이트 중단됨 (디바이스 오프라인)');
    }
  }, [isDeviceConnected, chartData, onPauseUpdates, onResumeUpdates]);

  // 화면 크기 변화 감지
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // 동적 레이아웃 계산
  const layoutConfig = useMemo(() => {
    const { width } = screenSize;
    
    if (width < 768) {
      return {
        chartHeight: Math.min(400, screenSize.height * 0.4),
        useFullWidth: true,
        singleColumn: true
      };
    } else if (width < 1024) {
      return {
        chartHeight: Math.min(450, screenSize.height * 0.45),
        useFullWidth: true,
        singleColumn: false
      };
    } else if (width < 1440) {
      return {
        chartHeight: Math.min(500, screenSize.height * 0.5),
        useFullWidth: false,
        singleColumn: false
      };
    } else {
      return {
        chartHeight: Math.min(600, screenSize.height * 0.55),
        useFullWidth: false,
        singleColumn: false
      };
    }
  }, [screenSize]);

  // 🔥 표시할 차트 데이터 결정 (오프라인 시 동결된 데이터 사용, 기간별 보기 지원)
  const displayChartData = useMemo(() => {
    // 기간별 보기 모드일 때
    if (viewMode === 'period') {
      return currentChartData;
    }
    
    // 실시간 보기 모드일 때
    if (isChartUpdatesPaused) {
      // 오프라인 상태: 동결된 데이터 우선, 없으면 캐시 데이터
      if (frozenChartData.length > 0) {
        return frozenChartData;
      }
      if (lastOnlineChartData.length > 0) {
        return lastOnlineChartData;
      }
      return cachedChartData || [];
    } else {
      // 온라인 상태: 실시간 데이터 우선, 없으면 캐시 데이터
      return chartData && chartData.length > 0 ? chartData : (cachedChartData || []);
    }
  }, [viewMode, currentChartData, chartData, cachedChartData, isChartUpdatesPaused, frozenChartData, lastOnlineChartData]);

  // 오프라인 상태 시간 포맷팅
  const formatLastUpdateTime = (timeString?: string): string => {
    if (!timeString) return '알 수 없음';
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return '방금 전';
      if (diffMins < 60) return `${diffMins}분 전`;
      if (diffHours < 24) return `${diffHours}시간 전`;
      return date.toLocaleString('ko-KR');
    } catch {
      return timeString;
    }
  };


  // 🔥 기간별 보기에서 사용할 센서 타입들 추출
  const periodSensorTypes = useMemo(() => {
    if (viewMode !== 'period' || convertPeriodDataToChartData.length === 0) {
      return [];
    }

    const sensorTypes = new Set<number>();
    convertPeriodDataToChartData.forEach(data => {
      Object.keys(data).forEach(key => {
        if (key.includes('_') && key !== 'time' && key !== 'timestamp') {
          // 센서 이름에서 타입 추출
          const sensorName = key.split('_')[0];
          
          // 🔥 I2C 센서들 (실시간 데이터와 동일한 키 형식)
          // 🔥 TSL2591이 현재 사용 중이므로 TSL2591을 우선 체크 (BH1750은 하위 호환용)
          if (sensorName.includes('SHT20') || sensorName.includes('온습도센서')) sensorTypes.add(1);
          else if (sensorName.includes('TSL2591') || sensorName.includes('조도센서') || sensorName.includes('BH1750')) sensorTypes.add(2);
          else if (sensorName.includes('ADS1115') || sensorName.includes('수질센서') || sensorName.includes('양액센서')) sensorTypes.add(3);
          else if (sensorName.includes('SCD30') || sensorName.includes('CO2센서') || sensorName.includes('대기질센서')) sensorTypes.add(4);
          else if (sensorName.includes('DS18B20') || sensorName.includes('온도센서') || sensorName.includes('수온센서')) sensorTypes.add(5);
          // 🔥 Modbus 센서들
          else if (sensorName.includes('토양센서')) sensorTypes.add(19);
          else if (sensorName.includes('온습도센서') && !sensorName.includes('SHT20')) sensorTypes.add(11);
          else if (sensorName.includes('압력센서')) sensorTypes.add(12);
          else if (sensorName.includes('유량센서')) sensorTypes.add(13);
          else if (sensorName.includes('릴레이모듈')) sensorTypes.add(14);
          else if (sensorName.includes('전력계')) sensorTypes.add(15);
          else if (sensorName.includes('풍향센서')) sensorTypes.add(16);
          else if (sensorName.includes('풍속센서')) sensorTypes.add(17);
          else if (sensorName.includes('강우강설센서')) sensorTypes.add(18);
        }
      });
    });

    return Array.from(sensorTypes);
  }, [viewMode, convertPeriodDataToChartData]);

  // 🔥 기간별 보기에서 센서 타입 자동 선택 (사용자가 선택한 센서가 없을 때만, 명시적으로 해제한 경우 제외)
  useEffect(() => {
    if (viewMode === 'period' && periodSensorTypes.length > 0 && selectedSensorTypes.size === 0 && !userClearedLineFilters) {
      // 사용 가능한 센서 타입 중에서 자동 선택
      const availableTypes = periodSensorTypes.filter((sensorType: number) => 
        [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19].includes(sensorType)
      );
      if (availableTypes.length > 0) {
        setSelectedSensorTypes(new Set(availableTypes));
      }
    }
  }, [viewMode, periodSensorTypes, selectedSensorTypes.size, userClearedLineFilters]);

  // 선형차트용 센서 타입들 (조도 센서는 막대차트 전용이므로 제외)
  const lineChartSensorTypes = useMemo(() => {
    const allowedTypes = [1, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // 타입 2 (조도) 제외
    
    if (viewMode === 'period') {
      // 🔥 기간별 보기일 때는 기간별 데이터에서 추출한 센서 타입과 기존 센서 타입을 합침
      const periodTypes = periodSensorTypes.filter((sensorType: number) => allowedTypes.includes(sensorType));
      const activeTypes = activeSensors
        .map((sensor: DetectedSensor) => sensor.type)
        .filter((sensorType: number) => allowedTypes.includes(sensorType))
        .filter((sensorType: number, index: number, array: number[]) => array.indexOf(sensorType) === index);
      
      // 두 배열을 합치고 중복 제거
      const combinedTypes = [...new Set([...periodTypes, ...activeTypes])];
      return combinedTypes;
    } else {
      // 🔥 실시간 보기일 때는 기존 로직 사용
      return activeSensors
        .map((sensor: DetectedSensor) => sensor.type)
        .filter((sensorType: number) => allowedTypes.includes(sensorType))
        .filter((sensorType: number, index: number, array: number[]) => array.indexOf(sensorType) === index);
    }
  }, [activeSensors, viewMode, periodSensorTypes]);

  // 막대차트 키 판별 함수 (기간별 보기 지원)
  const isKeyForBarChart = (key: string): boolean => {
    // CO2 센서
    if (key.includes('SCD30') && key.includes('CO2')) return true;
    
    // 조도 센서 (TSL2591 우선, BH1750은 하위 호환용)
    // 🔥 TSL25912_조도 같은 잘못된 형식도 처리 (TSL2591로 시작하는 조도 키)
    if (key.startsWith('TSL2591') || key.includes('TSL2591') || 
        (key.includes('조도') && !key.includes('토양')) || key.includes('BH1750')) return true;
    
    // 토양센서는 막대차트에서 제외 (선형차트에서만 활성화)
    if (key.includes('토양센서')) return false;
    
    // ADS1115 수질센서: pH, EC만 막대차트에 표시
    if (key.includes('ADS1115') || key.includes('수질센서') || key.includes('양액센서')) {
      return (key.includes('_pH') || key.includes('_EC') || 
              key.includes('pH') || key.includes('EC')) &&
             !key.includes('수온');
    }
    
    // 기타 pH/EC 값들 (토양센서 제외)
    if ((key.includes('EC') || key.includes('ec') || 
         key.includes('pH') || key.includes('ph')) &&
        !key.includes('토양') && !key.includes('wind') && 
        !key.includes('WIND') && !key.includes('SHT')) {
      return true;
    }
    
    return false;
  };

  // 막대차트용 데이터 키들 (조도 센서 중복 제거, 기간별 보기 지원)
  const barChartKeys = useMemo(() => {
    // 🔥 기간별 보기일 때는 convertPeriodDataToChartData 사용, 실시간 보기일 때는 displayChartData 사용
    const dataSource = viewMode === 'period' && convertPeriodDataToChartData.length > 0 
      ? convertPeriodDataToChartData 
      : displayChartData;
    
    if (!dataSource.length) return [];

    // 🔥 모든 데이터 포인트를 확인하여 실제로 존재하는 키만 수집
    const allKeys = new Set<string>();
    dataSource.forEach((dataPoint: ChartDataPoint) => {
      Object.keys(dataPoint).forEach((key: string) => {
        if (key !== 'time' && key !== 'timestamp' && isKeyForBarChart(key)) {
          allKeys.add(key);
        }
      });
    });

    const keys: string[] = [];
    let lightSensorKey: string | null = null; // 조도 센서 키 (하나만 저장)

    // 🔥 조도 센서 키를 먼저 찾아서 우선순위 결정 (TSL2591 > BH1750 > 기타 조도)
    // 🔥 TSL25912_조도 같은 잘못된 키도 처리 (TSL2591로 시작하는 조도 키)
    const lightKeys = Array.from(allKeys).filter(key => {
      // TSL2591로 시작하거나 TSL25912 같은 잘못된 형식도 포함
      const isTSL2591 = key.startsWith('TSL2591') || key.includes('TSL2591');
      const isBH1750 = key.includes('BH1750');
      const isOtherLight = (key.includes('조도') && !key.includes('토양')) && !isTSL2591 && !isBH1750;
      return isTSL2591 || isBH1750 || isOtherLight;
    });
    
    // 🔥 TSL2591 우선, 없으면 BH1750, 없으면 기타 조도
    if (lightKeys.length > 0) {
      // 🔥 TSL2591_조도 형식 우선, 없으면 TSL25912_조도 같은 잘못된 형식도 허용
      const tsl2591Key = lightKeys.find(k => k.startsWith('TSL2591_조도')) || 
                         lightKeys.find(k => k.includes('TSL2591') && k.includes('조도'));
      const bh1750Key = lightKeys.find(k => k.includes('BH1750'));
      const otherLightKey = lightKeys.find(k => !k.includes('TSL2591') && !k.includes('BH1750'));
      
      if (tsl2591Key) {
        lightSensorKey = tsl2591Key;
        keys.push(tsl2591Key);
      } else if (bh1750Key) {
        lightSensorKey = bh1750Key;
        keys.push(bh1750Key);
      } else if (otherLightKey) {
        lightSensorKey = otherLightKey;
        keys.push(otherLightKey);
      }
    }

    // 🔥 나머지 키 추가 (조도 센서 제외)
    Array.from(allKeys).forEach((key: string) => {
      if (!key.includes('TSL2591') && !key.includes('BH1750') && 
          !(key.includes('조도') && !key.includes('토양'))) {
        keys.push(key);
      }
    });

    return keys;
  }, [displayChartData, viewMode, convertPeriodDataToChartData]);

  // 🔥 기간별 보기로 전환할 때 막대차트 필터 초기화 (조도 센서 중복 방지)
  useEffect(() => {
    if (viewMode === 'period' && barChartKeys.length > 0) {
      // 🔥 기간별 보기로 전환할 때, 조도 센서가 여러 개 선택되어 있으면 하나만 유지
      setSelectedBarValues(prev => {
        const currentKeys = Array.from(prev);
        const lightKeys = currentKeys.filter(k => 
          k.includes('TSL2591') || k.includes('BH1750') || (k.includes('조도') && !k.includes('토양'))
        );
        const otherKeys = currentKeys.filter(k => 
          !k.includes('TSL2591') && !k.includes('BH1750') && !(k.includes('조도') && !k.includes('토양'))
        );
        
        // 🔥 조도 센서가 여러 개면 하나만 유지 (TSL2591 우선)
        if (lightKeys.length > 1) {
          const tsl2591Key = lightKeys.find(k => k.includes('TSL2591'));
          const bh1750Key = lightKeys.find(k => k.includes('BH1750'));
          const otherLightKey = lightKeys.find(k => !k.includes('TSL2591') && !k.includes('BH1750'));
          
          const finalLightKey: string | undefined = tsl2591Key || bh1750Key || otherLightKey;
          // 🔥 finalLightKey가 undefined일 수 있으므로 명시적으로 처리
          const allKeys: string[] = [];
          if (finalLightKey) {
            allKeys.push(finalLightKey);
          }
          allKeys.push(...otherKeys);
          
          const validKeys = allKeys.filter(k => barChartKeys.includes(k));
          return new Set(validKeys);
        }
        
        // 🔥 조도 센서가 하나거나 없으면 그대로 유지 (유효한 키만)
        return new Set(currentKeys.filter(k => barChartKeys.includes(k)));
      });
    }
  }, [viewMode, barChartKeys]);

  // 키를 사용자 친화적 이름으로 변환 (조도 센서 통합)
  const getDisplayName = (key: string): string => {
    if (key.includes('SCD30') && key.includes('CO2')) {
      return 'CO2 농도';
    }
    
    // 🔥 조도 센서는 TSL2591과 BH1750 모두 "조도"로 통합 표시 (TSL2591 우선)
    // 🔥 TSL25912_조도 같은 잘못된 형식도 처리
    if (key.startsWith('TSL2591') || key.includes('TSL2591') || 
        (key.includes('조도') && !key.includes('토양')) || key.includes('BH1750')) {
      return '조도';
    }
    
    if (key.includes('_pH') && !key.includes('SHT20') && !key.includes('환경센서')) {
      return '토양 산도(pH)';
    }
    if (key.includes('_EC') && !key.includes('SHT20') && !key.includes('환경센서')) {
      return '토양 전도도(EC) dS/m';
    }
    if (key.includes('_온도') && !key.includes('SHT20') && !key.includes('환경센서')) {
      return '토양 온도';
    }
    if (key.includes('_습도') && !key.includes('SHT20') && !key.includes('환경센서')) {
      return '토양 습도';
    }
    
    if (key.includes('ADS1115')) {
      if (key.includes('_0') || key.includes('ph') || key.includes('pH')) return '양액 산도(pH)';
      if (key.includes('_1') || key.includes('ec') || key.includes('EC')) return '양액 전도도(EC) dS/m';
      return 'ADS1115';
    }
    
    if (key.includes('EC') || key.includes('ec')) return '전기전도도(EC)';
    if (key.includes('pH') || key.includes('ph')) return '수소이온농도(pH)';
    
    return key;
  };

  // 센서 타입 설명
  const getSensorDescription = (sensorType: number): string => {
    const descriptions: Record<number, string> = {
      1: '온도/습도 센서',
      5: '온도 센서',
      11: 'Modbus 온습도',
      12: 'Modbus 압력',
      13: 'Modbus 유량',
      14: 'Modbus 릴레이',
      15: 'Modbus 전력',
      19: '토양 센서'
    };
    return descriptions[sensorType] || SENSOR_METADATA[sensorType]?.name || '알 수 없음';
  };

  // 막대차트 색상
  const getBarColor = (key: string): string => {
    if (key.includes('SCD30') && key.includes('CO2')) {
      return '#9333ea';
    }
    
    if (key.includes('TSL2591') || key.includes('BH1750') || key.toLowerCase().includes('light')) {
      return '#eab308';
    }
    
    if (key.includes('토양센서') || key.includes('SOIL_SENSOR')) {
      if (key.includes('_pH') || key.includes('_값0')) return '#06b6d4';  // pH - 청색
      if (key.includes('_EC') || key.includes('_값1')) return '#ef4444';  // EC - 빨간색
      if (key.includes('_온도') || key.includes('_값2')) return '#8b5cf6'; // 온도 - 보라색
      if (key.includes('_습도') || key.includes('_값3')) return '#10b981'; // 습도 - 초록색
      return '#92400e';
    }
    
    if (key.includes('ADS1115')) {
      if (key.includes('ph') || key.includes('pH')) return '#059669';
      if (key.includes('ec') || key.includes('EC')) return '#0ea5e9';
      return '#3b82f6';
    }
    
    if (key.includes('pH') || key.includes('ph')) return '#059669';
    if (key.includes('EC') || key.includes('ec')) return '#0ea5e9';
    
    return '#6b7280';
  };

  // DB에서 필터 데이터 불러오기
  const loadFiltersFromDB = useCallback(async () => {
    if (!deviceId || hasRestoredFromDB) return;

    const result = await sensorChartAPI.loadFilters(deviceId);
    setHasRestoredFromDB(true);

    if (result?.success && result.hasFilter && result.filter) {
      const { filter } = result;

      if (filter.selectedSensorTypes !== undefined && Array.isArray(filter.selectedSensorTypes)) {
        // 🔥 빈 배열도 복원 (모든 센서를 비활성화한 경우도 유지)
        if (filter.selectedSensorTypes.length === 0) {
          setSelectedSensorTypes(new Set());
          setUserClearedLineFilters(true); // 🔥 빈 배열이면 사용자가 해제한 것으로 간주
        } else {
          const validTypes = (filter.selectedSensorTypes as number[]).filter((sensorType: number) =>
            lineChartSensorTypes.includes(sensorType)
          );
          if (validTypes.length > 0) {
            setSelectedSensorTypes(new Set(validTypes));
            setUserClearedLineFilters(false); // 🔥 DB에서 필터를 복원하면 플래그 리셋
          }
        }
      }

      if (filter.selectedBarValues !== undefined && Array.isArray(filter.selectedBarValues)) {
        // 🔥 빈 배열도 복원 (조도 센서를 비활성화한 경우도 유지)
        if (filter.selectedBarValues.length === 0) {
          setSelectedBarValues(new Set());
        } else {
          // 🔥 조도 센서는 하나만 선택되도록 필터링 (TSL2591 우선)
          const validKeys = (filter.selectedBarValues as string[]).filter((key: string) =>
            barChartKeys.includes(key)
          );
          
          // 🔥 조도 센서가 여러 개 선택되어 있으면 하나만 유지 (TSL2591 우선)
          const lightKeys = validKeys.filter(k => 
            k.includes('TSL2591') || k.includes('BH1750') || (k.includes('조도') && !k.includes('토양'))
          );
          const otherKeys = validKeys.filter(k => 
            !k.includes('TSL2591') && !k.includes('BH1750') && !(k.includes('조도') && !k.includes('토양'))
          );
          
          const finalKeys: string[] = [];
          if (lightKeys.length > 0) {
            // 🔥 TSL2591 우선, 없으면 BH1750, 없으면 기타 조도
            const tsl2591Key = lightKeys.find(k => k.includes('TSL2591'));
            const bh1750Key = lightKeys.find(k => k.includes('BH1750'));
            const otherLightKey = lightKeys.find(k => !k.includes('TSL2591') && !k.includes('BH1750'));
            
            if (tsl2591Key) finalKeys.push(tsl2591Key);
            else if (bh1750Key) finalKeys.push(bh1750Key);
            else if (otherLightKey) finalKeys.push(otherLightKey);
          }
          finalKeys.push(...otherKeys);
          
          if (finalKeys.length > 0) {
            setSelectedBarValues(new Set(finalKeys));
          }
        }
      }

      if (filter.mobileChartTab) {
        setMobileChartTab(filter.mobileChartTab);
      }
    }
  }, [deviceId, lineChartSensorTypes, barChartKeys, hasRestoredFromDB]);

  // DB에 필터 데이터 저장하기 (디바운스)
  const saveFiltersToDBDebounced = useCallback((filterData: FilterData) => {
    if (!deviceId || !hasRestoredFromDB) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      await sensorChartAPI.saveFilters(deviceId, filterData);
      setIsSaving(false);
    }, 1000);
  }, [deviceId, hasRestoredFromDB]);

  // 컴포넌트 마운트 시 DB에서 필터 불러오기
  useEffect(() => {
    if (lineChartSensorTypes.length > 0 && !hasRestoredFromDB) {
      setTimeout(() => {
        loadFiltersFromDB();
      }, 200);
    }
  }, [lineChartSensorTypes.length, loadFiltersFromDB]);

  // 센서 타입 변경 시 DB 저장
  useEffect(() => {
    if (hasRestoredFromDB) {
      saveFiltersToDBDebounced({
        selectedSensorTypes: Array.from(selectedSensorTypes)
      });
    }
  }, [selectedSensorTypes, hasRestoredFromDB, saveFiltersToDBDebounced]);

  // 막대차트 값 변경 시 DB 저장
  useEffect(() => {
    if (hasRestoredFromDB) {
      saveFiltersToDBDebounced({
        selectedBarValues: Array.from(selectedBarValues)
      });
    }
  }, [selectedBarValues, hasRestoredFromDB, saveFiltersToDBDebounced]);

  // 모바일 탭 변경 시 DB 저장
  useEffect(() => {
    if (hasRestoredFromDB) {
      saveFiltersToDBDebounced({
        mobileChartTab: mobileChartTab
      });
    }
  }, [mobileChartTab, hasRestoredFromDB, saveFiltersToDBDebounced]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 막대차트 데이터 준비 (기간별 보기 지원)
  const barChartData = useMemo(() => {
    if (!displayChartData.length || selectedBarValues.size === 0) return [];

    // 🔥 기간별 보기일 때는 샘플링된 데이터 사용, 실시간 보기일 때는 최근 7개
    const recentData = viewMode === 'period' ? displayChartData : displayChartData.slice(-7);
    
    // 🔥 막대 차트는 최대 20개 포인트로 제한 (가독성 향상)
    const maxBarPoints = 20;
    const barData = recentData.length > maxBarPoints ? 
      recentData.filter((_, index) => index % Math.ceil(recentData.length / maxBarPoints) === 0) : 
      recentData;
    
    // 🔥 선택된 키에 해당하는 데이터만 포함 (값이 있는 데이터만)
    return barData.map((item: ChartDataPoint) => {
      const barPoint: Record<string, any> = { time: item.time };
      (Array.from(selectedBarValues) as string[]).forEach((key: string) => {
        // 🔥 실제 데이터에 존재하고 값이 null이 아닌 경우만 포함
        if (item[key] !== undefined && item[key] !== null) {
          barPoint[key] = item[key];
        }
      });
      // 🔥 선택된 키 중 하나라도 값이 있는 경우만 반환 (빈 데이터 포인트 제거)
      const hasValue = Object.keys(barPoint).some(k => k !== 'time' && barPoint[k] !== undefined && barPoint[k] !== null);
      return hasValue ? barPoint : null;
    }).filter((item): item is Record<string, any> => item !== null);
  }, [displayChartData, selectedBarValues, viewMode]);

  // Y축 그룹 분석
  const axisGroups = useMemo(() => {
    if (!barChartData.length || selectedBarValues.size === 0) {
      return { leftAxis: [], rightAxis: [] };
    }

    const leftAxis: string[] = [];
    const rightAxis: string[] = [];

    (Array.from(selectedBarValues) as string[]).forEach((key: string) => {
      const values = barChartData
        .map((item: Record<string, any>) => item[key])
        .filter((val: any) => typeof val === 'number' && !isNaN(val));

      if (values.length > 0) {
        const max = Math.max(...values);
        const displayName = getDisplayName(key);

        if (max <= 100 || displayName.includes('pH') ||
          displayName.includes('습도') || displayName.includes('온도')) {
          leftAxis.push(key);
        } else {
          rightAxis.push(key);
        }
      }
    });

    return { leftAxis, rightAxis };
  }, [barChartData, selectedBarValues]);

  // 선형차트 라인 생성
  const lineChartLines = useMemo(() => {
    if (!displayChartData.length || selectedSensorTypes.size === 0) return [];

    const lines: React.ReactElement[] = [];
    const sampleData = displayChartData[0];


    Object.keys(sampleData).forEach((key: string) => {
      // 🔥 조도 센서는 막대차트 전용이므로 선형차트에서 제외 (TSL2591 우선 체크)
      if (key !== 'time' && !barChartKeys.includes(key) && 
          !key.includes('TSL2591') && !(key.includes('조도') && !key.includes('토양')) && 
          !key.includes('BH1750')) {
        const shouldShow = (Array.from(selectedSensorTypes) as number[]).some((sensorType: number) => {
          if (sensorType === 1) {
            // SHT20: 온도, 습도만 (토양센서 제외)
            // 🔥 키 형식: SHT20_온도, SHT20_습도 또는 SHT20_CH1_온도, SHT20_CH1_습도
            const isSHT20 = key.includes('SHT20') || key.includes('온습도센서') || key.includes('환경센서');
            const isTempOrHumid = (key.includes('_온도') || key.includes('_습도') || 
                                  (key.includes('온도') && !key.includes('토양') && !key.includes('수온')) ||
                                  (key.includes('습도') && !key.includes('토양')));
            const isNotSoil = !key.includes('토양');
            return isSHT20 && isTempOrHumid && isNotSoil;
          } else if (sensorType === 3) {
            // ADS1115: pH, EC, 수온
            return (key.includes('ADS1115') || key.includes('수질센서') || key.includes('양액센서')) && 
                   (key.includes('_pH') || key.includes('_EC') || key.includes('_수온') ||
                    key.includes('pH') || key.includes('EC') || key.includes('수온'));
          } else if (sensorType === 4) {
            // SCD30: CO2, 온도, 습도
            return (key.includes('SCD30') || key.includes('CO2센서') || key.includes('대기질센서')) && 
                   (key.includes('CO2') || key.includes('온도') || key.includes('습도'));
          } else if (sensorType === 5) {
            // DS18B20: 온도
            return (key.includes('DS18B20') || key.includes('온도센서') || key.includes('수온센서')) && 
                   key.includes('온도');
          } else if (sensorType === 19) {
            // 🔥 토양센서: pH, EC, 온도, 습도만
            return key.includes('토양센서') && (
              key.includes('_pH') || key.includes('_EC') || 
              key.includes('_온도') || key.includes('_습도') ||
              key.includes('pH') || key.includes('EC') || 
              key.includes('온도') || key.includes('습도')
            );
          } else {
            // 기타 센서들 (Modbus 등)
            const typeKeywords: Record<number, string[]> = {
              11: ['MODBUS_TH', 'modbus_temperature', 'modbus_humidity', '온습도센서'],
              12: ['MODBUS_PRESSURE', 'modbus_pressure', '압력센서'],
              13: ['MODBUS_FLOW', 'modbus_flow', '유량센서'],
              14: ['MODBUS_RELAY', 'modbus_relay', '릴레이모듈'],
              15: ['MODBUS_ENERGY', 'modbus_voltage', 'modbus_current', '전력계'],
              16: ['풍향센서', 'WIND_DIRECTION'],
              17: ['풍속센서', 'WIND_SPEED'],
              18: ['강우강설센서', 'PRECIPITATION']
            };
            const keywords = typeKeywords[sensorType] || [];
            return keywords.some((keyword: string) => key.includes(keyword));
          }
        });

        if (shouldShow) {
          let color = '#8884d8';

          if (key.includes('_pH') && !key.includes('SHT20') && !key.includes('환경센서')) color = SENSOR_COLOR_PALETTE[19].primary;
          else if (key.includes('_EC') && !key.includes('SHT20') && !key.includes('환경센서')) color = SENSOR_COLOR_PALETTE[191].primary;
          else if (key.includes('_온도') && !key.includes('SHT20') && !key.includes('환경센서')) color = SENSOR_COLOR_PALETTE[192].primary;
          else if (key.includes('_습도') && !key.includes('SHT20') && !key.includes('환경센서')) color = SENSOR_COLOR_PALETTE[193].primary;
          else if (key.includes('온도') || key.includes('temperature')) color = SENSOR_COLOR_PALETTE[1].primary;
          else if (key.includes('습도') || key.includes('humidity')) color = SENSOR_COLOR_PALETTE[11].primary;
          else if (key.includes('modbus_temperature')) color = SENSOR_COLOR_PALETTE[1].primary;
          else if (key.includes('modbus_humidity')) color = SENSOR_COLOR_PALETTE[111].primary;
          else if (key.includes('modbus_pressure')) color = SENSOR_COLOR_PALETTE[12].primary;
          else if (key.includes('modbus_flow')) color = SENSOR_COLOR_PALETTE[13].primary;
          else if (key.includes('modbus_relay')) color = SENSOR_COLOR_PALETTE[14].primary;
          else if (key.includes('modbus_voltage')) color = SENSOR_COLOR_PALETTE[15].primary;
          else if (key.includes('modbus_current')) color = SENSOR_COLOR_PALETTE[151].primary;

          lines.push(
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, stroke: color, strokeWidth: 2 }}
              name={key}
              // 오프라인 시 애니메이션 비활성화
              isAnimationActive={!isChartUpdatesPaused}
              animationDuration={isChartUpdatesPaused ? 0 : 1000}
            />
          );
        }
      }
    });

    return lines;
  }, [displayChartData, selectedSensorTypes, barChartKeys, isChartUpdatesPaused]);

  // 막대차트 바 생성
  const barChartBars = useMemo(() => {
    if (!barChartData.length) return [];

    const bars: React.ReactElement[] = [];

    axisGroups.leftAxis.forEach((key: string) => {
      const color = getBarColor(key);
      bars.push(
        <Bar
          key={`${key}-left`}
          dataKey={key}
          fill={color}
          fillOpacity={0.8}
          name={getDisplayName(key)}
          radius={[2, 2, 0, 0]}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={1}
          yAxisId="left"
          // 오프라인 시 애니메이션 비활성화
          isAnimationActive={!isChartUpdatesPaused}
          animationDuration={isChartUpdatesPaused ? 0 : 800}
        />
      );
    });

    axisGroups.rightAxis.forEach((key: string) => {
      const color = getBarColor(key);
      bars.push(
        <Bar
          key={`${key}-right`}
          dataKey={key}
          fill={color}
          fillOpacity={0.6}
          name={`${getDisplayName(key)} (우)`}
          radius={[2, 2, 0, 0]}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={1}
          yAxisId="right"
          // 오프라인 시 애니메이션 비활성화
          isAnimationActive={!isChartUpdatesPaused}
          animationDuration={isChartUpdatesPaused ? 0 : 800}
        />
      );
    });

    return bars;
  }, [barChartData, axisGroups, isChartUpdatesPaused]);

  // 이벤트 핸들러들
  const handleSensorToggle = useCallback((sensorType: number) => {
    setSelectedSensorTypes(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(sensorType)) {
        newSelected.delete(sensorType);
      } else {
        newSelected.add(sensorType);
        setUserClearedLineFilters(false); // 🔥 센서를 선택하면 플래그 리셋
      }
      return newSelected;
    });
  }, []);

  // 🔥 막대차트 값 토글: 실제 데이터에 존재하는 키만 토글
  const handleBarValueToggle = useCallback((value: string) => {
    setSelectedBarValues(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(value)) {
        // 해제: 키가 있으면 제거
        newSelected.delete(value);
      } else {
        // 선택: 실제 데이터에 존재하는 키인지 확인 후 추가
        const dataSource = viewMode === 'period' && convertPeriodDataToChartData.length > 0 
          ? convertPeriodDataToChartData 
          : displayChartData;
        
        const keyExists = dataSource.some((data: ChartDataPoint) => 
          data[value] !== undefined && data[value] !== null
        );
        
        if (keyExists) {
          newSelected.add(value);
        } else {
          console.warn(`⚠️ 막대차트 키 "${value}"가 실제 데이터에 존재하지 않습니다.`);
        }
      }
      return newSelected;
    });
  }, [viewMode, convertPeriodDataToChartData, displayChartData]);

  const handleMobileTabChange = (tab: 'line' | 'bar') => {
    setMobileChartTab(tab);
  };

  const handleLineSelectAll = () => {
    setUserClearedLineFilters(false); // 🔥 전체 선택 시 플래그 리셋
    setSelectedSensorTypes(new Set(lineChartSensorTypes));
  };

  const handleLineClearAll = () => {
    setUserClearedLineFilters(true); // 🔥 사용자가 명시적으로 해제했음을 표시
    setSelectedSensorTypes(new Set());
  };

  // 🔥 막대차트 전체 선택: 실제 데이터에 존재하는 키만 선택
  const handleBarSelectAll = useCallback(() => {
    // 🔥 실제 데이터에 존재하는 키만 필터링하여 선택
    const dataSource = viewMode === 'period' && convertPeriodDataToChartData.length > 0 
      ? convertPeriodDataToChartData 
      : displayChartData;
    
    const validKeys = barChartKeys.filter(key => {
      return dataSource.some((data: ChartDataPoint) => 
        data[key] !== undefined && data[key] !== null
      );
    });
    
    if (validKeys.length > 0) {
      setSelectedBarValues(new Set(validKeys));
    } else {
      console.warn('⚠️ 막대차트에 표시할 수 있는 유효한 키가 없습니다.');
    }
  }, [barChartKeys, viewMode, convertPeriodDataToChartData, displayChartData]);

  // 🔥 막대차트 전체 해제
  const handleBarClearAll = useCallback(() => {
    setSelectedBarValues(new Set());
  }, []);

  // 툴팁 포맷터
  const formatTooltipValue = (value: any, name: string) => {
    const cleanName = name.replace(' (우)', '');
    
    if (cleanName.includes('CO2')) {
      return [`${Math.round(value)} ppm`, 'CO2 농도'];
    } else if (cleanName.includes('조도')) {
      return [`${Math.round(value)} lux`, '조도'];
    } else if (cleanName.includes('토양 산도') || cleanName.includes('양액 산도') || cleanName.includes('수소이온농도')) {
      return [`${Number(value).toFixed(2)}`, cleanName];
    } else if (cleanName.includes('토양 전도도') || cleanName.includes('양액 전도도') || cleanName.includes('전기전도도')) {
      return [`${Math.round(value)} μS/cm`, cleanName];
    } else if (cleanName.includes('토양 수분')) {
      return [`${Number(value).toFixed(1)}%`, '토양 수분'];
    } else if (cleanName.includes('토양 온도')) {
      return [`${Number(value).toFixed(1)}°C`, '토양 온도'];
    }
    
    return [Number(value).toFixed(2), cleanName];
  };

  // 개선된 오프라인 상태 배너 (차트 업데이트 제어 포함)
  const renderOfflineStatus = () => {
    if (!displayChartData.length) return null;

    return (
      <div className={`mb-4 border rounded-lg p-3 ${
        isDeviceConnected 
          ? isChartUpdatesPaused 
            ? 'bg-blue-50 border-blue-200' 
            : 'hidden'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${
              isDeviceConnected 
                ? 'bg-blue-100' 
                : 'bg-amber-100'
            }`}>
              <svg className={`w-4 h-4 ${
                isDeviceConnected ? 'text-blue-600' : 'text-amber-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isDeviceConnected ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                )}
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">

            {lastDataUpdateTime && (
              <p className={`text-xs mt-1 ${
                isDeviceConnected ? 'text-blue-600' : 'text-amber-600'
              }`}>
                마지막 업데이트: {formatLastUpdateTime(lastDataUpdateTime)}
              </p>
            )}
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg p-4">
      {/* 개선된 오프라인/일시정지 상태 표시 */}
      {renderOfflineStatus()}

      {/* 헤더 부분 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <span>센서 차트</span>

            {isSaving && (
              <span className="text-sm text-blue-500">저장 중...</span>
            )}
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
            {/* 🔥 보기 모드 선택 */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleViewModeChange('realtime')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  viewMode === 'realtime' 
                    ? 'bg-green-100 text-green-700 font-medium' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                실시간 보기
              </button>
              <button
                onClick={() => handleViewModeChange('period')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  viewMode === 'period' 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                기간별 보기
              </button>
            </div>

            {/* 🔥 기간 선택 (기간별 보기일 때만 표시) */}
            {viewMode === 'period' && (
              <select
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={periodLoading}
              >
                <option value="1week">1주일</option>
                <option value="1month">1개월</option>
                <option value="3months">3개월</option>
                <option value="6months">6개월</option>
                <option value="1year">1년</option>
              </select>
            )}

            {/* 🔥 로딩 표시 */}
            {periodLoading && (
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="hidden sm:inline">데이터 로딩 중...</span>
                <span className="sm:hidden">로딩...</span>
              </div>
            )}

            {onExportData && displayChartData.length > 0 && (
              <button
                onClick={onExportData}
                className="px-4 py-2 text-sm bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors flex items-center space-x-2"
                title={!isDeviceConnected ? "오프라인 상태에서도 데이터 내보내기 가능" : "데이터 내보내기"}
              >
                <span>
                  <img src="/folder.png" alt="폴더" className="inline-block w-5 h-5 align-middle" />
                </span>
                <span>데이터 내보내기</span>
              </button>
            )}
          </div>
        </div>

        {/* 🔥 기간별 보기 정보 표시 */}
        {viewMode === 'period' && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
              <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                <span className="text-sm font-medium text-blue-700">기간별 보기</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    {selectedPeriod === '1week' && '1주일'}
                    {selectedPeriod === '1month' && '1개월'}
                    {selectedPeriod === '3months' && '3개월'}
                    {selectedPeriod === '6months' && '6개월'}
                    {selectedPeriod === '1year' && '1년'}
                  </span>
                  
                  {convertPeriodDataToChartData.length > 0 && getDataRangeInfo && (
                    <>
                      <span className="text-xs text-gray-600">
                        ({convertPeriodDataToChartData.length}개 데이터 포인트)
                      </span>
                      {!getDataRangeInfo.isFullPeriod && (
                        <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded" title="선택한 기간보다 적은 데이터가 있습니다">
                          실제 {getDataRangeInfo.actualDays}일 데이터
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {getDataRangeInfo.earliest.toLocaleDateString()} ~ {getDataRangeInfo.latest.toLocaleDateString()}
                      </span>
                    </>
                  )}
                  
                  {periodLoading && (
                    <span className="text-xs text-blue-500">
                      로딩 중...
                    </span>
                  )}
                  {periodError && (
                    <span className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded" title={periodError}>
                      ⚠️ 오류
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleViewModeChange('realtime')}
                className="text-xs text-blue-600 hover:text-blue-800 underline self-start sm:self-auto"
              >
                실시간 보기로 전환
              </button>
            </div>
          </div>
        )}

        {/* 🔥 기간별 보기 데이터 없음/오류 메시지 */}
        {viewMode === 'period' && !periodLoading && periodData.length === 0 && convertPeriodDataToChartData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-lg mb-2">📊</div>
            {periodError ? (
              <>
                <div className="text-sm text-red-600 mb-2">데이터 로드 실패</div>
                <div className="text-xs text-red-500 mb-2">{periodError}</div>
                <div className="text-xs text-gray-500">실시간 보기로 전환하거나 페이지를 새로고침해보세요</div>
              </>
            ) : (
              <>
                <div className="text-sm">데이터가 없습니다</div>
                <div className="text-xs mt-1">이 장치에서 아직 센서 데이터가 수집되지 않았습니다</div>
                <div className="text-xs mt-1">실시간 보기로 전환하거나 장치 연결을 확인해보세요</div>
              </>
            )}
          </div>
        )}

        {/* 모바일용 차트 탭 */}
        {isMobile && (
          <div className="border-t pt-4">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-4">
              <button
                onClick={() => handleMobileTabChange('line')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${mobileChartTab === 'line'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
                  }`}
              >
                <span>선형 차트</span>
              </button>
              <button
                onClick={() => handleMobileTabChange('bar')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2 ${mobileChartTab === 'bar'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
                  }`}
              >
                <span>막대 차트</span>
              </button>
            </div>

            {/* 모바일 선형차트 필터 */}
            {mobileChartTab === 'line' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <img src="/chart.png" alt="선형차트" className="w-4 h-4 mr-1" />
                    선형 차트 필터
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={handleLineSelectAll}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded"
                    >
                      전체
                    </button>
                    <button
                      onClick={handleLineClearAll}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lineChartSensorTypes.map((sensorType: number) => {
                    const isSelected = selectedSensorTypes.has(sensorType);
                    return (
                      <button
                        key={sensorType}
                        onClick={() => handleSensorToggle(sensorType)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${isSelected
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300'
                          }`}
                      >
                        {getSensorDescription(sensorType)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 모바일 막대차트 필터 */}
            {mobileChartTab === 'bar' && barChartKeys.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <img src="/barchart.png" alt="Bar Chart Icon" className="w-4 h-4" />
                    막대형 센서 필터
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={handleBarSelectAll}
                      className="px-2 py-1 text-xs bg-green-100 text-green-600 rounded"
                    >
                      전체
                    </button>
                    <button
                      onClick={handleBarClearAll}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {barChartKeys.map((key: string) => {
                    const isSelected = selectedBarValues.has(key);
                    const displayName = getDisplayName(key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleBarValueToggle(key)}
                        className={`px-2 py-1 rounded text-xs transition-colors ${isSelected
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300'
                          }`}
                        title={displayName}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 데이터가 없는 경우 */}
      {displayChartData.length === 0 && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">차트 데이터 없음</h3>
            <p className="text-gray-500 mb-6">
              아직 차트로 표시할 센서 데이터가 없습니다.
            </p>
            <div className="space-y-2 text-sm text-gray-600">
              <p>• 디바이스가 데이터를 전송하기까지 잠시 기다려주세요</p>
              <p>• 센서 연결 상태를 확인해주세요</p>
            </div>
          </div>
        </div>
      )}

      {/* 데스크톱 차트 영역 */}
      {!isMobile && displayChartData.length > 0 && !(viewMode === 'period' && convertPeriodDataToChartData.length === 0) && (
        <div className="flex flex-col xl:flex-row gap-6">
          {/* 선형차트 영역 */}
          <div className="xl:flex-[2] bg-white rounded-lg p-4 shadow-sm border">
            {lineChartSensorTypes.length > 0 && (
              <div className="mb-4 border-b pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 flex items-center">
                    <img src="/chart.png" alt="선형차트" className="w-4 h-4 mr-1" />
                    선형 차트 필터
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleLineSelectAll}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                    >
                      전체 선택
                    </button>
                    <button
                      onClick={handleLineClearAll}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                    >
                      선택 해제
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lineChartSensorTypes.map((sensorType: number) => {
                    const isSelected = selectedSensorTypes.has(sensorType);
                    return (
                      <button
                        key={sensorType}
                        onClick={() => handleSensorToggle(sensorType)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center space-x-1 ${isSelected
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                          }`}
                      >
                        <SensorIcon sensorType={sensorType} size="sm" />
                        <span>{getSensorDescription(sensorType)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ height: `${layoutConfig.chartHeight}px` }}>
              {selectedSensorTypes.size > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={displayChartData}
                    margin={{ top: 15, right: 15, left: 15, bottom: 30 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="time"
                      fontSize={10}
                      stroke="#666"
                      interval="preserveStartEnd"
                      tick={{ fontSize: 10, dy: 3 }}
                      axisLine={false}
                      tickLine={false}
                      height={20}
                      reversed={viewMode === 'period'} // 🔥 기간별 보기일 때 시간축 반대로 (좌측=예전값, 우측=최근값)
                    />
                    <YAxis
                      fontSize={10}
                      stroke="#666"
                      axisLine={false}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      labelStyle={{ color: '#374151', fontWeight: '500' }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                      iconType="circle"
                      layout="horizontal"
                      align="center"
                      verticalAlign="bottom"
                    />
                    {lineChartLines}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-4xl mb-4">
                      <img src="/chart.png" alt="Chart" className="w-10 h-10 mx-auto" />
                    </div>
                    <p className="text-gray-500 mb-4">
                      선형 차트를 보려면 위의 필터에서 센서를 선택해주세요.
                    </p>
                    <div className="text-sm text-gray-400">
                      온도, 습도, 압력, 유량 등의 연속적인 데이터 변화를 확인할 수 있습니다.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 막대차트 영역 */}
          {barChartKeys.length > 0 && (
            <div className="xl:flex-[1] bg-white rounded-lg p-4 shadow-sm border">
              <div className="mb-4 border-b pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 inline-flex items-center gap-1">
                    <img src="/barchart.png" alt="Bar Chart Icon" className="w-4 h-4" />
                    막대형 센서 필터
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={handleBarSelectAll}
                      className="px-2 py-1 text-xs bg-green-100 text-green-600 rounded hover:bg-green-200 transition-colors"
                    >
                      전체
                    </button>
                    <button
                      onClick={handleBarClearAll}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {barChartKeys.map((key: string) => {
                    const isSelected = selectedBarValues.has(key);
                    const displayName = getDisplayName(key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleBarValueToggle(key)}
                        className={`px-2 py-1 rounded text-xs transition-colors text-center ${isSelected
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                          }`}
                        title={displayName}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ height: `${layoutConfig.chartHeight}px` }}>
                {selectedBarValues.size > 0 && barChartData.some((item: Record<string, any>) => Object.keys(item).length > 1) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      barCategoryGap="20%"
                      barGap={4}
                      maxBarSize={25}
                    >
                      <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="time"
                        fontSize={7}
                        stroke="#666"
                        interval="preserveStartEnd"
                        axisLine={false}
                        tickLine={false}
                        angle={-60}
                        textAnchor="end"
                        height={35}
                        tick={{ dy: 2, dx: -5, fontSize: 7 }}
                        reversed={viewMode === 'period'} // 🔥 기간별 보기일 때 시간축 반대로 (좌측=예전값, 우측=최근값)
                      />
                      <YAxis
                        yAxisId="left"
                        fontSize={9}
                        stroke="#666"
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        orientation="left"
                      />
                      {axisGroups.rightAxis.length > 0 && (
                        <YAxis
                          yAxisId="right"
                          fontSize={9}
                          stroke="#999"
                          axisLine={false}
                          tickLine={false}
                          width={30}
                          orientation="right"
                        />
                      )}
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        labelStyle={{ color: '#374151', fontWeight: '500' }}
                        formatter={formatTooltipValue}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '9px', paddingTop: '15px' }}
                        iconType="rect"
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                      />
                      {barChartBars}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl mb-4">
                        <img src="/chart.png" alt="Chart Icon" className="w-10 h-10 mx-auto" />
                      </div>
                      <p className="text-gray-500 mb-4">
                        {barChartKeys.length === 0
                          ? '막대형 차트 데이터가 없습니다.'
                          : '막대형 차트를 보려면 위의 필터에서 값을 선택해주세요.'
                        }
                      </p>
                      <div className="text-sm text-gray-400">
                        CO2, 조도, 토양센서, pH/EC 등의 수치 데이터를 확인할 수 있습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 모바일 차트 영역 */}
      {isMobile && displayChartData.length > 0 && !(viewMode === 'period' && convertPeriodDataToChartData.length === 0) && (
        <div className="bg-white rounded-lg p-2 shadow-sm border">
          {mobileChartTab === 'line' ? (
            <>
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                <span>
                  <img src="/chart.png" alt="Chart" className="inline-block w-5 h-5 align-middle" />
                </span>
                <span>선형 차트</span>
                {!isDeviceConnected && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                    오프라인 데이터
                  </span>
                )}
              </h4>
              <div style={{ height: `${layoutConfig.chartHeight}px` }}>
                {selectedSensorTypes.size > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={displayChartData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="time"
                        fontSize={8}
                        stroke="#666"
                        interval="preserveStartEnd"
                        tick={{ fontSize: 8, dy: 2 }}
                        axisLine={false}
                        tickLine={false}
                        height={15}
                        reversed={viewMode === 'period'} // 🔥 기간별 보기일 때 시간축 반대로 (좌측=예전값, 우측=최근값)
                      />
                      <YAxis
                        fontSize={8}
                        stroke="#666"
                        axisLine={false}
                        tickLine={false}
                        width={25}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                          fontSize: '12px'
                        }}
                        labelStyle={{ color: '#374151', fontWeight: '500', fontSize: '11px' }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }}
                        iconType="circle"
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                      />
                      {lineChartLines}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="mb-3">
                        <img src="/chart.png" alt="Chart" className="w-8 h-8 mx-auto" />
                      </div>
                      <p className="text-gray-500 mb-3 text-sm">
                        선형 차트를 보려면 위의 필터에서 센서를 선택해주세요.
                      </p>
                      <div className="text-xs text-gray-400">
                        온도, 습도, 압력, 유량 등의 연속적인 데이터 변화를 확인할 수 있습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                <span className="inline-flex items-center">
                  <img src="/barchart.png" alt="Chart Icon" className="w-5 h-5" />
                </span>
                <span>막대형 차트</span>
                {!isDeviceConnected && (
                  <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                    오프라인 데이터
                  </span>
                )}
              </h4>
              <div style={{ height: `${layoutConfig.chartHeight}px` }}>
                {selectedBarValues.size > 0 && barChartData.some((item: Record<string, any>) => Object.keys(item).length > 1) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      margin={{ top: 10, right: 20, left: 20, bottom: 35 }}
                      barCategoryGap="15%"
                      barGap={3}
                      maxBarSize={30}
                    >
                      <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="time"
                        fontSize={6}
                        stroke="#666"
                        interval="preserveStartEnd"
                        axisLine={false}
                        tickLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={25}
                        tick={{ dy: 1, dx: -3, fontSize: 6 }}
                        reversed={viewMode === 'period'} // 🔥 기간별 보기일 때 시간축 반대로 (좌측=예전값, 우측=최근값)
                      />
                      <YAxis
                        yAxisId="left"
                        fontSize={8}
                        stroke="#666"
                        axisLine={false}
                        tickLine={false}
                        width={25}
                        orientation="left"
                      />
                      {axisGroups.rightAxis.length > 0 && (
                        <YAxis
                          yAxisId="right"
                          fontSize={8}
                          stroke="#999"
                          axisLine={false}
                          tickLine={false}
                          width={25}
                          orientation="right"
                        />
                      )}
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                          fontSize: '12px'
                        }}
                        labelStyle={{ color: '#374151', fontWeight: '500', fontSize: '11px' }}
                        formatter={formatTooltipValue}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '8px', paddingTop: '8px' }}
                        iconType="rect"
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                      />
                      {barChartBars}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-3xl mb-3">
                        <img src="/chart.png" alt="Chart Icon" className="w-8 h-8 mx-auto" />
                      </div>
                      <p className="text-gray-500 mb-3 text-sm">
                        {barChartKeys.length === 0
                          ? '막대형 차트 데이터가 없습니다.'
                          : '막대형 차트를 보려면 위의 필터에서 값을 선택해주세요.'
                        }
                      </p>
                      <div className="text-xs text-gray-400">
                        CO2, 조도, 토양센서, 양액 pH/EC 등의 수치 데이터를 확인할 수 있습니다.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};