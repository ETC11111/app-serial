// components/Home.tsx - URL 자동 선택 로직 개선으로 그룹 선택 유지
import React, { useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDevices } from '../contexts/DeviceContext';
import { useNotifications } from '../contexts/NotificationContext';
import useDeviceGroups from '../hooks/useDeviceGroups';
import { useSensorData } from '../hooks/useSensorData';
import { useWeatherData } from '../hooks/useWeatherData';
import Layout from './Layout';
import { FavoriteList } from './home/FavoriteList';
import { SensorDashboardContent } from './home/SensorDashboardContent';
import { GroupSensorDashboardContent } from './home/GroupSensorDashboardContent';
import { useHomeLogic } from './home/hooks/useHomeLogic';
import { Device } from '../types/device.types';
import { FlexibleSensorData } from '../types/sensor.types';

const Home: React.FC = () => {
  const { devices, loading, deviceLatestDataMap } = useDevices();
  const { groups } = useDeviceGroups();
  const { setCurrentDevice } = useNotifications();
  const navigate = useNavigate();
  
  // URL 파라미터 읽기
  const { deviceId: urlDeviceId, groupId: urlGroupId } = useParams<{
    deviceId?: string;
    groupId?: string;
  }>();

  console.log('URL 파라미터:', {
    urlDeviceId,
    urlGroupId,
    currentPath: window.location.pathname,
    searchParams: window.location.search
  });

  const {
    selectedDevice,
    latestData,
    historyData,
    sensorLoading,
    handleDeviceSelect,
    refreshData,
    prepareChartData,
    getConnectionStatusInfo
  } = useSensorData();

  const {
    weatherData,
    weatherLoading,
    weatherError,
    weatherForecast,
    selectedRegion,
    changeRegion,
    refreshWeather
  } = useWeatherData();

  const {
    favoriteGroups,
    isMobile,
    selectedFavoriteType,
    selectedFavoriteId,
    favoriteItems,
    favoriteDevices,
    getDeviceStatusText,
    handleFavoriteItemSelect,
    isLoadingLastSelection,
    userHasManuallySelected
  } = useHomeLogic({ devices, groups, selectedDevice, latestData, handleDeviceSelect });

  console.log('useHomeLogic 반환값:', {
    selectedFavoriteType,
    selectedFavoriteId,
    favoriteItems: favoriteItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      totalCount: item.totalCount,
      onlineCount: item.onlineCount
    })),
    favoriteDevices: favoriteDevices.map((d: any) => ({
      id: d.device_id,
      name: d.device_name
    })),
    favoriteGroupsCount: favoriteGroups.length,
    isLoadingLastSelection,
    userHasManuallySelected
  });

  // SensorDashboardContent와 동일한 간소화된 디바이스 상태 판단 로직
  const getDeviceStatus = useCallback((device: Device): 'online' | 'offline' | 'pending' => {
    if (device.status === 'online') {
      return 'online';
    }
    
    if (device.last_seen_at) {
      const lastSeen = new Date(device.last_seen_at);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
      
      if (diffMinutes < 1) return 'online';
      return 'offline';
    }
    
    return 'offline';
  }, []);

  const getLastConnectedTime = useCallback((device: Device) => {
    return device.last_seen_at || null;
  }, []);

  // DeviceContext에서 실시간 데이터 맵을 가져옴

  // 실시간 데이터 기반 디바이스 상태 판단 (FavoriteList용)
  const getDeviceStatusWithData = useCallback((device: Device): 'online' | 'offline' | 'pending' => {
    const deviceData = deviceLatestDataMap[device.device_id];
    if (deviceData) {
      const dataTime = typeof deviceData.timestamp === 'string' 
        ? new Date(deviceData.timestamp).getTime()
        : deviceData.timestamp;
      const now = Date.now();
      const diffMinutes = (now - dataTime) / (1000 * 60);
      
      if (diffMinutes < 1) {
        return 'online';
      }
    }

    return getDeviceStatus(device);
  }, [deviceLatestDataMap, getDeviceStatus]);

  const isDeviceOnlineWithData = useCallback((device: Device) => {
    return getDeviceStatusWithData(device) === 'online';
  }, [getDeviceStatusWithData]);

  // 핵심 수정: URL 파라미터 기반 자동 선택 로직 개선
  useEffect(() => {
    console.log('URL 자동 선택 useEffect 실행:', {
      loading,
      devicesLength: devices.length,
      groupsLength: groups.length,
      urlDeviceId,
      urlGroupId,
      currentSelection: { selectedFavoriteType, selectedFavoriteId },
      userHasManuallySelected
    });

    if (loading || devices.length === 0) {
      console.log('URL 자동 선택 중단: 로딩 중이거나 디바이스 없음');
      return;
    }

    // 사용자가 수동으로 선택한 후에는 URL 자동 선택 비활성화
    if (userHasManuallySelected) {
      console.log('사용자 수동 선택 후 URL 자동 선택 무시');
      return;
    }

    // 이미 선택된 상태가 있고, URL 파라미터와 일치한다면 중복 실행 방지
    if (selectedFavoriteType && selectedFavoriteId) {
      if (
        (urlDeviceId && selectedFavoriteType === 'device' && selectedFavoriteId === urlDeviceId) ||
        (urlGroupId && selectedFavoriteType === 'group' && selectedFavoriteId === urlGroupId)
      ) {
        console.log('URL과 현재 선택이 일치함, 자동 선택 건너뜀');
        return;
      }
    }

    let shouldAutoSelect = false;
    let targetType: 'device' | 'group' | null = null;
    let targetId: string | null = null;

    // 그룹 ID 우선 처리 (디바이스 ID보다 우선)
    if (urlGroupId) {
      const foundGroup = groups.find((g: any) => g.group_id === urlGroupId);
      if (foundGroup) {
        targetType = 'group';
        targetId = urlGroupId;
        shouldAutoSelect = true;
        console.log(`URL에서 그룹 자동 선택: ${foundGroup.group_name} (${urlGroupId})`);
      } else {
        console.warn(`URL의 그룹 ID를 찾을 수 없음: ${urlGroupId}`, {
          availableGroups: groups.map((g: any) => ({ id: g.group_id, name: g.group_name }))
        });
        navigate('/home', { replace: true });
        return;
      }
    }
    else if (urlDeviceId) {
      const foundDevice = devices.find((d: Device) => d.device_id === urlDeviceId);
      if (foundDevice) {
        targetType = 'device';
        targetId = urlDeviceId;
        shouldAutoSelect = true;
        console.log(`URL에서 디바이스 자동 선택: ${foundDevice.device_name} (${urlDeviceId})`);
      } else {
        console.warn(`URL의 디바이스 ID를 찾을 수 없음: ${urlDeviceId}`);
        navigate('/home', { replace: true });
        return;
      }
    }

    console.log('자동 선택 결정:', {
      shouldAutoSelect,
      targetType,
      targetId,
      currentType: selectedFavoriteType,
      currentId: selectedFavoriteId,
      needsUpdate: shouldAutoSelect && (selectedFavoriteType !== targetType || selectedFavoriteId !== targetId)
    });

    // URL 기반 자동 선택은 현재 선택과 다를 때만 실행
    if (shouldAutoSelect && 
        (selectedFavoriteType !== targetType || selectedFavoriteId !== targetId)) {
      
      console.log(`URL 기반 자동 선택 실행: ${targetType}=${targetId}`);
      
      const targetItem = favoriteItems.find(item => 
        item.type === targetType && item.id === targetId
      );

      if (targetItem) {
        console.log(`즐겨찾기에서 찾음:`, targetItem);
        handleFavoriteItemSelect(targetItem);
      } else {
        console.log(`즐겨찾기에 없음, 직접 생성`);
        if (targetType === 'device') {
          const device = devices.find((d: Device) => d.device_id === targetId);
          if (device) {
            const syntheticItem = {
              id: device.device_id,
              name: device.device_name,
              type: 'device' as const,
              description: device.device_location || '',
              totalCount: 1,
              onlineCount: isDeviceOnlineWithData(device) ? 1 : 0,
              devices: [device] // FavoriteItem 타입에 필요한 devices 속성 추가
            };
            console.log(`합성 디바이스 아이템 생성:`, syntheticItem);
            handleFavoriteItemSelect(syntheticItem);
          }
        } else if (targetType === 'group') {
          const group = groups.find((g: any) => g.group_id === targetId);
          if (group) {
            const groupDevicesForItem = devices.filter((device: Device) => 
              group.device_ids?.includes(device.device_id)
            );
            const syntheticItem = {
              id: group.group_id,
              name: group.group_name,
              type: 'group' as const,
              description: group.description || '',
              totalCount: group.device_ids?.length || 0,
              onlineCount: group.device_ids?.length || 0,
              color: group.color,
              devices: groupDevicesForItem // FavoriteItem 타입에 필요한 devices 속성 추가
            };
            console.log(`합성 그룹 아이템 생성:`, syntheticItem);
            handleFavoriteItemSelect(syntheticItem);
          }
        }
      }
    }
  }, [
    urlDeviceId, 
    urlGroupId, 
    devices, 
    groups, 
    loading,
    selectedFavoriteType, 
    selectedFavoriteId,
    favoriteItems,
    handleFavoriteItemSelect,
    navigate,
    isDeviceOnlineWithData,
    userHasManuallySelected
  ]);

  // 선택된 그룹 찾기
  const selectedGroup = React.useMemo(() => {
    if (selectedFavoriteType !== 'group' || !selectedFavoriteId) {
      console.log('그룹 선택 없음:', { selectedFavoriteType, selectedFavoriteId });
      return null;
    }

    const foundGroup = groups.find((g: any) => g.group_id === selectedFavoriteId);
    
    console.log('그룹 찾기 결과:', {
      selectedFavoriteId,
      availableGroups: groups.map((g: any) => ({ id: g.group_id, name: g.group_name })),
      foundGroup: foundGroup ? `${foundGroup.group_name} (${foundGroup.group_id})` : 'None'
    });

    return foundGroup || null;
  }, [selectedFavoriteType, selectedFavoriteId, groups]);

  // 그룹 디바이스 매칭 (상태 정보 포함)
  const groupDevices = React.useMemo(() => {
    if (!selectedGroup || !selectedGroup.device_ids) {
      console.log('그룹 디바이스 없음:', {
        hasSelectedGroup: !!selectedGroup,
        groupDeviceIds: selectedGroup?.device_ids
      });
      return [];
    }

    const matchedDevices = devices.filter((device: Device) => {
      return selectedGroup.device_ids.includes(device.device_id);
    });

    // 온/오프라인 상관없이 모든 디바이스 반환 (정렬하지 않음)
    console.log('그룹 디바이스 매칭 결과:', {
      groupDeviceIds: selectedGroup.device_ids,
      allDeviceIds: devices.map((d: Device) => d.device_id),
      matchedDevices: matchedDevices.map((d: Device) => d.device_id),
      deviceStatuses: matchedDevices.map((d: Device) => ({
        name: d.device_name,
        id: d.device_id,
        status: getDeviceStatusWithData(d),
        isOnline: isDeviceOnlineWithData(d)
      }))
    });

    return matchedDevices;
  }, [selectedGroup, devices, getDeviceStatusWithData, isDeviceOnlineWithData]);

  console.log('그룹 관련 상태 종합:', {
    selectedFavoriteType,
    selectedFavoriteId,
    groups: groups.map((g: any) => ({ id: g.group_id, name: g.group_name, device_ids: g.device_ids })),
    selectedGroup: selectedGroup ? {
      id: selectedGroup.group_id,
      name: selectedGroup.group_name,
      device_ids: selectedGroup.device_ids
    } : null,
    groupDevices: groupDevices.map((d: Device) => ({
      id: d.device_id,
      name: d.device_name,
      status: getDeviceStatusWithData(d)
    })),
    allDevices: devices.map((d: Device) => ({ id: d.device_id, name: d.device_name }))
  });

  useEffect(() => {
    if (selectedDevice) {
      setCurrentDevice(selectedDevice.device_id, selectedDevice.device_name);
    } else {
      setCurrentDevice(null);
    }
  }, [selectedDevice, setCurrentDevice]);

  useEffect(() => {
    if (selectedDevice && latestData) {
      const event = new CustomEvent('sensorDataUpdate', {
        detail: {
          deviceId: selectedDevice.device_id,
          sensorData: latestData
        }
      });
      window.dispatchEvent(event);
    }
  }, [selectedDevice, latestData]);

  const chartData = prepareChartData();

  // 선택된 디바이스의 실제 연결 상태 판단 (간소화)
  const selectedDeviceConnectionInfo = React.useMemo(() => {
    if (!selectedDevice) {
      return {
        isConnected: false,
        lastConnectedTime: null,
        hasCache: false
      };
    }

    const isConnected = isDeviceOnlineWithData(selectedDevice);
    const lastConnectedTime = getLastConnectedTime(selectedDevice);
    const hasCache = !!latestData;

    console.log('선택된 디바이스 연결 상태:', {
      deviceName: selectedDevice.device_name,
      isConnected,
      lastConnectedTime,
      hasCache,
      deviceStatus: getDeviceStatusWithData(selectedDevice)
    });

    return {
      isConnected,
      lastConnectedTime,
      hasCache
    };
  }, [selectedDevice, isDeviceOnlineWithData, getLastConnectedTime, latestData, getDeviceStatusWithData]);

  // 조건부 렌더링 분기 디버깅
  const renderingDecision = {
    selectedFavoriteType,
    selectedFavoriteId,
    hasSelectedGroup: !!selectedGroup,
    selectedGroupName: selectedGroup?.group_name,
    groupDevicesLength: groupDevices.length,
    hasSelectedDevice: !!selectedDevice,
    selectedDeviceName: selectedDevice?.device_name,
    
    // 각 조건 평가
    isGroupSelected: selectedFavoriteType === 'group' && selectedGroup,
    hasGroupDevices: groupDevices.length > 0,
    isDeviceSelected: selectedDevice && selectedFavoriteType === 'device',
    
    // 최종 결정
    willShowGroupDashboard: selectedFavoriteType === 'group' && selectedGroup && groupDevices.length > 0,
    willShowGroupEmpty: selectedFavoriteType === 'group' && selectedGroup && groupDevices.length === 0,
    willShowGroupNotFound: selectedFavoriteType === 'group' && !selectedGroup,
    willShowDeviceDashboard: selectedDevice && selectedFavoriteType === 'device',
    willShowDefault: !selectedFavoriteType || (!selectedGroup && !selectedDevice)
  };

  console.log('렌더링 결정:', renderingDecision);

  return (
    <Layout
      maxWidth="wide"
      padding={isMobile ? 'none' : 'md'}
      background="gray"
      onNotificationClick={() => navigate('/alerts')}
      onSettingsClick={() => navigate('/settings')}
    >
      <div className="flex flex-col">
        {/* 즐겨찾기 목록 */}
        <div className="order-1 sm:order-2 sm:px-0 mt-4 sm:mt-6">
          <FavoriteList
            favoriteItems={favoriteItems}
            selectedFavoriteType={selectedFavoriteType}
            selectedFavoriteId={selectedFavoriteId}
            favoriteDevices={favoriteDevices}
            favoriteGroupsCount={favoriteGroups.length}
            isMobile={isMobile}
            isLoadingLastSelection={isLoadingLastSelection || loading || sensorLoading}
            onFavoriteItemSelect={handleFavoriteItemSelect}
            onRefresh={refreshData}
            getDeviceStatusText={getDeviceStatusText}
            deviceLatestDataMap={deviceLatestDataMap}
            getDeviceStatus={getDeviceStatusWithData}
            isDeviceOnline={isDeviceOnlineWithData}
          />
        </div>

        {/* 메인 컨텐츠 */}
        <div className="order-2 sm:order-1 flex-1 max-w-full overflow-hidden mb-6">
          {/* 그룹 선택된 경우 우선 처리 */}
          {selectedFavoriteType === 'group' && selectedGroup ? (
            groupDevices.length > 0 ? (
              <div className="h-full overflow-hidden">
                {(() => {
                  console.log('그룹 대시보드 렌더링:', selectedGroup.group_name);
                  return (
                    <GroupSensorDashboardContent
                      selectedGroup={selectedGroup}
                      groupDevices={groupDevices}
                      isMobile={isMobile}
                      weatherData={weatherData}
                      weatherLoading={weatherLoading}
                      weatherError={weatherError}
                      weatherForecast={weatherForecast}
                      selectedRegion={selectedRegion}
                      onWeatherRefresh={(region?: string) => region ? changeRegion(region) : refreshWeather()}
                      onRegionChange={changeRegion}
                      devices={devices}
                      getDeviceStatus={getDeviceStatusWithData}
                      isDeviceOnline={isDeviceOnlineWithData}
                      getLastConnectedTime={getLastConnectedTime}
                    />
                  );
                })()}
              </div>
            ) : (
              <div className={`bg-white rounded-lg shadow p-8 text-center ${isMobile ? 'mx-4' : ''}`}>
                {(() => {
                  console.log('그룹에 디바이스 없음 렌더링');
                  return (
                    <>
                      <div className="text-6xl mb-4">📱</div>
                      <h3 className="text-xl font-semibold mb-2 text-gray-800">그룹에 디바이스가 없습니다</h3>
                      <p className="text-gray-500 mb-6">
                        <strong>{selectedGroup.group_name}</strong> 그룹에 등록된 디바이스가 없거나 디바이스를 찾을 수 없습니다.
                      </p>
                      <div className="space-y-3 text-sm text-gray-600 mb-6">
                        <p>• 그룹 ID: {selectedGroup.group_id}</p>
                        <p>• 그룹 device_ids: {selectedGroup.device_ids?.join(', ') || '없음'}</p>
                        <p>• 전체 디바이스 수: {devices.length}</p>
                        <p>• 매칭된 디바이스 수: {groupDevices.length}</p>
                      </div>
                      <Link 
                        to="/devices" 
                        className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        디바이스 관리
                      </Link>
                    </>
                  );
                })()}
              </div>
            )
          ) : selectedFavoriteType === 'group' && !selectedGroup ? (
            <div className={`bg-white rounded-lg shadow p-8 text-center ${isMobile ? 'mx-4' : ''}`}>
              {(() => {
                console.log('그룹을 찾을 수 없음 렌더링');
                return (
                  <>
                    <div className="text-6xl mb-4">❓</div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">그룹을 찾을 수 없습니다</h3>
                    <p className="text-gray-500 mb-6">
                      선택한 즐겨찾기 그룹이 더 이상 존재하지 않습니다.
                    </p>
                    <div className="space-y-3 text-sm text-gray-600 mb-6">
                      <p>• 즐겨찾기 ID: {selectedFavoriteId}</p>
                      <p>• URL 그룹 ID: {urlGroupId}</p>
                      <p>• 사용 가능한 그룹 수: {groups.length}</p>
                    </div>
                    <Link 
                      to="/devices" 
                      className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      디바이스 목록에서 확인하기
                    </Link>
                  </>
                );
              })()}
            </div>
          ) : selectedDevice && selectedFavoriteType === 'device' ? (
            <div className="h-full overflow-hidden">
              {(() => {
                console.log('디바이스 대시보드 렌더링:', selectedDevice.device_name);
                return (
                  <SensorDashboardContent
                    selectedDevice={selectedDevice}
                    latestData={latestData}
                    sensorLoading={sensorLoading}
                    chartData={chartData}
                    historyData={historyData}
                    isMobile={isMobile}
                    devices={devices}
                    weatherData={weatherData}
                    weatherLoading={weatherLoading}
                    weatherError={weatherError}
                    weatherForecast={weatherForecast}
                    selectedRegion={selectedRegion}
                    onRefresh={refreshData}
                    onWeatherRefresh={(region?: string) => region ? changeRegion(region) : refreshWeather()}
                    onRegionChange={changeRegion}
                    deviceId={selectedDevice.device_id}
                    selectedFavoriteType={selectedFavoriteType}
                    selectedFavoriteId={selectedFavoriteId || undefined}
                    selectedGroup={selectedGroup}
                    groups={groups}
                    isDeviceConnected={selectedDeviceConnectionInfo.isConnected}
                    lastConnectedTime={selectedDeviceConnectionInfo.lastConnectedTime}
                    cachedData={selectedDeviceConnectionInfo.hasCache && !selectedDeviceConnectionInfo.isConnected ? latestData : null}
                  />
                );
              })()}
            </div>
          ) : (
            <div className={`bg-white rounded-lg shadow p-8 text-center ${isMobile ? 'mx-4' : ''}`}>
              {(() => {
                console.log('기본 화면 렌더링');
                return (
                  <>
                    <div className="text-6xl mb-4">⭐</div>
                    <h3 className="text-xl font-semibold mb-2">즐겨찾기를 선택하세요</h3>
                    <p className="text-gray-500 mb-6">
                      아래 즐겨찾기 목록에서 디바이스나 그룹을 클릭하면<br />
                      실시간 센서 데이터와 CCTV 스트림을 확인할 수 있습니다.
                    </p>
                    {favoriteItems.length === 0 && (
                      <div className="mt-8 p-6 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="text-yellow-600 mb-2">⚠️ 즐겨찾기가 없습니다</div>
                        <p className="text-sm text-yellow-700 mb-4">
                          장치 목록에서 자주 사용하는 장치나 그룹을 즐겨찾기로 추가해보세요.
                        </p>
                        <Link to="/devices" className="inline-flex items-center bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors">
                          장치 목록 바로가기
                        </Link>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Home;