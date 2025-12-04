// EmptyDeviceState.tsx
import React, { memo } from 'react';
import { Link } from 'react-router-dom';

export const EmptyDeviceState = memo(() => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <div className="text-6xl mb-4" role="img" aria-label="디바이스 없음">📱</div>
      <h3 className="text-xl font-semibold mb-2 text-gray-800">등록된 장치가 없습니다</h3>
      <p className="text-gray-500 mb-6">첫 번째 스마트팜 장치를 추가해보세요!</p>
      <Link
        to="/device-setup"
        className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 focus:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors shadow-sm"
      >
        🚀 첫 번째 장치 추가하기
      </Link>
    </div>
  );
});

EmptyDeviceState.displayName = 'EmptyDeviceState';