// src/components/greenhouse/HomeGreenhouseViewer.tsx - 하단 잘림 현상 완전 해결

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { FlexibleSensorData } from '../../types/sensor.types';
import {
  GreenhouseDataManager,
  createGreenhouseDataManager
} from '../../services/greenhouseApi';

interface GroupSensorData {
  device_id: string;
  device_name: string;
  group_id: string;
  flexibleData?: FlexibleSensorData;
}

interface HomeGreenhouseViewerProps {
  groupId: string;
  groupData: GroupSensorData[];
  compactMode?: boolean;
}

interface SimpleSensor {
  device_id: string;
  device_name: string;
  sensor_name: string;
  sensor_id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  icon: string;
  type: number;
  channel: number;
}

const HomeGreenhouseViewer: React.FC<HomeGreenhouseViewerProps> = ({
  groupId,
  groupData,
  compactMode = false
}) => {
  const [sensors, setSensors] = useState<SimpleSensor[]>([]);
  const [config, setConfig] = useState({
    type: 'vinyl' as 'vinyl' | 'glass',
    height: 4,
    width: 20,
    length: 50
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'top' | 'side'>('top');

  // 불필요한 새로고침 방지를 위한 refs
  const loadedGroupIdRef = useRef<string>('');
  const loadTimeoutRef = useRef<NodeJS.Timeout>();

  // 데이터 매니저 인스턴스
  const dataManager = React.useMemo(() => {
    const firstDevice = groupData[0];
    return firstDevice ? createGreenhouseDataManager(firstDevice.device_id) : null;
  }, [groupData]);

  // 화면 크기 감지
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
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    return colors[deviceIndex % colors.length];
  }, []);

  // 센서 타입별 아이콘
  const getSensorIcon = useCallback((sensorType: number): string => {
    const iconMap: Record<number, string> = {
      1: '🌡️', // SHT20 (온습도)
      2: '☀️', // BH1750 (조도)
      3: '🔬', // ADS1115 (아날로그)
      4: '🌤️', // SCD30 (CO2/온습도)
      5: '🌡️'  // DS18B20 (온도)
    };
    return iconMap[sensorType] || '📊';
  }, []);

  // DB에서 센서 데이터 로드 (캐시 및 최적화)
  const loadSensorDataFromDB = useCallback(async () => {
    if (!dataManager) return null;

    const now = Date.now();
    if (now - lastLoadTime < 5000) {
      console.log('🔥 최근에 로드했음 - 스킵');
      return null;
    }

    try {
      setLastLoadTime(now);
      const savedData = await dataManager.loadFloorPlanData();

      return {
        sensors: savedData.sensors || [],
        config: savedData.config || config
      };
    } catch (error) {
      console.error('DB에서 센서 데이터 로드 실패:', error);
      return null;
    }
  }, [dataManager, config, lastLoadTime]);

  // 센서 데이터 초기화 (저장된 위치 불러오기 포함)
  useEffect(() => {
    const initializeSensors = async () => {
      if (loadedGroupIdRef.current === groupId && sensors.length > 0) {
        console.log('🚀 동일한 그룹 - 초기화 스킵');
        return;
      }

      setIsLoading(true);
      console.log('🚀 새로운 센서 초기화 시작');
      console.log('🚀 GroupData:', groupData);

      const newSensors: SimpleSensor[] = [];

      try {
        // 먼저 DB에서 저장된 데이터 확인
        const savedData = await loadSensorDataFromDB();

        let savedSensors: any[] = [];
        let savedConfig = config;

        if (savedData) {
          savedSensors = savedData.sensors;
          savedConfig = savedData.config;
          setConfig(savedConfig);
          console.log('🚀 저장된 설정 불러옴:', savedConfig);
          console.log('🚀 저장된 센서 위치:', savedSensors.length, '개');
        }

        groupData.forEach((device, deviceIndex) => {
          console.log(`🚀 Device ${deviceIndex}:`, device.device_name);
          console.log('🚀 FlexibleData:', device.flexibleData);

          if (!device.flexibleData?.sensors) {
            console.log('🚀 센서 데이터 없음:', device.device_name);
            return;
          }

          const activeSensors = device.flexibleData.sensors.filter(sensor => sensor.active);
          console.log('🚀 활성 센서:', activeSensors.length, '개');

          activeSensors.forEach((sensor, sensorIndex) => {
            const sensorId = `${device.device_id}_${sensor.name}`;

            // 저장된 위치가 있으면 사용, 없으면 자동 배치
            const savedSensor = savedSensors.find(s => s.sensor_id === sensorId);

            let x, y, z;
            if (savedSensor) {
              x = savedSensor.x;
              y = savedSensor.y;
              z = savedSensor.z || 50;
              console.log('🚀 저장된 위치 사용:', sensor.name, `(${x}, ${y}, ${z})`);
            } else {
              // 자동 배치 로직
              const deviceCount = groupData.length;
              let baseX, baseY;

              if (deviceCount <= 2) {
                baseX = 30 + (deviceIndex * 40);
                baseY = 50;
              } else if (deviceCount <= 4) {
                const row = Math.floor(deviceIndex / 2);
                const col = deviceIndex % 2;
                baseX = 25 + (col * 50);
                baseY = 30 + (row * 40);
              } else {
                baseX = 20 + Math.random() * 60;
                baseY = 20 + Math.random() * 60;
              }

              const angle = (sensorIndex * 360 / activeSensors.length) * (Math.PI / 180);
              const radius = Math.min(10, 5 + activeSensors.length);

              x = Math.max(5, Math.min(95, baseX + radius * Math.cos(angle)));
              y = Math.max(5, Math.min(95, baseY + radius * Math.sin(angle)));
              z = 40 + (sensorIndex * 15);
              console.log('🚀 자동 배치:', sensor.name, `(${x}, ${y}, ${z})`);
            }

            const simpleSensor: SimpleSensor = {
              device_id: device.device_id,
              device_name: device.device_name,
              sensor_name: sensor.name,
              sensor_id: sensorId,
              x: x,
              y: y,
              z: z,
              color: getDeviceColor(deviceIndex),
              icon: getSensorIcon(sensor.type),
              type: sensor.type,
              channel: sensor.channel
            };

            newSensors.push(simpleSensor);
            console.log('🚀 센서 추가:', simpleSensor.sensor_name);
          });
        });

        console.log('🚀 총 센서 개수:', newSensors.length);
        setSensors(newSensors);
        loadedGroupIdRef.current = groupId;

      } catch (error) {
        console.error('센서 초기화 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (groupData.length > 0) {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }

      loadTimeoutRef.current = setTimeout(() => {
        initializeSensors();
      }, 300);
    }

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [groupData, getDeviceColor, getSensorIcon, loadSensorDataFromDB, config, groupId]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // 🔥 완전 수정된 평면도 컴포넌트
  const TopView = memo(() => {
    const viewBoxWidth = compactMode ? "150" : "100";
    const viewBoxHeight = compactMode ? "100" : "100";

    return (
      <div className="w-full h-full max-h-full overflow-hidden">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="border border-gray-300 rounded w-full h-full"
          preserveAspectRatio="none"
          style={{
            maxHeight: '100%',
            maxWidth: '100%'
          }}
        >
          {/* 온실 외곽 - 건물 타입에 따라 색상 변경 */}
          <rect
            x="10"
            y="10"
            width={Number(viewBoxWidth) - 20}
            height={Number(viewBoxHeight) - 20}
            fill={config.type === 'vinyl' ? '#f0f9ff' : '#fef3c7'}
            stroke={config.type === 'vinyl' ? '#22c55e' : '#3b82f6'}
            strokeWidth="2"
            strokeDasharray={config.type === 'vinyl' ? '5,5' : 'none'}
          />

          {/* 출입구 */}
          <rect
            x={Number(viewBoxWidth) / 2 - 15}
            y="10"
            width="30"
            height="3"
            fill="#ef4444"
            stroke="#dc2626"
            strokeWidth="1"
          />
          <text
            x={Number(viewBoxWidth) / 2}
            y="25"
            textAnchor="middle"
            fontSize="8"
            fill="red"
            fontWeight="500"
          >
            출입구
          </text>

          {/* 센서들 */}
          {sensors.map((sensor) => {
            const cx = 10 + (sensor.x / 100) * (Number(viewBoxWidth) - 20);
            const cy = 10 + (sensor.y / 100) * (Number(viewBoxHeight) - 20);

            return (
              <g key={sensor.sensor_id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="6"
                  fill={sensor.color}
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy + 2}
                  textAnchor="middle"
                  fontSize="8"
                  className="pointer-events-none select-none"
                >
                  {sensor.icon}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  });

  // 🔥 완전 수정된 측면도 컴포넌트
  const SideView = memo(() => {
    const viewBoxWidth = compactMode ? "150" : "100";
    const viewBoxHeight = compactMode ? "100" : "100";
    const floorY = Number(viewBoxHeight) - 25;

    return (
      <div className="w-full h-full max-h-full overflow-hidden">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="border border-gray-300 rounded w-full h-full"
          preserveAspectRatio="none"
          style={{
            maxHeight: '100%',
            maxWidth: '100%'
          }}
        >
          {/* 지면 */}
          <rect
            x="10"
            y={floorY}
            width={Number(viewBoxWidth) - 20}
            height="10"
            fill="#8b5cf6"
            stroke="#7c3aed"
            strokeWidth="2"
          />
          <text
            x={Number(viewBoxWidth) / 2}
            y={floorY + 8}
            textAnchor="middle"
            fontSize="7"
            fill="white"
            fontWeight="500"
          >
            지면
          </text>

          {/* 온실 구조 - 건물 타입에 따라 아치형/각형 변경 */}
          {config.type === 'vinyl' ? (
            <path
              d={`M 10 ${floorY} Q ${Number(viewBoxWidth) / 2} 25 ${Number(viewBoxWidth) - 10} ${floorY}`}
              fill="rgba(34, 197, 94, 0.1)"
              stroke="#22c55e"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          ) : (
            <polygon
              points={`10,${floorY} 10,35 ${Number(viewBoxWidth) / 2},25 ${Number(viewBoxWidth) - 10},35 ${Number(viewBoxWidth) - 10},${floorY}`}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          )}

          {/* 센서들 */}
          {sensors.map((sensor) => {
            const sensorX = 10 + (sensor.x / 100) * (Number(viewBoxWidth) - 20);
            const sensorY = floorY - (sensor.z / 100) * (floorY - 25);

            return (
              <g key={sensor.sensor_id}>
                <circle
                  cx={sensorX}
                  cy={sensorY}
                  r="6"
                  fill={sensor.color}
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={sensorX}
                  y={sensorY + 2}
                  textAnchor="middle"
                  fontSize="8"
                  className="pointer-events-none select-none"
                >
                  {sensor.icon}
                </text>
                {/* 지면으로의 선 */}
                <line
                  x1={sensorX}
                  y1={sensorY}
                  x2={sensorX}
                  y2={floorY}
                  stroke={sensor.color}
                  strokeWidth="1.5"
                  strokeDasharray="2,2"
                  opacity="0.7"
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  });

  // 로딩 상태
  if (groupData.length === 0) {
    return (
      <div className="bg-gray-100 rounded p-4 text-center h-full flex items-center justify-center">
        <div>
          <div className="text-xl mb-2">🏠</div>
          <p className="text-xs text-gray-600">센서 데이터 대기 중...</p>
        </div>
      </div>
    );
  }

  if (isLoading && sensors.length === 0) {
    return (
      <div className="bg-gray-100 rounded p-4 text-center h-full flex items-center justify-center">
        <div>
          <div className="flex items-center justify-center space-x-2 mb-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-xs font-medium text-gray-800">온실 레이아웃 로드 중...</span>
          </div>
          <p className="text-xs text-gray-600">센서 위치를 불러오고 있습니다.</p>
        </div>
      </div>
    );
  }

  // 🔥 완전 수정된 컴팩트 모드
  if (compactMode) {
    return (
      <div className="w-full h-full flex flex-col">
        {/* 로딩 상태 표시 */}
        {isLoading && (
          <div className="flex items-center justify-center space-x-2 mb-2 flex-shrink-0">
            <div className="animate-spin rounded-full h-2 w-2 border-b-2 border-blue-600"></div>
            <span className="text-xs text-gray-600">업데이트 중...</span>
          </div>
        )}

        {/* 🔥 높이 제한과 오버플로우 처리 완벽 적용 */}
        <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
          <div className="flex flex-col h-full min-h-0">
            <div className="mb-1 flex-shrink-0">
              <h5 className="text-xs font-medium text-gray-700">평면도</h5>
            </div>
            <div className="flex-1 min-h-0 max-h-full overflow-hidden">
              <TopView />
            </div>
          </div>

          <div className="flex flex-col h-full min-h-0">
            <div className="mb-1 flex-shrink-0">
              <h5 className="text-xs font-medium text-gray-700">측면도</h5>
            </div>
            <div className="flex-1 min-h-0 max-h-full overflow-hidden">
              <SideView />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 일반 모드 (모바일/데스크톱 구분)
  return (
    <div className="w-full h-full">
      {isMobile ? (
        // 🔥 모바일: 탭 버튼으로 전환
        <div className="space-y-3 h-full flex flex-col">
          {/* 탭 버튼 */}
          <div className="flex bg-gray-100 rounded-lg p-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('top')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium ${activeTab === 'top'
                ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              <span className="mr-2"></span>
              평면도
            </button>
            <button
              onClick={() => setActiveTab('side')}
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md transition-all duration-200 text-sm font-medium ${activeTab === 'side'
                ? 'bg-white text-green-700 shadow-sm border border-green-200'
                : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              <span className="mr-2"></span>
              측면도
            </button>
          </div>

          {/* 선택된 뷰 표시 */}
          <div className="flex-1 min-h-0">
            {activeTab === 'top' ? <TopView /> : <SideView />}
          </div>
        </div>
      ) : (
        // 🔥 데스크톱: 기존처럼 양쪽에 동시 표시
        <div className="grid grid-cols-2 gap-4 h-full">
          <div className="flex flex-col min-h-0">
            <h5 className="text-sm font-medium text-gray-700 mb-2 flex-shrink-0">📐 평면도</h5>
            <div className="flex-1 min-h-0">
              <TopView />
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <h5 className="text-sm font-medium text-gray-700 mb-2 flex-shrink-0">📏 측면도</h5>
            <div className="flex-1 min-h-0">
              <SideView />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(HomeGreenhouseViewer);