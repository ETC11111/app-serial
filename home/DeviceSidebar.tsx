// components/home/DeviceSidebar.tsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

// 타입 정의 (실제 타입 파일이 없는 경우를 대비한 임시 정의)
interface Device {
  device_id: string;
  device_name: string;
  status?: string;
  last_seen?: Date;
  [key: string]: any;
}

interface DeviceGroup {
  id: string;
  name: string;
  devices: Device[];
  [key: string]: any;
}

interface FlexibleSensorData {
  [key: string]: any;
}

interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  [key: string]: any;
}

interface DeviceSidebarProps {
  selectedDevice: Device | null;
  favoriteDevices: Device[];
  deviceStats?: DeviceStats; // optional로 변경
  groups?: DeviceGroup[]; // optional로 변경
  latestData?: FlexibleSensorData | null; // optional로 변경
  lastUpdateTime?: Date | null; // optional로 변경
  sensorLoading?: boolean; // optional로 변경
  statusInfo?: {
    status: string;
    message: string;
    color: string;
    canShowDashboard: boolean;
  }; // optional로 변경
  onDeviceSelect: (device: Device) => void;
  onRefreshData?: () => void; // optional로 변경
  getDeviceStatusColor: (device: Device) => string;
  getDeviceStatusText: (device: Device) => string;
}

const SELECTED_DEVICE_STORAGE_KEY = 'selected-device-id';

export const DeviceSidebar: React.FC<DeviceSidebarProps> = ({
  selectedDevice,
  favoriteDevices,
  deviceStats: _deviceStats, // underscore로 unused 표시
  groups: _groups, // underscore로 unused 표시
  latestData: _latestData, // underscore로 unused 표시
  lastUpdateTime: _lastUpdateTime, // underscore로 unused 표시
  sensorLoading: _sensorLoading, // underscore로 unused 표시
  statusInfo: _statusInfo, // underscore로 unused 표시
  onDeviceSelect,
  onRefreshData: _onRefreshData, // underscore로 unused 표시
  getDeviceStatusColor,
  getDeviceStatusText
}) => {
  // 컴포넌트 마운트 시 저장된 장치 불러오기
  useEffect(() => {
    const savedDeviceId = localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
    
    if (savedDeviceId && !selectedDevice && favoriteDevices.length > 0) {
      // 저장된 장치 ID가 즐겨찾기 목록에 있는지 확인
      const savedDevice = favoriteDevices.find(device => device.device_id === savedDeviceId);
      if (savedDevice) {
        onDeviceSelect(savedDevice);
      }
    }
  }, [favoriteDevices, selectedDevice, onDeviceSelect]);

  // 장치 선택 시 localStorage에 저장하는 핸들러
  const handleDeviceSelect = (device: Device) => {
    localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, device.device_id);
    onDeviceSelect(device);
  };

  return (
    <div className="lg:col-span-1 space-y-4">
      {/* 즐겨찾기 장치 목록 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900 flex items-center">
            <span className="mr-2">⭐</span>
            즐겨찾기 장치
          </h3>
        </div>
        <div className="p-4">
          {favoriteDevices.length > 0 ? (
            <div className="space-y-3">
              {favoriteDevices.map((device: Device) => (
                <button
                  key={device.device_id}
                  className={`w-full text-left flex items-center justify-between p-3 rounded-lg transition-all border ${selectedDevice?.device_id === device.device_id
                    ? 'bg-blue-100 border-blue-300 shadow-sm'
                    : 'hover:bg-gray-50 border-transparent hover:border-gray-200'
                    }`}
                  onClick={() => handleDeviceSelect(device)}
                >
                  <div className="flex items-center">
                    <div className={`w-3 h-3 ${getDeviceStatusColor(device)} rounded-full mr-3`}></div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{device.device_name}</div>
                      <div className="text-xs text-gray-500">{device.device_id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{getDeviceStatusText(device)}</div>
                    {selectedDevice?.device_id === device.device_id && (
                      <div className="text-xs text-blue-600 font-medium">선택됨</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">즐겨찾기 장치가 없습니다</p>
              <Link to="/devices" className="text-blue-500 text-xs hover:underline">
                장치 목록에서 추가하기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};