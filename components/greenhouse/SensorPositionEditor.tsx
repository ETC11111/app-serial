// src/components/greenhouse/SideView.tsx

import React, { useCallback, useState, useRef, memo } from 'react';
import { SensorPosition, GreenhouseConfig, getSensorInfo } from './types';

interface SideViewProps {
  config: GreenhouseConfig;
  sensors: SensorPosition[];
  onSensorMove: (sensorId: string, x: number, z: number) => void;
  onSensorUpdate: (sensorId: string, updates: Partial<SensorPosition>) => void;
  selectedSensor: string;
  onSensorSelect: (sensorId: string) => void;
}

const SideView: React.FC<SideViewProps> = memo(({
  config,
  sensors,
  onSensorMove,
  onSensorUpdate,
  selectedSensor,
  onSensorSelect
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragSensor, setDragSensor] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);

  // 개선된 좌표 변환 함수
  const convertToPercentage = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, z: 0 };
    
    const rect = svgRef.current.getBoundingClientRect();
    
    // 더 정확한 클릭 위치 계산
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    // SVG 설정값들 (SideView용)
    const SVG_CONFIG = {
      viewBox: { width: 400, height: 300 },
      greenhouse: { x: 10, y: 50, width: 380, height: 200 }
    };
    
    // 클릭 위치를 0-1 비율로 정규화
    const normalizedX = Math.max(0, Math.min(1, clickX / rect.width));
    const normalizedY = Math.max(0, Math.min(1, clickY / rect.height));
    
    // viewBox 좌표계로 변환
    const viewBoxX = normalizedX * SVG_CONFIG.viewBox.width;
    const viewBoxY = normalizedY * SVG_CONFIG.viewBox.height;
    
    // 온실 영역 내에서의 상대 위치 계산
    const greenhouseX = (viewBoxX - SVG_CONFIG.greenhouse.x) / SVG_CONFIG.greenhouse.width;
    const greenhouseY = (viewBoxY - SVG_CONFIG.greenhouse.y) / SVG_CONFIG.greenhouse.height;
    
    // 0-100% 범위로 제한
    const relativeX = Math.max(0, Math.min(100, greenhouseX * 100));
    // Y축 반전 (SVG에서는 아래쪽이 큰 값, 높이에서는 위쪽이 큰 값)
    const relativeZ = Math.max(0, Math.min(100, (1 - greenhouseY) * 100));
    
    return { x: relativeX, z: relativeZ };
  }, []);

  // 마우스 드래그 시작
  const handleSensorMouseDown = useCallback((sensorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    setDragSensor(sensorId);
    onSensorSelect(sensorId);
    
    // 드래그 상태 설정
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    
    // 드래그 이미지 제거
    if (e.currentTarget instanceof Element) {
      e.currentTarget.setAttribute('draggable', 'false');
    }
  }, [onSensorSelect]);

  // 터치 드래그 시작
  const handleSensorTouchStart = useCallback((sensorId: string, e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    setDragSensor(sensorId);
    onSensorSelect(sensorId);
  }, [onSensorSelect]);

  // 드래그 끝 처리
  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragSensor('');
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    }
  }, [isDragging]);

  // 전역 이벤트 리스너
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
    
    // 이벤트 리스너 등록
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

  const getSensorColor = useCallback((sensor: SensorPosition) => {
    return getSensorInfo(sensor.sensor_type).color;
  }, []);

  const handleCardClick = useCallback((sensorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSensorSelect(sensorId);
  }, [onSensorSelect]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold">📍 옆에서 본 모습 (측면도)</h4>
        <div className="text-sm text-gray-600">
          {config.width}m × {config.height}m
        </div>
      </div>
      
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height="300"
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
          {/* 지면 */}
          <rect
            x="10"
            y="250"
            width="380"
            height="40"
            fill="#8b5cf6"
            stroke="#7c3aed"
            strokeWidth="2"
          />
          <text x="200" y="275" textAnchor="middle" className="text-xs fill-white font-medium select-none">
            지면
          </text>
          
          {/* 온실 구조 */}
          {config.type === 'vinyl' ? (
            <path
              d="M 10 250 Q 200 50 390 250"
              fill="rgba(34, 197, 94, 0.1)"
              stroke="#22c55e"
              strokeWidth="3"
              strokeDasharray="5,5"
            />
          ) : (
            <>
              <polygon
                points="10,250 10,100 200,50 390,100 390,250"
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3b82f6"
                strokeWidth="3"
              />
              <line x1="200" y1="50" x2="200" y2="250" stroke="#3b82f6" strokeWidth="1" strokeDasharray="2,2"/>
            </>
          )}
          
          {/* 격자 */}
          <defs>
            <pattern id="sideGrid" width="40" height="25" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 25" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect x="10" y="50" width="380" height="200" fill="url(#sideGrid)" />
          
          {/* 센서 위치 */}
          {sensors.map((sensor) => {
            const sensorX = 10 + (sensor.x / 100) * 380;
            const sensorY = 250 - (sensor.z / 100) * 200;
            const sensorInfo = getSensorInfo(sensor.sensor_type);
            const isCurrentDragging = dragSensor === sensor.sensor_id;
            
            return (
              <g key={sensor.sensor_id}>
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
                <text
                  x={sensorX}
                  y={sensorY + 4}
                  textAnchor="middle"
                  className="text-xs pointer-events-none select-none"
                >
                  {sensorInfo.icon}
                </text>
                <line
                  x1={sensorX}
                  y1={sensorY}
                  x2={sensorX}
                  y2="250"
                  stroke={getSensorColor(sensor)}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />
                <text
                  x={sensorX}
                  y={sensorY - 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-700 font-medium pointer-events-none select-none"
                >
                  {sensor.device_name}-{sensorInfo.label}
                </text>
                {selectedSensor === sensor.sensor_id && (
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
          <text x="0" y="255" className="text-xs fill-gray-500 select-none">0m</text>
          <text x="0" y="60" className="text-xs fill-gray-500 select-none">{config.height}m</text>
          <text x="20" y="305" className="text-xs fill-gray-500 select-none">0m</text>
          <text x="380" y="305" className="text-xs fill-gray-500 select-none">{config.width}m</text>
        </svg>
        
        {/* 드래그 안내 */}
        {isDragging && (
          <div className="absolute top-0 right-0 bg-green-100 border border-green-300 rounded-lg p-2 text-sm">
            <p className="font-medium text-green-800">🎯 드래그 중...</p>
            <p className="text-green-700">원하는 위치에서 마우스를 놓으세요</p>
          </div>
        )}
        
        {/* 선택된 센서 안내 */}
        {selectedSensor && !isDragging && (
          <div className="absolute top-0 right-0 bg-yellow-100 border border-yellow-300 rounded-lg p-2 text-sm">
            <p className="font-medium text-yellow-800">
              {(() => {
                const sensor = sensors.find(s => s.sensor_id === selectedSensor);
                const sensorInfo = sensor ? getSensorInfo(sensor.sensor_type) : null;
                return sensor && sensorInfo ? `${sensor.device_name}-${sensorInfo.label}` : '';
              })()} 선택됨
            </p>
            <p className="text-yellow-700">드래그하여 위치 변경</p>
          </div>
        )}
      </div>
      

      
      {/* 높이 정보 카드 - 2x3 그리드 */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
        {sensors.map((sensor) => {
          const sensorInfo = getSensorInfo(sensor.sensor_type);
          const isSelected = selectedSensor === sensor.sensor_id;
          
          return (
            <div key={sensor.sensor_id} className="space-y-1">
              <div
                className={`p-2 rounded border text-xs cursor-pointer transition-all hover:shadow-md ${
                  isSelected 
                    ? 'bg-yellow-50 border-yellow-300 shadow-md' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={(e) => handleCardClick(sensor.sensor_id, e)}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getSensorColor(sensor) }}
                  />
                  <span className="font-medium">{sensor.device_name}</span>
                  <span className="text-gray-500">{sensorInfo.icon}{sensorInfo.label}</span>
                  {isSelected && (
                    <span className="text-yellow-600 font-medium">✓</span>
                  )}
                </div>
                <div className="text-gray-600 mt-1">
                  X: {((sensor.x / 100) * config.width).toFixed(1)}m, 
                  높이: {((sensor.z / 100) * config.height).toFixed(1)}m
                </div>
              </div>
              
              {/* 편집 컨트롤 */}
              {isSelected && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                  <h6 className="text-sm font-medium text-blue-800 mb-2">위치 편집</h6>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      가로: {sensor.x.toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sensor.x}
                      onChange={(e) => onSensorUpdate(sensor.sensor_id, { x: Number(e.target.value) })}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      높이: {sensor.z.toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sensor.z}
                      onChange={(e) => onSensorUpdate(sensor.sensor_id, { z: Number(e.target.value) })}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={sensor.x.toFixed(1)}
                      onChange={(e) => onSensorUpdate(sensor.sensor_id, { x: Number(e.target.value) })}
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                      placeholder="X %"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100" 
                      step="0.1"
                      value={sensor.z.toFixed(1)}
                      onChange={(e) => onSensorUpdate(sensor.sensor_id, { z: Number(e.target.value) })}
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                      placeholder="Z %"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

SideView.displayName = 'SideView';

export default SideView;