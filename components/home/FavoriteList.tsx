// components/home/FavoriteList.tsx - 그룹 선택시 URL 충돌 방지
import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FavoriteItem } from './types/HomeTypes';
import { Device } from '../../types/device.types';
import { FlexibleSensorData } from '../../types/sensor.types';

interface FavoriteListProps {
  favoriteItems: FavoriteItem[];
  selectedFavoriteType: 'device' | 'group' | null;
  selectedFavoriteId: string | null;
  favoriteDevices: Device[];
  favoriteGroupsCount: number;
  isMobile: boolean;
  isLoadingLastSelection?: boolean;
  onFavoriteItemSelect: (item: FavoriteItem) => void;
  onRefresh: () => void;
  getDeviceStatusText: (device: Device) => string;
  // 실시간 데이터와 동기화를 위한 props 추가
  deviceLatestDataMap?: Record<string, FlexibleSensorData | null>;
  getDeviceStatus?: (device: Device) => 'online' | 'offline' | 'pending';
  isDeviceOnline?: (device: Device) => boolean;
}

export const FavoriteList: React.FC<FavoriteListProps> = ({
  favoriteItems,
  selectedFavoriteType,
  selectedFavoriteId,
  favoriteDevices,
  favoriteGroupsCount,
  isMobile,
  isLoadingLastSelection = false,
  onFavoriteItemSelect,
  onRefresh,
  getDeviceStatusText,
  // 실시간 데이터 관련
  deviceLatestDataMap = {},
  getDeviceStatus,
  isDeviceOnline
}) => {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  // SensorDashboardContent와 동일한 단순화된 디바이스 상태 판단 로직
  const checkDeviceOnline = React.useCallback((device: Device) => {
    // 1순위: 전달받은 함수가 있으면 사용
    if (isDeviceOnline) {
      return isDeviceOnline(device);
    }

    // 2순위: 실시간 데이터 확인 (최근 5분 이내)
    const latestData = deviceLatestDataMap[device.device_id];
    if (latestData) {
      const dataTime = typeof latestData.timestamp === 'string' 
        ? new Date(latestData.timestamp).getTime()
        : latestData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      if (diffMinutes < 1) {
        return true;
      }
    }
    
    // 3순위: 디바이스 상태 필드 확인
    if (device.status === 'online') {
      return true;
    }
    
    // 4순위: last_seen_at 기반 판단 (fallback)
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
      return diffMinutes < 1;
    }
    
    // 기본값: 오프라인
    return false;
  }, [isDeviceOnline, deviceLatestDataMap]);

  const getStatusColor = React.useCallback((device: Device) => {
    if (getDeviceStatus) {
      const status = getDeviceStatus(device);
      switch (status) {
        case 'online':
          return 'bg-green-400';
        case 'pending':
          return 'bg-yellow-400';
        case 'offline':
        default:
          return 'bg-red-400';
      }
    }
    
    return checkDeviceOnline(device) ? 'bg-green-400' : 'bg-red-400';
  }, [getDeviceStatus, checkDeviceOnline]);

  // 개선된 즐겨찾기 아이템 상태 계산 (실시간 데이터 반영)
  const enhancedFavoriteItems = React.useMemo(() => {
    return favoriteItems.map(item => {
      if (item.type === 'device') {
        const device = favoriteDevices.find(d => d.device_id === item.id);
        if (device) {
          const isOnline = checkDeviceOnline(device);
          const statusColor = getStatusColor(device);

          return {
            ...item,
            onlineCount: isOnline ? 1 : 0,
            totalCount: 1,
            devices: [device],
            statusColor
          };
        }
      } else if (item.type === 'group' && item.devices) {
        const onlineCount = item.devices.filter(device => checkDeviceOnline(device)).length;

        return {
          ...item,
          onlineCount,
          totalCount: item.devices.length
        };
      }
      
      return item;
    });
  }, [favoriteItems, favoriteDevices, checkDeviceOnline, getStatusColor, deviceLatestDataMap]);

  // 선택된 항목의 클래스명 계산 (로딩 상태 포함)
  const getItemClassName = (item: FavoriteItem, isMobileVersion: boolean = false) => {
    const isSelected = selectedFavoriteType === item.type && selectedFavoriteId === item.id;

    if (isMobileVersion) {
      const baseClasses = `px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 flex items-center whitespace-nowrap flex-shrink-0`;

      if (isLoadingLastSelection && isSelected) {
        return `${baseClasses} bg-blue-300 text-white animate-pulse`;
      } else if (isSelected) {
        return `${baseClasses} bg-blue-500 text-white`;
      } else {
        return `${baseClasses} bg-gray-100 text-gray-700 hover:bg-gray-200`;
      }
    } else {
      // 데스크톱 버전
      const baseClasses = `p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer hover:shadow-md`;

      if (isLoadingLastSelection && isSelected) {
        return `${baseClasses} border-blue-300 bg-blue-50 animate-pulse`;
      } else if (isSelected) {
        return `${baseClasses} border-blue-500 bg-blue-50`;
      } else {
        return `${baseClasses} border-gray-200 hover:border-gray-300`;
      }
    }
  };

  // URL 생성 함수
  const generateItemUrl = (item: FavoriteItem) => {
    if (item.type === 'device') {
      return `/home/device/${item.id}`;
    } else if (item.type === 'group') {
      return `/home/group/${item.id}`;
    }
    return '/home';
  };

  // 스크롤 상태 체크
  const checkScrollability = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  };

  // 스크롤 이벤트 처리
  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = isMobile ? 120 : 300;
      const newScrollLeft = direction === 'left'
        ? scrollContainerRef.current.scrollLeft - scrollAmount
        : scrollContainerRef.current.scrollLeft + scrollAmount;

      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  // 마우스 드래그 이벤트들
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;

    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;

    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2;

    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }

    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setTimeout(() => setHasDragged(false), 100);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // 터치 이벤트들
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchScrollLeft, setTouchScrollLeft] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return;

    setIsDragging(true);
    setHasDragged(false);
    setTouchStartX(e.touches[0].pageX);
    setTouchScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;

    const touchX = e.touches[0].pageX;
    const walk = (touchStartX - touchX) * 1.5;

    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }

    scrollContainerRef.current.scrollLeft = touchScrollLeft + walk;
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setTimeout(() => setHasDragged(false), 100);
  };

  // 초기 스크롤 상태 체크 및 리사이즈 이벤트
  useEffect(() => {
    checkScrollability();
    const handleResize = () => checkScrollability();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [enhancedFavoriteItems]);

  // 핵심 수정: 그룹 선택시 URL 변경 방지
  const handleItemClick = (item: FavoriteItem, e?: React.MouseEvent) => {
    console.log('FavoriteList 클릭됨:', {
      itemName: item.name,
      itemType: item.type,
      itemId: item.id,
      hasDragged,
      isLoadingLastSelection
    });

    if (hasDragged) {
      console.log('드래그 때문에 클릭 무시됨');
      e?.preventDefault();
      return;
    }

    if (!isLoadingLastSelection) {
      console.log('onFavoriteItemSelect 호출 시도');
      
      // 1. 상위 컴포넌트 콜백 호출 (기존 로직 유지)
      onFavoriteItemSelect(item);
      
      // 2. 디바이스일 때만 URL 네비게이션 실행 (그룹은 URL 변경 안함)
      if (item.type === 'device') {
        const targetUrl = generateItemUrl(item);
        navigate(targetUrl, { replace: false });
        console.log(`디바이스 URL 네비게이션: ${targetUrl}`);
      } else if (item.type === 'group') {
        // 그룹 선택시에는 URL 변경하지 않음 (자동 선택 로직 트리거 방지)
        console.log('그룹 선택 - URL 변경 방지 (자동 선택 충돌 방지)');
      }
    } else {
      console.log('로딩 중이라 클릭 무시됨');
    }
  };

  if (isMobile) {
    return (
      <div className="bg-white rounded-lg shadow mx-4">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center">
            <span className="mr-1 text-xs">⭐</span>
            즐겨찾기 ({enhancedFavoriteItems.length})
            {isLoadingLastSelection && (
              <span className="ml-2 animate-spin text-blue-500">⚙️</span>
            )}
          </h2>
          <button
            onClick={onRefresh}
            className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
            title="새로고침"
            disabled={isLoadingLastSelection}
          >
            <img
              src="/refresh.png"
              alt="새로고침"
              className="w-4 h-4"
            />
          </button>
        </div>

        <div className="p-3">
          {enhancedFavoriteItems.length > 0 ? (
            <div className="relative">
              {/* 왼쪽 스크롤 버튼 */}
              {canScrollLeft && (
                <button
                  onClick={() => handleScroll('left')}
                  className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-white shadow-md rounded-full w-6 h-6 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  style={{ marginLeft: '-8px' }}
                >
                  <span className="text-gray-600 text-xs">◀</span>
                </button>
              )}

              {/* 오른쪽 스크롤 버튼 */}
              {canScrollRight && (
                <button
                  onClick={() => handleScroll('right')}
                  className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-white shadow-md rounded-full w-6 h-6 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  style={{ marginRight: '-8px' }}
                >
                  <span className="text-gray-600 text-xs">▶</span>
                </button>
              )}

              {/* 즐겨찾기 목록 */}
              <div
                ref={scrollContainerRef}
                className={`flex gap-2 overflow-x-auto py-2 ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                  }`}
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                  WebkitScrollSnapType: 'x mandatory',
                  scrollSnapType: 'x mandatory'
                }}
                onScroll={checkScrollability}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {enhancedFavoriteItems.map((item) => (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={(e) => handleItemClick(item, e)}
                    className={getItemClassName(item, true)}
                    disabled={isLoadingLastSelection}
                    style={{
                      WebkitScrollSnapAlign: 'start',
                      scrollSnapAlign: 'start'
                    }}
                    title={`${item.name}로 이동`}
                  >
                    <span className="truncate max-w-24">{item.name}</span>
                    {/* 실시간 데이터 반영된 상태 표시 */}
                    <div className="flex items-center ml-2 space-x-1">
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          item.type === 'device' && item.statusColor 
                            ? item.statusColor
                            : item.onlineCount > 0 ? 'bg-green-400' : 'bg-red-400'
                        }`}
                        title={
                          item.type === 'device' 
                            ? (item.onlineCount > 0 ? '온라인' : '오프라인')
                            : `온라인: ${item.onlineCount}/${item.totalCount}`
                        }
                      ></span>
                      {item.type === 'group' && item.totalCount > 1 && (
                        <span className="text-xs text-gray-500 font-medium">
                          {item.onlineCount}/{item.totalCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* 그라데이션 오버레이 */}
              <div
                className={`absolute top-0 left-0 w-3 h-full bg-gradient-to-r from-white to-transparent pointer-events-none transition-opacity ${canScrollLeft ? 'opacity-100' : 'opacity-0'
                  }`}
              />
              <div
                className={`absolute top-0 right-0 w-3 h-full bg-gradient-to-l from-white to-transparent pointer-events-none transition-opacity ${canScrollRight ? 'opacity-100' : 'opacity-0'
                  }`}
              />
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="text-xl mb-2 opacity-50">⭐</div>
              <p className="text-xs text-gray-500 mb-2">
                즐겨찾기가 없습니다
              </p>
              <Link
                to="/devices"
                className="inline-flex items-center bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
              >
                장치 목록으로
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 데스크톱 버전
  return (
    <div className="bg-white rounded-lg shadow h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <span className="mr-2">⭐</span>
          즐겨찾기 ({enhancedFavoriteItems.length})
          {isLoadingLastSelection && (
            <span className="ml-2 animate-spin text-blue-500">⚙️</span>
          )}
        </h2>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 hidden md:block">
            디바이스 {favoriteDevices.length}개, 그룹 {favoriteGroupsCount}개
          </span>
          <button
            onClick={onRefresh}
            className="text-blue-600 hover:text-blue-800 transition-colors p-2 rounded-lg hover:bg-blue-50"
            title="새로고침"
            disabled={isLoadingLastSelection}
          >
            <img
              src="/refresh.png"
              alt="새로고침"
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {enhancedFavoriteItems.length > 0 ? (
          <div className="relative">
            {/* 왼쪽 스크롤 버튼 */}
            {canScrollLeft && (
              <button
                onClick={() => handleScroll('left')}
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-white shadow-lg rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                style={{ marginLeft: '-16px' }}
              >
                ◀
              </button>
            )}

            {/* 오른쪽 스크롤 버튼 */}
            {canScrollRight && (
              <button
                onClick={() => handleScroll('right')}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-white shadow-lg rounded-full w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                style={{ marginRight: '-16px' }}
              >
                ▶
              </button>
            )}

            {/* 가로 스크롤 컨테이너 */}
            <div
              ref={scrollContainerRef}
              className={`flex gap-4 overflow-x-auto pb-2 ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
                }`}
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitScrollSnapType: 'x mandatory',
                scrollSnapType: 'x mandatory'
              }}
              onScroll={checkScrollability}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {enhancedFavoriteItems.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={(e) => handleItemClick(item, e)}
                  className={`${getItemClassName(item, false)} flex-shrink-0 w-72`}
                  style={{
                    WebkitScrollSnapAlign: 'start',
                    scrollSnapAlign: 'start'
                  }}
                  title={`${item.name}로 이동`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {item.type === 'device' ? (
                        <img src="/device.png" alt="디바이스" className="w-5 h-5 flex-shrink-0" />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: item.color || '#3b82f6' }}
                        >
                          {item.totalCount}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm truncate">
                          {item.name}
                        </h3>
                        <p className="text-xs text-gray-500 truncate">
                          {item.type === 'device' ? item.description : `${item.totalCount}개 디바이스`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <div className="flex items-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-1 ${
                            item.type === 'device' && item.statusColor 
                              ? item.statusColor
                              : item.onlineCount > 0 ? 'bg-green-400' : 'bg-red-400'
                          }`}
                          title={
                            item.type === 'device' 
                              ? (item.onlineCount > 0 ? '온라인' : '오프라인')
                              : `온라인: ${item.onlineCount}/${item.totalCount}`
                          }
                        ></span>
                        <span className="text-xs text-gray-600">
                          {item.onlineCount}/{item.totalCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 개선된 그룹 디바이스 표시 (실시간 상태 반영) */}
                  {item.type === 'group' && item.devices && item.devices.length > 0 && (
                    <div className="text-xs text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {item.devices.slice(0, 2).map((device) => {
                          const isOnline = checkDeviceOnline(device);
                          return (
                            <span
                              key={device.device_id}
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                isOnline
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-600'
                              }`}
                              title={`${device.device_name}: ${isOnline ? '온라인' : '오프라인'}`}
                            >
                              {device.device_name}
                              {!isOnline && (
                                <span className="ml-1 text-xs">●</span>
                              )}
                            </span>
                          );
                        })}
                        {item.devices.length > 2 && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
                            +{item.devices.length - 2}개
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 그라데이션 오버레이 */}
            <div
              className={`absolute top-0 left-0 w-4 h-full bg-gradient-to-r from-white to-transparent pointer-events-none transition-opacity ${canScrollLeft ? 'opacity-100' : 'opacity-0'
                }`}
            />
            <div
              className={`absolute top-0 right-0 w-4 h-full bg-gradient-to-l from-white to-transparent pointer-events-none transition-opacity ${canScrollRight ? 'opacity-100' : 'opacity-0'
                }`}
            />
          </div>
        ) : (
          <div className="text-center h-full flex items-center justify-center">
            <div>
              <div className="text-4xl mb-4 opacity-50">⭐</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                즐겨찾기가 없습니다
              </h3>
              <p className="text-gray-500 mb-6">
                장치 목록에서 자주 사용하는 디바이스나 그룹을 즐겨찾기로 추가해보세요.
              </p>
              <Link
                to="/devices"
                className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <img src="/device.png" alt="장치 관리" className="w-4 h-4 mr-2" />
                장치 목록 바로가기
              </Link>
            </div>
          </div>
        )}

        {/* 데스크톱 스크롤 힌트 */}
        {enhancedFavoriteItems.length > 3 && (
          <div className="mt-2 text-center">
            <p className="text-xs text-gray-400">← 좌우로 드래그하여 더 보기 →</p>
          </div>
        )}
      </div>
    </div>
  );
};