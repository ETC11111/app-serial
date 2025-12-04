// components/admin/SensorHistoryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Device {
  device_id: string;
  device_name: string;
}

interface SensorData {
  sensor_id: number;
  name: string;
  type: number;
  channel: number;
  status: number;
  active: boolean;
  values: number[];
  value_names: string[];
}

interface SensorHistory {
  device_id: string;
  timestamp: number;
  sensor_count: number;
  sensors: SensorData[];
  stored_at: string;
  original_timestamp: number;
}

interface SensorHistoryModalProps {
  user: User;
  device: Device;
  isOpen: boolean;
  onClose: () => void;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  sensorTypes: number[];
  activeOnly: boolean;
  channels: number[];
  searchText: string;
}

const SensorHistoryModal: React.FC<SensorHistoryModalProps> = ({
  user,
  device,
  isOpen,
  onClose
}) => {
  const [history, setHistory] = useState<SensorHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // 필터 상태
  const [filters, setFilters] = useState<Filters>({
    dateFrom: '',
    dateTo: '',
    sensorTypes: [],
    activeOnly: false,
    channels: [],
    searchText: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchSensorHistory();
      
      // 5초마다 자동 갱신
      const interval = setInterval(() => {
        fetchSensorHistory(true); // 자동 갱신임을 표시
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isOpen, user.id, device.device_id]);

  const fetchSensorHistory = async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(
        `/api/admin/users/${user.id}/devices/${device.device_id}/sensor-history?limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setHistory(data.history);
          setError('');
        } else {
          setError(data.error || '센서 히스토리를 불러올 수 없습니다.');
        }
      } else {
        setError('센서 히스토리를 불러오는 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('Fetch sensor history error:', err);
      setError('센서 히스토리를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    fetchSensorHistory();
  };

  const getSensorTypeLabel = (type: number) => {
    const types: { [key: number]: string } = {
      1: 'SHT20 (온습도)',
      2: 'BH1750 (조도)',
      3: 'ADS1115 (pH/EC)',
      4: 'SCD30 (CO2)',
      5: 'DS18B20 (온도)'
    };
    return types[type] || `센서타입${type}`;
  };

  const formatSensorValue = (value: number, valueName: string) => {
    const units: { [key: string]: string } = {
      temperature: '°C',
      humidity: '%',
      light_level: ' lux',
      ph: '',
      ec: ' dS/m',
      co2_ppm: ' ppm'
    };
    
    const unit = units[valueName] || '';
    return `${value.toFixed(2)}${unit}`;
  };

  // 사용 가능한 센서 타입과 채널 추출
  const availableSensorTypes = useMemo(() => {
    const types = new Set<number>();
    history.forEach(record => {
      record.sensors.forEach(sensor => {
        types.add(sensor.type);
      });
    });
    return Array.from(types).sort();
  }, [history]);

  const availableChannels = useMemo(() => {
    const channels = new Set<number>();
    history.forEach(record => {
      record.sensors.forEach(sensor => {
        channels.add(sensor.channel);
      });
    });
    return Array.from(channels).sort();
  }, [history]);

  // 필터링된 데이터
  const filteredHistory = useMemo(() => {
    return history.filter(record => {
      // 날짜 필터
      const recordDate = new Date(record.stored_at);
      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        if (recordDate < fromDate) return false;
      }
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999); // 해당 날짜 끝까지
        if (recordDate > toDate) return false;
      }

      // 센서별 필터링
      const filteredSensors = record.sensors.filter(sensor => {
        // 센서 타입 필터
        if (filters.sensorTypes.length > 0 && !filters.sensorTypes.includes(sensor.type)) {
          return false;
        }
        
        // 활성 상태 필터
        if (filters.activeOnly && !sensor.active) {
          return false;
        }
        
        // 채널 필터
        if (filters.channels.length > 0 && !filters.channels.includes(sensor.channel)) {
          return false;
        }
        
        // 검색 텍스트 필터
        if (filters.searchText) {
          const searchLower = filters.searchText.toLowerCase();
          const sensorName = getSensorTypeLabel(sensor.type).toLowerCase();
          if (!sensorName.includes(searchLower) && 
              !sensor.sensor_id.toString().includes(searchLower)) {
            return false;
          }
        }
        
        return true;
      });

      return filteredSensors.length > 0;
    }).map(record => ({
      ...record,
      sensors: record.sensors.filter(sensor => {
        // 위와 동일한 필터 로직
        if (filters.sensorTypes.length > 0 && !filters.sensorTypes.includes(sensor.type)) return false;
        if (filters.activeOnly && !sensor.active) return false;
        if (filters.channels.length > 0 && !filters.channels.includes(sensor.channel)) return false;
        if (filters.searchText) {
          const searchLower = filters.searchText.toLowerCase();
          const sensorName = getSensorTypeLabel(sensor.type).toLowerCase();
          if (!sensorName.includes(searchLower) && !sensor.sensor_id.toString().includes(searchLower)) return false;
        }
        return true;
      })
    }));
  }, [history, filters]);

  const resetFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      sensorTypes: [],
      activeOnly: false,
      channels: [],
      searchText: ''
    });
  };

  const handleSensorTypeToggle = (type: number) => {
    setFilters(prev => ({
      ...prev,
      sensorTypes: prev.sensorTypes.includes(type)
        ? prev.sensorTypes.filter(t => t !== type)
        : [...prev.sensorTypes, type]
    }));
  };

  const handleChannelToggle = (channel: number) => {
    setFilters(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full h-[90vh] flex flex-col">
        {/* 고정 헤더 */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center space-x-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                센서 데이터 히스토리
              </h3>
              <p className="text-sm text-gray-500">
                {user.name} - {device.device_name} 
                {filteredHistory.length !== history.length && (
                  <span className="ml-2 text-blue-600">
                    (필터됨: {filteredHistory.reduce((acc, record) => acc + record.sensors.length, 0)} / 
                    {history.reduce((acc, record) => acc + record.sensors.length, 0)})
                  </span>
                )}
              </p>
            </div>
            {refreshing && (
              <div className="flex items-center text-sm text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                갱신 중...
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleManualRefresh}
              disabled={loading || refreshing}
              className="px-3 py-2 bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center space-x-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm">새로고침</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 탭 메뉴 */}
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex px-6">
            <button
              onClick={() => setShowFilters(false)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                !showFilters 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📊 데이터 목록
            </button>
            <button
              onClick={() => setShowFilters(true)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                showFilters 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🔍 필터 설정
              {(filters.dateFrom || filters.dateTo || filters.sensorTypes.length > 0 || 
                filters.activeOnly || filters.channels.length > 0 || filters.searchText) && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  활성
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* 필터 패널 */}
        {showFilters && (
          <div className="border-b border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 날짜 범위 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작 날짜</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료 날짜</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              
              {/* 검색 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">검색</label>
                <input
                  type="text"
                  placeholder="센서명 또는 ID"
                  value={filters.searchText}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>

              {/* 활성 상태 */}
              <div className="flex items-center">
                <label className="flex items-center mt-6">
                  <input
                    type="checkbox"
                    checked={filters.activeOnly}
                    onChange={(e) => setFilters(prev => ({ ...prev, activeOnly: e.target.checked }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">활성 센서만</span>
                </label>
              </div>
            </div>

            {/* 센서 타입 필터 */}
            {availableSensorTypes.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">센서 타입</label>
                <div className="flex flex-wrap gap-2">
                  {availableSensorTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => handleSensorTypeToggle(type)}
                      className={`px-3 py-1 rounded-full text-xs transition-colors ${
                        filters.sensorTypes.includes(type)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {getSensorTypeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 채널 필터 */}
            {availableChannels.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">채널</label>
                <div className="flex flex-wrap gap-2">
                  {availableChannels.map(channel => (
                    <button
                      key={channel}
                      onClick={() => handleChannelToggle(channel)}
                      className={`px-3 py-1 rounded-full text-xs transition-colors ${
                        filters.channels.includes(channel)
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      CH {channel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 필터 리셋 버튼 */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={resetFilters}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
              >
                필터 초기화
              </button>
            </div>
          </div>
        )}

        {/* 스크롤 가능한 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
          ) : error ? (
            <div className="m-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {history.length === 0 ? '센서 데이터가 없습니다.' : '필터 조건에 맞는 데이터가 없습니다.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      #
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      수집시간
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      센서타입
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      CH
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      ID
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      상태
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      온도(°C)
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      습도(%)
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      조도(lux)
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      pH
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      EC(dS/m)
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                      CO2(ppm)
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredHistory.map((record, recordIndex) => 
                    record.sensors.map((sensor, sensorIndex) => {
                      // 센서값들을 매핑
                      const sensorValues: { [key: string]: number | null } = {};
                      sensor.value_names.forEach((name, index) => {
                        sensorValues[name] = sensor.values[index] || null;
                      });

                      return (
                        <tr 
                          key={`${recordIndex}-${sensorIndex}`} 
                          className={`hover:bg-blue-50 ${!sensor.active ? 'bg-gray-50 text-gray-500' : ''} ${recordIndex % 2 === 0 ? 'bg-gray-25' : ''}`}
                        >
                          <td className="px-2 py-1 text-center border-r border-gray-100">
                            {sensorIndex === 0 && (
                              <span className="text-gray-600 font-medium">
                                {recordIndex + 1}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1 border-r border-gray-100">
                            {sensorIndex === 0 ? (
                              <div className="whitespace-nowrap">
                                <div className="font-medium text-gray-900">
                                  {new Date(record.stored_at).toLocaleDateString('ko-KR', {
                                    month: '2-digit',
                                    day: '2-digit'
                                  })}
                                </div>
                                <div className="text-gray-500">
                                  {new Date(record.stored_at).toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-1 border-r border-gray-100">
                            <div className="whitespace-nowrap font-medium">
                              {getSensorTypeLabel(sensor.type).split(' ')[0]}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-gray-100">
                            <span className="font-mono">{sensor.channel}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-gray-100">
                            <span className="font-mono">{sensor.sensor_id}</span>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-gray-100">
                            <span className={`w-2 h-2 rounded-full inline-block ${
                              sensor.active ? 'bg-green-500' : 'bg-gray-400'
                            }`}></span>
                          </td>
                          <td className="px-2 py-1 text-right border-r border-gray-100 font-mono">
                            {sensorValues.temperature !== null && sensorValues.temperature !== undefined ? 
                              sensorValues.temperature.toFixed(1) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right border-r border-gray-100 font-mono">
                            {sensorValues.humidity !== null && sensorValues.humidity !== undefined ? 
                              sensorValues.humidity.toFixed(1) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right border-r border-gray-100 font-mono">
                            {sensorValues.light_level !== null && sensorValues.light_level !== undefined ? 
                              Math.round(sensorValues.light_level) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right border-r border-gray-100 font-mono">
                            {sensorValues.ph !== null && sensorValues.ph !== undefined ? 
                              sensorValues.ph.toFixed(2) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right border-r border-gray-100 font-mono">
                            {sensorValues.ec !== null && sensorValues.ec !== undefined ? 
                              sensorValues.ec.toFixed(2) : '-'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">
                            {sensorValues.co2_ppm !== null && sensorValues.co2_ppm !== undefined ? 
                              Math.round(sensorValues.co2_ppm) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SensorHistoryModal;