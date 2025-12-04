// src/hooks/useGreenhouseData.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GreenhouseDataManager, 
  createGreenhouseDataManager,
  handleApiError,
  checkNetworkStatus,
  apiCallWithRetry 
} from '../services/greenhouseApi';
import { GreenhouseConfig, SensorPosition } from '../components/greenhouse/types';

interface UseGreenhouseDataProps {
  deviceId: string;
  autoSave?: boolean;
  saveDelay?: number;
}

interface UseGreenhouseDataReturn {
  // 데이터 상태
  config: GreenhouseConfig;
  sensors: SensorPosition[];
  
  // 로딩/에러 상태
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSaved: Date | null;
  isOnline: boolean;
  
  // 액션 함수들
  updateConfig: (newConfig: GreenhouseConfig) => Promise<void>;
  updateSensor: (sensorId: string, updates: Partial<SensorPosition>) => void;
  updateSensors: (newSensors: SensorPosition[]) => void;
  moveSensor: (sensorId: string, updates: Partial<Pick<SensorPosition, 'x' | 'y' | 'z'>>) => void;
  
  // 유틸리티 함수들
  refresh: () => Promise<void>;
  saveNow: () => Promise<void>;
  clearError: () => void;
  resetToDefaults: () => void;
}

// 🔥 기본 설정
const DEFAULT_CONFIG: GreenhouseConfig = {
  type: 'vinyl',
  width: 20,
  length: 50,
  height: 4,
  name: '온실'
};

// 🔥 디바운스 유틸리티
function useDebounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      func(...args);
    }, delay);
  }, [func, delay]) as T;
}

export const useGreenhouseData = ({ 
  deviceId, 
  autoSave = true, 
  saveDelay = 1000 
}: UseGreenhouseDataProps): UseGreenhouseDataReturn => {
  
  // 상태 관리
  const [config, setConfig] = useState<GreenhouseConfig>(DEFAULT_CONFIG);
  const [sensors, setSensors] = useState<SensorPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(checkNetworkStatus());

  // 데이터 매니저
  const dataManagerRef = useRef<GreenhouseDataManager | undefined>(undefined);
  const pendingSaveRef = useRef<{ config: GreenhouseConfig; sensors: SensorPosition[] } | null>(null);

  // 데이터 매니저 초기화
  useEffect(() => {
    if (deviceId) {
      dataManagerRef.current = createGreenhouseDataManager(deviceId);
    }
  }, [deviceId]);

  // 네트워크 상태 모니터링
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // 온라인 복구 시 대기 중인 저장 작업 실행
      if (pendingSaveRef.current) {
        saveToDatabase(pendingSaveRef.current.config, pendingSaveRef.current.sensors);
        pendingSaveRef.current = null;
      }
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🔥 DB에서 데이터 로드
  const loadData = useCallback(async () => {
    const dataManager = dataManagerRef.current;
    if (!dataManager) return;

    setIsLoading(true);
    setError(null);

    try {
      const savedData = await apiCallWithRetry(() => 
        dataManager.loadFloorPlanData(), 3, 1000
      );

      setConfig(savedData.config || DEFAULT_CONFIG);
      setSensors(savedData.sensors || []);
      
      console.log('🔥 데이터 로드 완료:', {
        config: savedData.config,
        sensorsCount: savedData.sensors?.length || 0
      });

    } catch (err) {
      const errorMessage = handleApiError(err);
      console.error('데이터 로드 실패:', errorMessage);
      setError(`데이터 로드 실패: ${errorMessage}`);
      
      // 로컬 스토리지 폴백
      loadFromLocalStorage();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 🔥 로컬 스토리지 폴백
  const loadFromLocalStorage = useCallback(() => {
    try {
      const savedData = localStorage.getItem(`greenhouse_${deviceId}`);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.config) setConfig(parsed.config);
        if (parsed.sensors) setSensors(parsed.sensors);
        console.log('🔥 로컬 스토리지에서 데이터 로드');
      }
    } catch (err) {
      console.error('로컬 스토리지 로드 실패:', err);
    }
  }, [deviceId]);

  // 🔥 DB에 데이터 저장
  const saveToDatabase = useCallback(async (
    newConfig: GreenhouseConfig, 
    newSensors: SensorPosition[]
  ) => {
    const dataManager = dataManagerRef.current;
    if (!dataManager) return;

    // 오프라인이면 대기열에 추가
    if (!isOnline) {
      pendingSaveRef.current = { config: newConfig, sensors: newSensors };
      saveToLocalStorage(newConfig, newSensors);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const [floorPlanResult, sideViewResult] = await Promise.all([
        apiCallWithRetry(() => 
          dataManager.saveFloorPlanData(newConfig, newSensors, {
            zoom: 1,
            centerX: 50,
            centerY: 50,
            showGrid: true,
            showLabels: true,
          }), 2, 500
        ),
        apiCallWithRetry(() => 
          dataManager.saveSideViewData(newConfig, newSensors, {
            showGrid: true,
            showLabels: true,
            showHeightGuides: true,
            showGroundLine: true,
          }), 2, 500
        ),
      ]);

      if (floorPlanResult && sideViewResult) {
        setLastSaved(new Date());
        console.log('🔥 DB 저장 완료');
      } else {
        throw new Error('일부 데이터 저장 실패');
      }

    } catch (err) {
      const errorMessage = handleApiError(err);
      console.error('DB 저장 실패:', errorMessage);
      setError(`저장 실패: ${errorMessage}`);
      
      // 오프라인 저장을 위해 대기열에 추가
      pendingSaveRef.current = { config: newConfig, sensors: newSensors };
      saveToLocalStorage(newConfig, newSensors);
    } finally {
      setIsSaving(false);
    }
  }, [isOnline]);

  // 로컬 스토리지 저장
  const saveToLocalStorage = useCallback((
    newConfig: GreenhouseConfig, 
    newSensors: SensorPosition[]
  ) => {
    try {
      const dataToSave = { config: newConfig, sensors: newSensors };
      localStorage.setItem(`greenhouse_${deviceId}`, JSON.stringify(dataToSave));
      console.log('🔥 로컬 스토리지 저장 완료');
    } catch (err) {
      console.error('로컬 스토리지 저장 실패:', err);
    }
  }, [deviceId]);

  // 🔥 디바운스된 자동 저장
  const debouncedSave = useDebounce(saveToDatabase, saveDelay);

  // 🔥 설정 업데이트 (즉시 저장)
  const updateConfig = useCallback(async (newConfig: GreenhouseConfig) => {
    setConfig(newConfig);
    await saveToDatabase(newConfig, sensors);
  }, [sensors, saveToDatabase]);

  // 🔥 센서 업데이트 (디바운스 저장)
  const updateSensor = useCallback((sensorId: string, updates: Partial<SensorPosition>) => {
    setSensors(prevSensors => {
      const updatedSensors = prevSensors.map(sensor =>
        sensor.sensor_id === sensorId ? { ...sensor, ...updates } : sensor
      );
      
      if (autoSave) {
        debouncedSave(config, updatedSensors);
      }
      
      return updatedSensors;
    });
  }, [config, autoSave, debouncedSave]);

  // 🔥 센서 위치 이동 (디바운스 저장)
  const moveSensor = useCallback((
    sensorId: string, 
    updates: Partial<Pick<SensorPosition, 'x' | 'y' | 'z'>>
  ) => {
    setSensors(prevSensors => {
      const updatedSensors = prevSensors.map(sensor =>
        sensor.sensor_id === sensorId ? { ...sensor, ...updates } : sensor
      );
      
      if (autoSave) {
        debouncedSave(config, updatedSensors);
      }
      
      return updatedSensors;
    });
  }, [config, autoSave, debouncedSave]);

  // 🔥 센서 배열 전체 업데이트
  const updateSensors = useCallback((newSensors: SensorPosition[]) => {
    setSensors(newSensors);
    
    if (autoSave) {
      debouncedSave(config, newSensors);
    }
  }, [config, autoSave, debouncedSave]);

  // 🔥 새로고침/동기화
  const refresh = useCallback(async () => {
    const dataManager = dataManagerRef.current;
    if (dataManager) {
      dataManager.clearCache();
      await loadData();
    }
  }, [loadData]);

  // 🔥 즉시 저장
  const saveNow = useCallback(async () => {
    await saveToDatabase(config, sensors);
  }, [config, sensors, saveToDatabase]);

  // 🔥 에러 클리어
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 🔥 기본값으로 리셋
  const resetToDefaults = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setSensors([]);
    
    if (autoSave) {
      debouncedSave(DEFAULT_CONFIG, []);
    }
  }, [autoSave, debouncedSave]);

  // 🔥 초기 데이터 로드
  useEffect(() => {
    if (deviceId) {
      loadData();
    }
  }, [deviceId, loadData]);

  return {
    // 데이터 상태
    config,
    sensors,
    
    // 로딩/에러 상태
    isLoading,
    isSaving,
    error,
    lastSaved,
    isOnline,
    
    // 액션 함수들
    updateConfig,
    updateSensor,
    updateSensors,
    moveSensor,
    
    // 유틸리티 함수들
    refresh,
    saveNow,
    clearError,
    resetToDefaults,
  };
};

// 🔥 센서 데이터 관리를 위한 추가 Hook
export const useSensorPositions = (deviceId: string, viewType: 'floor_plan' | 'side_view') => {
  const [positions, setPositions] = useState<SensorPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataManager = useRef<GreenhouseDataManager | undefined>(undefined);

  useEffect(() => {
    if (deviceId) {
      dataManager.current = createGreenhouseDataManager(deviceId);
    }
  }, [deviceId]);

  // 위치 데이터 로드
  const loadPositions = useCallback(async () => {
    if (!dataManager.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = viewType === 'floor_plan' 
        ? await dataManager.current.loadFloorPlanData()
        : await dataManager.current.loadSideViewData();
      
      setPositions(data.sensors || []);
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      console.error(`${viewType} 위치 로드 실패:`, errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [viewType]);

  // 위치 데이터 저장
  const savePositions = useCallback(async (newPositions: SensorPosition[]) => {
    if (!dataManager.current) return false;

    try {
      const config = DEFAULT_CONFIG; // 기본 설정 사용 또는 props로 받기
      const viewSettings = viewType === 'floor_plan' ? {
        zoom: 1,
        centerX: 50,
        centerY: 50,
        showGrid: true,
        showLabels: true,
      } : {
        showGrid: true,
        showLabels: true,
        showHeightGuides: true,
        showGroundLine: true,
      };

      const result = viewType === 'floor_plan'
        ? await dataManager.current.saveFloorPlanData(config, newPositions, viewSettings)
        : await dataManager.current.saveSideViewData(config, newPositions, viewSettings);

      if (result) {
        setPositions(newPositions);
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      console.error(`${viewType} 위치 저장 실패:`, errorMessage);
      return false;
    }
  }, [viewType]);

  // 단일 센서 위치 업데이트
  const updateSensorPosition = useCallback((
    sensorId: string, 
    updates: Partial<Pick<SensorPosition, 'x' | 'y' | 'z'>>
  ) => {
    setPositions(prev => 
      prev.map(sensor => 
        sensor.sensor_id === sensorId ? { ...sensor, ...updates } : sensor
      )
    );
  }, []);

  useEffect(() => {
    if (deviceId) {
      loadPositions();
    }
  }, [deviceId, loadPositions]);

  return {
    positions,
    isLoading,
    error,
    loadPositions,
    savePositions,
    updateSensorPosition,
    clearError: () => setError(null),
  };
};

// 🔥 실시간 동기화를 위한 Hook
export const useGreenhouseSync = (deviceId: string) => {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const dataManager = useRef<GreenhouseDataManager | undefined>(undefined);

  useEffect(() => {
    if (deviceId) {
      dataManager.current = createGreenhouseDataManager(deviceId);
    }
  }, [deviceId]);

  // 동기화 실행
  const performSync = useCallback(async () => {
    if (!dataManager.current) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      // 캐시 클리어 후 최신 데이터 로드
      dataManager.current.clearCache();
      await dataManager.current.loadFloorPlanData();
      
      setLastSync(new Date());
      console.log('🔥 자동 동기화 완료');
    } catch (err) {
      const errorMessage = handleApiError(err);
      setSyncError(errorMessage);
      console.error('자동 동기화 실패:', errorMessage);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 🔥 주기적 동기화 (5분마다)
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (dataManager.current && checkNetworkStatus()) {
        await performSync();
      }
    }, 5 * 60 * 1000); // 5분

    return () => clearInterval(syncInterval);
  }, [performSync]);

  // 수동 동기화
  const manualSync = useCallback(async () => {
    await performSync();
  }, [performSync]);

  return {
    lastSync,
    syncError,
    isSyncing,
    manualSync,
    clearSyncError: () => setSyncError(null),
  };
};

// 🔥 온실 설정 전용 Hook
export const useGreenhouseConfig = (deviceId: string) => {
  const [config, setConfig] = useState<GreenhouseConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const dataManager = useRef<GreenhouseDataManager | undefined>(undefined);

  useEffect(() => {
    if (deviceId) {
      dataManager.current = createGreenhouseDataManager(deviceId);
    }
  }, [deviceId]);

  // 설정 로드
  const loadConfig = useCallback(async () => {
    if (!dataManager.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await dataManager.current.loadFloorPlanData();
      setConfig(data.config || DEFAULT_CONFIG);
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      
      // 로컬 스토리지 폴백
      try {
        const saved = localStorage.getItem(`greenhouse_${deviceId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.config) {
            setConfig(parsed.config);
          }
        }
      } catch (localErr) {
        console.error('로컬 설정 로드 실패:', localErr);
      }
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  // 설정 저장
  const saveConfig = useCallback(async (newConfig: GreenhouseConfig) => {
    if (!dataManager.current) return false;

    setIsSaving(true);
    setError(null);

    try {
      // 현재 센서 데이터 유지하면서 설정만 업데이트
      const currentData = await dataManager.current.loadFloorPlanData();
      const result = await dataManager.current.saveFloorPlanData(
        newConfig, 
        currentData.sensors || [], 
        currentData.viewSettings || {
          zoom: 1,
          centerX: 50,
          centerY: 50,
          showGrid: true,
          showLabels: true,
        }
      );

      if (result) {
        setConfig(newConfig);
        setLastSaved(new Date());
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = handleApiError(err);
      setError(errorMessage);
      
      // 로컬 스토리지에 저장
      try {
        const currentLocal = localStorage.getItem(`greenhouse_${deviceId}`);
        const parsed = currentLocal ? JSON.parse(currentLocal) : {};
        parsed.config = newConfig;
        localStorage.setItem(`greenhouse_${deviceId}`, JSON.stringify(parsed));
        setConfig(newConfig);
      } catch (localErr) {
        console.error('로컬 설정 저장 실패:', localErr);
      }
      
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [deviceId]);

  // 설정 업데이트 (즉시 저장)
  const updateConfig = useCallback(async (updates: Partial<GreenhouseConfig>) => {
    const newConfig = { ...config, ...updates };
    const success = await saveConfig(newConfig);
    return success;
  }, [config, saveConfig]);

  useEffect(() => {
    if (deviceId) {
      loadConfig();
    }
  }, [deviceId, loadConfig]);

  return {
    config,
    isLoading,
    isSaving,
    error,
    lastSaved,
    loadConfig,
    saveConfig,
    updateConfig,
    clearError: () => setError(null),
  };
};