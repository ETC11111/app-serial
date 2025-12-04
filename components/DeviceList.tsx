// DeviceList.tsx - 간소화된 디바이스 상태 로직 적용 버전
import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Layout from './Layout';
import { GroupCreateModal } from './GroupCreateModal';
import { GroupEditModal } from './GroupEditModal';
import useDeviceGroups from '../hooks/useDeviceGroups';
import { deviceService } from '../services/deviceService';
import { Device, DeviceGroup } from '../types/device.types';
import { useDevices } from '../contexts/DeviceContext';
import { FlexibleSensorData } from '../types/sensor.types';

// 장치-스트림 연결 관리 컴포넌트 import
import DeviceStreamManager from './DeviceStreamManager';

// 타입 정의들
interface IconProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// 🔥 간소화된 디바이스 상태 타입
interface DeviceStatusProps {
  status: 'online' | 'offline' | 'unknown';
}

interface DeviceTableHeaderProps {
  sortConfig: { key: string; direction: 'asc' | 'desc' };
  onSort: (key: string) => void;
}

interface DeviceStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDevice: Device;
}

interface DropdownMenuProps {
  device: Device;
  group?: DeviceGroup;
  canCreateGroup: boolean;
  onOpenSettings: (device: Device) => void;
  onEditGroup: (group: DeviceGroup) => void;
  onCreateGroup: () => void;
  onOpenStreamConnection: (device: Device) => void;
  onToggleGroupFavorite?: (groupId: string) => void;
  favoriteGroups: Record<string, boolean>;
}

interface DeviceRowProps {
  device: Device;
  index: number;
  group?: DeviceGroup;
  deviceStatus: 'online' | 'offline' | 'unknown';
  onToggleFavorite: (deviceId: string) => void;
  favoriteTogglingDevices: Set<string>;
  onOpenSettings: (device: Device) => void;
  onEditGroup: (group: DeviceGroup) => void;
  onCreateGroup: () => void;
  ungroupedDevicesCount: number;
  onOpenStreamConnection: (device: Device) => void;
  onToggleGroupFavorite?: (groupId: string) => void;
  favoriteGroups: Record<string, boolean>;
  // 🔥 실시간 데이터 상태 표시용
  hasRecentData?: boolean;
}

interface DeviceSettingsModalProps {
  device: Device;
  isOpen: boolean;
  onClose: () => void;
  onUpdateDevice: (deviceId: string, deviceData: any) => Promise<boolean>;
  onDeleteDevice: (deviceId: string) => Promise<boolean>;
}

// DeviceStreamManager props 타입 (임시)
interface DeviceStreamManagerProps {
  initialSelectedDevice?: Device;
  showDeviceSelector?: boolean;
}

// 🔥 DeviceList 메인 컴포넌트 Props 확장
interface DeviceListProps {
  // 🔥 실시간 데이터는 이제 Context에서 가져옴 (하위 호환성을 위해 유지)
  deviceLatestDataMap?: Record<string, FlexibleSensorData | null>;
}

// 아이콘 컴포넌트
const Icon: React.FC<IconProps> = ({ name, size = 'md', className = '' }) => {
  const [imageError, setImageError] = useState(false);

  const sizeClasses: Record<string, string> = {
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

  const fallbackText: Record<string, string> = {
    'warning': '!',
    'error': 'X',
    'refresh': 'R',
    'home': 'H',
    'device': 'D',
    'add': '+',
    'plusIcon': '+',
    'success': 'OK'
  };

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className} bg-gray-200 rounded text-xs font-bold text-gray-600`}>
      {fallbackText[name] || name.slice(0, 2).toUpperCase()}
    </span>
  );
};

// 🔥 간소화된 디바이스 상태 컴포넌트
const DeviceStatus = React.memo<DeviceStatusProps>(({ status }) => {
  const statusConfig = {
    'online': { bg: 'bg-green-100', text: 'text-green-800', label: '온라인', dot: 'bg-green-400' },
    'offline': { bg: 'bg-red-100', text: 'text-red-800', label: '오프라인', dot: 'bg-red-400' },
    'unknown': { bg: 'bg-gray-200', text: 'text-gray-800', label: '상태 불명', dot: 'bg-gray-400' }
  };

  const config = statusConfig[status] || statusConfig['unknown'];

  return (
    <div className="flex items-center space-x-2">
      <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-medium min-w-[70px] ${config.bg} ${config.text}`}>
        {config.label}
      </span>
      <div className={`w-2 h-2 rounded-full ${config.dot}`} title={config.label}></div>
    </div>
  );
});

// 테이블 헤더 컴포넌트
const DeviceTableHeader = React.memo<DeviceTableHeaderProps>(({ sortConfig, onSort }) => {
  const getSortIcon = (key: string) => sortConfig.key !== key ? '⌄' : (sortConfig.direction === 'asc' ? '⌃' : '⌄');
  const getSortClass = (key: string) => sortConfig.key === key ? 'text-white' : 'text-gray-200';

  return (
    <div className="bg-blue-500 text-white">
      <div className="hidden lg:block">
        <div className="grid grid-cols-20 gap-2 px-4 py-3 text-sm font-medium">
          <div className="col-span-3 flex items-center space-x-1">
            <button onClick={() => onSort('device_id')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>Device ID</span>
              <span className={`text-xs ${getSortClass('device_id')}`}>{getSortIcon('device_id')}</span>
            </button>
          </div>
          <div className="col-span-2 flex items-center space-x-1">
            <button onClick={() => onSort('created_at')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>등록일</span>
              <span className={`text-xs ${getSortClass('created_at')}`}>{getSortIcon('created_at')}</span>
            </button>
          </div>
          <div className="col-span-4 flex items-center space-x-1">
            <button onClick={() => onSort('device_name')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>디바이스명</span>
              <span className={`text-xs ${getSortClass('device_name')}`}>{getSortIcon('device_name')}</span>
            </button>
          </div>
          <div className="col-span-3 flex items-center space-x-1">
            <button onClick={() => onSort('device_location')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>위치</span>
              <span className={`text-xs ${getSortClass('device_location')}`}>{getSortIcon('device_location')}</span>
            </button>
          </div>
          <div className="col-span-2 flex items-center space-x-1">
            <button onClick={() => onSort('group')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>그룹</span>
              <span className={`text-xs ${getSortClass('group')}`}>{getSortIcon('group')}</span>
            </button>
          </div>
          <div className="col-span-6 flex items-center space-x-1">
            <button onClick={() => onSort('status')} className="flex items-center space-x-1 hover:text-green-200 transition-colors">
              <span>장치 상태 및 액션</span>
              <span className={`text-xs ${getSortClass('status')}`}>{getSortIcon('status')}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="lg:hidden px-4 py-3 text-sm font-medium">
        <div className="flex items-center justify-between">
          <span>Device ID</span>
          <span>장치 상태 및 액션</span>
        </div>
      </div>
    </div>
  );
});

// 장치-스트림 연결 모달 컴포넌트
const DeviceStreamModal: React.FC<DeviceStreamModalProps> = ({ isOpen, onClose, selectedDevice }) => {
  if (!isOpen || !selectedDevice) return null;

  // DeviceStreamManager를 임시로 div로 대체 (실제 컴포넌트가 없을 경우)
  const DeviceStreamManagerComponent = DeviceStreamManager as React.ComponentType<DeviceStreamManagerProps>;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl h-[90vh] overflow-hidden shadow-2xl">
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">🔗 장치-스트림 연결 관리</h2>
            <p className="text-blue-100 text-sm mt-1 truncate">
              {selectedDevice.device_name} (#{selectedDevice.device_id})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 text-2xl font-bold transition-colors ml-4 flex-shrink-0"
          >
            ✕
          </button>
        </div>
        <div className="p-6 h-full overflow-y-auto">
          <DeviceStreamManagerComponent
            initialSelectedDevice={selectedDevice}
            showDeviceSelector={false}
          />
        </div>
      </div>
    </div>
  );
};

// 드롭다운 메뉴 컴포넌트
const DropdownMenu: React.FC<DropdownMenuProps> = ({
  device,
  group,
  canCreateGroup,
  onOpenSettings,
  onEditGroup,
  onCreateGroup,
  onOpenStreamConnection,
  onToggleGroupFavorite,
  favoriteGroups
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      if (isOpen) {
        updatePosition();
      }
    };

    const handleResize = () => {
      if (isOpen) {
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      setPosition({
        top: rect.bottom + scrollTop + 4,
        right: window.innerWidth - (rect.right + scrollLeft)
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleMenuClick = (action: string) => {
    console.log('메뉴 액션:', action, device.device_id);
    setIsOpen(false);

    switch (action) {
      case 'settings':
        onOpenSettings(device);
        break;
      case 'editGroup':
        if (group) onEditGroup(group);
        break;
      case 'createGroup':
        onCreateGroup();
        break;
      case 'streamConnection':
        onOpenStreamConnection(device);
        break;
      case 'toggleGroupFavorite':
        if (group && onToggleGroupFavorite) {
          onToggleGroupFavorite(group.group_id);
        }
        break;
    }
  };

  const isGroupFavorite = group && favoriteGroups[group.group_id];

  return (
    <>
      <div className="relative" ref={buttonRef}>
        <button
          onClick={handleToggle}
          className="text-gray-400 hover:text-gray-600 px-2 transition-colors"
          type="button"
        >
          <span className="text-lg">⋯</span>
        </button>
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999]"
          style={{
            top: `${position.top}px`,
            right: `${position.right}px`,
            maxHeight: 'calc(100vh - 20px)',
            overflowY: 'auto'
          }}
        >
          <div className="py-1">
            <button
              onClick={() => handleMenuClick('streamConnection')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
            >
              <img src="/cctv.png" alt="CCTV" className="w-4 h-4" />
              스트림 연결 관리
            </button>

            <div className="border-t border-gray-100"></div>

            {group && (
              <button
                onClick={() => handleMenuClick('toggleGroupFavorite')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {isGroupFavorite ? '⭐ 그룹 즐겨찾기 해제' : '☆ 그룹 즐겨찾기 추가'}
              </button>
            )}

            {group ? (
              <button
                onClick={() => handleMenuClick('editGroup')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
              >
                <img src="/edit.png" alt="그룹 편집" className="w-4 h-4" />
                그룹 편집
              </button>
            ) : (
              <button
                onClick={() => handleMenuClick('createGroup')}
                disabled={!canCreateGroup}
                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${canCreateGroup
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-400 cursor-not-allowed'
                  }`}
              >
                <img src="/plusIcon.png" alt="그룹 추가" className="w-4 h-4" />
                그룹 추가
              </button>
            )}

            <div className="border-t border-gray-100"></div>
          </div>
        </div>
      )}
    </>
  );
};

// 🔥 개선된 디바이스 행 컴포넌트
const DeviceRow = React.memo<DeviceRowProps>(({
  device,
  index,
  group,
  deviceStatus,
  onToggleFavorite,
  favoriteTogglingDevices,
  onOpenSettings,
  onEditGroup,
  onCreateGroup,
  ungroupedDevicesCount,
  onOpenStreamConnection,
  onToggleGroupFavorite,
  favoriteGroups,
  hasRecentData = false
}) => {
  const handleToggleFavorite = () => onToggleFavorite(device.device_id);
  const handleOpenSettings = () => {
    console.log('설정 버튼 클릭:', device.device_id);
    onOpenSettings(device);
  };

  const isToggling = favoriteTogglingDevices.has(device.device_id);
  const canCreateGroup = ungroupedDevicesCount >= 2;
  const isGroupFavorite = group && favoriteGroups[group.group_id];

  return (
    <>
      {/* 데스크톱 행 */}
      <div className={`hidden lg:grid grid-cols-20 gap-2 px-4 py-3 text-sm border-b border-gray-200 hover:bg-gray-200 transition-colors ${index % 2 === 0 ? 'bg-gray-100' : 'bg-gray-150'
        }`}>
        <div className="col-span-3 font-mono text-blue-600 flex items-center space-x-2">
          <button
            onClick={handleToggleFavorite}
            disabled={isToggling}
            className={`text-lg hover:scale-110 transition-transform ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={device.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            {isToggling ? (
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            ) : device.is_favorite ? '⭐' : '☆'}
          </button>
          <span className="truncate">#{device.device_id}</span>
          {/* 🔥 실시간 데이터 표시 */}
          {hasRecentData && deviceStatus === 'online' && (
            <span className="text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded" title="실시간 데이터 수신 중">
              LIVE
            </span>
          )}
        </div>

        <div className="col-span-2 text-gray-600 text-xs">
          <div className="truncate">{new Date(device.created_at).toLocaleDateString('ko-KR')}</div>
          <div className="text-xs text-gray-400 truncate">
            {new Date(device.created_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>

        <div className="col-span-4 font-medium text-gray-800">
          <div className="font-semibold truncate">{device.device_name}</div>
          {device.admin_name && (
            <div className="text-xs text-gray-500 truncate">관리자: {device.admin_name}</div>
          )}
        </div>

        <div className="col-span-3 text-gray-600 text-xs">
          <span className="truncate">{device.device_location || '위치 미설정'}</span>
        </div>

        <div className="col-span-2 flex items-center">
          {group ? (
            <div className="flex items-center space-x-1">
              {isGroupFavorite && (
                <span className="text-yellow-500 text-sm" title="즐겨찾기 그룹">⭐</span>
              )}
              <Link
                to={`/group-sensors/${group.group_id}`}
                className="px-2 py-1 text-xs rounded-full text-white font-medium hover:opacity-80 transition-opacity cursor-pointer truncate max-w-full"
                style={{ backgroundColor: group.color }}
                title={`${group.group_name} 그룹 대시보드 보기`}
              >
                {group.group_name}
              </Link>
            </div>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-500 font-medium truncate">
              그룹 없음
            </span>
          )}
        </div>

        <div className="col-span-6 flex items-center space-x-2">
          <DeviceStatus status={deviceStatus} />
          <div className="flex items-center space-x-1">
            <Link
              to={`/sensors/${device.device_id}`}
              className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 transition-colors font-medium"
            >
              센서보기
            </Link>
            <button
              onClick={handleOpenSettings}
              className="bg-gray-500 text-white px-3 py-1 rounded text-xs hover:bg-gray-600 transition-colors font-medium"
              type="button"
            >
              설정
            </button>
            <DropdownMenu
              device={device}
              group={group}
              canCreateGroup={canCreateGroup}
              onOpenSettings={onOpenSettings}
              onEditGroup={onEditGroup}
              onCreateGroup={onCreateGroup}
              onOpenStreamConnection={onOpenStreamConnection}
              onToggleGroupFavorite={onToggleGroupFavorite}
              favoriteGroups={favoriteGroups}
            />
          </div>
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className={`lg:hidden border-b border-gray-200 ${index % 2 === 0 ? 'bg-gray-100' : 'bg-gray-150'} w-full min-w-0`}>
        <div className="p-4 w-full min-w-0">
          <div className="flex items-center justify-between mb-3 w-full min-w-0">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <button
                onClick={handleToggleFavorite}
                disabled={isToggling}
                className={`text-lg hover:scale-110 transition-transform flex-shrink-0 ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={device.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              >
                {isToggling ? (
                  <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                ) : device.is_favorite ? '⭐' : '☆'}
              </button>
              <span className="font-mono text-blue-600 font-medium truncate min-w-0">#{device.device_id}</span>
              {/* 🔥 모바일 실시간 데이터 표시 */}
              {hasRecentData && deviceStatus === 'online' && (
                <span className="text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded flex-shrink-0" title="실시간 데이터 수신 중">
                  LIVE
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <DeviceStatus status={deviceStatus} />
              <DropdownMenu
                device={device}
                group={group}
                canCreateGroup={canCreateGroup}
                onOpenSettings={onOpenSettings}
                onEditGroup={onEditGroup}
                onCreateGroup={onCreateGroup}
                onOpenStreamConnection={onOpenStreamConnection}
                onToggleGroupFavorite={onToggleGroupFavorite}
                favoriteGroups={favoriteGroups}
              />
            </div>
          </div>

          <div className="mb-2 w-full min-w-0">
            <h3 className="font-semibold text-gray-800 text-base truncate">{device.device_name}</h3>
            {device.admin_name && (
              <p className="text-sm text-gray-500 truncate">관리자: {device.admin_name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-gray-600 w-full">
            <div className="min-w-0">
              <span className="text-gray-400 block">등록일:</span>
              <span className="truncate block">{new Date(device.created_at).toLocaleDateString('ko-KR')}</span>
            </div>
            <div className="min-w-0">
              <span className="text-gray-400 block">위치:</span>
              <span className="truncate block">{device.device_location || '위치 미설정'}</span>
            </div>
          </div>

          <div className="mb-3 w-full min-w-0">
            {group ? (
              <div className="flex items-center space-x-2 min-w-0">
                {isGroupFavorite && (
                  <span className="text-yellow-500 flex-shrink-0" title="즐겨찾기 그룹">⭐</span>
                )}
                <Link
                  to={`/group-sensors/${group.group_id}`}
                  className="inline-block px-3 py-1 text-xs rounded-full text-white font-medium hover:opacity-80 transition-opacity truncate min-w-0"
                  style={{ backgroundColor: group.color }}
                  title={`${group.group_name} 그룹 대시보드 보기`}
                >
                  {group.group_name}
                </Link>
              </div>
            ) : (
              <span className="inline-block px-3 py-1 text-xs rounded-full bg-gray-200 text-gray-500 font-medium">
                그룹 없음
              </span>
            )}
          </div>

          <div className="flex space-x-2 w-full">
            <Link
              to={`/sensors/${device.device_id}`}
              className="flex-1 bg-green-500 text-white py-2 px-3 rounded text-sm text-center hover:bg-green-600 transition-colors font-medium min-w-0"
            >
              센서보기
            </Link>
            <button
              onClick={handleOpenSettings}
              className="flex-1 bg-gray-500 text-white py-2 px-3 rounded text-sm hover:bg-gray-600 transition-colors font-medium min-w-0"
              type="button"
            >
              설정
            </button>
          </div>
        </div>
      </div>
    </>
  );
});

// 빈 상태 컴포넌트
const EmptyDeviceState = () => {
  return (
    <div className="bg-gray-100 rounded-xl shadow-sm p-8 text-center border border-gray-200 w-full min-w-0">
      <div className="flex justify-center mb-4">
        <Icon name="device" size="lg" className="opacity-50" />
      </div>
      <h3 className="text-xl font-semibold mb-2 text-gray-800">등록된 장치가 없습니다</h3>
      <p className="text-gray-500 mb-6">첫 번째 스마트팜 장치를 추가해보세요!</p>
      <Link
        to="/device-setup"
        className="inline-flex items-center space-x-2 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 focus:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors shadow-sm"
      >
        <Icon name="success" size="sm" />
        <span>첫 번째 장치 추가하기</span>
      </Link>
    </div>
  );
};

// 설정 모달 컴포넌트
const DeviceSettingsModal = React.memo<DeviceSettingsModalProps>(({ device, isOpen, onClose, onUpdateDevice, onDeleteDevice }) => {
  const [deviceName, setDeviceName] = useState(device?.device_name || '');
  const [adminName, setAdminName] = useState(device?.admin_name || '');
  const [deviceLocation, setDeviceLocation] = useState(device?.device_location || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && device) {
      setDeviceName(device.device_name || '');
      setAdminName(device.admin_name || '');
      setDeviceLocation(device.device_location || '');
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  }, [isOpen, device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      alert('디바이스 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await onUpdateDevice(device.device_id, {
        deviceName: deviceName.trim(),
        adminName: adminName.trim() || undefined,
        deviceLocation: deviceLocation.trim() || undefined
      });

      if (success) {
        alert('디바이스 설정이 업데이트되었습니다.');
        onClose();
      } else {
        alert('설정 업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('설정 업데이트 오류:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!device || deleteConfirmText !== device.device_name) {
      alert('디바이스 이름을 정확히 입력해주세요.');
      return;
    }

    setDeleting(true);
    try {
      const success = await onDeleteDevice(device.device_id);
      if (success) {
        alert(`디바이스 "${device.device_name}"가 성공적으로 삭제되었습니다.`);
        onClose();
      } else {
        alert('디바이스 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('디바이스 삭제 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-hidden border border-gray-300">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-200 to-blue-50">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-gray-800">⚙️ 디바이스 설정</h3>
              <p className="text-sm text-gray-600 mt-1 truncate">#{device.device_id} - {device.device_name}</p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting || deleting}
              className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50 transition-colors ml-4 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">디바이스 ID</label>
              <input
                type="text"
                value={device.device_id}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-200 text-gray-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                디바이스 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={isSubmitting || deleting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-200 bg-gray-50"
                placeholder="예: 온실A 온도센서"
                maxLength={255}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">관리자 이름</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                disabled={isSubmitting || deleting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-200 bg-gray-50"
                placeholder="예: 김농부"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">설치 위치</label>
              <input
                type="text"
                value={deviceLocation}
                onChange={(e) => setDeviceLocation(e.target.value)}
                disabled={isSubmitting || deleting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-200 bg-gray-50"
                placeholder="예: 온실 A동 1구역"
                maxLength={255}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">등록일</label>
              <input
                type="text"
                value={new Date(device.created_at).toLocaleString('ko-KR')}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-200 text-gray-500"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mt-8 pt-4 border-t border-gray-200 gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting || deleting}
              className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              🗑️ 디바이스 삭제
            </button>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || deleting}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!deviceName.trim() || isSubmitting || deleting}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    저장 중...
                  </>
                ) : (
                  '💾 저장'
                )}
              </button>
            </div>
          </div>
        </form>

        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 border border-gray-300">
              <h4 className="text-lg font-semibold mb-3 text-red-600">⚠️ 디바이스 삭제 확인</h4>
              <div className="mb-4">
                <p className="text-gray-700 mb-4">
                  정말로 "<strong className="break-words">{device.device_name}</strong>" 디바이스를 삭제하시겠습니까?
                </p>
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                  <p className="text-red-700 text-sm">
                    <strong>주의:</strong> 이 작업은 되돌릴 수 없습니다.
                    디바이스와 관련된 모든 센서 데이터가 영구적으로 삭제됩니다.
                  </p>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  삭제를 확인하려면 디바이스 이름을 정확히 입력해주세요:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={device.device_name}
                  disabled={deleting}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-200 bg-gray-50"
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmText !== device.device_name}
                  className={`px-4 py-2 rounded font-medium transition-colors flex items-center justify-center ${deleting || deleteConfirmText !== device.device_name
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      삭제 중...
                    </>
                  ) : (
                    '삭제 확인'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// 🔥 메인 DeviceList 컴포넌트 (Props 확장)
const DeviceList: React.FC<DeviceListProps> = ({ deviceLatestDataMap: propDeviceLatestDataMap = {} }) => {
  const {
    devices,
    deviceStats,
    loading,
    error,
    refreshDevices,
    toggleFavorite,
    favoriteTogglingDevices,
    deviceLatestDataMap: contextDeviceLatestDataMap
  } = useDevices();
  
  // Context의 데이터를 우선 사용하고, props가 있으면 병합
  const deviceLatestDataMap = Object.keys(contextDeviceLatestDataMap).length > 0 
    ? contextDeviceLatestDataMap 
    : propDeviceLatestDataMap;

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DeviceGroup | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
    key: 'is_favorite', 
    direction: 'desc' 
  });
  const [settingsModalDevice, setSettingsModalDevice] = useState<Device | null>(null);

  // 장치-스트림 연결 모달 상태
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [streamModalDevice, setStreamModalDevice] = useState<Device | null>(null);

  // 그룹 즐겨찾기 상태
  const [favoriteGroups, setFavoriteGroups] = useState<Record<string, boolean>>({});

  const {
    groups,
    createGroup,
    deleteGroup,
    updateGroup,
    getUngroupedDevices
  } = useDeviceGroups();

  // 컴포넌트 마운트 시 로컬스토리지에서 그룹 즐겨찾기 정보 로드
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem('groupFavorites');
      if (savedFavorites) {
        setFavoriteGroups(JSON.parse(savedFavorites));
      }
    } catch (error) {
      console.error('그룹 즐겨찾기 로드 오류:', error);
      setFavoriteGroups({});
    }
  }, []);

  // 🔥 SensorDashboardContent와 동일한 간소화된 디바이스 상태 판단 로직
  const getDeviceStatusText = useCallback((device: Device): 'online' | 'offline' | 'unknown' => {
    // 1순위: 실시간 데이터 확인 (최근 5분 이내)
    const latestData = deviceLatestDataMap[device.device_id];
    if (latestData) {
      const dataTime = typeof latestData.timestamp === 'string' 
        ? new Date(latestData.timestamp).getTime()
        : latestData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      if (diffMinutes < 1) {
        console.log(`📍 ${device.device_name} 온라인 (실시간 데이터): ${diffMinutes.toFixed(1)}분 전`);
        return 'online';
      }
    }

    // 2순위: 디바이스 상태 필드 확인
    if (device.status === 'online') {
      return 'online';
    }

    // 3순위: last_seen_at 기반 판단 (fallback)
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
      
      if (diffMinutes < 1) {
        return 'online';
      }
      
      // 5분 이상이면 오프라인
      return 'offline';
    }

    // 기본값: unknown
    return 'unknown';
  }, [deviceLatestDataMap]);

  // 🔥 실시간 데이터 존재 여부 확인 함수
  const hasRecentData = useCallback((device: Device): boolean => {
    const latestData = deviceLatestDataMap[device.device_id];
    if (!latestData) return false;

    const dataTime = typeof latestData.timestamp === 'string' 
      ? new Date(latestData.timestamp).getTime()
      : latestData.timestamp;
    const now = Date.now();
    const diffMinutes = (now - dataTime) / (1000 * 60);
    
    return diffMinutes < 1;
  }, [deviceLatestDataMap]);

  const getDeviceGroup = useCallback((deviceId: string): DeviceGroup | undefined => {
    return groups.find(group => group.device_ids.includes(deviceId));
  }, [groups]);

  const handleSort = useCallback((key: string) => {
    setSortConfig(prevSort => ({
      key,
      direction: prevSort.key === key && prevSort.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const sortedDevices = useMemo(() => {
    const sorted = [...devices].sort((a, b) => {
      if (sortConfig.key === 'is_favorite') {
        const aFav = a.is_favorite || false;
        const bFav = b.is_favorite || false;
        if (aFav !== bFav) return bFav ? 1 : -1;
        const aOnline = getDeviceStatusText(a) === 'online';
        const bOnline = getDeviceStatusText(b) === 'online';
        if (aOnline !== bOnline) return bOnline ? 1 : -1;
        return a.device_name.localeCompare(b.device_name);
      }

      let aValue: any, bValue: any;
      switch (sortConfig.key) {
        case 'device_id':
          aValue = a.device_id;
          bValue = b.device_id;
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'device_name':
          aValue = a.device_name;
          bValue = b.device_name;
          break;
        case 'device_location':
          aValue = a.device_location || '';
          bValue = b.device_location || '';
          break;
        case 'group':
          const aGroup = getDeviceGroup(a.device_id);
          const bGroup = getDeviceGroup(b.device_id);
          aValue = aGroup ? aGroup.group_name : '';
          bValue = bGroup ? bGroup.group_name : '';
          break;
        case 'status':
          aValue = getDeviceStatusText(a);
          bValue = getDeviceStatusText(b);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [devices, sortConfig, getDeviceStatusText, getDeviceGroup]);

  const ungroupedDevices = useMemo(() => {
    return getUngroupedDevices(devices);
  }, [devices, getUngroupedDevices]);

  // 이벤트 핸들러들 (기존과 동일)
  const handleToggleFavorite = useCallback(async (deviceId: string) => {
    console.log('장치 즐겨찾기 토글:', deviceId);
    try {
      const success = await toggleFavorite(deviceId);
      if (success) {
        toast.success('즐겨찾기가 변경되었습니다.');
      } else {
        toast.error('즐겨찾기 설정에 실패했습니다.');
      }
    } catch (error) {
      console.error('즐겨찾기 토글 오류:', error);
      toast.error('오류가 발생했습니다. 다시 시도해주세요.');
    }
  }, []);

  // 그룹 즐겨찾기 토글 핸들러
  const handleToggleGroupFavorite = useCallback((groupId: string) => {
    console.log('그룹 즐겨찾기 토글:', groupId);

    setFavoriteGroups(prevFavorites => {
      const updatedFavorites = {
        ...prevFavorites,
        [groupId]: !prevFavorites[groupId]
      };

      // 로컬스토리지에 저장
      try {
        localStorage.setItem('groupFavorites', JSON.stringify(updatedFavorites));

        // 성공 메시지 표시
        const group = groups.find(g => g.group_id === groupId);
        if (group) {
          if (updatedFavorites[groupId]) {
            toast.success(`"${group.group_name}" 그룹이 즐겨찾기에 추가되었습니다.`);
          } else {
            toast.success(`"${group.group_name}" 그룹이 즐겨찾기에서 제거되었습니다.`);
          }
        }
      } catch (error) {
        console.error('그룹 즐겨찾기 저장 오류:', error);
        toast.error('즐겨찾기 설정 저장에 실패했습니다.');
        return prevFavorites; // 오류 시 이전 상태 유지
      }

      return updatedFavorites;
    });
  }, [groups]);

  const handleOpenSettings = useCallback((device: Device) => {
    console.log('설정 모달 열기:', device.device_id);
    setSettingsModalDevice(device);
  }, []);

  const handleEditGroup = useCallback((group: DeviceGroup) => {
    console.log('그룹 편집:', group.group_id);
    setEditingGroup(group);
    setShowEditModal(true);
  }, []);

  const handleCreateGroup = useCallback(() => {
    console.log('그룹 생성 모달 열기');
    setShowGroupModal(true);
  }, []);

  // 장치-스트림 연결 모달 핸들러
  const handleOpenStreamConnection = useCallback((device: Device) => {
    console.log('장치-스트림 연결 모달 열기:', device.device_id);
    setStreamModalDevice(device);
    setShowStreamModal(true);
  }, []);

  const handleCloseStreamModal = useCallback(() => {
    setShowStreamModal(false);
    setStreamModalDevice(null);
  }, []);

  const handleUpdateDevice = useCallback(async (deviceId: string, deviceData: any): Promise<boolean> => {
    try {
      const result = await deviceService.updateDevice(deviceId, {
        deviceName: deviceData.deviceName,
        adminName: deviceData.adminName || undefined,
        deviceLocation: deviceData.deviceLocation || undefined
      });

      if (result.success) {
        await refreshDevices();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('디바이스 업데이트 오류:', error);
      return false;
    }
  }, [refreshDevices]);

  const handleDeleteDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    try {
      const result = await deviceService.deleteDevice(deviceId);
      if (result.success) {
        await refreshDevices();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('디바이스 삭제 오류:', error);
      return false;
    }
  }, [refreshDevices]);

  // 로딩 및 에러 상태
  if (loading) {
    return (
      <Layout maxWidth="wide" padding="md" background="gray">
        <div className="flex justify-center items-center min-h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">장치 목록 로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout maxWidth="wide" padding="md" background="gray">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="flex justify-center mb-4">
            <Icon name="error" size="lg" className="text-red-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-red-800">연결 오류</h3>
          <p className="text-red-600 mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4">
            <button
              onClick={refreshDevices}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
            >
              <Icon name="refresh" size="sm" />
              <span>다시 시도</span>
            </button>
            <Link
              to="/"
              className="bg-gray-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
            >
              <Icon name="home" size="sm" />
              <span>홈으로</span>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout maxWidth="wide" padding="md" background="gray">
      {/* 페이지 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 w-full min-w-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <img src="/device.png" alt="Device Icon" className="w-6 h-6 flex-shrink-0" />
            <h1 className="text-2xl font-bold text-gray-800 truncate">장치 목록</h1>
          </div>
          {/* 🔥 수동 새로고침 버튼 */}
          <button
            onClick={() => refreshDevices(true)}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="장치 목록 새로고침"
          >
            <Icon name="refresh" size="sm" className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
        <p className="text-gray-600 mb-4">모든 장치와 그룹을 관리하세요</p>
        {/* 🔥 실시간 데이터 요약 정보 */}
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>전체 장치: {devices.length}개</span>
          <span className="text-green-600">
            온라인: {devices.filter(d => getDeviceStatusText(d) === 'online').length}개
          </span>
          <span className="text-red-600">
            오프라인: {devices.filter(d => getDeviceStatusText(d) === 'offline').length}개
          </span>
          {Object.keys(deviceLatestDataMap).length > 0 && (
            <span className="text-blue-600">
              실시간 데이터: {devices.filter(d => hasRecentData(d)).length}개
            </span>
          )}
        </div>
      </div>

      {/* 디바이스 목록 */}
      {sortedDevices.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full min-w-0">
          <DeviceTableHeader sortConfig={sortConfig} onSort={handleSort} />
          <div className="max-h-[600px] overflow-y-auto w-full">
            {sortedDevices.map((device, index) => (
              <DeviceRow
                key={device.device_id}
                device={device}
                index={index}
                group={getDeviceGroup(device.device_id)}
                deviceStatus={getDeviceStatusText(device)}
                onToggleFavorite={handleToggleFavorite}
                favoriteTogglingDevices={favoriteTogglingDevices}
                onOpenSettings={handleOpenSettings}
                onEditGroup={handleEditGroup}
                onCreateGroup={handleCreateGroup}
                ungroupedDevicesCount={ungroupedDevices.length}
                onOpenStreamConnection={handleOpenStreamConnection}
                onToggleGroupFavorite={handleToggleGroupFavorite}
                favoriteGroups={favoriteGroups}
                hasRecentData={hasRecentData(device)} // 🔥 실시간 데이터 존재 여부 전달
              />
            ))}
          </div>
        </div>
      ) : (
        <EmptyDeviceState />
      )}

      {/* 모달들 (기존과 동일) */}
      {showGroupModal && (
        <Suspense fallback={<div>모달 로딩 중...</div>}>
          <GroupCreateModal
            devices={ungroupedDevices}
            onClose={() => setShowGroupModal(false)}
            onCreateGroup={async (groupName: string, description: string, selectedDeviceIds: string[]) => {
              try {
                const success = await createGroup(groupName, description, selectedDeviceIds);
                if (success) {
                  setShowGroupModal(false);
                  await refreshDevices();
                  toast.success(`그룹 "${groupName}"이 성공적으로 생성되었습니다.`);
                } else {
                  toast.error('그룹 생성에 실패했습니다.');
                }
                return success;
              } catch (error) {
                console.error('그룹 생성 오류:', error);
                toast.error('그룹 생성 중 오류가 발생했습니다.');
                return false;
              }
            }}
          />
        </Suspense>
      )}

      {showEditModal && editingGroup && (
        <Suspense fallback={<div>모달 로딩 중...</div>}>
          <GroupEditModal
            group={editingGroup}
            allDevices={devices}
            onClose={() => {
              setShowEditModal(false);
              setEditingGroup(null);
            }}
            onUpdateGroup={async (groupId: string, updates: any) => {
              try {
                const success = await updateGroup(groupId, updates);
                if (success) {
                  setShowEditModal(false);
                  setEditingGroup(null);
                  toast.success('그룹이 성공적으로 수정되었습니다.');
                } else {
                  toast.error('그룹 수정에 실패했습니다.');
                }
              } catch (error) {
                console.error('그룹 수정 오류:', error);
                toast.error('그룹 수정 중 오류가 발생했습니다.');
              }
            }}
            onDeleteGroup={async (groupId: string) => {
              if (!window.confirm('정말로 이 그룹을 삭제하시겠습니까?')) {
                return;
              }
              try {
                const success = await deleteGroup(groupId);
                if (success) {
                  setShowEditModal(false);
                  setEditingGroup(null);

                  // 그룹 삭제 시 로컬스토리지에서도 즐겨찾기 정보 제거
                  setFavoriteGroups(prevFavorites => {
                    const updatedFavorites = { ...prevFavorites };
                    delete updatedFavorites[groupId];
                    localStorage.setItem('groupFavorites', JSON.stringify(updatedFavorites));
                    return updatedFavorites;
                  });

                  toast.success('그룹이 성공적으로 삭제되었습니다.');
                } else {
                  toast.error('그룹 삭제에 실패했습니다.');
                }
              } catch (error) {
                console.error('그룹 삭제 오류:', error);
                toast.error('그룹 삭제 중 오류가 발생했습니다.');
              }
            }}
          />
        </Suspense>
      )}

      {settingsModalDevice && (
        <DeviceSettingsModal
          device={settingsModalDevice}
          isOpen={!!settingsModalDevice}
          onClose={() => setSettingsModalDevice(null)}
          onUpdateDevice={handleUpdateDevice}
          onDeleteDevice={handleDeleteDevice}
        />
      )}

      {/* 장치-스트림 연결 모달 */}
      {showStreamModal && streamModalDevice && (
        <DeviceStreamModal
          isOpen={showStreamModal}
          onClose={handleCloseStreamModal}
          selectedDevice={streamModalDevice}
        />
      )}
    </Layout>
  );
};

export default DeviceList;