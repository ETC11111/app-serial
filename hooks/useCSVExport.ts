// hooks/useCSVExport.ts (수정된 버전)

import { FlexibleSensorData } from '../types/sensor.types';

export const useCSVExport = (currentDeviceId: string, historyData: FlexibleSensorData[] = []) => {
  // CSV 관련 함수들
  const convertToCSVFormat = async (startDate: Date, endDate: Date): Promise<FlexibleSensorData[]> => {
    try {
      console.log('🚀 useCSVExport.convertToCSVFormat 호출:', { 
        currentDeviceId, 
        startDate: startDate.toISOString(), 
        endDate: endDate.toISOString() 
      });

      const requestBody = {
        deviceId: currentDeviceId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 100000,
        samplingInterval: 1
      };

      const token = localStorage.getItem('token');
      const response = await fetch('/api/sensors/export-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorDetails;
        try {
          errorDetails = await response.text();
          console.error('❌ API 오류 상세:', errorDetails);
        } catch (e) {
          // 에러 무시
        }
        throw new Error(`API 오류: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'API 응답 오류');
      }

      console.log('✅ useCSVExport.convertToCSVFormat 성공:', result.data?.length, '건');
      return result.data || [];

    } catch (error) {
      console.error('❌ useCSVExport.convertToCSVFormat 오류:', error);
      console.log('📋 historyData로 fallback:', historyData?.length, '건');
      return historyData || [];
    }
  };

  const fetchAllData = async (): Promise<FlexibleSensorData[]> => {
    try {
      console.log('🚀 useCSVExport.fetchAllData 호출:', { currentDeviceId });

      // 1단계: 데이터 범위 조회
      const token = localStorage.getItem('token');
      const rangeResponse = await fetch(`/api/sensors/data-range/${currentDeviceId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (!rangeResponse.ok) {
        throw new Error(`데이터 범위 API 오류: ${rangeResponse.status} ${rangeResponse.statusText}`);
      }

      const rangeResult = await rangeResponse.json();
      
      if (!rangeResult.success) {
        throw new Error('데이터 범위 조회 실패');
      }

      console.log('✅ 데이터 범위 조회 성공:', {
        firstDate: rangeResult.firstDate,
        lastDate: rangeResult.lastDate,
        totalCount: rangeResult.totalCount
      });

      // 2단계: 전체 데이터 조회
      const requestBody = {
        deviceId: currentDeviceId,
        startDate: rangeResult.firstDate,
        endDate: rangeResult.lastDate,
        limit: 500000,
        samplingInterval: 1
      };

      const dataResponse = await fetch('/api/sensors/export-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(requestBody)
      });

      if (!dataResponse.ok) {
        throw new Error(`데이터 API 오류: ${dataResponse.status} ${dataResponse.statusText}`);
      }

      const dataResult = await dataResponse.json();
      if (!dataResult.success) {
        throw new Error(dataResult.error || '데이터 조회 실패');
      }

      console.log('✅ useCSVExport.fetchAllData 성공:', dataResult.data?.length, '건');
      return dataResult.data || [];

    } catch (error) {
      console.error('❌ useCSVExport.fetchAllData 오류:', error);
      console.log('📋 historyData로 fallback:', historyData?.length, '건');
      return historyData || [];
    }
  };

  const getDataRange = async () => {
    try {
      console.log('🚀 useCSVExport.getDataRange 호출:', { currentDeviceId });

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/sensors/data-range/${currentDeviceId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error('데이터 범위 조회 실패');
      }

      const rangeData = {
        firstDate: new Date(result.firstDate),
        lastDate: new Date(result.lastDate),
        totalCount: result.totalCount
      };

      console.log('✅ useCSVExport.getDataRange 성공:', rangeData);
      return rangeData;

    } catch (error) {
      console.error('❌ useCSVExport.getDataRange 오류:', error);
      
      // historyData를 사용한 fallback
      if (!historyData || historyData.length === 0) {
        console.log('📋 기본 범위로 fallback');
        return {
          firstDate: new Date('2020-01-01'),
          lastDate: new Date(),
          totalCount: 0
        };
      }

      console.log('📋 historyData로 범위 계산:', historyData.length, '건');

      // historyData에서 타임스탬프 추출
      const timestamps = historyData.map(data => {
        if (data.receivedAt) {
          return new Date(data.receivedAt);
        } else if (data.timestamp) {
          if (typeof data.timestamp === 'number') {
            // Unix timestamp 처리 (초 단위인지 밀리초 단위인지 확인)
            if (data.timestamp.toString().length === 10) {
              return new Date(data.timestamp * 1000);
            } else {
              return new Date(data.timestamp);
            }
          } else {
            return new Date(data.timestamp);
          }
        }
        return null;
      }).filter(date => date && !isNaN(date.getTime())) as Date[];

      if (timestamps.length === 0) {
        console.log('⚠️ 유효한 타임스탬프 없음, 기본 범위 사용');
        return {
          firstDate: new Date('2020-01-01'),
          lastDate: new Date(),
          totalCount: 0
        };
      }

      // 날짜 정렬
      const sortedDates = timestamps.sort((a, b) => a.getTime() - b.getTime());

      const fallbackRange = {
        firstDate: sortedDates[0],
        lastDate: sortedDates[sortedDates.length - 1],
        totalCount: historyData.length
      };

      console.log('✅ historyData 기반 범위 계산 완료:', fallbackRange);
      return fallbackRange;
    }
  };

  return {
    convertToCSVFormat,
    fetchAllData,
    getDataRange
  };
};