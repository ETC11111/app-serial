  // src/services/greenhouseApi.ts

  import { GreenhouseConfig, SensorPosition } from '../components/greenhouse/types';

  // API 기본 설정
  const API_BASE_URL = '';  // 🔥 상대 경로 사용 (현재 도메인 기준)

  // API 응답 타입들
  interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }

  interface FloorPlanFilterResponse {
    success: boolean;
    hasFilter: boolean;
    filter?: {
      greenhouseConfig: GreenhouseConfig;
      selectedSensor: string;
      viewSettings: {
        zoom: number;
        centerX: number;
        centerY: number;
        showGrid: boolean;
        showLabels: boolean;
      };
    };
    defaultFilter?: {
      greenhouseConfig: GreenhouseConfig;
      selectedSensor: string;
      viewSettings: {
        zoom: number;
        centerX: number;
        centerY: number;
        showGrid: boolean;
        showLabels: boolean;
      };
    };
    lastUpdated?: string;
    message: string;
  }

  interface SideViewFilterResponse {
    success: boolean;
    hasFilter: boolean;
    filter?: {
      greenhouseConfig: {
        width: number;
        height: number;
        type: 'vinyl' | 'glass';
      };
      selectedSensor: string;
      viewSettings: {
        showGrid: boolean;
        showLabels: boolean;
        showHeightGuides: boolean;
        showGroundLine: boolean;
      };
    };
    defaultFilter?: {
      greenhouseConfig: {
        width: number;
        height: number;
        type: 'vinyl' | 'glass';
      };
      selectedSensor: string;
      viewSettings: {
        showGrid: boolean;
        showLabels: boolean;
        showHeightGuides: boolean;
        showGroundLine: boolean;
      };
    };
    lastUpdated?: string;
    message: string;
  }

  // 🔥 수정: sensor_type을 number로 변경
  interface SensorPositionsResponse {
    success: boolean;
    positions: Array<{
      sensor_id: string;
      device_name: string;
      sensor_type: number;  // ✅ number로 변경
      x: number;
      y: number;
      z: number;
      rotation: number;
    }>;
    count: number;
    deviceId: string;
    viewType: string;
    message: string;
  }

  // 🔥 센서 타입 변환 매핑 추가
  const sensorTypeMapping: { [key: string]: number } = {
    '온습도센서': 1,
    'SHT20': 1,
    '조도센서': 2,
    'BH1750': 2,
    'ADS1115': 3,
    'CO2센서': 4,
    'SCD30': 4,
    'DS18B20': 5,
    '온도센서': 5,
    'MODBUS_TH': 11,
    'MODBUS_PRESSURE': 12,
    'MODBUS_FLOW': 13,
    'MODBUS_RELAY': 14,
    'MODBUS_ENERGY': 15,
    '풍향센서': 16,
    '풍속센서': 17,
    '강우센서': 18,
    '토양센서': 19
  };

  // 🔥 센서 타입 변환 함수
  const convertSensorType = (sensorType: string | number): number => {
    if (typeof sensorType === 'number') {
      return sensorType;
    }
    
    if (typeof sensorType === 'string') {
      // 숫자 문자열인 경우
      const parsed = parseInt(sensorType);
      if (!isNaN(parsed)) {
        return parsed;
      }
      
      // 매핑에서 찾기
      return sensorTypeMapping[sensorType] || 0;
    }
    
    return 0;
  };

  // 🔥 숫자 타입을 문자열로 변환 (프론트엔드 호환성)
  const convertSensorTypeToString = (sensorType: number): string => {
    const reverseMapping: { [key: number]: string } = {
      1: 'SHT20',
      2: 'BH1750', 
      3: 'ADS1115',
      4: 'SCD30',
      5: 'DS18B20',
      11: 'MODBUS_TH',
      12: 'MODBUS_PRESSURE',
      13: 'MODBUS_FLOW',
      14: 'MODBUS_RELAY',
      15: 'MODBUS_ENERGY',
      16: '풍향센서',
      17: '풍속센서',
      18: '강우센서',
      19: '토양센서'
    };
    
    return reverseMapping[sensorType] || `센서${sensorType}`;
  };

  // 🔥 센서 타입별 단위 반환
  const getSensorUnit = (sensorType: number): string => {
    const unitMapping: { [key: number]: string } = {
      1: '°C/%',    // SHT20 (온습도)
      2: 'lux',     // BH1750 (조도)
      3: 'V',       // ADS1115 (아날로그)
      4: 'ppm',     // SCD30 (CO2)
      5: '°C',      // DS18B20 (온도)
      11: '°C/%',   // MODBUS_TH
      12: 'Pa',     // MODBUS_PRESSURE
      13: 'L/min',  // MODBUS_FLOW
      14: 'ON/OFF', // MODBUS_RELAY
      15: 'kWh',    // MODBUS_ENERGY
      16: '°',      // 풍향센서
      17: 'm/s',    // 풍속센서
      18: 'mm',     // 강우센서
      19: '%'       // 토양센서
    };
    
    return unitMapping[sensorType] || '';
  };

  // 🔥 센서 타입별 색상 반환
  const getSensorColor = (sensorType: number): string => {
    const colorMapping: { [key: number]: string } = {
      1: '#2563eb',  // SHT20 - 파란색
      2: '#d97706',  // BH1750 - 주황색
      3: '#7c3aed',  // ADS1115 - 보라색
      4: '#16a34a',  // SCD30 - 녹색
      5: '#dc2626',  // DS18B20 - 빨간색
      11: '#2563eb', // MODBUS_TH - 파란색
      12: '#8b5cf6', // MODBUS_PRESSURE - 연보라
      13: '#06b6d4', // MODBUS_FLOW - 청록색
      14: '#ef4444', // MODBUS_RELAY - 빨간색
      15: '#f59e0b', // MODBUS_ENERGY - 노란색
      16: '#10b981', // 풍향센서 - 에메랄드
      17: '#3b82f6', // 풍속센서 - 파란색
      18: '#6366f1', // 강우센서 - 인디고
      19: '#84cc16'  // 토양센서 - 라임
    };
    
    return colorMapping[sensorType] || '#6b7280';
  };

  // 🔥 수정: 인증 토큰 키 동적 감지
  const getAuthToken = (): string => {
    // 여러 가능한 토큰 키들 시도
    const possibleKeys = ['token', 'authToken', 'access_token', 'accessToken', 'auth_token', 'jwt'];
    
    for (const key of possibleKeys) {
      const token = localStorage.getItem(key);
      if (token && token.length > 10) { // 유효한 토큰인지 간단 체크
        console.log(`🔥 토큰 발견: ${key} = ${token.substring(0, 20)}...`);
        return token;
      }
    }
    
    console.warn('🔥 유효한 인증 토큰을 찾을 수 없습니다.');
    return '';
  };

  // API 요청 헬퍼
  const apiRequest = async <T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const token = getAuthToken();
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
      ...options,
    };

    console.log('🔥 API 요청:', {
      url: `${API_BASE_URL}${endpoint}`,
      method: config.method || 'GET',
      hasAuth: !!token,
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? `${token.substring(0, 10)}...` : 'None',
      body: options.body ? JSON.parse(options.body as string) : null
    });

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      // 🔥 더 자세한 에러 정보 수집
      let errorDetails;
      try {
        errorDetails = await response.text();
        console.error('🔥 API 에러 응답:', {
          status: response.status,
          statusText: response.statusText,
          url: `${API_BASE_URL}${endpoint}`,
          responseBody: errorDetails,
          requestHeaders: config.headers
        });
      } catch (e) {
        errorDetails = `응답 파싱 실패: ${e}`;
      }
      
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    return response.json();
  };

  // 🔥 평면도 필터 API
  export const floorPlanApi = {
    // 평면도 설정 조회
    getFilter: async (deviceId: string): Promise<FloorPlanFilterResponse> => {
      return apiRequest(`/api/filters/${deviceId}/floor-plan`);
    },

    // 평면도 설정 저장
    saveFilter: async (
      deviceId: string,
      data: {
        greenhouseConfig: GreenhouseConfig;
        selectedSensor: string;
        viewSettings: {
          zoom: number;
          centerX: number;
          centerY: number;
          showGrid: boolean;
          showLabels: boolean;
        };
      }
    ): Promise<ApiResponse> => {
      return apiRequest(`/api/filters/${deviceId}/floor-plan`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // 🔥 측면도 필터 API
  export const sideViewApi = {
    // 측면도 설정 조회
    getFilter: async (deviceId: string): Promise<SideViewFilterResponse> => {
      return apiRequest(`/api/filters/${deviceId}/side-view`);
    },

    // 측면도 설정 저장
    saveFilter: async (
      deviceId: string,
      data: {
        greenhouseConfig: {
          width: number;
          height: number;
          type: 'vinyl' | 'glass';
        };
        selectedSensor: string;
        viewSettings: {
          showGrid: boolean;
          showLabels: boolean;
          showHeightGuides: boolean;
          showGroundLine: boolean;
        };
      }
    ): Promise<ApiResponse> => {
      return apiRequest(`/api/filters/${deviceId}/side-view`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // 🔥 센서 라벨 API
  export const sensorLabelsApi = {
    // 센서 라벨 조회
    getLabels: async (deviceId: string): Promise<{
      success: boolean;
      hasLabels: boolean;
      labels?: Record<string, string>; // key: "sensor_id_type_valueIndex", value: "custom_label"
      lastUpdated?: string;
      message: string;
    }> => {
      return apiRequest(`/api/filters/${deviceId}/sensor-labels`);
    },

    // 센서 라벨 저장
    saveLabels: async (
      deviceId: string,
      labels: Record<string, string> // key: "sensor_id_type_valueIndex", value: "custom_label"
    ): Promise<ApiResponse> => {
      return apiRequest(`/api/filters/${deviceId}/sensor-labels`, {
        method: 'POST',
        body: JSON.stringify({ labels }),
      });
    },

    // 단일 센서 라벨 저장
    saveLabel: async (
      deviceId: string,
      sensorId: string | number,
      sensorType: number,
      valueIndex: number,
      label: string
    ): Promise<ApiResponse> => {
      const key = `${sensorId}_${sensorType}_${valueIndex}`;
      return apiRequest(`/api/filters/${deviceId}/sensor-labels`, {
        method: 'POST',
        body: JSON.stringify({ labels: { [key]: label } }),
      });
    },
  };

  // 🔥 센서 위치 API (타입 변환 로직 추가)
  export const sensorPositionsApi = {
    // 센서 위치 조회
    getPositions: async (
      deviceId: string,
      viewType: 'floor_plan' | 'side_view'
    ): Promise<SensorPositionsResponse> => {
      return apiRequest(`/api/filters/${deviceId}/sensor-positions/${viewType}`);
    },

    // 🔥 수정: 센서 위치 저장 (타입 변환 추가)
    savePositions: async (
      deviceId: string,
      viewType: 'floor_plan' | 'side_view',
      positions: Array<{
        sensor_id: string;
        device_name: string;
        sensor_type: string | number;  // ✅ string | number 허용
        x: number;
        y: number;
        z: number;
        rotation?: number;
      }>
    ): Promise<ApiResponse> => {
      // 🔥 디버깅 로그 추가
      console.log('🔥 센서 위치 저장 요청:', {
        deviceId,
        viewType,
        positionsCount: positions.length,
        originalPositions: positions.slice(0, 2) // 처음 2개 전체 구조 확인
      });

      // 🔥 센서 타입 변환 및 숫자 타입 안전성 강화
      const convertedPositions = positions.map((position, index) => {
        const convertedType = convertSensorType(position.sensor_type);
        
        // 🔥 각 센서별 변환 로그
        console.log(`🔥 센서 ${index} 변환:`, {
          original: position.sensor_type,
          converted: convertedType,
          sensor_id: position.sensor_id
        });
        
        return {
          sensor_id: position.sensor_id,
          device_name: position.device_name,
          sensor_type: convertedType,  // ✅ 변환
          x: Number(position.x) || 0,
          y: Number(position.y) || 0,
          z: Number(position.z) || 0,
          rotation: Number(position.rotation) || 0,
        };
      });

      const requestData = { positions: convertedPositions };
      
      console.log('🔥 최종 요청 데이터:', {
        url: `${API_BASE_URL}/api/filters/${deviceId}/sensor-positions/${viewType}`,
        method: 'POST',
        positionsCount: convertedPositions.length,
        samplePosition: convertedPositions[0], // 첫 번째 센서 전체 구조
        allSensorTypes: convertedPositions.map(p => p.sensor_type)
      });

      try {
        const result = await apiRequest(`/api/filters/${deviceId}/sensor-positions/${viewType}`, {
          method: 'POST',
          body: JSON.stringify(requestData),
        });
        
        console.log('🔥 센서 위치 저장 성공:', result);
        return result;
      } catch (error) {
        console.error('🔥 센서 위치 저장 실패:', error);
        console.error('🔥 실패한 요청 데이터:', requestData);
        throw error;
      }
    },
  };

  // 🔥 통합 온실 데이터 관리 클래스
  export class GreenhouseDataManager {
    private deviceId: string;
    private cache: Map<string, any> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5분

    constructor(deviceId: string) {
      this.deviceId = deviceId;
    }

    // 캐시 확인
    private isCacheValid(key: string): boolean {
      const expiry = this.cacheExpiry.get(key);
      return expiry ? Date.now() < expiry : false;
    }

    // 캐시에서 데이터 가져오기
    private getFromCache<T>(key: string): T | null {
      if (this.isCacheValid(key)) {
        const data = this.cache.get(key);
        return data as T || null;
      }
      return null;
    }

    // 캐시에 데이터 저장
    private setCache<T>(key: string, data: T): void {
      this.cache.set(key, data);
      this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
    }

    // 🔥 평면도 데이터 로드 수정
    async loadFloorPlanData(): Promise<{
      config: GreenhouseConfig;
      sensors: SensorPosition[];
      viewSettings: any;
    }> {
      const cacheKey = `floor-plan-${this.deviceId}`;
      const cached = this.getFromCache<{
        config: GreenhouseConfig;
        sensors: SensorPosition[];
        viewSettings: any;
      }>(cacheKey);
      if (cached) return cached;

      try {
        const [filterResponse, positionsResponse] = await Promise.all([
          floorPlanApi.getFilter(this.deviceId),
          sensorPositionsApi.getPositions(this.deviceId, 'floor_plan')
        ]);

        const filterData = filterResponse.hasFilter 
          ? filterResponse.filter! 
          : filterResponse.defaultFilter!;

        // 🔥 수정: success 체크 강화
        const sensors: SensorPosition[] = positionsResponse.success && positionsResponse.positions
          ? positionsResponse.positions.map(pos => ({
              device_id: this.deviceId,
              device_name: pos.device_name,
              sensor_type: convertSensorTypeToString(pos.sensor_type),
              sensor_id: pos.sensor_id,
              x: pos.x,
              y: pos.y,
              z: pos.z,
              sensorInfo: {
                type: pos.sensor_type,
                channel: 0,
                valueIndex: 0,
                unit: getSensorUnit(pos.sensor_type),
                color: getSensorColor(pos.sensor_type)
              }
            }))
          : [];

        const result = {
          config: filterData.greenhouseConfig,
          sensors,
          viewSettings: filterData.viewSettings,
        };

        this.setCache(cacheKey, result);
        return result;

      } catch (error) {
        console.error('평면도 데이터 로드 실패:', error);
        return this.getDefaultFloorPlanData();
      }
    }

    // 🔥 측면도 데이터 로드 수정
    async loadSideViewData(): Promise<{
      config: Partial<GreenhouseConfig>;
      sensors: SensorPosition[];
      viewSettings: any;
    }> {
      const cacheKey = `side-view-${this.deviceId}`;
      const cached = this.getFromCache<{
        config: Partial<GreenhouseConfig>;
        sensors: SensorPosition[];
        viewSettings: any;
      }>(cacheKey);
      if (cached) return cached;

      try {
        const [filterResponse, positionsResponse] = await Promise.all([
          sideViewApi.getFilter(this.deviceId),
          sensorPositionsApi.getPositions(this.deviceId, 'side_view')
        ]);

        const filterData = filterResponse.hasFilter 
          ? filterResponse.filter! 
          : filterResponse.defaultFilter!;

        // 🔥 수정: positionsResponse.success 체크 추가
        const sensors: SensorPosition[] = positionsResponse.success && positionsResponse.positions
          ? positionsResponse.positions.map(pos => ({
              device_id: this.deviceId,
              device_name: pos.device_name,
              sensor_type: convertSensorTypeToString(pos.sensor_type),
              sensor_id: pos.sensor_id,
              x: pos.x,
              y: pos.y,
              z: pos.z,
              sensorInfo: {
                type: pos.sensor_type,
                channel: 0,
                valueIndex: 0,
                unit: getSensorUnit(pos.sensor_type),
                color: getSensorColor(pos.sensor_type)
              }
            }))
          : [];

        const result = {
          config: filterData.greenhouseConfig,
          sensors,
          viewSettings: filterData.viewSettings,
        };

        this.setCache(cacheKey, result);
        return result;

      } catch (error) {
        console.error('측면도 데이터 로드 실패:', error);
        return this.getDefaultSideViewData();
      }
    }

    // 🔥 수정: 평면도 데이터 저장 (타입 변환 강화)
    async saveFloorPlanData(
      config: GreenhouseConfig,
      sensors: SensorPosition[],
      viewSettings: any
    ): Promise<boolean> {
      try {
        console.log('🔥 평면도 저장 - 원본 센서 타입들:', 
          sensors.map(s => ({ id: s.sensor_id, type: s.sensor_type }))
        );

        // 🔥 백엔드 API 구조에 맞춰서 순차 저장
        console.log('🔥 평면도 필터 저장 시작...');
        const filterResult = await floorPlanApi.saveFilter(this.deviceId, {
          greenhouseConfig: config,
          selectedSensor: '', // 필요시 추가
          viewSettings,
        });

        console.log('🔥 센서 위치 저장 시작...');
        // 🔥 센서 타입 확실히 변환해서 저장
        const positionsResult = await sensorPositionsApi.savePositions(
          this.deviceId,
          'floor_plan',
          sensors.map(sensor => ({
            sensor_id: sensor.sensor_id,
            device_name: sensor.device_name,
            sensor_type: convertSensorType(sensor.sensor_type),  // ✅ 명시적 변환
            x: Number(sensor.x) || 0,
            y: Number(sensor.y) || 0,
            z: Number(sensor.z) || 0,
            rotation: 0,
          }))
        );

        console.log('🔥 저장 결과:', { 
          filter: filterResult.success, 
          positions: positionsResult.success 
        });

        if (filterResult.success && positionsResult.success) {
          // 캐시 무효화
          this.cache.delete(`floor-plan-${this.deviceId}`);
          console.log('🔥 평면도 저장 완료');
          return true;
        }

        console.error('🔥 저장 실패:', filterResult, positionsResult);
        return false;
      } catch (error) {
        console.error('평면도 데이터 저장 실패:', error);
        return false;
      }
    }

    // 🔥 수정: 측면도 데이터 저장 (타입 변환 강화)
    async saveSideViewData(
      config: Partial<GreenhouseConfig>,
      sensors: SensorPosition[],
      viewSettings: any
    ): Promise<boolean> {
      try {
        const sideViewConfig = {
          width: config.width || 20,
          height: config.height || 4,
          type: config.type || 'vinyl' as 'vinyl' | 'glass',
        };

        const [filterResult, positionsResult] = await Promise.all([
          sideViewApi.saveFilter(this.deviceId, {
            greenhouseConfig: sideViewConfig,
            selectedSensor: '',
            viewSettings,
          }),
          sensorPositionsApi.savePositions(
            this.deviceId,
            'side_view',
            sensors.map(sensor => ({
              sensor_id: sensor.sensor_id,
              device_name: sensor.device_name,
              sensor_type: convertSensorType(sensor.sensor_type),  // ✅ 명시적 변환
              x: Number(sensor.x) || 0,
              y: Number(sensor.y) || 0,
              z: Number(sensor.z) || 0,
              rotation: 0,
            }))
          ),
        ]);

        if (filterResult.success && positionsResult.success) {
          this.cache.delete(`side-view-${this.deviceId}`);
          return true;
        }

        return false;
      } catch (error) {
        console.error('측면도 데이터 저장 실패:', error);
        return false;
      }
    }

    // 기본값 반환 - 평면도
    private getDefaultFloorPlanData(): {
      config: GreenhouseConfig;
      sensors: SensorPosition[];
      viewSettings: any;
    } {
      return {
        config: {
          type: 'vinyl' as const,
          width: 20,
          length: 50,
          height: 4,
          name: '온실',
        },
        sensors: [],
        viewSettings: {
          zoom: 1,
          centerX: 50,
          centerY: 50,
          showGrid: true,
          showLabels: true,
        },
      };
    }

    // 기본값 반환 - 측면도
    // 🔥 수정: 측면도 기본값 반환 메서드
    private getDefaultSideViewData(): {
      config: Partial<GreenhouseConfig>;
      sensors: SensorPosition[];
      viewSettings: any;
    } {
      return {
        config: {
          type: 'vinyl' as const,
          width: 20,
          height: 4,  // length 제거 (측면도는 width, height만 필요)
          name: '온실',
        },
        sensors: [],
        viewSettings: {
          showGrid: true,
          showLabels: true,
          showHeightGuides: true,
          showGroundLine: true,
        },
      };
    }

    // 캐시 클리어
    clearCache(): void {
      this.cache.clear();
      this.cacheExpiry.clear();
    }

    // 특정 뷰 캐시만 클리어
    clearViewCache(viewType: 'floor-plan' | 'side-view'): void {
      this.cache.delete(`${viewType}-${this.deviceId}`);
      this.cacheExpiry.delete(`${viewType}-${this.deviceId}`);
    }
  }

  // 🔥 유틸리티 함수들
  export const globalSettingsApi = {
    // 전역 설정 조회
    getGlobalSettings: async (): Promise<{
      success: boolean;
      hasSettings: boolean;
      settings: {
        favoriteGroupIds: any;
        lastSelectedDevice: {
          deviceId: string;
          context: string;
          timestamp: string;
        } | null;
        homeSettings: any;
      };
      lastUpdated?: string;
      message: string;
    }> => {
      return apiRequest('/api/filters/global');
    },

    // 마지막 선택 장치 저장
    saveLastSelectedDevice: async (deviceId: string, context: string = 'home'): Promise<ApiResponse> => {
      console.log('💾 마지막 선택 장치 저장:', { deviceId, context });
      return apiRequest('/api/filters/global/lastSelectedDeviceId', {
        method: 'PATCH',
        body: JSON.stringify({ value: deviceId }),
      });
    },

    // 마지막 선택 컨텍스트 저장
    saveLastSelectedContext: async (context: string): Promise<ApiResponse> => {
      return apiRequest('/api/filters/global/lastSelectedContext', {
        method: 'PATCH',
        body: JSON.stringify({ value: context }),
      });
    },

    // 즐겨찾기 그룹 저장
    saveFavoriteGroups: async (favoriteGroupIds: any): Promise<ApiResponse> => {
      console.log('💾 즐겨찾기 그룹 저장:', favoriteGroupIds);
      return apiRequest('/api/filters/global/favoriteGroupIds', {
        method: 'PATCH',
        body: JSON.stringify({ value: favoriteGroupIds }),
      });
    }
  };
  export const createGreenhouseDataManager = (deviceId: string): GreenhouseDataManager => {
    return new GreenhouseDataManager(deviceId);
  };

  // API 에러 처리 헬퍼
  export const handleApiError = (error: any): string => {
    if (error?.response?.data?.error) {
      return error.response.data.error;
    }
    if (error?.message) {
      return error.message;
    }
    return '알 수 없는 오류가 발생했습니다.';
  };

  // 네트워크 상태 확인
  export const checkNetworkStatus = (): boolean => {
    return navigator.onLine;
  };

  // 재시도 로직을 포함한 API 호출
  export const apiCallWithRetry = async <T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await apiCall();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        console.warn(`API 호출 실패 (${i + 1}/${maxRetries}), ${delay}ms 후 재시도:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 지수 백오프
      }
    }
    throw new Error('최대 재시도 횟수 초과');
  };