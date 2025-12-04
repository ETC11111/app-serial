// components/FlexibleSensorTabContent.tsx - 개선된 오프라인 상태 처리

import React, { useState } from 'react';
import { FlexibleSensorData, DetectedSensor, ChartDataPoint } from '../../types/sensor.types';
import { SensorAlerts } from '../alert/SensorAlerts';
import CSVDownloadSection from '../CSVDownloadSection';
import { useSimpleSensorData } from '../../hooks/useSensorData';
import { SensorCardsGrid } from '../sensor/SensorCardsGrid';
import { InactiveSensors } from '../sensor/InactiveSensors';
import { SensorSummary } from '../sensor/SensorSummary';
import { SensorCharts } from '../sensor/SensorCharts';

interface FlexibleSensorTabContentProps {
  latestData: FlexibleSensorData | null;
  chartData: ChartDataPoint[];
  isMobile: boolean;
  historyData?: FlexibleSensorData[];
  hideSensorInfo?: boolean;
  hideDataManagement?: boolean;
  hideAlerts?: boolean;
  deviceId?: string;
  // 🔥 개선된 오프라인 대응 props
  isDeviceConnected?: boolean;
  cachedData?: FlexibleSensorData | null;
  cachedChartData?: ChartDataPoint[];
  lastDataUpdateTime?: string | null;
}

export const FlexibleSensorTabContent: React.FC<FlexibleSensorTabContentProps> = ({
  latestData,
  chartData,
  isMobile,
  historyData = [],
  hideSensorInfo = false,
  hideDataManagement = false,
  hideAlerts = false,
  deviceId,
  // 🔥 개선된 오프라인 대응 props
  isDeviceConnected = true,
  cachedData,
  cachedChartData = [],
  lastDataUpdateTime
}) => {
  const [showCSVModal, setShowCSVModal] = useState(false);
  
  // 편집 상태 관리 추가
  const [isDragMode, setIsDragMode] = useState(false);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // 🔥 표시할 데이터 결정 로직 개선
  const displayData = React.useMemo(() => {
    // 온라인: 실시간 데이터 우선
    if (isDeviceConnected && latestData) {
      return latestData;
    }
    
    // 오프라인: 캐시 데이터 사용
    if (!isDeviceConnected && cachedData) {
      return cachedData;
    }
    
    // fallback: 어떤 데이터라도 있으면 사용
    return latestData || cachedData;
  }, [isDeviceConnected, latestData, cachedData]);

  const displayChartData = React.useMemo(() => {
    // 온라인: 실시간 차트 데이터 우선
    if (isDeviceConnected && chartData.length > 0) {
      return chartData;
    }
    
    // 오프라인: 캐시 차트 데이터 사용
    if (!isDeviceConnected && cachedChartData.length > 0) {
      return cachedChartData;
    }
    
    // fallback: 어떤 차트 데이터라도 있으면 사용
    return chartData.length > 0 ? chartData : cachedChartData;
  }, [isDeviceConnected, chartData, cachedChartData]);

  const {
    selectedSensorTypes,
    setSelectedSensorTypes,
    animatingCards,
    currentDeviceId,
    handleSensorTypeToggle
  } = useSimpleSensorData(displayData, deviceId);

  // 편집 핸들러들
  const handleToggleDragMode = () => setIsDragMode(!isDragMode);
  const handleResetOrder = () => {
    setCustomOrder([]);
    // localStorage에서도 제거
    try {
      localStorage.removeItem('sensorCards_customOrder');
    } catch (error) {
      console.error('순서 초기화 실패:', error);
    }
  };

  // 🔥 연결 상태 포맷팅
  const formatLastUpdateTime = (timeString?: string | null) => {
    if (!timeString) return '알 수 없음';
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return '방금 전';
      if (diffMins < 60) return `${diffMins}분 전`;
      if (diffHours < 24) return `${diffHours}시간 전`;
      return date.toLocaleString('ko-KR');
    } catch {
      return timeString;
    }
  };

  const handleExportData = () => {
    if (!currentDeviceId) {
      alert('디바이스 ID가 설정되지 않았습니다.');
      return;
    }
    setShowCSVModal(true);
  };

  // 🔥 개선된 오프라인 상태 표시 컴포넌트
  const renderOfflineStatus = () => {
    if (isDeviceConnected || !displayData) return null;

    // 데이터 소스 확인
    const dataSource = cachedData ? 'cache' : 'legacy';
    const hasRecentData = lastDataUpdateTime && 
      new Date().getTime() - new Date(lastDataUpdateTime).getTime() < 24 * 60 * 60 * 1000; // 24시간 이내

    return (
      <div className={`mb-4 rounded-lg p-3 ${hasRecentData ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${hasRecentData ? 'bg-amber-100' : 'bg-red-100'}`}>
              <svg className={`w-4 h-4 ${hasRecentData ? 'text-amber-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${hasRecentData ? 'text-amber-800' : 'text-red-800'}`}>
              <span className="font-medium">
                {hasRecentData ? '🔌 디바이스 오프라인' : '⚠️ 디바이스 장시간 오프라인'}
              </span>
              {' - '}
              {hasRecentData ? '최근 데이터를 표시합니다.' : '오래된 데이터입니다.'}
            </p>
            {lastDataUpdateTime && (
              <p className={`text-xs mt-1 ${hasRecentData ? 'text-amber-600' : 'text-red-600'}`}>
                마지막 업데이트: {formatLastUpdateTime(lastDataUpdateTime)}
              </p>
            )}
            <p className={`text-xs mt-1 ${hasRecentData ? 'text-amber-600' : 'text-red-600'}`}>
              💡 차트, 데이터 내보내기 등 모든 기능은 계속 사용 가능합니다.
            </p>
            {dataSource === 'cache' && (
              <p className="text-xs mt-1 text-blue-600">
                📋 캐시 데이터 표시 중 (센서 {displayData.sensors?.length || 0}개)
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 조기 반환 처리 - 캐시 데이터도 없는 경우
  if (!displayData) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-4xl mb-4">
          <img src="/chart.png" alt="Chart Icon" className="w-10 h-10 mx-auto" />
        </div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">센서 데이터 없음</h2>
        <p className="text-gray-500 mb-4">
          {isDeviceConnected 
            ? '디바이스에서 데이터를 수신하고 있지 않습니다.' 
            : '오프라인 상태이며 저장된 데이터도 없습니다.'
          }
        </p>
        <div className="text-xs text-gray-400 space-y-1">
          <p>• 연결 상태: {isDeviceConnected ? '온라인' : '오프라인'}</p>
          <p>• 실시간 데이터: {latestData ? '있음' : '없음'}</p>
          <p>• 캐시 데이터: {cachedData ? '있음' : '없음'}</p>
        </div>
      </div>
    );
  }

  // 데이터 준비
  const activeSensors = displayData.sensors?.filter(sensor => sensor.active) || [];
  const inactiveSensors = displayData.sensors?.filter(sensor => !sensor.active) || [];

  // deviceId 우선순위 체인 (가장 확실한 방법)
  const finalDeviceId = deviceId || currentDeviceId || displayData?.device_id || displayData?.deviceId;

  return (
    // 전체 컨테이너 높이 제한 완화
    <div className="space-y-3">
      {/* 애니메이션 CSS */}
      <style>{`
        @keyframes colorIntensify {
         0% { 
           background-color: inherit;
           transform: scale(1);
         }
         30% { 
           background-color: rgba(var(--sensor-color), 0.3);
           transform: scale(1.02);
         }
         60% { 
           background-color: rgba(var(--sensor-color), 0.4);
           transform: scale(1.02);
         }
         100% { 
           background-color: inherit;
           transform: scale(1);
         }
       }
      `}</style>

      {/* 🔥 개선된 오프라인 상태 표시 */}
      {renderOfflineStatus()}

      {/* CSV 다운로드 모달 */}
      {showCSVModal && (
        <CSVDownloadSection
          deviceId={currentDeviceId}
          availableSensors={activeSensors}
          historyData={historyData}
          isModal={true}
          onClose={() => {
            setShowCSVModal(false);
          }}
        />
      )}

      {/* 🔥 활성 센서 카드들 - 편집 버튼 포함 */}
      {activeSensors.length > 0 && (
        <div className="space-y-2 bg-white p-4 rounded-lg relative">
          {/* 모바일용 편집 버튼 - 센서 현황 헤더 우측에 위치 */}
          {isMobile && (
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={handleToggleDragMode}
                className={`w-8 h-8 rounded-md shadow-md border flex items-center justify-center transition-all duration-200 ${
                  isDragMode
                    ? 'bg-green-500 text-white border-green-600'
                    : 'bg-gray-200 text-black border-gray-200'
                }`}
              >
                {isDragMode ? (
                  <img src="/setup.png" alt="완료" className="w-4 h-4" />
                ) : (
                  <img src="/edit.png" alt="편집" className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {/* 모바일 초기화 버튼 */}
          {isMobile && customOrder.length > 0 && (
            <div className="absolute top-4 right-14 z-10">
              <button
                onClick={handleResetOrder}
                className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition-colors flex items-center justify-center"
              >
                <img src="/refresh.png" alt="초기화" className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* 센서 상태 헤더 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900">센서 현황</h3>
              <div className="flex items-center space-x-2">
                {!isDeviceConnected && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                    {lastDataUpdateTime && new Date().getTime() - new Date(lastDataUpdateTime).getTime() < 24 * 60 * 60 * 1000 
                      ? '일시 오프라인' 
                      : '장기 오프라인'
                    }
                  </span>
                )}
                {customOrder.length > 0 && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-medium">
                    커스텀
                  </span>
                )}
                {isDragMode && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    편집중
                  </span>
                )}
                {/* 🔥 데이터 소스 표시 */}
                {displayData && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isDeviceConnected 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isDeviceConnected ? '실시간' : '캐시'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <SensorCardsGrid
            sensors={activeSensors}
            animatingCards={animatingCards}
            isMobile={isMobile}
            isDragMode={isDragMode}
            onToggleDragMode={handleToggleDragMode}
            onResetOrder={handleResetOrder}
            customOrder={customOrder}
            showMobileEditButton={false} // 외부에서 렌더링하므로 false
            deviceId={deviceId}
          />
        </div>
      )}

      {/* 비활성 센서들 */}
      <InactiveSensors sensors={inactiveSensors} />

      {/* 🔥 차트 섹션 - 개선된 오프라인 대응 */}
      {displayChartData.length > 0 && finalDeviceId && (
        <div style={{ minHeight: '500px' }} className="p-4 bg-white rounded-lg">
          <SensorCharts
            chartData={displayChartData}
            isMobile={isMobile}
            selectedSensorTypes={selectedSensorTypes}
            setSelectedSensorTypes={setSelectedSensorTypes}
            handleSensorTypeToggle={handleSensorTypeToggle}
            activeSensors={activeSensors}
            deviceId={finalDeviceId}
            onExportData={!hideDataManagement ? handleExportData : undefined}
            // 🔥 차트 컴포넌트에 오프라인 상태 정보 전달
            isDeviceConnected={isDeviceConnected}
            cachedChartData={!isDeviceConnected ? displayChartData : undefined}
            lastDataUpdateTime={lastDataUpdateTime}
          />
        </div>
      )}

      {/* 차트 섹션 - deviceId가 없을 때 경고 */}
      {displayChartData.length > 0 && !finalDeviceId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="text-yellow-600">⚠️</div>
            <div>
              <p className="text-yellow-800 font-medium">차트 필터 저장 불가</p>
              <p className="text-yellow-700 text-sm">
                디바이스 ID가 설정되지 않아 차트 필터 설정을 저장할 수 없습니다.
                <br />
                <small>디버그: deviceId={deviceId}, currentDeviceId={currentDeviceId}, displayData.device_id={displayData?.device_id}</small>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 차트가 없는 경우에도 데이터 내보내기 버튼 표시 */}
      {displayChartData.length === 0 && !hideDataManagement && activeSensors.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-medium text-gray-900">데이터 관리</h4>
              <p className="text-sm text-gray-600 mt-1">
                {isDeviceConnected ? '실시간 데이터 관리' : '오프라인 데이터 관리'}
                {!isDeviceConnected && (
                  <span className="text-amber-600"> (오프라인 상태에서도 사용 가능)</span>
                )}
              </p>
            </div>
            <button
              onClick={handleExportData}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                isDeviceConnected 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
            >
              <span>📥</span>
              <span>CSV 내보내기</span>
            </button>
          </div>
        </div>
      )}


    </div>
  );
};