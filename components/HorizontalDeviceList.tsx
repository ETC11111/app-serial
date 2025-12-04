import React from 'react';
import { Link } from 'react-router-dom';
import { useDevices } from '../contexts/DeviceContext';
import { Device } from '../types/device.types';

interface HorizontalDeviceListProps {
  currentDeviceId?: string;
}

const HorizontalDeviceList: React.FC<HorizontalDeviceListProps> = ({ currentDeviceId }) => {
  const { devices, loading } = useDevices();

  // 디바이스 상태 컬러 계산
  const getDeviceStatusColor = (device: Device): string => {
    if (!device.last_seen_at) return 'bg-gray-400';
    
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return 'bg-green-400';
    if (diffMinutes < 30) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  // 디바이스 상태 텍스트
  const getDeviceStatusText = (device: Device): string => {
    if (!device.last_seen_at) return '상태 불명';
    
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return '온라인';
    if (diffMinutes < 30) return '최근 활동';
    return '오프라인';
  };

  // 즐겨찾기를 우선으로 정렬
  const sortedDevices = [...devices].sort((a, b) => {
    // 즐겨찾기 우선
    if (a.is_favorite !== b.is_favorite) {
      return b.is_favorite ? 1 : -1;
    }
    // 온라인 상태 우선
    const aOnline = getDeviceStatusText(a) === '온라인';
    const bOnline = getDeviceStatusText(b) === '온라인';
    if (aOnline !== bOnline) {
      return bOnline ? 1 : -1;
    }
    // 이름순
    return a.device_name.localeCompare(b.device_name);
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center space-x-2 mb-3">
          <div className="w-5 h-5 bg-gray-300 rounded animate-pulse"></div>
          <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
        </div>
        <div className="flex space-x-3 overflow-x-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-48 h-20 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="flex items-center space-x-2 mb-3">
          <img src="/device.png" alt="device" className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-gray-800">내 장치</h2>
        </div>
        <div className="text-center py-8 text-gray-500">
          <p>등록된 장치가 없습니다.</p>
          <Link to="/device-setup" className="text-blue-600 hover:underline">
            첫 번째 장치 추가하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <img src="/device.png" alt="device" className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-gray-800">내 장치</h2>
          <span className="text-sm text-gray-500">({devices.length}개)</span>
        </div>
        <Link 
          to="/devices" 
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          전체보기 →
        </Link>
      </div>

      {/* 가로 스크롤 디바이스 리스트 */}
      <div className="relative">
        <div 
          className="flex space-x-3 overflow-x-auto pb-2 scrollbar-hide"
          style={{
            scrollBehavior: 'smooth',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none'
          }}
        >
          {sortedDevices.map((device) => {
            const isActive = currentDeviceId === device.device_id;
            const statusColor = getDeviceStatusColor(device);
            const statusText = getDeviceStatusText(device);
            
            return (
              <Link
                key={device.device_id}
                to={`/sensors/${device.device_id}`}
                className={`
                  flex-shrink-0 w-48 p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md
                  ${isActive 
                    ? 'border-blue-500 bg-blue-50 shadow-md' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                  }
                `}
              >
                {/* 디바이스 정보 */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-sm truncate ${
                      isActive ? 'text-blue-700' : 'text-gray-800'
                    }`}>
                      {device.device_name}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">
                      ID: {device.device_id}
                    </p>
                  </div>
                  
                  {/* 즐겨찾기 아이콘 */}
                  {device.is_favorite && (
                    <span className="text-yellow-500 text-sm ml-1">★</span>
                  )}
                </div>

                {/* 상태 표시 */}
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
                  <span className={`text-xs font-medium ${
                    statusText === '온라인' 
                      ? 'text-green-600' 
                      : statusText === '최근 활동'
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }`}>
                    {statusText}
                  </span>
                </div>

                {/* 마지막 연결 시간 */}
                {device.last_seen_at && (
                  <div className="mt-1 text-xs text-gray-400">
                    {new Date(device.last_seen_at).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}

                {/* 현재 선택된 디바이스 표시 */}
                {isActive && (
                  <div className="mt-2 text-xs text-blue-600 font-medium">
                    ▶ 현재 보고 있는 장치
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {/* 스크롤 인디케이터 (선택사항) */}
        {devices.length > 2 && (
          <div className="flex justify-center mt-2">
            <div className="flex space-x-1">
              {Array.from({ length: Math.ceil(devices.length / 2) }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-gray-300"
                ></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CSS 스타일 */}
      <style>
        {`
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
    </div>
  );
};

export default HorizontalDeviceList;