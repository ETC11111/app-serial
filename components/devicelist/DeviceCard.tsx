// DeviceCard.tsx - PNG 아이콘 버전
import React, { memo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Device, DeviceGroup } from '../../types/device.types';

// 🔥 아이콘 컴포넌트 추가
const Icon: React.FC<{ 
  name: string; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ name, size = 'md', className = '' }) => {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4', 
    lg: 'w-5 h-5'
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
    'chart': 'CH',
    'settings': 'SET',
    'human': 'USR',
    'add': '+',
    'device': 'DEV'
  }[name] || name.slice(0, 2).toUpperCase();

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className} bg-gray-200 rounded text-xs font-bold text-gray-600`}>
      {fallbackText}
    </span>
  );
};

interface DeviceCardProps {
  device: Device;
  showGroupBadge?: boolean;
  onToggleFavorite: (deviceId: string) => Promise<void>;
  getDeviceStatusColor: (device: Device) => string;
  getDeviceStatusText: (device: Device) => string;
  favoriteTogglingDevices: Set<string>;
  groups: DeviceGroup[];
}

export const DeviceCard = memo<DeviceCardProps>(({ 
  device, 
  showGroupBadge = false,
  onToggleFavorite,
  getDeviceStatusColor,
  getDeviceStatusText,
  favoriteTogglingDevices,
  groups
}) => {
  // 🔥 그룹 정보 메모이제이션
  const group = React.useMemo(() => {
    return groups.find(g => g.device_ids.includes(device.device_id));
  }, [groups, device.device_id]);

  // 🔥 상태 계산 메모이제이션
  const statusColor = React.useMemo(() => {
    return getDeviceStatusColor(device);
  }, [getDeviceStatusColor, device]);

  const statusText = React.useMemo(() => {
    return getDeviceStatusText(device);
  }, [getDeviceStatusText, device]);

  // 🔥 즐겨찾기 토글 핸들러
  const handleFavoriteToggle = useCallback(() => {
    onToggleFavorite(device.device_id);
  }, [onToggleFavorite, device.device_id]);

  // 🔥 로딩 상태 확인
  const isToggling = favoriteTogglingDevices.has(device.device_id);

  // 🔥 날짜 포맷팅 메모이제이션
  const formattedCreatedDate = React.useMemo(() => {
    return new Date(device.created_at).toLocaleDateString('ko-KR');
  }, [device.created_at]);

  const formattedLastSeenDate = React.useMemo(() => {
    return device.last_seen_at 
      ? new Date(device.last_seen_at).toLocaleDateString('ko-KR')
      : null;
  }, [device.last_seen_at]);

  return (
    <article 
      className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-200 relative h-full flex flex-col"
      aria-label={`디바이스 ${device.device_name}`}
    >
      {/* 상단: 즐겨찾기 + 상태 + 그룹 배지 */}
      <div className="flex justify-between items-start mb-2">
        <button
          onClick={handleFavoriteToggle}
          disabled={isToggling}
          className={`p-1 hover:scale-110 transition-transform z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded ${
            isToggling ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
          }`}
          aria-label={device.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          aria-pressed={device.is_favorite}
          title={device.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {isToggling ? (
            <Icon name="refresh" size="md" className="animate-spin" />
          ) : device.is_favorite ? (
            <span className="text-yellow-500 text-lg">★</span>
          ) : (
            <span className="text-gray-400 text-lg">☆</span>
          )}
        </button>
        
        <div className="flex flex-col items-end space-y-1">
          {/* 상태 표시 */}
          <div className="flex items-center" role="status" aria-label={`디바이스 상태: ${statusText}`}>
            <div 
              className={`w-2 h-2 rounded-full ${statusColor} mr-1`}
              aria-hidden="true"
            />
            <span className="text-xs text-gray-500">{statusText}</span>
          </div>
          
          {/* 그룹 배지 */}
          {showGroupBadge && group && (
            <span 
              className="px-2 py-1 text-xs rounded-full text-white font-medium"
              style={{ backgroundColor: group.color }}
              title={`그룹: ${group.group_name}`}
              role="badge"
            >
              {group.group_name}
            </span>
          )}
        </div>
      </div>
      
      {/* 중앙: 디바이스 정보 */}
      <div className="flex-1 text-center mb-3">
        <h3 className="font-semibold text-gray-800 text-sm mb-1 leading-tight">
          {device.device_name}
        </h3>
        <p className="text-xs text-gray-500 font-mono mb-1 break-all">
          {device.device_id}
        </p>
        {device.admin_name && (
          <div className="flex items-center justify-center space-x-1 mb-1" title={`관리자: ${device.admin_name}`}>
            <Icon name="human" size="sm" />
            <span className="text-xs text-gray-500">{device.admin_name}</span>
          </div>
        )}
        <time 
          className="text-xs text-gray-400 block"
          dateTime={device.created_at}
          title={`등록일: ${formattedCreatedDate}`}
        >
          등록: {formattedCreatedDate}
        </time>
        {formattedLastSeenDate && (
          <time 
            className="text-xs text-gray-400 block"
            dateTime={device.last_seen_at}
            title={`마지막 접속: ${formattedLastSeenDate}`}
          >
            마지막: {formattedLastSeenDate}
          </time>
        )}
      </div>
      
      {/* 하단: 액션 버튼들 */}
      <nav className="space-y-2" role="navigation" aria-label="디바이스 액션">
        <Link
          to={`/sensors/${device.device_id}`}
          className="flex items-center justify-center space-x-2 w-full bg-green-500 text-white py-2 rounded-lg text-xs font-medium hover:bg-green-600 focus:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
          aria-label={`${device.device_name} 센서 데이터 보기`}
        >
          <Icon name="chart" size="sm" />
          <span>센서보기</span>
        </Link>
        <Link
          to={`/devices/${device.device_id}/settings`}
          className="flex items-center justify-center space-x-2 w-full bg-gray-400 text-white py-2 rounded-lg text-xs font-medium hover:bg-gray-500 focus:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 transition-colors"
          aria-label={`${device.device_name} 설정`}
        >
          <Icon name="settings" size="sm" />
          <span>설정</span>
        </Link>
      </nav>
    </article>
  );
});

DeviceCard.displayName = 'DeviceCard';