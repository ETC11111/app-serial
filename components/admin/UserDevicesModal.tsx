// components/admin/UserDevicesModal.tsx 수정

import React, { useState, useEffect } from 'react';
import DeviceEditModal from './DeviceEditModal';
import SensorHistoryModal from './SensorHistoryModal';

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
  last_seen_at: string;
  last_seen_ip: string;
  total_readings: number;
  last_reading: string;
}

interface UserDevicesModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const UserDevicesModal: React.FC<UserDevicesModalProps> = ({
  user,
  isOpen,
  onClose,
  onRefresh
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 하위 모달 상태
  const [editDeviceModalOpen, setEditDeviceModalOpen] = useState(false);
  const [sensorHistoryModalOpen, setSensorHistoryModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUserDevices();
    }
  }, [isOpen, user.id]);

  const fetchUserDevices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');

      const response = await fetch(`/api/admin/users/${user.id}/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDevices(data.data.devices);
        } else {
          setError(data.error || '장치 목록을 불러올 수 없습니다.');
        }
      } else {
        setError('장치 목록을 불러오는 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('Fetch user devices error:', err);
      setError('장치 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditDevice = (device: Device) => {
    setSelectedDevice(device);
    setEditDeviceModalOpen(true);
  };

  const handleViewSensorHistory = (device: Device) => {
    setSelectedDevice(device);
    setSensorHistoryModalOpen(true);
  };

  const handleDeleteDevice = async (device: Device) => {
    if (!confirm(`장치 "${device.device_name}"를 정말 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/admin/users/${user.id}/devices/${device.device_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        fetchUserDevices();
        onRefresh(); // 부모 컴포넌트 새로고침
      } else {
        const data = await response.json();
        alert(data.error || '장치 삭제 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('Delete device error:', error);
      alert('장치 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDeviceUpdated = () => {
    fetchUserDevices();
    onRefresh();
    setEditDeviceModalOpen(false);
    setSelectedDevice(null);
  };

  // 🔥 온라인 상태 계산 함수 (last_seen_at 기준)
  const getDeviceStatus = (lastSeenAt: string) => {
    if (!lastSeenAt) return 'unknown';

    const now = new Date();
    const lastSeen = new Date(lastSeenAt);
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

    if (diffMinutes <= 5) return 'online';
    else if (diffMinutes >= 30) return 'offline';
    else return 'recent';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800';
      case 'recent': return 'bg-yellow-100 text-yellow-800';
      case 'offline': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return '온라인';
      case 'recent': return '최근 활성';
      case 'offline': return '오프라인';
      default: return '알 수 없음';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-5xl w-full mx-4 max-h-96 overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {user.name}님의 장치 목록
                </h3>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                등록된 장치가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        장치 정보
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        위치/관리자
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        데이터
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        등록일
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        작업
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {devices.map((device) => {
                      const status = getDeviceStatus(device.last_seen_at);
                      return (
                        <tr key={device.device_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {device.device_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {device.device_id}
                              </div>
                              <div className="text-xs text-gray-400">
                                타입: {device.device_type}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              <div>{device.device_location || '-'}</div>
                              <div className="text-xs text-gray-500">
                                관리자: {device.admin_name || '-'}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(status)}`}>
                              {getStatusText(status)}
                            </span>
                            {device.last_seen_at && (
                              <div className="text-xs text-gray-500 mt-1">
                                {new Date(device.last_seen_at).toLocaleString('ko-KR')}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {device.total_readings}개
                            </div>
                            <div className="text-sm text-gray-500">
                              {device.last_reading
                                ? new Date(device.last_reading).toLocaleDateString('ko-KR')
                                : '-'
                              }
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(device.created_at).toLocaleDateString('ko-KR')}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button
                              onClick={() => handleEditDevice(device)}
                              className="px-3 py-2 bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-900 rounded-lg transition-colors"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleViewSensorHistory(device)}
                              className="px-3 py-2 bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-900 rounded-lg transition-colors"
                            >
                              센서
                            </button>
                            <button
                              onClick={() => handleDeleteDevice(device)}
                              className="px-3 py-2 bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-900 rounded-lg transition-colors"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 하위 모달들 */}
      {editDeviceModalOpen && selectedDevice && (
        <DeviceEditModal
          user={user}
          device={selectedDevice}
          isOpen={editDeviceModalOpen}
          onClose={() => {
            setEditDeviceModalOpen(false);
            setSelectedDevice(null);
          }}
          onDeviceUpdated={handleDeviceUpdated}
        />
      )}

      {sensorHistoryModalOpen && selectedDevice && (
        <SensorHistoryModal
          user={user}
          device={selectedDevice}
          isOpen={sensorHistoryModalOpen}
          onClose={() => {
            setSensorHistoryModalOpen(false);
            setSelectedDevice(null);
          }}
        />
      )}
    </>
  );
};

export default UserDevicesModal;