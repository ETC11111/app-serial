// DeviceListHeader.tsx - PNG 아이콘 버전
import React, { memo, useState } from 'react';
import { Link } from 'react-router-dom';

// 🔥 아이콘 컴포넌트 추가
const Icon: React.FC<{ 
  name: string; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ name, size = 'md', className = '' }) => {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  if (!imageError) {
    return (
      <img 
        src={`/${name}.png`} 
        alt={name}
        className={`${sizeClasses[size]} ${className} object-contain`}
        onError={() => setImageError(true)}
      />
    );
  }

  // 폴백 텍스트
  const fallbackText = {
    'device': 'DEV',
    'add': '+',
    'plusIcon': '+'
  }[name] || name.slice(0, 3).toUpperCase();

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className} bg-gray-200 rounded text-xs font-bold text-gray-600`}>
      {fallbackText}
    </span>
  );
};

interface DeviceListHeaderProps {
  deviceStats: {
    total: number;
    online: number;
    favorites: number;
  };
  groupsCount: number;
  viewMode: 'individual' | 'groups';
  onViewModeChange: (mode: 'individual' | 'groups') => void;
  ungroupedDevicesCount: number;
  onShowGroupModal: () => void;
  loading: boolean;
}

export const DeviceListHeader = memo<DeviceListHeaderProps>(({
  deviceStats,
  groupsCount,
  viewMode,
  onViewModeChange,
  ungroupedDevicesCount,
  onShowGroupModal,
  loading
}) => {
  return (
    <header className="bg-gray-100 rounded-xl shadow-sm p-4 mb-4">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Icon name="device" size="lg" />
          <h1 className="text-xl font-bold text-gray-800">
            내 장치
          </h1>
        </div>
        
        {/* 통계 표시 */}
        {!loading && deviceStats.total > 0 && (
          <div className="flex justify-center space-x-4 text-sm text-gray-600 mb-4">
            <span>총 {deviceStats.total}개</span>
            <span>온라인 {deviceStats.online}개</span>
            <span>즐겨찾기 {deviceStats.favorites}개</span>
            <span>그룹 {groupsCount}개</span>
          </div>
        )}
      </div>
      
      {/* 보기 모드 선택 */}
      <div className="flex bg-gray-200 rounded-lg p-1 mb-4" role="tablist">
        <button
          onClick={() => onViewModeChange('individual')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'individual'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          role="tab"
          aria-selected={viewMode === 'individual'}
          aria-controls="device-content"
        >
          개별 보기
        </button>
        <button
          onClick={() => onViewModeChange('groups')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'groups'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          role="tab"
          aria-selected={viewMode === 'groups'}
          aria-controls="device-content"
        >
          그룹 보기
        </button>
      </div>
      
      {/* 액션 버튼들 */}
      <div className="space-y-2">
        <button
          onClick={onShowGroupModal}
          className="flex items-center justify-center space-x-2 w-full bg-green-500 text-white py-3 rounded-lg font-medium hover:bg-green-600 focus:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={ungroupedDevicesCount < 2}
          title={ungroupedDevicesCount < 2 ? "그룹을 만들려면 최소 2개의 디바이스가 필요합니다" : ""}
        >
          <Icon name="add" size="sm" />
          <span>그룹 만들기 {ungroupedDevicesCount >= 2 && `(${ungroupedDevicesCount}개 사용 가능)`}</span>
        </button>
        
        <Link
          to="/device-setup"
          className="flex items-center justify-center space-x-2 w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 focus:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors shadow-sm"
        >
          <Icon name="plusIcon" size="sm" />
          <span>새 장치 추가</span>
        </Link>
      </div>
    </header>
  );
});

DeviceListHeader.displayName = 'DeviceListHeader';