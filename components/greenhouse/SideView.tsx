// src/components/greenhouse/SideView.tsx (수정된 최적화 버전)

import React, { useCallback, useState, useRef, memo } from 'react';
import { SensorPosition, GreenhouseConfig, getSensorInfo } from './types';

interface SideViewProps {
  config: GreenhouseConfig;
  sensors: SensorPosition[];
  onSensorMove: (sensorId: string, x: number, z: number) => void;
  onSensorUpdate: (sensorId: string, updates: Partial<SensorPosition>) => void;
  selectedSensor: string;
  onSensorSelect: (sensorId: string) => void;
  onDragStart?: () => void; // 🔥 드래그 시작 콜백 추가
  onDragEnd?: () => void;   // 🔥 드래그 완료 콜백 추가
}

const SideView: React.FC<SideViewProps> = memo(({
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
  const dragStartTimeRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  // SVG 설정
  const SVG_CONFIG = {
    viewBox: { width: 400, height: 300 },
    greenhouse: { x: 10, y: 50, width: 380, height: 200 }
  };

  // 🔥 동적 SVG 크기 계산
  const baseGroundY = 250;
  const baseMinY = 50;
  const baseViewBoxHeight = 300;
  
  const heightMultiplier = Math.max(1, config.height / 4);
  const expandedHeight = baseViewBoxHeight * heightMultiplier;
  
  const groundY = baseGroundY * heightMultiplier;
  const availableHeight = (baseGroundY - baseMinY) * heightMultiplier;
  const minY = groundY - availableHeight;
  
  const heightProgress = config.height / 4;
  const actualHeightInSVG = availableHeight * Math.min(heightProgress, 1);
  
  const maxHeight = groundY - actualHeightInSVG;
  const sideHeight = maxHeight + (actualHeightInSVG * 0.2);
  
  const dynamicViewBox = `0 0 400 ${Math.ceil(expandedHeight)}`;
  const dynamicSVGHeight = Math.max(400, 300 * heightMultiplier);

  const convertToPercentage = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, z: 0 };
    
    const rect = svgRef.current.getBoundingClientRect();
    
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    const normalizedX = Math.max(0, Math.min(1, clickX / rect.width));
    const normalizedY = Math.max(0, Math.min(1, clickY / rect.height));
    
    const viewBoxX = normalizedX * 400;
    const viewBoxY = normalizedY * expandedHeight;
    
    const greenhouseX = (viewBoxX - SVG_CONFIG.greenhouse.x) / SVG_CONFIG.greenhouse.width;
    const greenhouseY = (viewBoxY - minY) / availableHeight;
    
    const relativeX = Math.max(0, Math.min(100, greenhouseX * 100));
    const relativeZ = Math.max(0, Math.min(100, (1 - greenhouseY) * 100));
    
    return { x: relativeX, z: relativeZ };
  }, [expandedHeight, minY, availableHeight]);

  // 🔥 드래그 시작 핸들러
  const handleSensorMouseDown = useCallback((sensorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartTimeRef.current = Date.now();
    setIsDragging(true);
    setDragSensor(sensorId);
    onSensorSelect(sensorId);
    onDragStart?.();
    
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
    onDragStart?.();
  }, [onSensorSelect, onDragStart]);

  // 🔥 드래그 종료 핸들러
  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      const dragDuration = Date.now() - dragStartTimeRef.current;
      
      setIsDragging(false);
      setDragSensor('');
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      
      // 최소 드래그 시간 체크 (100ms 이상일 때만 드래그로 인정)
      if (dragDuration > 100) {
        onDragEnd?.();
      }
    }
  }, [isDragging, onDragEnd]);

  // 🔥 실시간 위치 업데이트
  React.useEffect(() => {
    if (!isDragging || !dragSensor) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const { x, z } = convertToPercentage(e.clientX, e.clientY);
      onSensorMove(dragSensor, x, z);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const { x, z } = convertToPercentage(touch.clientX, touch.clientY);
        onSensorMove(dragSensor, x, z);
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

      
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height={dynamicSVGHeight}
          viewBox={dynamicViewBox}
          className="border-2 border-gray-300 rounded-lg select-none touch-none"
          style={{ 
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}
        >
          {/* 지면 */}
          <rect
            x="10"
            y={groundY}
            width="380"
            height="40"
            fill="#8b5cf6"
            stroke="#7c3aed"
            strokeWidth="2"
          />
          <text x="200" y={groundY + 25} textAnchor="middle" className="text-xs fill-white font-medium select-none">
            지면
          </text>
          
          {/* 온실 구조 - 🔥 동적 높이 적용 */}
          {config.type === 'vinyl' ? (
            <path
              d={`M 10 ${groundY} Q 200 ${maxHeight} 390 ${groundY}`}
              fill="rgba(34, 197, 94, 0.1)"
              stroke="#22c55e"
              strokeWidth="3"
              strokeDasharray="5,5"
            />
          ) : (
            <>
              <polygon
                points={`10,${groundY} 10,${sideHeight} 200,${maxHeight} 390,${sideHeight} 390,${groundY}`}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3b82f6"
                strokeWidth="3"
              />
              <line x1="200" y1={maxHeight} x2="200" y2={groundY} stroke="#3b82f6" strokeWidth="1" strokeDasharray="2,2"/>
            </>
          )}
          
          {/* 격자 */}
          <defs>
            <pattern id="sideGrid" width="40" height="25" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 25" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect x="10" y={minY} width="380" height={availableHeight} fill="url(#sideGrid)" />
          
          {/* 🔥 동적 센서 위치 렌더링 */}
          {sensors.map((sensor) => {
            const sensorInfo = getSensorInfo(sensor);
            const sensorX = 10 + (sensor.x / 100) * 380;
            const sensorY = groundY - (sensor.z / 100) * availableHeight;
            const isCurrentDragging = dragSensor === sensor.sensor_id;
            const isSelected = selectedSensor === sensor.sensor_id;
            
            return (
              <g key={sensor.sensor_id}>
                {/* 센서 원 */}
                <circle
                  cx={sensorX}
                  cy={sensorY}
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
                  x={sensorX}
                  y={sensorY + 4}
                  textAnchor="middle"
                  className="text-xs pointer-events-none select-none"
                >
                  {getSensorIcon(sensor)}
                </text>
                
                {/* 지면으로의 선 */}
                <line
                  x1={sensorX}
                  y1={sensorY}
                  x2={sensorX}
                  y2={groundY}
                  stroke={getSensorColor(sensor)}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />
                
                {/* 센서 라벨 */}
                <text
                  x={sensorX}
                  y={sensorY - 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-700 font-medium pointer-events-none select-none"
                  style={{ fontSize: '10px' }}
                >
                  {sensorInfo.label}
                </text>
                
                {/* 선택 표시 */}
                {isSelected && (
                  <circle
                    cx={sensorX}
                    cy={sensorY}
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
          
          {/* 높이 가이드 */}
          <text x="0" y={groundY + 15} className="text-xs fill-gray-500 select-none">0m</text>
          <text x="0" y={minY + 10} className="text-xs fill-gray-500 select-none">{config.height}m</text>
          <text x="20" y={groundY + 55} className="text-xs fill-gray-500 select-none">0m</text>
          <text x="380" y={groundY + 55} className="text-xs fill-gray-500 select-none">{config.width}m</text>
        </svg>
        
        {/* 🔥 드래그 상태 표시 */}
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

SideView.displayName = 'SideView';

export default SideView;