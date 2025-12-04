// src/components/greenhouse/GreenhouseFloorPlan.tsx (위치 초기화 기능 추가)

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import TopView from './TopView';
import SideView from './SideView';
import GreenhouseSelector from './GreenhouseSelector';
import { GreenhouseConfig, SensorPosition, GreenhouseData } from './types';
import { FlexibleSensorData, DetectedSensor, SENSOR_METADATA } from '../../types/sensor.types';
import { 
  GreenhouseDataManager, 
  createGreenhouseDataManager,
  handleApiError,
  checkNetworkStatus,
  apiCallWithRetry 
} from '../../services/greenhouseApi';

interface GroupSensorData {
  device_id: string;
  device_name: string;
  group_id: string;
  flexibleData?: FlexibleSensorData;
}

interface GreenhouseFloorPlanProps {
  groupId: string;
  groupData: GroupSensorData[];
}

const GreenhouseFloorPlan: React.FC<GreenhouseFloorPlanProps> = ({
  groupId,
  groupData
}) => {
  // 상태 관리
  const [selectedSensor, setSelectedSensor] = useState<string>('');
  const [sensors, setSensors] = useState<SensorPosition[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'top' | 'side'>('top');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [config, setConfig] = useState<GreenhouseConfig>({
    type: 'vinyl',
    width: 20,
    length: 50,
    height: 4,
    name: ''
  });

  // 간소화된 상태 관리
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(checkNetworkStatus());
  const [savingMessage, setSavingMessage] = useState<string>('');

  // 드래그 상태 추적
  const isDraggingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);

  // 데이터 매니저 인스턴스
  const dataManager = useMemo(() => {
    const firstDevice = groupData[0];
    return firstDevice ? createGreenhouseDataManager(firstDevice.device_id) : null;
  }, [groupData]);

  // 네트워크 상태 모니터링
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 디바이스별 색상 팔레트
  const getDeviceColor = useCallback((deviceIndex: number): string => {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'
    ];
    return colors[deviceIndex % colors.length];
  }, []);

  // 활성 센서 추출
  const getActiveSensors = useCallback((device: GroupSensorData): DetectedSensor[] => {
    if (!device.flexibleData?.sensors) {
      return [];
    }
    return device.flexibleData.sensors.filter(sensor => sensor.active);
  }, []);

  // 센서 정보 생성
  const createSensorInfo = useCallback((sensor: DetectedSensor, deviceIndex: number) => {
    const metadata = SENSOR_METADATA[sensor.type];
    const displayName = metadata?.name || sensor.name;
    const icon = metadata?.icon || '📊';
    const unit = metadata?.unit || '';
    const valueLabels = metadata?.valueLabels || [];

    return {
      displayName,
      icon,
      unit,
      valueLabels,
      color: getDeviceColor(deviceIndex),
      rawSensor: sensor
    };
  }, [getDeviceColor]);

  // 센서 위치 초기화 함수
  const initializeSensors = useCallback(async () => {
    const newSensors: SensorPosition[] = [];

    groupData.forEach((device, deviceIndex) => {
      const activeSensors = getActiveSensors(device);

      activeSensors.forEach((sensor, sensorIndex) => {
        const sensorInfo = createSensorInfo(sensor, deviceIndex);

        const deviceCount = groupData.length;
        let baseX, baseY;

        if (deviceCount <= 3) {
          baseX = 25 + (deviceIndex * 50);
          baseY = 50;
        } else {
          const row = Math.floor(deviceIndex / 3);
          const col = deviceIndex % 3;
          baseX = 20 + (col * 30);
          baseY = 30 + (row * 40);
        }

        const angle = (sensorIndex * 360 / activeSensors.length) * (Math.PI / 180);
        const radius = Math.min(15, 8 + activeSensors.length * 2);

        // Z 좌표(높이) 계산 - 센서 수에 관계없이 측면도 범위 내 배치
        const baseHeight = 40; // 기본 높이 40%
        const heightIncrement = Math.min(10, 40 / Math.max(activeSensors.length, 1)); // 센서 수에 따라 간격 조정
        const calculatedHeight = baseHeight + (sensorIndex * heightIncrement);
        const heightPercent = Math.max(15, Math.min(85, calculatedHeight)); // 15%~85% 범위로 제한

        const sensorPosition: SensorPosition = {
          device_id: device.device_id,
          device_name: device.device_name,
          sensor_type: sensorInfo.displayName,
          sensor_id: `${device.device_id}_${sensor.name}`,
          x: Math.max(5, Math.min(95, baseX + radius * Math.cos(angle))),
          y: Math.max(5, Math.min(95, baseY + radius * Math.sin(angle))),
          z: heightPercent,
          sensorInfo: {
            type: sensor.type,
            channel: sensor.channel,
            valueIndex: 0,
            unit: sensorInfo.unit,
            color: sensorInfo.color,
            allValues: sensor.values || [],
            allLabels: sensorInfo.valueLabels
          }
        };

        newSensors.push(sensorPosition);
      });
    });

    setSensors(newSensors);
    console.log('센서 배치 생성 완료:', newSensors.length);

    // 기본 배치 생성 후 즉시 저장
    if (dataManager && newSensors.length > 0) {
      await saveToDatabase(config, newSensors);
    }
  }, [groupData, getActiveSensors, createSensorInfo, config, dataManager]);

  // DB에서 데이터 로드
  const loadSavedData = useCallback(async () => {
    if (!dataManager) return;

    setIsInitialLoading(true);
    setError('');

    try {
      const savedData = await apiCallWithRetry(() => 
        dataManager.loadFloorPlanData()
      );

      if (savedData.config) {
        setConfig(savedData.config);
      }

      if (savedData.sensors && savedData.sensors.length > 0) {
        const updatedSensors: SensorPosition[] = [];

        groupData.forEach((device, deviceIndex) => {
          const activeSensors = getActiveSensors(device);

          activeSensors.forEach((sensor) => {
            const sensorId = `${device.device_id}_${sensor.name}`;
            const savedSensor = savedData.sensors.find((s: SensorPosition) => s.sensor_id === sensorId);
            const sensorInfo = createSensorInfo(sensor, deviceIndex);

            if (savedSensor) {
              updatedSensors.push({
                ...savedSensor,
                sensor_type: sensorInfo.displayName,
                sensorInfo: {
                  type: sensor.type,
                  channel: sensor.channel,
                  valueIndex: 0,
                  unit: sensorInfo.unit,
                  color: sensorInfo.color,
                  allValues: sensor.values || [],
                  allLabels: sensorInfo.valueLabels
                }
              });
            }
          });
        });

        if (updatedSensors.length > 0) {
          setSensors(updatedSensors);
          console.log('DB에서 센서 위치 로드 완료:', updatedSensors.length);
          return;
        }
      }

      await initializeSensors();

    } catch (error) {
      console.error('DB 데이터 로드 실패:', error);
      setError(`데이터 로드 실패: ${handleApiError(error)}`);
      await initializeSensors();
    } finally {
      setIsInitialLoading(false);
    }
  }, [dataManager, groupData, getActiveSensors, createSensorInfo, initializeSensors]);

  // DB 저장 함수
  const saveToDatabase = useCallback(async (
    newConfig: GreenhouseConfig, 
    newSensors: SensorPosition[]
  ) => {
    if (!dataManager || !isOnline) {
      console.warn('오프라인 상태 - 저장 스킵');
      return false;
    }

    const now = Date.now();
    if (now - lastSaveTimeRef.current < 1000) {
      console.log('저장 간격이 너무 짧음 - 스킵');
      return false;
    }

    setIsSaving(true);
    setSavingMessage('센서 위치 저장 중...');
    setError('');
    lastSaveTimeRef.current = now;

    try {
      const [floorPlanResult, sideViewResult] = await Promise.all([
        apiCallWithRetry(() => 
          dataManager.saveFloorPlanData(newConfig, newSensors, {
            zoom: 1,
            centerX: 50,
            centerY: 50,
            showGrid: true,
            showLabels: true,
          })
        ),
        apiCallWithRetry(() => 
          dataManager.saveSideViewData(newConfig, newSensors, {
            showGrid: true,
            showLabels: true,
            showHeightGuides: true,
            showGroundLine: true,
          })
        ),
      ]);

      if (floorPlanResult && sideViewResult) {
        setLastSaved(new Date());
        setSavingMessage('저장 완료!');
        console.log('DB 저장 완료');
        
        setTimeout(() => setSavingMessage(''), 1000);
        return true;
      } else {
        throw new Error('일부 데이터 저장 실패');
      }

    } catch (error) {
      console.error('DB 저장 실패:', error);
      setError(`저장 실패: ${handleApiError(error)}`);
      setSavingMessage('');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [dataManager, isOnline]);

  // 센서 위치 초기화 핸들러
  const handleResetPositions = useCallback(async () => {
    if (!dataManager) return;

    setIsResetting(true);
    setSavingMessage('센서 위치 초기화 중...');
    setError('');
    
    try {
      // 기존 센서 상태 초기화
      setSensors([]);
      
      // 잠시 대기 후 새로 초기화
      setTimeout(async () => {
        await initializeSensors();
        setSavingMessage('위치 초기화 완료!');
        setTimeout(() => setSavingMessage(''), 2000);
        setIsResetting(false);
        setShowResetConfirm(false);
      }, 500);
      
    } catch (error) {
      console.error('센서 위치 초기화 실패:', error);
      setError(`초기화 실패: ${handleApiError(error)}`);
      setSavingMessage('');
      setIsResetting(false);
    }
  }, [dataManager, initializeSensors]);

  // 드래그 상태 추적
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setSavingMessage('');
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    saveToDatabase(config, sensors);
  }, [config, sensors, saveToDatabase]);

  // 실시간 센서 이동
  const handleSensorMove = useCallback((sensorId: string, updates: Partial<Pick<SensorPosition, 'x' | 'y' | 'z'>>) => {
    setSensors(prevSensors => 
      prevSensors.map(sensor =>
        sensor.sensor_id === sensorId ? { ...sensor, ...updates } : sensor
      )
    );
  }, []);

  // 설정 변경 시 즉시 저장
  const handleSensorUpdate = useCallback((sensorId: string, updates: Partial<SensorPosition>) => {
    setSensors(prevSensors => {
      const updatedSensors = prevSensors.map(sensor =>
        sensor.sensor_id === sensorId ? { ...sensor, ...updates } : sensor
      );
      
      setTimeout(() => saveToDatabase(config, updatedSensors), 100);
      
      return updatedSensors;
    });
  }, [config, saveToDatabase]);

  const handleTopViewSensorMove = useCallback((sensorId: string, x: number, y: number) => {
    handleSensorMove(sensorId, { x, y });
  }, [handleSensorMove]);

  const handleSideViewSensorMove = useCallback((sensorId: string, x: number, z: number) => {
    handleSensorMove(sensorId, { x, z });
  }, [handleSensorMove]);

  const handleSensorSelect = useCallback((sensorId: string) => {
    setSelectedSensor(prev => prev === sensorId ? '' : sensorId);
  }, []);

  // 온실 설정 변경 핸들러
  const handleConfigChange = useCallback((newConfig: GreenhouseConfig) => {
    setConfig(newConfig);
    saveToDatabase(newConfig, sensors);
  }, [sensors, saveToDatabase]);

  // 통계 계산
  const stats = useMemo(() => {
    const deviceCount = groupData.length;
    const sensorCount = sensors.length;
    const sensorDensity = sensorCount > 0 ? ((config.width * config.length) / sensorCount).toFixed(1) : '0';

    const deviceSensorCounts: Record<string, number> = {};
    const sensorTypesCounts: Record<string, number> = {};

    groupData.forEach(device => {
      const activeSensors = getActiveSensors(device);
      deviceSensorCounts[device.device_name] = activeSensors.length;

      activeSensors.forEach(sensor => {
        const metadata = SENSOR_METADATA[sensor.type];
        const typeName = metadata?.name || sensor.name;
        sensorTypesCounts[typeName] = (sensorTypesCounts[typeName] || 0) + 1;
      });
    });

    return {
      deviceCount,
      sensorCount,
      sensorDensity,
      deviceSensorCounts,
      sensorTypesCounts
    };
  }, [groupData, sensors.length, config, getActiveSensors]);

  // Effect: 그룹 데이터 변경 시 센서 로드
  useEffect(() => {
    if (groupData.length > 0 && !isInitialLoading && sensors.length === 0) {
      loadSavedData();
    }
  }, [groupData.length, loadSavedData, isInitialLoading, sensors.length]);

  // 로딩 상태
  if (groupData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="text-4xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">센서 데이터 대기 중</h3>
        <p className="text-gray-600">센서가 연결되면 센서 배치도 가 표시됩니다.</p>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-lg font-semibold text-gray-800">데이터 로드 중...</span>
        </div>
        <p className="text-gray-600">온실 설정과 센서 위치를 불러오고 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 온실 설정 패널 */}
      {showSettings && (
        <GreenhouseSelector
          config={config}
          onConfigChange={handleConfigChange}
        />
      )}

      <div className="bg-white rounded-lg shadow p-4">
        {/* 헤더 섹션 */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            {/* 온실 정보 */}
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <img src="/home.png" alt="홈 아이콘" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  센서 배치도
                </h3>
                <p className="text-sm text-gray-600">
                  {stats.deviceCount}개 디바이스, {stats.sensorCount}개 센서 | {config.width}×{config.length}×{config.height}m
                </p>
              </div>
            </div>

            {/* 버튼 그룹 */}
            {isMobile ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium ${showSettings
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    <span className="mr-2">⚙️</span>
                    건물 설정 {showSettings ? '숨기기' : '수정'}
                  </button>

                  <button
                    onClick={() => setShowResetConfirm(true)}
                    disabled={sensors.length === 0 || isResetting}
                    className="flex items-center justify-center px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="mr-2">🔄</span>
                    위치초기화
                  </button>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">건물 타입</p>
                  <div className="flex bg-gray-100 rounded-lg p-1 w-full">
                    <button
                      onClick={() => handleConfigChange({ ...config, type: 'vinyl' })}
                      className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium ${config.type === 'vinyl'
                          ? 'bg-white text-green-700 shadow-sm border border-green-200'
                          : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                      <span className="mr-2">🏠</span>
                      건물타입1
                    </button>
                    <button
                      onClick={() => handleConfigChange({ ...config, type: 'glass' })}
                      className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium ${config.type === 'glass'
                          ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                          : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                      <span className="mr-2">🏢</span>
                      건물타입2
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center px-3 py-2 rounded-xl transition-all duration-200 text-xs font-medium ${showSettings
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  <span className="mr-1">⚙️</span>
                  설정
                </button>

                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={sensors.length === 0 || isResetting}
                  className="flex items-center px-3 py-2 rounded-xl transition-all duration-200 text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="mr-1">🔄</span>
                  위치초기화
                </button>

                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => handleConfigChange({ ...config, type: 'vinyl' })}
                    className={`flex items-center px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium ${config.type === 'vinyl'
                        ? 'bg-white text-green-700 shadow-sm border border-green-200'
                        : 'text-gray-600 hover:text-gray-800'
                      }`}
                  >
                    <span className="mr-1">🏠</span>
                    건물타입1
                  </button>
                  <button
                    onClick={() => handleConfigChange({ ...config, type: 'glass' })}
                    className={`flex items-center px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium ${config.type === 'glass'
                        ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                        : 'text-gray-600 hover:text-gray-800'
                      }`}
                  >
                    <span className="mr-1">🏢</span>
                    건물타입2
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 모바일용 탭 버튼 */}
        {isMobile && (
          <div className="mb-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('top')}
                className={`flex-1 flex items-center justify-center px-4 py-3 rounded-md transition-all duration-200 text-sm font-medium ${
                  activeTab === 'top'
                    ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                평면도
              </button>
              <button
                onClick={() => setActiveTab('side')}
                className={`flex-1 flex items-center justify-center px-4 py-3 rounded-md transition-all duration-200 text-sm font-medium ${
                  activeTab === 'side'
                    ? 'bg-white text-green-700 shadow-sm border border-green-200'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                측면도
              </button>
            </div>
          </div>
        )}

        {/* 뷰 컴포넌트 */}
        <div className="mb-6">
          {isMobile ? (
            <div className="space-y-2">
              {activeTab === 'top' ? (
                <div>
                  <TopView
                    config={config}
                    sensors={sensors}
                    onSensorMove={handleTopViewSensorMove}
                    onSensorUpdate={handleSensorUpdate}
                    selectedSensor={selectedSensor}
                    onSensorSelect={handleSensorSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              ) : (
                <div>
                  <SideView
                    config={config}
                    sensors={sensors}
                    onSensorMove={handleSideViewSensorMove}
                    onSensorUpdate={handleSensorUpdate}
                    selectedSensor={selectedSensor}
                    onSensorSelect={handleSensorSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 mb-3">
                  <h5 className="text-lg font-semibold text-gray-800">평면도</h5>
                  <span className="text-sm text-gray-500">({config.width}m × {config.length}m)</span>
                </div>
                <TopView
                  config={config}
                  sensors={sensors}
                  onSensorMove={handleTopViewSensorMove}
                  onSensorUpdate={handleSensorUpdate}
                  selectedSensor={selectedSensor}
                  onSensorSelect={handleSensorSelect}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2 mb-3">
                  <h5 className="text-lg font-semibold text-gray-800">측면도</h5>
                  <span className="text-sm text-gray-500">({config.width}m × {config.height}m)</span>
                </div>
                <SideView
                  config={config}
                  sensors={sensors}
                  onSensorMove={handleSideViewSensorMove}
                  onSensorUpdate={handleSensorUpdate}
                  selectedSensor={selectedSensor}
                  onSensorSelect={handleSensorSelect}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </div>
            </div>
          )}
        </div>

        {/* 위치 초기화 확인 다이얼로그 */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="text-xl">⚠️</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">센서 위치 초기화</h3>
                  <p className="text-sm text-gray-600">정말로 모든 센서 위치를 초기화하시겠습니까?</p>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-orange-800">
                  <strong>주의:</strong> 현재 설정된 모든 센서 위치가 삭제되고 자동으로 재배치됩니다. 
                  이 작업은 되돌릴 수 없습니다.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">현재 센서 상태</h4>
                <div className="text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>총 센서 개수:</span>
                    <span className="font-medium">{sensors.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span>디바이스 개수:</span>
                    <span className="font-medium">{stats.deviceCount}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span>온실 크기:</span>
                    <span className="font-medium">{config.width}×{config.length}×{config.height}m</span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={isResetting}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleResetPositions}
                  disabled={isResetting}
                  className="flex-1 px-4 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                >
                  {isResetting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      초기화 중...
                    </>
                  ) : (
                    '위치 초기화'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 저장 상태 메시지 표시 */}
        {savingMessage && (
          <div className="fixed bottom-4 right-4 z-40">
            <div className="bg-green-100 border border-green-300 rounded-lg px-4 py-2 shadow-lg">
              <div className="flex items-center space-x-2">
                {isSaving || isResetting ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600"></div>
                ) : (
                  <span className="text-green-600">✓</span>
                )}
                <span className="text-sm font-medium text-green-800">{savingMessage}</span>
              </div>
            </div>
          </div>
        )}

        {/* 오류 메시지 표시 */}
        {error && (
          <div className="fixed bottom-4 right-4 z-40">
            <div className="bg-red-100 border border-red-300 rounded-lg px-4 py-2 shadow-lg max-w-md">
              <div className="flex items-center space-x-2">
                <span className="text-red-600">❌</span>
                <span className="text-sm font-medium text-red-800">{error}</span>
                <button
                  onClick={() => setError('')}
                  className="text-red-600 hover:text-red-800 ml-2"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(GreenhouseFloorPlan);