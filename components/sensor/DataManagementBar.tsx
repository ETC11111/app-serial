// components/sensor/DataManagementBar.tsx

import React from 'react';

interface DataManagementBarProps {
  currentDeviceId: string;
  onExportData: () => void;
}

export const DataManagementBar: React.FC<DataManagementBarProps> = ({
  currentDeviceId,
  onExportData
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">센서 데이터 관리</span>
          {process.env.NODE_ENV === 'development' && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              Device: {currentDeviceId}
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onExportData}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
          >
            📁 데이터 내보내기
          </button>
        </div>
      </div>
    </div>
  );
};