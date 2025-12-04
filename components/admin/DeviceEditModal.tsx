// components/admin/DeviceEditModal.tsx 수정

import React, { useState } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Device {
  device_id: string;
  device_name: string;
  device_type: number;
  admin_name: string;
  device_location: string;
  created_at: string;
}

interface DeviceEditModalProps {
  user: User;
  device: Device;
  isOpen: boolean;
  onClose: () => void;
  onDeviceUpdated: () => void;
}

const DeviceEditModal: React.FC<DeviceEditModalProps> = ({
  user,
  device,
  isOpen,
  onClose,
  onDeviceUpdated
}) => {
  const [formData, setFormData] = useState({
    deviceName: device.device_name,
    adminName: device.admin_name || '',
    deviceLocation: device.device_location || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      
      const response = await fetch(`/api/admin/users/${user.id}/devices/${device.device_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceName: formData.deviceName,
          adminName: formData.adminName,
          deviceLocation: formData.deviceLocation
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          onDeviceUpdated();
        } else {
          setError(data.error || '장치 수정 실패');
        }
      } else {
        const data = await response.json();
        setError(data.error || '장치 수정 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '장치 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">장치 정보 수정</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">
              <div><strong>사용자:</strong> {user.name} ({user.email})</div>
              <div><strong>장치 ID:</strong> {device.device_id}</div>
              <div><strong>장치 타입:</strong> {device.device_type}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                장치 이름 *
              </label>
              <input
                type="text"
                value={formData.deviceName}
                onChange={(e) => setFormData(prev => ({ ...prev, deviceName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                관리자 이름
              </label>
              <input
                type="text"
                value={formData.adminName}
                onChange={(e) => setFormData(prev => ({ ...prev, adminName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="관리자 이름을 입력하세요"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                설치 위치
              </label>
              <input
                type="text"
                value={formData.deviceLocation}
                onChange={(e) => setFormData(prev => ({ ...prev, deviceLocation: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="장치 설치 위치를 입력하세요"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DeviceEditModal;