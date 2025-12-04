// src/components/greenhouse/TopView.tsx (최적화 버전)

import React, { useCallback, useState, useRef, memo } from 'react';
import { SensorPosition, GreenhouseConfig, getSensorInfo } from './types';

interface TopViewProps {
  config: GreenhouseConfig;
  sensors: SensorPosition[];
  onSensorMove: (sensorId: string, x: number, y: number) => void;
  onSensorUpdate: (sensorId: string, updates: Partial<SensorPosition>) => void;
  selectedSensor: string;
  onSensorSelect: (sensorId: string) => void;
  onDragStart?: () => void; // 🔥 드래그 시작 콜백 추가
  onDragEnd?: () => void;   // 🔥 드래그 완료 콜백 추가
}

const TopView: React.FC<TopViewProps> = memo(({
  config,
  sensors,
  onSensorMove,
  onSensorUpdate,
  selectedSensor,
  onSensorSelect,
  onDragStart,
  onDragEnd
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragSensor, setDragSensor] = useState<string>('');
  const dragStartTimeRef = useRef<number>(0); // 🔥 드래그 시작 시간 추적
  const svgRef = useRef<SVGSVGElement>(null);

  const convertToPercentage = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const rect = svgRef.current.getBoundingClientRect();
    
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    const scaleX = 400 / rect.width;
    const scaleY = 300 / rect.height;
    
    const viewBoxX = clickX * scaleX;
    const viewBoxY = clickY * scaleY;
    
    const GREENHOUSE_BOUNDS = {
      left: 10,
      top: 10,
      width: 380,
      height: 280
    };
    
    const relativeX = (viewBoxX - GREENHOUSE_BOUNDS.left) / GREENHOUSE_BOUNDS.width;
    const relativeY = (viewBoxY - GREENHOUSE_BOUNDS.top) / GREENHOUSE_BOUNDS.height;
    
    const percentX = Math.max(0, Math.min(100, relativeX * 100));
    const percentY = Math.max(0, Math.min(100, relativeY * 100));
    
    return { x: percentX, y: percentY };
  }, []);

  // 🔥 개선된 드래그 시작 핸들러
  const handleSensorMouseDown = useCallback((sensorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartTimeRef.current = Date.now();
    setIsDragging(true);
    setDragSensor(sensorId);
    onSensorSelect(sensorId);
    onDragStart?.(); // 🔥 상위 컴포넌트에 드래그 시작 알림
    
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    
    if (e.currentTarget instanceof Element) {
      e.currentTarget.setAttribute('draggable', 'false');
    }
  }, [onSensorSelect, onDragStart]);

  const handleSensorTouchStart = useCallback((sensorId: string, e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartTimeRef.current = Date.now();
    setIsDragging(true);
    setDragSensor(sensorId);
    onSensorSelect(sensorId);
    onDragStart?.(); // 🔥 상위 컴포넌트에 드래그 시작 알림
  }, [onSensorSelect, onDragStart]);

  // 🔥 개선된 드래그 종료 핸들러
  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      const dragDuration = Date.now() - dragStartTimeRef.current;
      
      setIsDragging(false);
      setDragSensor('');
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      
      // 🔥 최소 드래그 시간 체크 (100ms 이상일 때만 드래그로 인정)
      if (dragDuration > 100) {
        onDragEnd?.(); // 🔥 상위 컴포넌트에 드래그 완료 알림
      }
    }
  }, [isDragging, onDragEnd]);

  // 🔥 실시간 위치 업데이트 (저장은 드래그 완료 후)
  React.useEffect(() => {
    if (!isDragging || !dragSensor) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const { x, y } = convertToPercentage(e.clientX, e.clientY);
      onSensorMove(dragSensor, x, y); // 실시간 위치만 업데이트
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const { x, y } = convertToPercentage(touch.clientX, touch.clientY);
        onSensorMove(dragSensor, x, y); // 실시간 위치만 업데이트
      }
    };
    
    document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
    
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, dragSensor, convertToPercentage, onSensorMove, handleDragEnd]);

  // 🔥 동적 센서 색상 가져오기
  const getSensorColor = useCallback((sensor: SensorPosition) => {
    return sensor.sensorInfo?.color || getSensorInfo(sensor).color;
  }, []);

  // 🔥 동적 센서 아이콘 가져오기
  const getSensorIcon = useCallback((sensor: SensorPosition) => {
    return getSensorInfo(sensor).icon;
  }, []);

  const handleCardClick = useCallback((sensorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSensorSelect(sensorId);
  }, [onSensorSelect]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">

      </div>
      
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height="400"
          viewBox="0 0 400 300"
          className="border-2 border-gray-300 rounded-lg select-none touch-none"
          style={{ 
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        >
          {/* 온실 외곽 */}
          <rect
            x="10"
            y="10"
            width="380"
            height="280"
            fill={config.type === 'vinyl' ? '#f0f9ff' : '#fef3c7'}
            stroke={config.type === 'vinyl' ? '#22c55e' : '#3b82f6'}
            strokeWidth="3"
            strokeDasharray={config.type === 'vinyl' ? '5,5' : 'none'}
          />
          
          {/* 격자 */}
          <defs>
            <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect x="10" y="10" width="380" height="280" fill="url(#grid)" />
          
          {/* 출입구 */}
          <rect
            x="180"
            y="10"
            width="40"
            height="8"
            fill="#ef4444"
            stroke="#dc2626"
            strokeWidth="1"
          />
          <text x="200" y="35" textAnchor="middle" className="text-xs fill-red-600 font-medium select-none">
            출입구
          </text>
          
          {/* 🔥 동적 센서 위치 렌더링 */}
          {sensors.map((sensor) => {
            const sensorInfo = getSensorInfo(sensor);
            const cx = 10 + (sensor.x / 100) * 380;
            const cy = 10 + (sensor.y / 100) * 280;
            const isCurrentDragging = dragSensor === sensor.sensor_id;
            const isSelected = selectedSensor === sensor.sensor_id;
            
            return (
              <g key={sensor.sensor_id}>
                {/* 센서 원 */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isCurrentDragging ? 12 : 10}
                  fill={getSensorColor(sensor)}
                  stroke="white"
                  strokeWidth="2"
                  className={`transition-all ${
                    isCurrentDragging 
                      ? 'cursor-grabbing opacity-80' 
                      : 'cursor-grab hover:r-12'
                  }`}
                  onMouseDown={(e) => handleSensorMouseDown(sensor.sensor_id, e)}
                  onTouchStart={(e) => handleSensorTouchStart(sensor.sensor_id, e)}
                  style={{ 
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    pointerEvents: 'all'
                  }}
                />
                
                {/* 센서 아이콘 */}
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  className="text-xs pointer-events-none select-none"
                >
                  {getSensorIcon(sensor)}
                </text>
                
                {/* 센서 라벨 */}
                <text
                  x={cx}
                  y={cy + 25}
                  textAnchor="middle"
                  className="text-xs fill-gray-700 font-medium pointer-events-none select-none"
                  style={{ fontSize: '10px' }}
                >
                  {sensorInfo.label}
                </text>
                
                {/* 🔥 추가 정보 표시 (채널, 값 인덱스) */}
                {sensor.sensorInfo && (
                  <text
                    x={cx}
                    y={cy + 35}
                    textAnchor="middle"
                    className="text-xs fill-gray-500 pointer-events-none select-none"
                    style={{ fontSize: '8px' }}
                  >
                    CH{sensor.sensorInfo.channel}
                    {sensor.sensorInfo.valueIndex > 0 && `-V${sensor.sensorInfo.valueIndex}`}
                  </text>
                )}
                
                {/* 선택 표시 */}
                {isSelected && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="15"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3"
                    strokeDasharray="3,3"
                    className="animate-pulse"
                  />
                )}
              </g>
            );
          })}
          
          {/* 좌표 가이드 */}
          <text x="20" y="305" className="text-xs fill-gray-500 select-none">0m</text>
          <text x="380" y="305" className="text-xs fill-gray-500 select-none">{config.width}m</text>
          <text x="0" y="25" className="text-xs fill-gray-500 select-none">0m</text>
          <text x="0" y="285" className="text-xs fill-gray-500 select-none">{config.length}m</text>
        </svg>
        
        {/* 🔥 개선된 드래그 상태 표시 */}
        {isDragging && (
          <div className="absolute top-0 right-0 bg-green-100 border border-green-300 rounded-lg p-2 text-sm z-10">
            <p className="font-medium text-green-800">🎯 센서 이동 중...</p>
            <p className="text-green-700">원하는 위치에서 마우스를 놓으세요</p>
          </div>
        )}
        
        {/* 선택된 센서 안내 */}
        {selectedSensor && !isDragging && (
          <div className="absolute top-0 right-0 bg-yellow-100 border border-yellow-300 rounded-lg p-2 text-sm z-10">
            <p className="font-medium text-yellow-800">
              {(() => {
                const sensor = sensors.find(s => s.sensor_id === selectedSensor);
                const sensorInfo = sensor ? getSensorInfo(sensor) : null;
                return sensor && sensorInfo ? `${sensorInfo.label}` : '';
              })()} 선택됨
            </p>
            <p className="text-yellow-700">드래그하여 위치 변경</p>
          </div>
        )}
      </div>
    </div>
  );
});

TopView.displayName = 'TopView';

export default TopView;