// components/sensor/InactiveSensors.tsx

import React from 'react';
import { DetectedSensor } from '../../types/sensor.types';
import { SensorIcon } from './SensorIcon';
import { convertSensorName } from '../../utils/sensorUtils';

interface InactiveSensorsProps {
  sensors: DetectedSensor[];
}

export const InactiveSensors: React.FC<InactiveSensorsProps> = ({ sensors }) => {
  if (sensors.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-4">비활성 센서</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sensors.map((sensor, index) => (
          <div key={`inactive-${sensor.name}-${index}`} className="bg-white rounded-lg shadow border p-4 opacity-60">
            <div className="flex items-center space-x-3 mb-3">
              <SensorIcon sensorType={sensor.type} size="md" />
              <div>
                <h4 className="text-sm font-medium text-gray-600">{convertSensorName(sensor.name)}</h4>
                <p className="text-xs text-gray-400">채널 {sensor.channel} • 비활성</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};