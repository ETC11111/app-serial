// components/weather/WeatherWidget.tsx - 헤더 이미지 수정된 버전
import React, { useState, useEffect, useMemo } from 'react';
import { weatherService, ProcessedWeatherData } from '../../services/weatherService';
import { useDevices } from '../../contexts/DeviceContext';
import { mqttService } from '../../services/mqttService';
import { FlexibleSensorData } from '../../types/sensor.types';
import { locationService } from '../../services/locationService';

interface WeatherWidgetProps {
  weatherData: ProcessedWeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  weatherForecast: ProcessedWeatherData[];
  onRefresh: (region?: string) => void;
  onRegionChange?: (region: string) => void;
  selectedRegion?: string;
}

interface WeatherDeviceData {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  lastUpdate: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  windDirectionText?: string;
  precipitation?: string;
  precipitationIcon?: string;
  windScale?: string;
  windCondition?: string;
  location?: string;
  sensorStatus: {
    windDirection: 'available' | 'unavailable' | 'error';
    windSpeed: 'available' | 'unavailable' | 'error';
    precipitation: 'available' | 'unavailable' | 'error';
    hasAnyWeatherSensor: boolean;
  };
}

interface WeatherDeviceInfo {
  device: any;
  hasWeatherSensors: boolean;
  availableSensors: string[];
  sensorCount: number;
  isOnline: boolean;
  lastSensorUpdate?: string;
}

// 🔥 센서 타입 정의 추가
interface SensorData {
  type: number;
  values: (number | string | null)[];
}

const STORAGE_KEY = 'weather-selected-region';
const DEVICE_WEATHER_KEY = 'weather-selected-device';

// 기상 센서 타입 정의 및 설명
const WEATHER_SENSOR_TYPES = {
  WIND_DIRECTION: { type: 16, name: '풍향', icon: '🧭' },
  WIND_SPEED: { type: 17, name: '풍속', icon: '💨' },
  PRECIPITATION: { type: 18, name: '강우/강설', icon: '🌧️' }
} as const;

// 🔥 센서 데이터 유효성 검사 함수 - 타입 추가
const validateSensorData = (sensor: SensorData): boolean => {
  if (!sensor || !sensor.values) return false;

  // 센서 타입별 유효성 검사
  switch (sensor.type) {
    case 16: // 풍향
      return sensor.values.length >= 3 &&
        sensor.values[1] !== null &&
        sensor.values[1] !== undefined &&
        !isNaN(sensor.values[1] as number);

    case 17: // 풍속
      return sensor.values.length >= 1 &&
        sensor.values[0] !== null &&
        sensor.values[0] !== undefined &&
        !isNaN(sensor.values[0] as number);

    case 18: // 강우/강설 (온도, 습도 포함)
      return sensor.values.length >= 6 &&
        sensor.values[4] !== null && // 온도
        sensor.values[5] !== null && // 습도
        !isNaN(sensor.values[4] as number) &&
        !isNaN(sensor.values[5] as number);

    default:
      return false;
  }
};

// 디바이스의 기상 센서 정보 분석 함수
const analyzeWeatherDevice = (device: any): WeatherDeviceInfo => {
  const availableSensors: string[] = [];
  let hasValidWeatherSensor = false;

  // 1. 디바이스 이름 기반 키워드 검사
  const weatherKeywords = [
    '기상', '날씨', 'weather', '풍향', '풍속', '강우', '강설', '환경',
    '스마트팜', 'smartfarm', 'farm', '농장', '온실', 'greenhouse',
    'smart', '스마트', 'station', '스테이션', 'monitoring', '모니터링'
  ];

  const hasWeatherKeywords = weatherKeywords.some(keyword =>
    device.device_name.toLowerCase().includes(keyword.toLowerCase())
  );

  // 2. 실제 센서 데이터 분석
  if (device.latestSensorData?.sensors && Array.isArray(device.latestSensorData.sensors)) {
    const sensors = device.latestSensorData.sensors;

    sensors.forEach((sensor: SensorData) => {
      // 기상 센서 타입 확인 (16, 17, 18)
      const isWeatherSensorType = [16, 17, 18].includes(sensor.type);

      if (isWeatherSensorType) {
        const isValid = validateSensorData(sensor);

        if (isValid) {
          const sensorTypeName = Object.values(WEATHER_SENSOR_TYPES).find(t => t.type === sensor.type)?.name;
          if (sensorTypeName) {
            availableSensors.push(sensorTypeName);
            hasValidWeatherSensor = true;
          }
        }
      }
    });
  }

  // 3. 온라인 상태 확인 (다른 컴포넌트와 동일한 로직)
  // 1순위: device.status 필드 확인
  // 2순위: 센서 데이터 timestamp 확인 (1분 이내)
  // 3순위: last_seen_at 확인 (1분 이내)
  let isOnline = false;
  if (device.status === 'online') {
    isOnline = true;
  } else if (device.latestSensorData?.timestamp) {
    const dataTime = typeof device.latestSensorData.timestamp === 'string'
      ? new Date(device.latestSensorData.timestamp).getTime()
      : device.latestSensorData.timestamp;
    const now = Date.now();
    const diffMinutes = (now - dataTime) / (1000 * 60);
    isOnline = diffMinutes < 1; // 1분 이내
  } else if (device.last_seen_at) {
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    isOnline = diffMinutes < 1; // 1분 이내
  }

  // 4. 최종 판단 - 키워드 또는 유효한 센서가 있으면 기상 디바이스로 인정
  const isWeatherDevice = hasValidWeatherSensor || hasWeatherKeywords;

  const result: WeatherDeviceInfo = {
    device,
    hasWeatherSensors: isWeatherDevice,
    availableSensors,
    sensorCount: availableSensors.length,
    isOnline: !!isOnline,
    lastSensorUpdate: device.latestSensorData?.timestamp
  };

  return result;
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  weatherData,
  weatherLoading,
  weatherError,
  weatherForecast,
  onRefresh,
  onRegionChange,
  selectedRegion = '익산'
}) => {
  // useDevices hook 사용
  const { devices } = useDevices();

  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(selectedRegion);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [deviceWeatherData, setDeviceWeatherData] = useState<WeatherDeviceData | null>(null);
  const [deviceDataLoading, setDeviceDataLoading] = useState(false);
  const [showDeviceWeather, setShowDeviceWeather] = useState(false);

  // 지역 목록을 state로 관리 (async 함수이므로)
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [allRegions, setAllRegions] = useState<string[]>([]); // 🔥 전체 지역 목록 (검색용)
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>(''); // 🔥 검색어 상태


  // 지역 목록 로드
  useEffect(() => {
    const loadRegions = async () => {
      try {
        setRegionsLoading(true);
        const regions = await weatherService.getAvailableRegions();
        setAllRegions(regions); // 🔥 전체 지역 목록 저장
        setAvailableRegions(regions); // 🔥 초기 표시용
      } catch (error) {
        console.error('지역 목록 로드 실패:', error);
        // 로컬 백업 데이터 사용
        const defaultRegions = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '익산'];
        setAllRegions(defaultRegions);
        setAvailableRegions(defaultRegions);
      } finally {
        setRegionsLoading(false);
      }
    };

    loadRegions();
  }, []);

  // 🔥 개선된 검색어 변경 시 지역 필터링 (중복 제거)
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setAvailableRegions(allRegions);
    } else {
      const searchLower = searchTerm.toLowerCase();
      
      // 🔥 정확한 매치 우선, 부분 매치 후순위
      const exactMatches = allRegions.filter(region => 
        region.toLowerCase() === searchLower
      );
      
      const partialMatches = allRegions.filter(region => 
        region.toLowerCase().includes(searchLower) && 
        region.toLowerCase() !== searchLower
      );
      
      // 🔥 정확한 매치가 있으면 그것만, 없으면 부분 매치 사용
      const filtered = exactMatches.length > 0 ? exactMatches : partialMatches;
      
      setAvailableRegions(filtered);
    }
  }, [searchTerm, allRegions]);

  // 기상 디바이스 분석 및 필터링
  const weatherDeviceAnalysis = useMemo(() => {
    const analysisResults = devices.map(device => analyzeWeatherDevice(device));

    // 더 관대한 필터링 - 키워드가 있거나 센서가 있으면 포함
    const validWeatherDevices = analysisResults.filter(result => {
      // 기본 조건: 기상 센서가 있거나 키워드가 포함되어야 함
      const hasWeatherIndicators = result.hasWeatherSensors;

      // 추가 조건: 온라인이거나 최근에 데이터가 있으면 더 높은 우선순위
      const hasRecentActivity = result.isOnline ||
        (result.lastSensorUpdate &&
          (new Date().getTime() - new Date(result.lastSensorUpdate).getTime()) < 86400000); // 24시간 이내

      // 임시로 모든 디바이스를 기상 디바이스로 간주 (디버깅용)
      const includeAllForDebug = true; // 이 값을 false로 바꾸면 정상 필터링

      const isValid = hasWeatherIndicators || includeAllForDebug;

      return isValid;
    });

    return {
      all: analysisResults,
      valid: validWeatherDevices,
      totalDevices: devices.length,
      validDeviceCount: validWeatherDevices.length
    };
  }, [devices]);

  // 디바이스 센서 데이터 가져오기
  const fetchDeviceWeatherData = async (deviceId: string) => {
    if (!deviceId) return;

    setDeviceDataLoading(true);
    try {
      const result = await mqttService.getRealtimeSensorData(deviceId);

      if (result.success && result.data) {
        const sensorData: FlexibleSensorData = result.data;
        const device = devices.find(d => d.device_id === deviceId);

        if (!device) return;

        const sensors = sensorData.sensors || [];

        // 각 센서별 데이터 추출 및 유효성 검사
        const windDirSensor = sensors.find(s => s.type === 16) as SensorData | undefined;
        const windSpeedSensor = sensors.find(s => s.type === 17) as SensorData | undefined;
        const precipSensor = sensors.find(s => s.type === 18) as SensorData | undefined;

        // 🔥 센서 상태 분석 - as const 제거하고 명시적으로 hasAnyWeatherSensor 계산
        const windDirectionStatus = windDirSensor && validateSensorData(windDirSensor) ? 'available' : 'unavailable';
        const windSpeedStatus = windSpeedSensor && validateSensorData(windSpeedSensor) ? 'available' : 'unavailable';
        const precipitationStatus = precipSensor && validateSensorData(precipSensor) ? 'available' : 'unavailable';

        const sensorStatus = {
          windDirection: windDirectionStatus,
          windSpeed: windSpeedStatus,
          precipitation: precipitationStatus,
          hasAnyWeatherSensor: windDirectionStatus === 'available' ||
            windSpeedStatus === 'available' ||
            precipitationStatus === 'available'
        } as const;

        // 유효한 기상 센서가 없는 경우 처리
        if (!sensorStatus.hasAnyWeatherSensor) {
          setDeviceWeatherData(null);
          return;
        }

        // 온라인 상태 확인 (다른 컴포넌트와 동일한 로직)
        // 1순위: device.status 필드 확인
        // 2순위: 센서 데이터 timestamp 확인 (1분 이내)
        // 3순위: last_seen_at 확인 (1분 이내)
        let deviceIsOnline = false;
        if (device.status === 'online') {
          deviceIsOnline = true;
        } else if (sensorData.timestamp) {
          const dataTime = typeof sensorData.timestamp === 'string'
            ? new Date(sensorData.timestamp).getTime()
            : sensorData.timestamp;
          const now = Date.now();
          const diffMinutes = (now - dataTime) / (1000 * 60);
          deviceIsOnline = diffMinutes < 1; // 1분 이내
        } else if (device.last_seen_at) {
          const lastSeen = new Date(device.last_seen_at);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
          deviceIsOnline = diffMinutes < 1; // 1분 이내
        }

        const weatherInfo: WeatherDeviceData = {
          deviceId: device.device_id,
          deviceName: device.device_name,
          isOnline: deviceIsOnline,
          lastUpdate: new Date(sensorData.timestamp).toLocaleString('ko-KR'),
          location: device.device_location,
          sensorStatus: {
            windDirection: sensorStatus.windDirection,
            windSpeed: sensorStatus.windSpeed,
            precipitation: sensorStatus.precipitation,
            hasAnyWeatherSensor: sensorStatus.hasAnyWeatherSensor
          },

          // 온도, 습도 (강우/강설 센서에서)
          temperature: sensorStatus.precipitation === 'available' ? precipSensor?.values[4] as number : undefined,
          humidity: sensorStatus.precipitation === 'available' ? precipSensor?.values[5] as number : undefined,

          // 풍속 정보
          windSpeed: sensorStatus.windSpeed === 'available' ? windSpeedSensor?.values[0] as number : undefined,
          windScale: sensorStatus.windSpeed === 'available' ? windSpeedSensor?.values[1] as string : undefined,
          windCondition: sensorStatus.windSpeed === 'available' ? windSpeedSensor?.values[2] as string : undefined,

          // 풍향 정보
          windDirection: sensorStatus.windDirection === 'available' ? windDirSensor?.values[1] as number : undefined,
          windDirectionText: sensorStatus.windDirection === 'available' ? windDirSensor?.values[2] as string : undefined,

          // 강수 정보
          precipitation: sensorStatus.precipitation === 'available' ? precipSensor?.values[1] as string : undefined,
          precipitationIcon: sensorStatus.precipitation === 'available' ? precipSensor?.values[7] as string : undefined
        };

        setDeviceWeatherData(weatherInfo);
      }
    } catch (error) {
      setDeviceWeatherData(null);
    } finally {
      setDeviceDataLoading(false);
    }
  };

  // 자동 디바이스 선택 로직
  useEffect(() => {
    const savedRegion = localStorage.getItem(STORAGE_KEY);
    const savedDevice = localStorage.getItem(DEVICE_WEATHER_KEY);

    // 지역 목록이 로드된 후에만 실행
    if (!regionsLoading && availableRegions.length > 0) {
      if (savedRegion && availableRegions.includes(savedRegion)) {
        setCurrentRegion(savedRegion);
        if (onRegionChange && savedRegion !== selectedRegion) {
          onRegionChange(savedRegion);
        }
      }
    }

    // 기상 디바이스 자동 선택
    if (weatherDeviceAnalysis.validDeviceCount > 0) {
      const validDevices = weatherDeviceAnalysis.valid;

      // 저장된 디바이스가 있고 현재 유효한 기상 디바이스 목록에 있으면 선택
      if (savedDevice) {
        const savedDeviceExists = validDevices.some(d => d.device.device_id === savedDevice);
        if (savedDeviceExists) {
          setSelectedDeviceId(savedDevice);
          setShowDeviceWeather(true);
          return;
        }
      }

      // 저장된 디바이스가 없거나 유효하지 않으면 가장 적합한 기상 디바이스 자동 선택
      const bestWeatherDevice = validDevices
        .sort((a, b) => {
          // 1순위: 실제 기상 센서가 있는 디바이스
          if (a.sensorCount !== b.sensorCount) return b.sensorCount - a.sensorCount;
          // 2순위: 온라인 상태
          if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
          // 3순위: 이름 순
          return a.device.device_name.localeCompare(b.device.device_name);
        })[0];

      if (bestWeatherDevice) {
        setSelectedDeviceId(bestWeatherDevice.device.device_id);
        setShowDeviceWeather(true);
        localStorage.setItem(DEVICE_WEATHER_KEY, bestWeatherDevice.device.device_id);
      }
    } else {
      // 기상 디바이스가 없으면 기존 선택 해제
      setSelectedDeviceId(null);
      setShowDeviceWeather(false);
      localStorage.removeItem(DEVICE_WEATHER_KEY);
    }
  }, [weatherDeviceAnalysis, availableRegions, regionsLoading, onRegionChange, selectedRegion]);

  // 이벤트 핸들러들
  const handleRegionChange = (region: string) => {
    setShowRegionSelector(false);
    setCurrentRegion(region);
    setSearchTerm(''); // 🔥 지역 선택 시 검색어 초기화
    localStorage.setItem(STORAGE_KEY, region);
    if (onRegionChange) {
      onRegionChange(region);
    }
    onRefresh(region);
  };

  const handleDeviceSelect = (deviceId: string) => {
    setShowDeviceSelector(false);
    setSelectedDeviceId(deviceId);
    setShowDeviceWeather(true);
    localStorage.setItem(DEVICE_WEATHER_KEY, deviceId);
    fetchDeviceWeatherData(deviceId);
  };

  const removeDeviceWeather = () => {
    setShowDeviceWeather(false);
    setDeviceWeatherData(null);
    setSelectedDeviceId(null);
    localStorage.removeItem(DEVICE_WEATHER_KEY);
  };

  const refreshDeviceWeather = () => {
    if (selectedDeviceId) {
      fetchDeviceWeatherData(selectedDeviceId);
    }
  };

  const refreshAll = () => {
    // 🔥 API 호출 빈도 제한 (최근 5분 내 호출 방지)
    const now = Date.now();
    const lastRefresh = localStorage.getItem('lastWeatherRefresh');
    if (lastRefresh && (now - parseInt(lastRefresh)) < 5 * 60 * 1000) {
      console.log('⚠️ 너무 빈번한 새로고침 요청, 무시됨');
      return;
    }
    
    localStorage.setItem('lastWeatherRefresh', now.toString());
    onRefresh(currentRegion);
    // 장치 기상 데이터 새로고침 (장치 기상 데이터 표시 박스용)
    if (selectedDeviceId && showDeviceWeather) {
      refreshDeviceWeather();
    }
  };

  // 디바이스 선택 시 데이터 가져오기
  useEffect(() => {
    if (selectedDeviceId && showDeviceWeather) {
      fetchDeviceWeatherData(selectedDeviceId);

      const interval = setInterval(() => {
        fetchDeviceWeatherData(selectedDeviceId);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [selectedDeviceId, showDeviceWeather]);

  if (weatherLoading && !weatherData) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 relative">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center">
          {selectedRegion} 날씨
        </h3>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowRegionSelector(!showRegionSelector)}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            title={`지역 변경 (${allRegions.length}개 지역)`}
            disabled={regionsLoading}
          >
            <img src="/map.png" alt="위치 변경" className="w-4 h-4" />
            <span className="ml-1">({allRegions.length})</span>
          </button>

          <button
            onClick={refreshAll}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            title="새로고침"
          >
            <img src="/refresh.png" alt="새로고침" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 🔥 개선된 지역 선택 드롭다운 */}
      {showRegionSelector && (
        <div className="mb-3 relative">
          <div className="absolute top-0 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto z-20">
            {regionsLoading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <div className="text-xs">지역 목록 로딩 중...</div>
              </div>
            ) : (
              <div className="p-2">
                {/* 🔥 개선된 검색 입력 */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="지역명 검색... (예: 서울, 부산, 익산)"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <div className="text-xs text-gray-500 mt-1">
                      {availableRegions.length}개 지역 발견
                      {availableRegions.length === 0 && (
                        <span className="text-red-500 ml-2">검색 결과가 없습니다</span>
                      )}
                    </div>
                  )}
                </div>
                
                {/* 🔥 개선된 지역 그룹별 표시 (검색 결과에 맞게 필터링) */}
                {availableRegions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="text-sm mb-2">검색 결과가 없습니다</div>
                    <div className="text-xs">다른 검색어를 시도해보세요</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                  {/* 수도권 */}
                  {availableRegions.some(region => 
                    ['서울', '인천', '수원', '고양', '성남', '의정부', '부천', '광명', '평택', '과천', '오산', '시흥', '군포', '의왕', '하남', '용인', '파주', '이천', '안성', '김포', '화성', '광주', '여주', '양평', '동두천', '가평', '연천', '양주', '포천', '구리', '남양주'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        수도권
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['서울', '인천', '수원', '고양', '성남', '의정부', '부천', '광명', '평택', '과천', '오산', '시흥', '군포', '의왕', '하남', '용인', '파주', '이천', '안성', '김포', '화성', '광주', '여주', '양평', '동두천', '가평', '연천', '양주', '포천', '구리', '남양주'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 강원도 */}
                  {availableRegions.some(region => 
                    ['춘천', '강릉', '속초', '원주', '영월', '대관령', '홍천', '횡성', '평창', '정선', '철원', '화천', '양구', '인제', '고성', '양양', '동해', '삼척', '태백'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        강원도
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['춘천', '강릉', '속초', '원주', '영월', '대관령', '홍천', '횡성', '평창', '정선', '철원', '화천', '양구', '인제', '고성', '양양', '동해', '삼척', '태백'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 충청도 */}
                  {availableRegions.some(region => 
                    ['청주', '대전', '충주', '서산', '천안', '보령', '아산', '당진', '공주', '논산', '계룡', '금산', '부여', '서천', '청양', '홍성', '예산', '태안', '제천', '보은', '옥천', '영동', '증평', '진천', '괴산', '음성', '단양'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        충청도
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['청주', '대전', '충주', '서산', '천안', '보령', '아산', '당진', '공주', '논산', '계룡', '금산', '부여', '서천', '청양', '홍성', '예산', '태안', '제천', '보은', '옥천', '영동', '증평', '진천', '괴산', '음성', '단양'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 전라도 */}
                  {availableRegions.some(region => 
                    ['전주', '익산', '군산', '정읍', '남원', '김제', '완주', '진안', '무주', '장수', '임실', '순창', '고창', '부안', '광주', '목포', '여수', '완도', '해남', '순천', '나주', '광양', '담양', '곡성', '구례', '고흥', '보성', '화순', '장흥', '강진', '영암', '무안', '함평', '영광', '장성', '신안'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        전라도
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['전주', '익산', '군산', '정읍', '남원', '김제', '완주', '진안', '무주', '장수', '임실', '순창', '고창', '부안', '광주', '목포', '여수', '완도', '해남', '순천', '나주', '광양', '담양', '곡성', '구례', '고흥', '보성', '화순', '장흥', '강진', '영암', '무안', '함평', '영광', '장성', '신안'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 경상도 */}
                  {availableRegions.some(region => 
                    ['대구', '포항', '안동', '상주', '문경', '영주', '울릉도', '경주', '김천', '구미', '영천', '경산', '군위', '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화', '울진', '울릉', '부산', '울산', '창원', '진주', '통영', '거제', '김해', '양산', '의령', '함안', '창녕', '고성', '남해', '하동', '산청', '함양', '거창', '합천', '밀양', '사천', '진해', '마산'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        경상도
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['대구', '포항', '안동', '상주', '문경', '영주', '울릉도', '경주', '김천', '구미', '영천', '경산', '군위', '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화', '울진', '울릉', '부산', '울산', '창원', '진주', '통영', '거제', '김해', '양산', '의령', '함안', '창녕', '고성', '남해', '하동', '산청', '함양', '거창', '합천', '밀양', '사천', '진해', '마산'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 제주도 */}
                  {availableRegions.some(region => 
                    ['제주', '서귀포', '성산', '고산', '제주시', '서귀포시', '성산포'].includes(region)
                  ) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1 px-2 py-1 bg-gray-50 rounded">
                        제주도
                      </div>
                      <div className="grid grid-cols-2 gap-0">
                        {availableRegions.filter(region => 
                          ['제주', '서귀포', '성산', '고산', '제주시', '서귀포시', '성산포'].includes(region)
                        ).map((region) => (
                          <button
                            key={region}
                            onClick={() => handleRegionChange(region)}
                            className={`text-left px-3 py-2 text-xs hover:bg-gray-100 border-b border-gray-100 ${region === currentRegion ? 'bg-blue-50 text-blue-600 font-medium' : ''}`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 디바이스 선택 드롭다운 */}
      {showDeviceSelector && (
        <div className="mb-3 relative">
          <div className="absolute top-0 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto z-20">
            <div className="p-4 border-b bg-gradient-to-r from-green-50 to-emerald-50 relative">
              {/* 닫기 버튼 - cancel.png 이미지 버전 */}
              <button
                onClick={() => setShowDeviceSelector(false)}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white bg-opacity-70 hover:bg-opacity-100 transition-all duration-200 shadow-sm hover:shadow-md"
                title="닫기"
              >
                <img src="/cancle.png" alt="닫기" className="w-4 h-4" />
              </button>

              <div className="text-sm font-medium text-gray-800 mb-2 flex items-center">
                <img src="/weather.png" alt="날씨" className="w-4 h-4 mr-1" />
                실측 기상 디바이스 선택
              </div>
              <div className="text-xs text-gray-600 mb-2">
                홈에서 선택한 디바이스와 독립적으로 기상 데이터를 확인할 수 있습니다
              </div>
              <div className="text-xs text-gray-500">
                총 {weatherDeviceAnalysis.totalDevices}개 디바이스 중 {weatherDeviceAnalysis.validDeviceCount}개가 기상 측정 가능
              </div>
            </div>

            {weatherDeviceAnalysis.valid.length > 0 ? (
              <div className="max-h-64 overflow-y-auto">
                {weatherDeviceAnalysis.valid.map((deviceInfo) => {
                  const device = deviceInfo.device;
                  return (
                    <button
                      key={device.device_id}
                      onClick={() => handleDeviceSelect(device.device_id)}
                      className={`w-full text-left px-4 py-3 hover:bg-green-50 border-b border-gray-100 transition-colors ${device.device_id === selectedDeviceId ? 'bg-green-50 border-green-200' : ''
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium flex items-center text-gray-800 mb-1">
                            <img src="/device.png" alt="device" className="w-5 h-5 mr-2 inline-block" />
                            {device.device_name}
                            <span
                              className={`ml-2 w-2 h-2 rounded-full ${deviceInfo.isOnline ? 'bg-green-400' : 'bg-gray-400'
                                }`}
                            ></span>
                            {device.device_id === selectedDeviceId && (
                              <span className="ml-2 text-green-600 font-bold">✓</span>
                            )}
                          </div>

                          {device.device_location && (
                            <div className="text-xs text-gray-600 mb-1">📍 {device.device_location}</div>
                          )}

                          <div className="text-xs text-gray-500 mb-2">
                            {deviceInfo.isOnline ? (
                              <span className="text-green-600">🟢 온라인 • 실시간 측정</span>
                            ) : (
                              <span className="text-red-500">🔴 오프라인</span>
                            )}
                          </div>

                          {/* 사용 가능한 센서 표시 */}
                          <div className="flex items-center flex-wrap gap-1 mt-1">
                            <span className="text-xs text-gray-500">센서:</span>
                            {deviceInfo.availableSensors.map((sensorName, index) => (
                              <span key={index} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                {Object.values(WEATHER_SENSOR_TYPES).find(s => s.name === sensorName)?.icon} {sensorName}
                              </span>
                            ))}
                            {deviceInfo.availableSensors.length === 0 && (
                              <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                                🔍 키워드 기반 인식
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-green-600 text-lg ml-3">
                          {device.device_id === selectedDeviceId ? '✓' : '➕'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  기상 측정 디바이스가 없습니다
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  총 {weatherDeviceAnalysis.totalDevices}개 디바이스를 분석했지만 기상 센서가 없습니다
                </div>
                <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded">
                  <div className="font-medium mb-1">필요한 센서:</div>
                  <div>• 🧭 풍향 센서 (타입 16)</div>
                  <div>• 💨 풍속 센서 (타입 17)</div>
                  <div>• 🌧️ 강우/강설 센서 (타입 18)</div>
                  <div className="mt-2 text-gray-500">
                    또는 디바이스 이름에 '기상', '날씨', '풍향' 등 키워드 포함
                  </div>
                </div>
              </div>
            )}

            {/* 선택 해제 버튼 */}
            {showDeviceWeather && (
              <div className="p-3 border-t bg-gray-50">
                <button
                  onClick={removeDeviceWeather}
                  className="w-full text-center text-sm text-red-600 hover:text-red-800 py-2 hover:bg-red-50 rounded transition-colors"
                >
                  ❌ 실측 데이터 제거
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API 날씨 정보 */}
      <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg">
        {weatherError || !weatherData ? (
          <div className="text-center text-gray-500">
            <div className="text-lg">--°C</div>
            <div className="text-sm">
              {weatherError ? '날씨 정보를 불러올 수 없습니다' : '데이터 없음'}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="mt-4">
              {weatherData ? (
                <>
                  <img
                    src={weatherService.getWeatherImagePath(weatherData?.skyCondition || '', weatherData?.precipitationType || '')}
                    alt="날씨"
                    className="w-12 h-12"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline';
                    }}
                  />
                  <span style={{ display: 'none' }}>
                    {weatherService.getWeatherEmoji(weatherData?.skyCondition || '', weatherData?.precipitationType || '')}
                  </span>
                </>
              ) : (
                <>
                  <img
                    src="/icons/weather-default.png"
                    alt="날씨"
                    className="w-6 h-6"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline';
                    }}
                  />
                  <span style={{ display: 'none' }}>🌤️</span>
                </>
              )}
            </span>
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold text-gray-900">
                    {weatherData?.currentTemp !== null ? `${weatherData.currentTemp}°C` : '--°C'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {weatherData?.skyCondition || '--'} • {weatherData?.precipitationType || '--'}
                  </div>
                  {weatherData?.feelsLike !== null && weatherData?.feelsLike !== weatherData?.currentTemp && (
                    <div className="text-xs text-gray-500 mt-1">
                      체감 {weatherData.feelsLike}°C
                    </div>
                  )}
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>습도: {weatherData?.currentHumidity !== null && weatherData?.currentHumidity !== undefined ? `${weatherData.currentHumidity}%` : '--'}</div>
                  <div>풍속: {weatherData?.windSpeed !== null ? `${weatherData.windSpeed}m/s` : '--'}</div>
                  {weatherData?.windDirection !== null && (
                    <div>풍향: {weatherService.getWindDirection(weatherData.windDirection)}</div>
                  )}
                  {weatherData?.pressure !== null && (
                    <div className="text-xs mt-1">기압: {weatherData.pressure.toFixed(1)}hPa</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 디바이스 기상 정보 */}
      {showDeviceWeather && (
        <>
          <div className="flex items-center justify-between mb-3 border-t pt-3">
            <h4 className="font-medium text-gray-800 flex items-center">
              실측 장치
              <span className="ml-2 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                장치
              </span>
            </h4>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => setShowDeviceSelector(!showDeviceSelector)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                title="다른 디바이스 선택"
              >
                <img src="/setup.png" alt="설정" className="w-4 h-4" />
              </button>

              <button
                onClick={refreshDeviceWeather}
                disabled={deviceDataLoading}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
                title="디바이스 데이터 새로고침"
              >
                <img
                  src="/refresh.png"
                  alt="새로고침"
                  className={`w-4 h-4 ${deviceDataLoading ? 'animate-spin' : ''}`}
                />
              </button>

              <button
                onClick={removeDeviceWeather}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                title="디바이스 날씨 제거"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
            {deviceDataLoading ? (
              <div className="text-center text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto mb-2"></div>
                <div className="text-sm">디바이스 데이터 로딩 중...</div>
              </div>
            ) : !deviceWeatherData ? (
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-3">⚠️</div>
                <div className="text-lg font-medium text-gray-700 mb-2">기상 센서 데이터가 없습니다</div>
                <div className="text-sm text-gray-600 mb-3">
                  선택된 디바이스에서 유효한 기상 센서 데이터를 찾을 수 없습니다
                </div>
              </div>
            ) : !deviceWeatherData.sensorStatus.hasAnyWeatherSensor ? (
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-3">🚫</div>
                <div className="text-lg font-medium text-gray-700 mb-2">센서 데이터가 유효하지 않습니다</div>
                <div className="text-sm text-gray-600 mb-3">
                  기상 센서가 있지만 측정값이 0이거나 null입니다
                </div>

                {/* 센서별 상태 표시 */}
                <div className="text-xs bg-gray-50 p-3 rounded mb-4 text-left">
                  <div className="font-medium mb-2 text-center">센서 상태:</div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span>🧭 풍향 센서</span>
                      <span className={`px-2 py-1 rounded text-xs ${deviceWeatherData.sensorStatus.windDirection === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {deviceWeatherData.sensorStatus.windDirection === 'available' ? '정상' : '데이터 없음'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>💨 풍속 센서</span>
                      <span className={`px-2 py-1 rounded text-xs ${deviceWeatherData.sensorStatus.windSpeed === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {deviceWeatherData.sensorStatus.windSpeed === 'available' ? '정상' : '데이터 없음'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>🌧️ 강우/온습도 센서</span>
                      <span className={`px-2 py-1 rounded text-xs ${deviceWeatherData.sensorStatus.precipitation === 'available'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {deviceWeatherData.sensorStatus.precipitation === 'available' ? '정상' : '데이터 없음'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-400 mb-4">
                  센서가 연결되어 있지만 유효한 측정값을 받지 못하고 있습니다.<br />
                  센서 연결 상태와 전원을 확인해주세요.
                </div>

                <button
                  onClick={refreshDeviceWeather}
                  className="text-xs bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 transition-colors"
                >
                  🔄 센서 상태 재확인
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="mt-4">
                  {deviceWeatherData?.precipitationIcon ? (
                    <span className="text-2xl">{deviceWeatherData.precipitationIcon}</span>
                  ) : (
                    <img src="/device.png" alt="device" className="w-12 h-12" />
                  )}
                </span>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xl font-bold text-gray-900">
                        {deviceWeatherData.temperature !== undefined ? `${deviceWeatherData.temperature.toFixed(1)}°C` : '--°C'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {deviceWeatherData.precipitation || '측정 중'}
                        {deviceWeatherData.windScale && ` • ${deviceWeatherData.windScale}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center">
                        <span className={`w-2 h-2 rounded-full inline-block mr-1 ${deviceWeatherData.isOnline ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                        {deviceWeatherData.isOnline ? '실시간' : '오프라인'}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <div>습도: {deviceWeatherData.humidity !== undefined ? `${deviceWeatherData.humidity}%` : '--'}</div>
                      <div>풍속: {deviceWeatherData.windSpeed !== undefined ? `${deviceWeatherData.windSpeed.toFixed(1)}m/s` : '--'}</div>
                      {deviceWeatherData.windDirectionText && (
                        <div>풍향: {deviceWeatherData.windDirectionText}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 기상 디바이스가 없을 때 상세한 안내 */}
      {weatherDeviceAnalysis.validDeviceCount === 0 && (
        <div className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-lg">
          <div className="text-center">
            <div className="text-4xl mb-3">
              {weatherDeviceAnalysis.totalDevices === 0 ? '📭' : '🔍'}
            </div>

            {weatherDeviceAnalysis.totalDevices === 0 ? (
              <>
                <div className="text-gray-700 font-medium text-sm mb-2">등록된 디바이스가 없습니다</div>
                <div className="text-xs text-gray-500 mb-3">
                  IoT 디바이스를 먼저 등록해주세요
                </div>
              </>
            ) : (
              <>
                <div className="text-gray-700 font-medium text-sm mb-2">기상 측정 디바이스가 없습니다</div>
                <div className="text-xs text-gray-500 mb-3">
                  총 {weatherDeviceAnalysis.totalDevices}개 디바이스 중 기상 센서가 있는 디바이스가 없습니다
                </div>
              </>
            )}

            <div className="text-xs text-gray-400 bg-white p-3 rounded border mb-3">
              <div className="font-medium mb-2">기상 디바이스 조건:</div>
              <div className="text-left space-y-1">
                <div>✅ 풍향 센서 (타입 16) - 방향 데이터</div>
                <div>✅ 풍속 센서 (타입 17) - 속도 데이터</div>
                <div>✅ 강우/강설 센서 (타입 18) - 온도/습도 포함</div>
                <div className="border-t pt-2 mt-2">
                  <div>또는 디바이스 이름에 포함:</div>
                  <div>'기상', '날씨', '풍향', '풍속', '환경', '스마트팜' 등</div>
                </div>
              </div>
            </div>

            {weatherDeviceAnalysis.totalDevices > 0 && (
              <div className="text-xs text-gray-500">
                <div className="mb-2">현재 등록된 디바이스:</div>
                <div className="max-h-20 overflow-y-auto bg-gray-50 p-2 rounded text-left">
                  {weatherDeviceAnalysis.all.map((deviceInfo, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span>{deviceInfo.device.device_name}</span>
                      <span className={`text-xs px-2 py-1 rounded ${deviceInfo.hasWeatherSensors ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {deviceInfo.hasWeatherSensors ? '키워드 감지' : '기상 센서 없음'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};