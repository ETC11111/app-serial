// src/components/greenhouse/GreenhouseSelector.tsx

import React from 'react';
import { GreenhouseConfig } from './types';

interface GreenhouseSelectorProps {
  config: GreenhouseConfig;
  onConfigChange: (config: GreenhouseConfig) => void;
}

const GreenhouseSelector: React.FC<GreenhouseSelectorProps> = ({
  config,
  onConfigChange
}) => {
  // config가 undefined인 경우 기본값 사용
  const safeConfig = config || {
    type: 'vinyl' as const,
    width: 20,
    length: 50,
    height: 4,
    name: ''
  };

  const handleTypeChange = (type: 'vinyl' | 'glass') => {
    onConfigChange({ ...safeConfig, type });
  };

  const handleDimensionChange = (key: 'width' | 'length' | 'height', value: number) => {
    onConfigChange({ ...safeConfig, [key]: value });
  };

  // config가 없으면 로딩 상태 표시
  if (!config) {
    return (
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-blue-100 rounded-lg animate-pulse"></div>
            <span className="text-gray-500">건물 설정을 로드하는 중...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-lg border border-gray-100 p-6 mb-6">
      {/* 헤더 섹션 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <span className="text-xl">🏠</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-800">건물 설정</h3>
          </div>
        </div>
        
        {/* 온실 타입 선택 */}
        <div className="flex flex-col md:flex-row bg-gray-100 rounded-xl p-1 gap-1 md:gap-0 w-40 md:w-auto">
          <button
            onClick={() => handleTypeChange('vinyl')}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-xs md:text-sm font-medium ${
              safeConfig.type === 'vinyl'
                ? 'bg-white text-green-700 shadow-sm border border-green-200'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="mr-1 md:mr-2">🏠</span>
            건물타입1
          </button>
          <button
            onClick={() => handleTypeChange('glass')}
            className={`px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-xs md:text-sm font-medium ${
              safeConfig.type === 'glass'
                ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span className="mr-1 md:mr-2">🏢</span>
            건물타입2
          </button>
        </div>
      </div>

      {/* 입력 필드들 - 1x3 그리드 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 폭 */}
        <div>
          <label className="flex items-center text-sm font-semibold text-gray-700 mb-3">
            <span className="w-5 h-5 bg-orange-100 rounded-lg flex items-center justify-center mr-2 text-xs">
              ↔️
            </span>
            폭
          </label>
          <div className="relative">
            <input
              type="number"
              value={safeConfig.width}
              onChange={(e) => handleDimensionChange('width', Number(e.target.value))}
              min="1"
              max="100"
              className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 text-gray-800 pr-10"
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-medium">
              m
            </span>
          </div>
        </div>

        {/* 길이 */}
        <div>
          <label className="flex items-center text-sm font-semibold text-gray-700 mb-3">
            <span className="w-5 h-5 bg-green-100 rounded-lg flex items-center justify-center mr-2 text-xs">
              ↕️
            </span>
            길이
          </label>
          <div className="relative">
            <input
              type="number"
              value={safeConfig.length}
              onChange={(e) => handleDimensionChange('length', Number(e.target.value))}
              min="1"
              max="200"
              className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-gray-800 pr-10"
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-medium">
              m
            </span>
          </div>
        </div>

        {/* 높이 */}
        <div>
          <label className="flex items-center text-sm font-semibold text-gray-700 mb-3">
            <span className="w-5 h-5 bg-purple-100 rounded-lg flex items-center justify-center mr-2 text-xs">
              ⬆️
            </span>
            높이
          </label>
          <div className="relative">
            <input
              type="number"
              value={safeConfig.height}
              onChange={(e) => handleDimensionChange('height', Number(e.target.value))}
              min="1"
              max="20"
              step="0.1"
              className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 text-gray-800 pr-10"
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-medium">
              m
            </span>
          </div>
        </div>
      </div>

      {/* 온실 정보 요약 - 간략화 */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-center space-y-2">
          <div className="text-sm text-gray-600">
            치수정보: {safeConfig.width} × {safeConfig.length} × {safeConfig.height}m
          </div>
          <div className="text-sm text-gray-600">
            바닥면적: {(safeConfig.width * safeConfig.length).toFixed(1)}m²
          </div>
          <div className="text-sm text-gray-600">
            부피: {(safeConfig.width * safeConfig.length * safeConfig.height).toFixed(1)}m³
          </div>
        </div>
      </div>
    </div>
  );
};

export default GreenhouseSelector;