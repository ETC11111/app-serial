// components/sensor/SensorSummary.tsx

import React from 'react';
import { DetectedSensor, ChartDataPoint } from '../../types/sensor.types';

interface SensorSummaryProps {
  activeSensors: DetectedSensor[];
  inactiveSensors: DetectedSensor[];
  chartData: ChartDataPoint[];
  currentDeviceId: string;
}

export const SensorSummary: React.FC<SensorSummaryProps> = ({
  activeSensors,
  inactiveSensors,
  chartData,
  currentDeviceId
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">센서 현황</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{activeSensors.length}</div>
          <div className="text-sm text-green-700">활성 센서</div>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-gray-600">{inactiveSensors.length}</div>
          <div className="text-sm text-gray-700">비활성 센서</div>
        </div>
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{chartData.length}</div>
          <div className="text-sm text-blue-700">데이터 포인트</div>
        </div>
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600 text-xs">{currentDeviceId}</div>
          <div className="text-sm text-purple-700">디바이스 ID</div>
        </div>
      </div>
    </div>
  );
};