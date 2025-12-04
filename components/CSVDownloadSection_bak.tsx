// components/CSVDownloadSection.tsx - 타입 매칭 수정 완료
import React, { useState, useEffect } from 'react';
import { FlexibleSensorData, DetectedSensor } from '../types/sensor.types';

interface CSVDownloadSectionProps {
  deviceId: string;
  availableSensors?: DetectedSensor[];
  historyData?: FlexibleSensorData[];
  isModal?: boolean;
  onClose?: () => void;
  // 🔥 오프라인 데이터 지원 props 추가
  isDeviceConnected?: boolean;
  cachedData?: FlexibleSensorData | null;
  deviceName?: string;
  lastDataUpdateTime?: string | null;
}

interface SensorColumn {
  id: string;
  sensorName: string;
  valueIndex: number;
  label: string;
  unit: string;
  selected: boolean;
}

const CSVDownloadSection: React.FC<CSVDownloadSectionProps> = ({
  deviceId,
  availableSensors = [],
  historyData = [],
  isModal = false,
  onClose,
  // 🔥 오프라인 데이터 지원 props
  isDeviceConnected = true,
  cachedData,
  deviceName,
  lastDataUpdateTime
}) => {
  // 상태 관리
  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [samplingRate, setSamplingRate] = useState(1);
  const [maxRecords, setMaxRecords] = useState(100000);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeStats, setIncludeStats] = useState(false);
  const [sensorColumns, setSensorColumns] = useState<SensorColumn[]>([]);
  const [estimatedCount, setEstimatedCount] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  // 🔥 오프라인 관련 상태 추가
  const [includeCachedData, setIncludeCachedData] = useState(true);
  const [dataSourceMode, setDataSourceMode] = useState<'history_only' | 'cache_only' | 'both'>('both');

  // 🔥 데이터 소스 정보 계산
  const dataSourceInfo = React.useMemo(() => {
    const hasHistoryData = historyData.length > 0;
    const hasCachedData = !!cachedData;
    const isOnline = isDeviceConnected;

    let totalAvailableData = 0;
    if (hasHistoryData) totalAvailableData += historyData.length;
    if (hasCachedData && includeCachedData) totalAvailableData += 1;

    const dataAge = lastDataUpdateTime ? 
      Math.floor((Date.now() - new Date(lastDataUpdateTime).getTime()) / (1000 * 60)) : null;

    return {
      hasHistoryData,
      hasCachedData,
      isOnline,
      totalAvailableData,
      dataAge,
      canExport: hasHistoryData || hasCachedData,
      isStale: dataAge !== null && dataAge > 60, // 1시간 이상 오래된 데이터
      dataQuality: isOnline ? 'realtime' : (dataAge !== null && dataAge < 60 ? 'recent' : 'stale')
    };
  }, [historyData.length, cachedData, isDeviceConnected, lastDataUpdateTime, includeCachedData]);

  // 모달 초기화
  useEffect(() => {
    if (isModal) {
      setShowModal(true);
    }
  }, [isModal]);

  // 기본 날짜 설정 (최근 7일)
  useEffect(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    setEndDate(now.toISOString().split('T')[0]);
    setStartDate(weekAgo.toISOString().split('T')[0]);
  }, []);

  // 🔥 오프라인 상태에 따른 데이터 소스 모드 자동 설정
  useEffect(() => {
    if (!isDeviceConnected) {
      if (dataSourceInfo.hasHistoryData && dataSourceInfo.hasCachedData) {
        setDataSourceMode('both');
      } else if (dataSourceInfo.hasCachedData) {
        setDataSourceMode('cache_only');
      } else {
        setDataSourceMode('history_only');
      }
    }
  }, [isDeviceConnected, dataSourceInfo.hasHistoryData, dataSourceInfo.hasCachedData]);

  // 예상 데이터 개수 계산
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(`${startDate}T${startTime}:00`);
      const end = new Date(`${endDate}T${endTime}:00`);
      const diffSeconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
      
      let totalRecords = 0;
      
      // 온라인 상태: 시간 기반 추정
      if (isDeviceConnected) {
        totalRecords = Math.floor(diffSeconds / 5); // 5초마다 1건 가정
      } else {
        // 오프라인 상태: 실제 사용 가능한 데이터 기반
        if (dataSourceMode === 'history_only') {
          totalRecords = historyData.length;
        } else if (dataSourceMode === 'cache_only') {
          totalRecords = cachedData ? 1 : 0;
        } else { // both
          totalRecords = historyData.length + (cachedData ? 1 : 0);
        }
      }
      
      const sampledRecords = Math.floor(totalRecords / samplingRate);
      setEstimatedCount(Math.min(sampledRecords, maxRecords));
    }
  }, [startDate, endDate, startTime, endTime, samplingRate, maxRecords, isDeviceConnected, dataSourceMode, historyData.length, cachedData]);

  // ✅ 수정된 센서 라벨 함수 (실제 데이터 구조와 일치)
  const getSensorLabel = (sensorType: number, valueIndex: number): { label: string; unit: string } => {
    switch (sensorType) {
      case 1: // 온습도센서 (SHT20)
        if (valueIndex === 0) return { label: '온도', unit: '°C' };
        if (valueIndex === 1) return { label: '습도', unit: '%' };
        break;
      case 2: // 조도센서 (BH1750)
        if (valueIndex === 0) return { label: '조도', unit: 'lx' };
        break;
      case 3: // ADS1115 (pH/EC만 2개 값)
        if (valueIndex === 0) return { label: 'pH', unit: '' };
        if (valueIndex === 1) return { label: 'EC', unit: 'dS/m' };
        break;
      case 4: // CO2센서 (SCD30)
        if (valueIndex === 0) return { label: 'CO2', unit: 'ppm' };
        if (valueIndex === 1) return { label: '온도', unit: '°C' };
        if (valueIndex === 2) return { label: '습도', unit: '%' };
        break;
      case 5: // 온도센서 (DS18B20)
        if (valueIndex === 0) return { label: '온도', unit: '°C' };
        break;
      case 16: // 풍향센서
        if (valueIndex === 0) return { label: '기어방향', unit: '' };
        if (valueIndex === 1) return { label: '각도', unit: '°' };
        if (valueIndex === 2) return { label: '방향', unit: '' };
        break;
      case 17: // 풍속센서
        if (valueIndex === 0) return { label: '풍속', unit: 'm/s' };
        if (valueIndex === 1) return { label: '풍력계급', unit: '' };
        if (valueIndex === 2) return { label: '상태', unit: '' };
        break;
      case 18: // 강우/강설센서
        if (valueIndex === 0) return { label: '강수상태', unit: '' };
        if (valueIndex === 1) return { label: '강수상태텍스트', unit: '' };
        if (valueIndex === 2) return { label: '수분레벨', unit: '' };
        if (valueIndex === 3) return { label: '수분강도', unit: '' };
        if (valueIndex === 4) return { label: '온도', unit: '°C' };
        if (valueIndex === 5) return { label: '습도', unit: '%' };
        if (valueIndex === 6) return { label: '온도상태', unit: '' };
        if (valueIndex === 7) return { label: '아이콘', unit: '' };
        break;
      case 19: // 토양센서 (0~6 인덱스만 있음)
        if (valueIndex === 0) return { label: '토양습도', unit: '%' };
        if (valueIndex === 1) return { label: '토양온도', unit: '°C' };
        if (valueIndex === 2) return { label: '토양EC', unit: 'μS/cm' };
        if (valueIndex === 3) return { label: '토양pH', unit: '' };
        if (valueIndex === 4) return { label: '수분상태', unit: '' };
        if (valueIndex === 5) return { label: 'pH상태', unit: '' };
        if (valueIndex === 6) return { label: 'EC상태', unit: '' };
        break;
      case 11: // Modbus 온습도
        if (valueIndex === 0) return { label: '온도', unit: '°C' };
        if (valueIndex === 1) return { label: '습도', unit: '%' };
        break;
      case 12: // Modbus 압력
        if (valueIndex === 0) return { label: '압력', unit: 'bar' };
        break;
      case 13: // Modbus 유량
        if (valueIndex === 0) return { label: '유량', unit: 'L/min' };
        break;
      case 14: // Modbus 릴레이
        if (valueIndex === 0) return { label: '상태', unit: '' };
        break;
      case 15: // Modbus 전력
        if (valueIndex === 0) return { label: '전압', unit: 'V' };
        if (valueIndex === 1) return { label: '전류', unit: 'A' };
        break;
    }
    return { label: `값${valueIndex + 1}`, unit: '' };
  };

  // 센서 컬럼 생성 (캐시 데이터도 고려)
  useEffect(() => {
    const columns: SensorColumn[] = [];
    
    // 🔥 센서 데이터 소스 결정 (availableSensors 우선, 없으면 캐시 데이터 사용)
    let sensorsToProcess = availableSensors;
    
    if (availableSensors.length === 0 && cachedData?.sensors) {
      sensorsToProcess = cachedData.sensors.filter(sensor => sensor.active);
    }
    
    sensorsToProcess.forEach(sensor => {
      if (!sensor.active || !sensor.values) return;
      
      sensor.values.forEach((value, valueIndex) => {
        if (value === null || value === undefined) return;
        
        const { label, unit } = getSensorLabel(sensor.type, valueIndex);
        const friendlyName = getFriendlyName(sensor.name);
        
        columns.push({
          id: `${sensor.name}_${valueIndex}`,
          sensorName: sensor.name,
          valueIndex,
          label: `${friendlyName}_${label}`,
          unit,
          selected: true
        });
      });
    });
    
    setSensorColumns(columns);
  }, [availableSensors, cachedData]);

  // 센서 이름을 친화적으로 변환
  const getFriendlyName = (name: string): string => {
    const nameMap: { [key: string]: string } = {
      'SCD30_CH0': 'CO2센서',
      'BH1750_CH0': '조도센서',
      'SHT20_CH0': '온습도센서',
      'ADS1115_CH0': '수질센서',
      'DS18B20_CH0': '수온센서',
      'SOIL_SENSOR_CH0': '토양센서',
      'WIND_DIRECTION_CH0': '풍향센서',
      'WIND_SPEED_CH0': '풍속센서',
      'PRECIPITATION_CH0': '강우강설센서'
    };
    return nameMap[name] || name;
  };

  // 빠른 날짜 선택
  const setQuickRange = (days: number) => {
    const now = new Date();
    const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    setEndDate(now.toISOString().split('T')[0]);
    setStartDate(past.toISOString().split('T')[0]);
    setStartTime('00:00');
    setEndTime('23:59');
  };

  // 센서 선택 토글
  const toggleSensor = (id: string) => {
    setSensorColumns(prev =>
      prev.map(col => col.id === id ? { ...col, selected: !col.selected } : col)
    );
  };

  // 전체 선택/해제
  const toggleAllSensors = () => {
    const allSelected = sensorColumns.every(col => col.selected);
    setSensorColumns(prev =>
      prev.map(col => ({ ...col, selected: !allSelected }))
    );
  };

  // 🔥 개선된 데이터 조회 (오프라인 데이터 포함)
  const fetchSensorData = async (): Promise<FlexibleSensorData[]> => {
    try {
      console.log('🚀 센서 데이터 조회 시작:', { 
        deviceId, 
        isDeviceConnected, 
        dataSourceMode,
        historyCount: historyData.length,
        hasCachedData: !!cachedData
      });
      
      let combinedData: FlexibleSensorData[] = [];
      
      // 1. 온라인 상태: API 호출 시도
      if (isDeviceConnected) {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/sensors/export-batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: JSON.stringify({
              deviceId,
              startDate: `${startDate}T${startTime}:00.000Z`,
              endDate: `${endDate}T${endTime}:00.000Z`,
              limit: maxRecords,
              samplingInterval: samplingRate
            })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              console.log('✅ API로 데이터 조회 성공:', result.data.length, '건');
              return result.data;
            }
          }
        } catch (apiError) {
          console.warn('⚠️ API 호출 실패, 로컬 데이터 사용:', apiError);
        }
      }

      // 2. 오프라인 상태 또는 API 실패: 로컬 데이터 사용
      if (dataSourceMode === 'history_only' || dataSourceMode === 'both') {
        combinedData = [...historyData];
        console.log('📊 히스토리 데이터 추가:', historyData.length, '건');
      }

      if ((dataSourceMode === 'cache_only' || dataSourceMode === 'both') && cachedData && includeCachedData) {
        // 캐시 데이터를 최신 데이터로 추가
        combinedData.push(cachedData);
        console.log('💾 캐시 데이터 추가: 1건 (마지막 수신 데이터)');
      }

      // 3. 시간순 정렬 (최신 데이터가 마지막)
      combinedData.sort((a, b) => {
        const timeA = a.timestamp || a.receivedAt || 0;
        const timeB = b.timestamp || b.receivedAt || 0;
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });

      console.log(`✅ 총 데이터 조회 완료: ${combinedData.length}건`);
      return combinedData;

    } catch (error) {
      console.error('❌ 데이터 조회 오류:', error);
      // 최종 fallback: 사용 가능한 모든 데이터 반환
      const fallbackData = [...historyData];
      if (cachedData && includeCachedData) {
        fallbackData.push(cachedData);
      }
      return fallbackData;
    }
  };

  // 센서 값 추출
  const extractSensorValue = (data: FlexibleSensorData, sensorName: string, valueIndex: number): number => {
    const sensor = data.sensors?.find(s => s.name === sensorName);
    if (!sensor || !sensor.values || sensor.values[valueIndex] === undefined) return 0;
    
    const value = sensor.values[valueIndex];
    
    // 문자열인 경우 0 반환 (통계 계산용)
    if (typeof value !== 'number') return 0;
    
    return value;
  };

  // 🔥 개선된 CSV 생성 (데이터 소스 표시 포함)
  const generateCSV = (data: FlexibleSensorData[]): string => {
    const selectedColumns = sensorColumns.filter(col => col.selected);
    
    // 헤더 생성
    const headers = ['번호', '측정일시'];
    if (includeMetadata) {
      headers.push('디바이스ID', '센서개수', '데이터소스');
    }
    selectedColumns.forEach(col => {
      const unitText = col.unit ? ` (${col.unit})` : '';
      headers.push(`${col.label}${unitText}`);
    });
    
    // 🔥 데이터 소스 식별 함수
    const identifyDataSource = (item: FlexibleSensorData, index: number): string => {
      // 캐시 데이터 식별 (가장 최신이고 오프라인 상태인 경우)
      if (!isDeviceConnected && cachedData && 
          item.timestamp === cachedData.timestamp && 
          index === data.length - 1) {
        return '캐시';
      }
      
      // API 데이터 vs 로컬 데이터 구분
      if (isDeviceConnected) {
        return '실시간';
      } else {
        return '히스토리';
      }
    };
    
    // 데이터 행 생성
    const rows = data.map((item, index) => {
      // 타임스탬프 처리
      let timestamp = '날짜 없음';
      if (item.receivedAt) {
        timestamp = new Date(item.receivedAt).toLocaleString('ko-KR');
      } else if (item.timestamp) {
        const date = typeof item.timestamp === 'number' 
          ? new Date(item.timestamp * 1000) 
          : new Date(item.timestamp);
        timestamp = date.toLocaleString('ko-KR');
      }
      
      // 행 데이터 생성
      const row = [(index + 1).toString(), timestamp];
      if (includeMetadata) {
        const dataSource = identifyDataSource(item, index);
        row.push(deviceId, (item.sensors?.length || 0).toString(), dataSource);
      }
      selectedColumns.forEach(col => {
        const value = extractSensorValue(item, col.sensorName, col.valueIndex);
        const sensor = item.sensors?.find(s => s.name === col.sensorName);
        const rawValue = sensor?.values?.[col.valueIndex];
        
        // 문자열 값은 그대로, 숫자 값은 포맷팅
        if (typeof rawValue === 'string') {
          row.push(rawValue);
        } else {
          row.push(value.toFixed(2));
        }
      });
      
      return row;
    });
    
    // 통계 정보 추가
    if (includeStats && data.length > 0) {
      rows.push([]);
      rows.push(['=== 통계 정보 ===']);
      rows.push(['센서', '최소값', '최대값', '평균값', '데이터 개수']);
      
      selectedColumns.forEach(col => {
        const values = data
          .map(d => extractSensorValue(d, col.sensorName, col.valueIndex))
          .filter(v => !isNaN(v) && v !== 0);
        
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          rows.push([col.label, min.toFixed(2), max.toFixed(2), avg.toFixed(2), values.length.toString()]);
        }
      });
      
      // 🔥 오프라인 정보 추가
      if (!isDeviceConnected) {
        rows.push([]);
        rows.push(['=== 오프라인 데이터 정보 ===']);
        rows.push(['항목', '값']);
        rows.push(['디바이스 상태', '오프라인']);
        if (lastDataUpdateTime) {
          rows.push(['마지막 업데이트', new Date(lastDataUpdateTime).toLocaleString('ko-KR')]);
          rows.push(['데이터 나이 (분)', dataSourceInfo.dataAge?.toString() || '알 수 없음']);
        }
        rows.push(['히스토리 데이터', `${historyData.length}건`]);
        rows.push(['캐시 데이터', cachedData ? '1건 (포함됨)' : '없음']);
        rows.push(['데이터 품질', dataSourceInfo.dataQuality]);
      }
    }
    
    // CSV 문자열 생성
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    return '\uFEFF' + csvContent; // UTF-8 BOM 추가
  };

  // 파일 다운로드
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 다운로드 실행
  const handleDownload = async () => {
    const selectedCount = sensorColumns.filter(col => col.selected).length;
    
    if (selectedCount === 0) {
      alert('센서를 최소 1개 이상 선택해주세요.');
      return;
    }
    
    if (!dataSourceInfo.canExport) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    
    if (estimatedCount === 0) {
      alert('선택한 조건에 해당하는 데이터가 없습니다.');
      return;
    }
    
    if (estimatedCount > 50000) {
      const confirmed = confirm(
        `예상 데이터가 ${estimatedCount.toLocaleString()}건입니다.\n계속하시겠습니까?`
      );
      if (!confirmed) return;
    }
    
    // 🔥 오프라인 상태 경고
    if (!isDeviceConnected) {
      const offlineConfirm = confirm(
        `⚠️ 디바이스가 오프라인 상태입니다.\n\n` +
        `사용 가능한 데이터:\n` +
        `• 히스토리 데이터: ${historyData.length}건\n` +
        `• 캐시 데이터: ${cachedData ? '1건 (마지막 수신)' : '없음'}\n` +
        `• 데이터 나이: ${dataSourceInfo.dataAge ? `${dataSourceInfo.dataAge}분 전` : '알 수 없음'}\n\n` +
        `계속하시겠습니까?`
      );
      if (!offlineConfirm) return;
    }
    
    setIsDownloading(true);
    setProgress(0);
    
    try {
      setProgress(25);
      const data = await fetchSensorData();
      
      if (data.length === 0) {
        alert('선택한 조건에 해당하는 데이터가 없습니다.');
        return;
      }
      
      setProgress(50);
      const csvContent = generateCSV(data);
      
      setProgress(75);
      // 🔥 오프라인 상태를 파일명에 반영
      const statusSuffix = isDeviceConnected ? '' : '_오프라인';
      const deviceNameSuffix = deviceName ? `_${deviceName}` : '';
      const filename = `센서데이터_${deviceId}${deviceNameSuffix}${statusSuffix}_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}.csv`;
      
      setProgress(100);
      downloadCSV(csvContent, filename);
      
      const successMessage = [
        '✅ 다운로드 완료!',
        `파일: ${filename}`,
        `데이터: ${data.length.toLocaleString()}건`
      ];
      
      if (!isDeviceConnected) {
        successMessage.push(`상태: 오프라인 데이터 (${dataSourceInfo.dataQuality})`);
      }
      
      alert(successMessage.join('\n'));
      
      // 모달 닫기
      if (isModal && onClose) {
        onClose();
      } else {
        setShowModal(false);
      }
      
    } catch (error) {
      console.error('❌ 다운로드 실패:', error);
      alert(`다운로드 실패: ${error}`);
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  // 모달 닫기
  const handleClose = () => {
    setShowModal(false);
    if (isModal && onClose) {
      onClose();
    }
  };

  // 🔥 오프라인 상태 표시 컴포넌트
  const renderOfflineStatus = () => {
    if (isDeviceConnected) return null;

    const statusColor = dataSourceInfo.isStale ? 'red' : 'amber';
    const bgClass = `bg-${statusColor}-50`;
    const borderClass = `border-${statusColor}-200`;
    const textClass = `text-${statusColor}-800`;
    const iconClass = `text-${statusColor}-600`;

    return (
      <div className={`p-4 rounded-lg border ${bgClass} ${borderClass} mb-4`}>
        <div className="flex items-start space-x-3">
          <div className={`${iconClass} mt-0.5`}>
            {dataSourceInfo.isStale ? '⚠️' : '📋'}
          </div>
          <div className="flex-1">
            <h4 className={`font-medium ${textClass} mb-1`}>
              {dataSourceInfo.isStale ? '장기 오프라인 데이터' : '오프라인 데이터'}
            </h4>
            <div className={`text-sm ${textClass} space-y-1`}>
              <p>• 히스토리 데이터: {historyData.length}건</p>
              <p>• 캐시 데이터: {cachedData ? '1건 (마지막 수신)' : '없음'}</p>
              {dataSourceInfo.dataAge && (
                <p>• 데이터 나이: {dataSourceInfo.dataAge}분 전</p>
              )}
              <p>• 품질: {dataSourceInfo.dataQuality === 'recent' ? '최근' : dataSourceInfo.dataQuality === 'stale' ? '오래됨' : '실시간'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 모달 컨텐츠
  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* 헤더 */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold flex items-center">
                📊 CSV 다운로드
                {/* 🔥 오프라인 상태 표시 */}
                {!isDeviceConnected && (
                  <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 text-sm rounded">
                    오프라인
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {deviceName && `${deviceName} - `}
                {isDeviceConnected ? '실시간 센서 데이터' : '오프라인 센서 데이터'}를 CSV 파일로 다운로드합니다
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isDownloading}
              className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50"
            >
              ×
            </button>
          </div>

          {/* 🔥 오프라인 상태 표시 */}
          {renderOfflineStatus()}

          {/* 진행률 표시 */}
          {isDownloading && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-blue-800">다운로드 중...</span>
                <span className="text-sm text-blue-600">{progress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 왼쪽: 설정 */}
            <div className="space-y-6">
              {/* 🔥 오프라인일 때 데이터 소스 선택 */}
              {!isDeviceConnected && (dataSourceInfo.hasHistoryData || dataSourceInfo.hasCachedData) && (
                <div>
                  <h3 className="font-medium mb-3">📂 데이터 소스</h3>
                  <div className="space-y-2">
                    {dataSourceInfo.hasHistoryData && (
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="dataSource"
                          value="history_only"
                          checked={dataSourceMode === 'history_only'}
                          onChange={(e) => setDataSourceMode(e.target.value as any)}
                          disabled={isDownloading}
                          className="mr-2"
                        />
                        <span className="text-sm">히스토리 데이터만 ({historyData.length}건)</span>
                      </label>
                    )}
                    {dataSourceInfo.hasCachedData && (
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="dataSource"
                          value="cache_only"
                          checked={dataSourceMode === 'cache_only'}
                          onChange={(e) => setDataSourceMode(e.target.value as any)}
                          disabled={isDownloading}
                          className="mr-2"
                        />
                        <span className="text-sm">캐시 데이터만 (1건 - 마지막 수신)</span>
                      </label>
                    )}
                    {dataSourceInfo.hasHistoryData && dataSourceInfo.hasCachedData && (
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="dataSource"
                          value="both"
                          checked={dataSourceMode === 'both'}
                          onChange={(e) => setDataSourceMode(e.target.value as any)}
                          disabled={isDownloading}
                          className="mr-2"
                        />
                        <span className="text-sm">전체 데이터 ({historyData.length + 1}건)</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* 날짜 선택 */}
              <div>
                <h3 className="font-medium mb-3">📅 기간 선택</h3>
                
                {/* 빠른 선택 버튼 */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <button
                    onClick={() => setQuickRange(1)}
                    disabled={isDownloading}
                    className="p-2 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    오늘
                  </button>
                  <button
                    onClick={() => setQuickRange(7)}
                    disabled={isDownloading}
                    className="p-2 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    7일
                  </button>
                  <button
                    onClick={() => setQuickRange(30)}
                    disabled={isDownloading}
                    className="p-2 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    30일
                  </button>
                  <button
                    onClick={() => setQuickRange(365)}
                    disabled={isDownloading}
                    className="p-2 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    1년
                  </button>
                </div>

                {/* 상세 날짜 시간 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">시작일</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={isDownloading || !isDeviceConnected}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      disabled={isDownloading || !isDeviceConnected}
                      className="w-full p-2 border rounded mt-1 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">종료일</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={isDownloading || !isDeviceConnected}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      disabled={isDownloading || !isDeviceConnected}
                      className="w-full p-2 border rounded mt-1 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>
                
                {/* 오프라인 상태에서 날짜 선택 비활성화 안내 */}
                {!isDeviceConnected && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 오프라인 상태에서는 사용 가능한 모든 데이터를 내보냅니다.
                  </p>
                )}
              </div>

              {/* 샘플링 설정 (온라인일 때만) */}
              {isDeviceConnected && (
                <div>
                  <h3 className="font-medium mb-3">⚙️ 샘플링 설정</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">샘플링 간격</label>
                      <select
                        value={samplingRate}
                        onChange={(e) => setSamplingRate(Number(e.target.value))}
                        disabled={isDownloading}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1}>전체 (5초마다)</option>
                        <option value={2}>1/2 (10초마다)</option>
                        <option value={6}>1/6 (30초마다)</option>
                        <option value={12}>1/12 (1분마다)</option>
                        <option value={60}>1/60 (5분마다)</option>
                        <option value={120}>1/120 (10분마다)</option>
                        <option value={360}>1/360 (30분마다)</option>
                        <option value={720}>1/720 (1시간마다)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">최대 레코드 수</label>
                      <select
                        value={maxRecords}
                        onChange={(e) => setMaxRecords(Number(e.target.value))}
                        disabled={isDownloading}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1000}>1,000건</option>
                        <option value={5000}>5,000건</option>
                        <option value={10000}>10,000건</option>
                        <option value={50000}>50,000건</option>
                        <option value={100000}>100,000건</option>
                        <option value={500000}>500,000건</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* CSV 옵션 */}
              <div>
                <h3 className="font-medium mb-3">📋 CSV 옵션</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={(e) => setIncludeMetadata(e.target.checked)}
                      disabled={isDownloading}
                      className="mr-2"
                    />
                    <span className="text-sm">메타데이터 포함 (디바이스ID, 센서개수, 데이터소스)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={includeStats}
                      onChange={(e) => setIncludeStats(e.target.checked)}
                      disabled={isDownloading}
                      className="mr-2"
                    />
                    <span className="text-sm">통계 정보 포함 (최소/최대/평균값)</span>
                  </label>
                </div>
              </div>

              {/* 🔥 개선된 예상 정보 */}
              <div className={`p-3 rounded ${isDeviceConnected ? 'bg-blue-50' : 'bg-amber-50'}`}>
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${isDeviceConnected ? 'text-blue-800' : 'text-amber-800'}`}>
                    📊 예상 데이터: {estimatedCount.toLocaleString()}건
                  </p>
                  {isDeviceConnected ? (
                    <>
                      <p className="text-xs text-blue-600">
                        샘플링: 1/{samplingRate} ({samplingRate === 1 ? '전체' : `${samplingRate * 5}초 간격`})
                      </p>
                      <p className="text-xs text-blue-600">
                        최대: {maxRecords.toLocaleString()}건
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-amber-600">
                        오프라인 모드: 사용 가능한 모든 데이터
                      </p>
                      <p className="text-xs text-amber-600">
                        품질: {dataSourceInfo.dataQuality === 'recent' ? '최근 데이터' : '오래된 데이터'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* 디바이스 정보 */}
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-sm text-gray-700">
                  <strong>디바이스:</strong> {deviceName || deviceId}
                </p>
                <p className="text-sm text-gray-700">
                  <strong>상태:</strong> {isDeviceConnected ? '온라인' : '오프라인'}
                </p>
                <p className="text-sm text-gray-700">
                  <strong>활성 센서:</strong> {availableSensors.length}개
                </p>
                <p className="text-sm text-gray-700">
                  <strong>선택 가능한 컬럼:</strong> {sensorColumns.length}개
                </p>
                {!isDeviceConnected && lastDataUpdateTime && (
                  <p className="text-sm text-gray-700">
                    <strong>마지막 수신:</strong> {new Date(lastDataUpdateTime).toLocaleString('ko-KR')}
                  </p>
                )}
              </div>
            </div>

            {/* 오른쪽: 센서 선택 */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">🔧 센서 선택</h3>
                <button
                  onClick={toggleAllSensors}
                  disabled={isDownloading}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {sensorColumns.every(col => col.selected) ? '전체 해제' : '전체 선택'}
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto border rounded p-3 space-y-2">
                {sensorColumns.length > 0 ? sensorColumns.map((column) => (
                  <label
                    key={column.id}
                    className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={column.selected}
                      onChange={() => toggleSensor(column.id)}
                      disabled={isDownloading}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{column.label}</p>
                      <p className="text-xs text-gray-500">
                        {column.unit && `${column.unit} | `}{column.sensorName}
                      </p>
                    </div>
                  </label>
                )) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">선택 가능한 센서가 없습니다.</p>
                    {!isDeviceConnected && (
                      <p className="text-xs mt-1">오프라인 상태에서 센서 정보를 불러올 수 없습니다.</p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-2">
                선택: {sensorColumns.filter(col => col.selected).length}/{sensorColumns.length}개
              </p>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
            <button
              onClick={handleClose}
              disabled={isDownloading}
              className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading || !dataSourceInfo.canExport || sensorColumns.filter(col => col.selected).length === 0}
              className={`px-4 py-2 text-white rounded hover:opacity-90 disabled:opacity-50 flex items-center ${
                isDeviceConnected ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isDownloading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  다운로드 중...
                </>
              ) : (
                `📥 CSV 다운로드 (${estimatedCount.toLocaleString()}건)`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 모달 모드인 경우 바로 모달 렌더링
  if (isModal) {
    return modalContent;
  }

  // 일반 모드 (기존 호환성 유지)
  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              📊 데이터 다운로드
              {/* 🔥 오프라인 상태 표시 */}
              {!isDeviceConnected && (
                <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 text-sm rounded">
                  오프라인
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {isDeviceConnected ? '센서 데이터' : '오프라인 센서 데이터'}를 CSV 파일로 다운로드합니다
              {!isDeviceConnected && ` (사용 가능: ${dataSourceInfo.totalAvailableData}건)`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['today', 'week', 'month', 'all'] as const).map((period) => {
            const periodData = {
              today: { name: '오늘', icon: '📅', days: 1 },
              week: { name: '일주일', icon: '📆', days: 7 },
              month: { name: '한달', icon: '🗓️', days: 30 },
              all: { name: '전체', icon: '📋', days: 365 }
            };
            const { name, icon, days } = periodData[period];

            return (
              <button
                key={period}
                onClick={() => {
                  setQuickRange(days);
                  setShowModal(true);
                }}
                disabled={!dataSourceInfo.canExport}
                className="relative p-4 rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex flex-col items-center space-y-2">
                  <div className="text-2xl">{icon}</div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-800 text-sm">{name}</p>
                  </div>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isDeviceConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isDeviceConnected ? 'CSV' : '오프라인'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`mt-4 p-3 rounded-lg ${isDeviceConnected ? 'bg-gray-50' : 'bg-amber-50'}`}>
          <p className={`text-xs flex items-center ${isDeviceConnected ? 'text-gray-600' : 'text-amber-700'}`}>
            <span className="mr-2">💡</span>
            {isDeviceConnected 
              ? '원하는 기간을 선택하면 센서 데이터를 CSV 파일로 다운로드할 수 있습니다.'
              : `오프라인 상태입니다. 사용 가능한 데이터 ${dataSourceInfo.totalAvailableData}건을 다운로드할 수 있습니다.`
            }
          </p>
        </div>
      </div>

      {/* 모달 */}
      {showModal && modalContent}
    </>
  );
};

export default CSVDownloadSection;