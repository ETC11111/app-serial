// components/GroupSensorDashboard/GroupDashboardContent.tsx
// Layout 없이 순수 컨텐츠만 렌더링하는 버전

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import GreenhouseFloorPlan from '../components/greenhouse/GreenhouseFloorPlan';

// 커스텀 훅들
import { useGroupSensorData } from '../hooks/useGroupSensorData';
import { useStreamData } from '../hooks/useStreamData';

// 로컬 컴포넌트들
import GroupHeader from './GroupHeader';
import AverageValuesCard from './AverageValuesCard';
import ChartSelector from './ChartSelector';
import DeviceSensorCard from './DeviceSensorCard';
import MultiRealtimeChart from './MultiRealtimeChart';
import StreamViewer from './StreamViewer';

interface GroupDashboardContentProps {
  groupId: string;
  isMobile?: boolean;
}

const GroupDashboardContent: React.FC<GroupDashboardContentProps> = ({ 
  groupId, 
  isMobile = false 
}) => {
  // 차트 관련 상태
  const [activeCharts, setActiveCharts] = useState<Array<'temp' | 'humidity' | 'water' | 'light' | 'ec' | 'ph' | 'co2' | 'pressure' | 'soil_ph' | 'soil_ec' | 'soil_temp' | 'soil_humidity'>>(['temp']);

  // 커스텀 훅 사용
  const {
    group,
    devices,
    deviceSensorData,
    historicalData,
    loading,
    error,
    lastUpdate,
    averageValues,
    statusCounts,
    fetchGroupData,
    fetchAllSensorData,
    extractStandardValues
  } = useGroupSensorData(groupId);

  const {
    groupStreams,
    streamLoading
  } = useStreamData(groupId, devices);

  // 차트 토글
  const toggleChart = (chartType: 'temp' | 'humidity' | 'water' | 'light' | 'ec' | 'ph' | 'co2' | 'pressure' | 'soil_ph' | 'soil_ec' | 'soil_temp' | 'soil_humidity') => {
    setActiveCharts(prev => {
      if (prev.includes(chartType)) {
        if (prev.length > 1) {
          return prev.filter(chart => chart !== chartType);
        }
        return prev;
      } else {
        return [...prev, chartType];
      }
    });
  };

  const handleSelectAllCharts = () => {
    setActiveCharts(['temp', 'humidity', 'water', 'light', 'ec', 'ph', 'co2', 'pressure', 'soil_ph', 'soil_ec', 'soil_temp', 'soil_humidity']);
  };

  const handleResetCharts = () => {
    setActiveCharts(['temp']);
  };

  // 온실 평면도용 데이터
  const stableGroupData = useMemo(() => {
    if (deviceSensorData.length === 0) {
      return { data: [], key: 'empty' };
    }

    const sortedData = [...deviceSensorData]
      .filter(d => d.isOnline && d.sensorData)
      .sort((a, b) => a.device.device_id.localeCompare(b.device.device_id));

    return {
      data: sortedData.map(deviceData => ({
        device_id: deviceData.device.device_id,
        device_name: deviceData.device.device_name,
        group_id: deviceData.device.device_id,
        flexibleData: deviceData.sensorData
      })),
      key: `${sortedData.length}-${sortedData.map(d => d.device.device_id).join(',')}`
    };
  }, [deviceSensorData]);

  // 로딩 상태
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700">그룹 센서 데이터 로딩 중...</h2>
          <p className="text-gray-500 mt-2">디바이스 연결을 확인하고 있습니다.</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error || !group) {
    return (
      <div className="bg-white rounded-lg shadow h-full flex items-center justify-center">
        <div className="text-center p-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">그룹 로딩 오류</h2>
          <p className="text-gray-600 mb-4">{error || '그룹 정보를 찾을 수 없습니다.'}</p>
          <div className="space-y-2">
            <button onClick={fetchGroupData} className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
              🔄 다시 시도
            </button>
            <Link to="/devices" className="block w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
              ← 장치 목록으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      {/* 메인 레이아웃 */}
      <div className={`${isMobile ? 'flex flex-col space-y-4' : 'flex flex-row space-x-6'} h-full max-w-full overflow-hidden`}>
        
        {/* 왼쪽: 센서 데이터 영역 */}
        <div className={`${isMobile ? 'px-4 flex-1' : 'w-3/5 flex-1 min-w-0'} overflow-hidden`}>
          <div className="h-full flex flex-col space-y-4 overflow-hidden">
            
            {/* 헤더 */}
            <GroupHeader
              group={group}
              statusCounts={statusCounts}
              streamCount={groupStreams.length}
              lastUpdate={lastUpdate}
              onRefresh={fetchAllSensorData}
              isMobile={isMobile}
            />

            {/* 메인 컨텐츠 영역 */}
            <div className="flex-1 min-h-0 overflow-auto space-y-4">
              {/* 실시간 차트 */}
              {!isMobile && historicalData.length > 0 && statusCounts.online > 0 && (
                <div className="bg-white rounded-lg shadow p-4 lg:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-6">
                    <div className="mb-4 lg:mb-0">
                      <h3 className="text-base sm:text-lg font-semibold flex items-center">
                        📊 실시간 다중 센서 차트 ({statusCounts.online}개 디바이스)
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        여러 센서를 동시에 선택하여 비교할 수 있습니다
                      </p>
                    </div>
                    <div className="lg:max-w-md">
                      <ChartSelector
                        activeCharts={activeCharts}
                        onToggleChart={toggleChart}
                        onSelectAll={handleSelectAllCharts}
                        onReset={handleResetCharts}
                      />
                    </div>
                  </div>
                  <MultiRealtimeChart
                    historicalData={historicalData}
                    deviceSensorData={deviceSensorData}
                    activeCharts={activeCharts}
                  />
                </div>
              )}



              {/* 개별 디바이스 센서 데이터 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                {deviceSensorData.map((deviceData) => (
                  <DeviceSensorCard
                    key={deviceData.device.device_id}
                    deviceData={deviceData}
                    extractStandardValues={extractStandardValues}
                    onRefresh={fetchAllSensorData}
                    isMobile={isMobile}
                  />
                ))}
              </div>

              {/* 디바이스가 없는 경우 */}
              {devices.length === 0 && (
                <div className="bg-white rounded-lg shadow p-6 sm:p-8 text-center">
                  <div className="text-4xl sm:text-6xl mb-4">📱</div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-800">그룹에 디바이스가 없습니다</h3>
                  <p className="text-sm sm:text-base text-gray-500 mb-6">이 그룹에 디바이스를 추가해보세요</p>
                  <Link
                    to="/devices"
                    className="inline-block bg-blue-500 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm sm:text-base"
                  >
                    디바이스 관리하기
                  </Link>
                </div>
              )}


            </div>
          </div>
        </div>

        {/* 오른쪽: 스트림 뷰어 영역 (데스크톱만) */}
        {!isMobile && (
          <div className="w-2/5 flex-shrink-0 overflow-hidden max-w-[40vw]">
            <div className="w-full h-auto bg-white rounded-lg shadow overflow-hidden">
              {/* 스트림 뷰어 헤더 */}
              <div className="p-3 border-b bg-gray-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 flex items-center text-sm">
                    🎥 실시간 CCTV
                    {streamLoading && (
                      <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    )}
                  </h3>
                  <div className="text-xs text-gray-500 truncate ml-2 max-w-32">
                    {group.group_name} ({groupStreams.length}개)
                  </div>
                </div>
              </div>

              {/* 스트림 뷰어 컨텐츠 */}
              <div className="flex-grow min-h-0 overflow-y-auto overflow-x-hidden">
                <StreamViewer
                  groupStreams={groupStreams}
                  streamLoading={streamLoading}
                  group={group}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 모바일 스트림 뷰어 (하단) */}
      {isMobile && groupStreams.length > 0 && (
        <div className="px-4 flex-shrink-0 w-full overflow-hidden mt-4">
          <div className="bg-white rounded-lg shadow w-full overflow-hidden h-96">
            <div className="p-3 border-b bg-gray-50 flex-shrink-0">
              <h3 className="font-semibold text-gray-800 flex items-center text-sm">
                🎥 실시간 CCTV ({groupStreams.length}개)
                {streamLoading && (
                  <div className="ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                )}
              </h3>
            </div>
            <div className="h-80 overflow-hidden">
              <StreamViewer
                groupStreams={groupStreams}
                streamLoading={streamLoading}
                group={group}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDashboardContent;