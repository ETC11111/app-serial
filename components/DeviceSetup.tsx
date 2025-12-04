import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import { deviceService } from '../services/deviceService';

// 기존 컴포넌트들 import
import AddStreamForm from './AddStreamForm';
import StreamList from './StreamList';
import MultiStreamViewer from './MultiStreamViewer';
import ImprovedMultiGridViewer from './ImprovedMultiGridViewer';
import DeviceStreamManager from './DeviceStreamManager';

interface PendingDevice {
  device_id: string;
  device_name: string;
  local_ip: string;
  created_at: string;
}

interface DeviceForm {
  deviceName: string;
  deviceLocation: string;
  deviceId: string;
  adminName: string;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface DeviceIdCheckResult {
  success: boolean;
  available?: boolean;
  isOwnDevice?: boolean;
  isPending?: boolean;
  message: string;
  deviceName?: string;
  devicePublicIP?: string;
  error?: string;
}

interface Stream {
  id: number;
  stream_name: string;
  rtsp_url: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StreamStatus {
  id: number;
  name: string;
  description?: string;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'restarting';
  isRunning: boolean;
  playlistExists: boolean;
  playlistUrl: string | null;
  createdAt: string;
}

interface Device {
  device_id: string;
  device_name: string;
  admin_name?: string;
  device_location?: string;
  last_seen_at?: string;
  is_favorite: boolean;
}

const DeviceSetup: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'setup' | 'streams' | 'devices' | 'monitoring' | 'connections'>('setup');

  // 장치 관련 상태 (기존 DeviceSetup.tsx에서)
  const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [deviceIdCheck, setDeviceIdCheck] = useState<DeviceIdCheckResult | null>(null);
  const [deviceIdCheckLoading, setDeviceIdCheckLoading] = useState(false);
  const [deviceForm, setDeviceForm] = useState<DeviceForm>({
    deviceName: '',
    deviceLocation: '',
    deviceId: '',
    adminName: ''
  });

  // 스트림 관련 상태 (StreamManager.tsx에서)
  const [streams, setStreams] = useState<Stream[]>([]);
  const [streamStatuses, setStreamStatuses] = useState<StreamStatus[]>([]);
  const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
  const [showAddStreamForm, setShowAddStreamForm] = useState(false);
  const [showGridViewer, setShowGridViewer] = useState(false);

  // 공통 상태
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const deviceIdFromUrl = searchParams.get('device_id');
  const autoFromUrl = searchParams.get('auto');

  // API 헤더 공통 함수
  const getAuthHeaders = () => {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('accessToken='))
      ?.split('=')[1] || localStorage.getItem('accessToken');

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  // 사용자 정보 가져오기 (기존 DeviceSetup.tsx에서)
  const fetchUserInfo = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();

        if (result.success && result.user) {
          const userData = result.user;
          setUserInfo(userData);

          setDeviceForm(prev => ({
            ...prev,
            adminName: userData.name || userData.email || ''
          }));
        }
      }
    } catch (error) {
      console.error('사용자 정보 가져오기 실패:', error);
    }
  };

  // Device ID 중복 검사 (기존 DeviceSetup.tsx에서)
  const checkDeviceId = async (deviceId: string) => {
    if (!deviceId.trim()) {
      setDeviceIdCheck(null);
      return;
    }

    setDeviceIdCheckLoading(true);

    try {
      const response = await fetch('/api/devices/check-device-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ deviceId: deviceId.trim() })
      });

      const result = await response.json();

      if (result.success) {
        setDeviceIdCheck({
          success: true,
          available: result.available === true ? true : (result.available === false ? false : undefined),
          isOwnDevice: result.isOwnDevice,
          isPending: result.isPending,
          message: result.message,
          deviceName: result.deviceName,
          devicePublicIP: result.devicePublicIP
        });
      } else {
        setDeviceIdCheck({
          success: false,
          available: false,
          message: result.error || 'Device ID 확인 중 오류가 발생했습니다.',
          error: result.error
        });
      }
    } catch (error) {
      setDeviceIdCheck({
        success: false,
        available: false,
        message: '네트워크 오류가 발생했습니다.',
        error: 'Network error'
      });
    } finally {
      setDeviceIdCheckLoading(false);
    }
  };

  // 장치 검색 (기존 DeviceSetup.tsx에서)
  const searchDevices = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/devices/pending-devices', {
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setPendingDevices(result.pendingDevices);
        setMessage(`${result.pendingDevices.length}개의 장치를 발견했습니다! (IP: ${result.userIP})`);

        if (result.pendingDevices.length > 0) {
          fillFormFromDevice(result.pendingDevices[0]);
        }
      } else {
        setMessage('장치 검색 실패');
      }
    } catch (error) {
      setMessage('네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  // 자동 검색된 장치로 폼 채우기 (기존 DeviceSetup.tsx에서)
  const fillFormFromDevice = (device: PendingDevice) => {
    setDeviceForm(prev => ({
      ...prev,
      deviceName: device.device_name,
      deviceLocation: '',
      deviceId: device.device_id,
    }));
  };

  // 장치 등록 (기존 DeviceSetup.tsx에서)
  const linkDevice = async (deviceId: string, adminName?: string) => {
    setLinking(true);

    try {
      const response = await fetch('/api/devices/link-pending-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          deviceId,
          adminName: adminName || deviceForm.adminName || userInfo?.name,
          deviceLocation: deviceForm.deviceLocation
        })
      });

      const result = await response.json();

      if (result.success) {
        setMessage(`장치가 성공적으로 등록되었습니다! (${result.device.registrationMethod})`);
        // 캐시 무효화 요청
        try {
          await deviceService.invalidateCache(['devices', 'groups']);
          console.log('✅ 캐시 무효화 완료');
        } catch (cacheError) {
          console.warn('⚠️ 캐시 무효화 실패:', cacheError);
        }

        fetchDevices(); // 장치 목록 새로고침
        setTimeout(() => {
          setMessage('');
          setActiveTab('devices'); // 장치 목록 탭으로 이동
        }, 2000);
      } else {
        setMessage('장치 등록 실패: ' + result.error);
      }
    } catch (error) {
      setMessage('네트워크 오류');
    } finally {
      setLinking(false);
    }
  };

  // 자동 등록 (URL에서)
  const linkSpecificDevice = (deviceId: string) => {
    linkDevice(deviceId, userInfo?.name);
  };

  // 장치 목록 가져오기 (StreamManager.tsx에서)
  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices/with-favorites', {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setDevices(result.devices);
      }
    } catch (error) {
      console.error('장치 목록 조회 오류:', error);
    }
  };

  // 스트림 목록 조회 (StreamManager.tsx에서)
  const fetchStreams = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/stream-devices`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setStreams(data.streams);
        console.log('📋 스트림 목록 로드됨:', data.streams);
      } else {
        setError(data.error || '스트림 목록 조회 실패');
      }
    } catch (err: any) {
      console.error('스트림 목록 조회 오류:', err);
      setError(`스트림 목록 조회 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 스트림 상태 조회 (StreamManager.tsx에서)
  const fetchStreamStatuses = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stream/status`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setStreamStatuses(data.streams);
        console.log('📊 스트림 상태 로드됨:', data.streams);
      }
    } catch (err: any) {
      console.error('스트림 상태 조회 오류:', err);
    }
  };

  // 스트림 삭제 (StreamManager.tsx에서)
  const handleDeleteStream = async (streamId: number) => {
    if (!confirm('정말로 이 스트림을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/stream-devices/${streamId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();
      if (data.success) {
        alert('스트림이 삭제되었습니다.');
        fetchStreams();
        fetchStreamStatuses();
        if (selectedStreamId === streamId) {
          setSelectedStreamId(null);
        }
      } else {
        alert(`삭제 실패: ${data.error}`);
      }
    } catch (err: any) {
      console.error('스트림 삭제 오류:', err);
      alert(`삭제 실패: ${err.message}`);
    }
  };

  // 폼 입력 핸들러
  const handleFormChange = (field: keyof DeviceForm, value: string) => {
    setDeviceForm(prev => ({
      ...prev,
      [field]: value
    }));

    if (field === 'deviceId') {
      setDeviceIdCheck(null);
    }
  };

  // 폼 제출 핸들러
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!deviceForm.deviceId) {
      setMessage('Device ID가 필요합니다.');
      return;
    }

    if (!deviceForm.adminName.trim()) {
      setMessage('관리자명을 입력해주세요.');
      return;
    }

    if (deviceForm.deviceLocation && deviceForm.deviceLocation.length > 255) {
      setMessage('위치 정보는 255자를 초과할 수 없습니다.');
      return;
    }

    if (deviceIdCheck && deviceIdCheck.available === false) {
      if (deviceIdCheck.isOwnDevice) {
        setMessage('이미 등록된 본인 소유의 장치입니다.');
      } else {
        setMessage('다른 사용자가 이미 등록한 장치이거나 사용할 수 없는 Device ID입니다.');
      }
      return;
    }

    linkDevice(deviceForm.deviceId, deviceForm.adminName);
  };

  // Device ID 검사 결과 스타일
  const getDeviceIdCheckStyle = () => {
    if (!deviceIdCheck) return {};

    if (deviceIdCheck.available === true) {
      return { color: '#28a745' }; // 사용 가능
    } else if (deviceIdCheck.isOwnDevice) {
      return { color: '#ffc107' }; // 본인 소유
    } else {
      return { color: '#dc3545' }; // 사용 불가
    }
  };

  // 스트림 상태 정보
  const getStreamStatus = (streamId: number) => {
    return streamStatuses.find(s => s.id === streamId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#28a745';
      case 'starting': case 'restarting': return '#ffc107';
      case 'stopped': return '#6c757d';
      case 'error': return '#dc3545';
      default: return '#17a2b8';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return '실행 중';
      case 'starting': return '시작 중';
      case 'restarting': return '재시작 중';
      case 'stopped': return '정지됨';
      case 'error': return '오류';
      default: return '알 수 없음';
    }
  };

  // Device ID 입력 디바운싱
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (deviceForm.deviceId) {
        checkDeviceId(deviceForm.deviceId);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [deviceForm.deviceId]);

  // 초기화
  useEffect(() => {
    fetchUserInfo();
    fetchDevices();
    fetchStreams();
    fetchStreamStatuses();

    // 주기적으로 상태 업데이트 (5초마다)
    const interval = setInterval(fetchStreamStatuses, 5000);
    return () => clearInterval(interval);
  }, []);

  // URL에서 자동 등록
  useEffect(() => {
    if (deviceIdFromUrl && autoFromUrl === 'true') {
      linkSpecificDevice(deviceIdFromUrl);
    }
  }, [deviceIdFromUrl, autoFromUrl, userInfo]);

  return (
    <Layout maxWidth="wide" padding="md" background="gray">
      {/*페이지 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <img
            src="/device.png"
            alt="Device Icon"
            className="w-6 h-6"
          />
          <h1 className="text-2xl font-bold text-gray-800">장치 설정</h1>
        </div>
        <p className="text-gray-600 mb-4">
          장치와 CCTV 를 관리하세요
        </p>

        {/* 헤더 안의 버튼들 */}
        <div className="flex w-full space-x-2">
          <button
            onClick={() => setActiveTab('setup')}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-6 py-3 rounded-lg transition-colors ${activeTab === 'setup'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <img src="/register.png" alt="Register Icon" className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">장치 등록</span>
          </button>
          <button
            onClick={() => setActiveTab('streams')}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-6 py-3 rounded-lg transition-colors ${activeTab === 'streams'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <img src="/cctv.png" alt="CCTV Icon" className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">카메라 등록</span>
          </button>
          <button
            onClick={() => setActiveTab('connections')}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-6 py-3 rounded-lg transition-colors ${activeTab === 'connections'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <img src="/setup.png" alt="setup Icon" className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">카메라 관리</span>
          </button>
        </div>
      </div>

      {/* 메시지 표시 */}
      {message && (
        <div className={`mb-4 md:mb-6 p-3 md:p-4 rounded-lg border text-sm md:text-base ${message.includes('성공')
          ? 'bg-green-50 text-green-800 border-green-200'
          : message.includes('실패') || message.includes('오류')
            ? 'bg-red-50 text-red-800 border-red-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
          <div className="flex items-start justify-between gap-2">
            <span className="flex-1">{message}</span>
            <button
              onClick={() => setMessage('')}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 md:mb-6 p-3 md:p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm md:text-base">
          <div className="flex items-start justify-between gap-2">
            <span className="flex-1">⚠️ {error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 탭 컨텐츠 */}
      <div className="bg-white rounded-lg shadow-lg">
        {/* 장치 등록 탭 - 기존 DeviceSetup.tsx 내용 */}
        {activeTab === 'setup' && (
          <div className="p-4 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold mb-6 md:mb-8">장치 등록</h2>

            {/* URL device_id가 있는 경우 */}
            {deviceIdFromUrl && (
              <div className="mb-6 p-4 bg-blue-50 border rounded">
                <h2 className="font-semibold mb-2">장치 자동 등록</h2>
                <p className="text-sm md:text-base break-all">Device ID: {deviceIdFromUrl}</p>
                {!linking && !message && (
                  <button
                    onClick={() => linkSpecificDevice(deviceIdFromUrl)}
                    className="mt-3 w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm md:text-base"
                  >
                    이 장치 등록하기
                  </button>
                )}
              </div>
            )}

            {/* 자동 검색 */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">방법 1: 자동 검색</h2>
              <p className="text-sm text-gray-600 mb-3">
                같은 네트워크에 있는 장치를 자동으로 찾아 등록합니다.
              </p>
              <button
                onClick={searchDevices}
                disabled={loading}
                className={`w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded font-medium text-sm md:text-base ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                  } text-white transition-colors`}
              >
                <img
                  src="/search.png"
                  alt="Search Icon"
                  className="w-5 h-5"
                />
                {loading ? '검색 중...' : '네트워크 장치 검색'}
              </button>
            </div>

            {/* 발견된 장치 목록 */}
            {pendingDevices.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">
                  🔍 발견된 장치 ({pendingDevices.length}개)
                </h3>
                <div className="text-sm text-gray-600 mb-3">
                  장치를 클릭하면 폼에 정보가 자동으로 채워집니다.
                </div>

                {pendingDevices.map((device) => (
                  <div
                    key={device.device_id}
                    className="border rounded p-4 mb-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => fillFormFromDevice(device)}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-base md:text-lg">{device.device_name}</h4>
                        <p className="text-sm text-gray-600 break-all">Device ID: {device.device_id}</p>
                        <p className="text-sm text-gray-600">Local IP: {device.local_ip}</p>
                        <p className="text-xs text-gray-500">
                          발견 시간: {new Date(device.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-col md:items-end gap-2">
                        <span className="text-sm text-blue-600">📱 클릭하여 폼에 채우기</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            linkDevice(device.device_id, userInfo?.name);
                          }}
                          disabled={linking}
                          className="w-full md:w-auto bg-green-500 text-white px-3 py-2 rounded text-sm hover:bg-green-600 transition-colors disabled:bg-gray-400"
                        >
                          {linking ? '등록 중...' : '⚡ 바로 등록'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 수동 입력 폼 */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">방법 2: 수동 입력</h2>
              <p className="text-sm text-gray-600 mb-4">
                Device ID를 직접 입력하여 등록합니다. (네트워크가 달라도 등록 가능)
              </p>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      장치 이름
                    </label>
                    <input
                      type="text"
                      value={deviceForm.deviceName}
                      onChange={(e) => handleFormChange('deviceName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                      placeholder="예: 온실 센서 #1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      장치 위치
                    </label>
                    <input
                      type="text"
                      value={deviceForm.deviceLocation}
                      onChange={(e) => handleFormChange('deviceLocation', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                      placeholder="예: 1번 온실, A동 2층"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Device ID *
                    </label>

                    <input
                      type="text"
                      value={deviceForm.deviceId}
                      onChange={(e) => handleFormChange('deviceId', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base ${deviceIdCheck && deviceIdCheck.available === false ? 'border-red-300' :
                        deviceIdCheck && deviceIdCheck.available === true ? 'border-green-300' : 'border-gray-300'
                        }`}
                      placeholder="장치의 고유 ID를 입력하세요"
                      required
                    />

                    {/* Device ID 검사 결과 표시 */}
                    <div className="mt-1 min-h-5">
                      {deviceIdCheckLoading && (
                        <div className="flex items-center text-sm text-gray-500">
                          <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-500 mr-2"></div>
                          Device ID 확인 중...
                        </div>
                      )}
                      {!deviceIdCheckLoading && deviceIdCheck && (
                        <div className="text-sm" style={getDeviceIdCheckStyle()}>
                          {deviceIdCheck.available === true && (
                            <span className="flex items-start gap-1">
                              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <div className="flex-1">
                                {deviceIdCheck.message}
                                {deviceIdCheck.isPending && deviceIdCheck.deviceName && (
                                  <span className="ml-1">({deviceIdCheck.deviceName})</span>
                                )}
                                {deviceIdCheck.isPending && deviceIdCheck.devicePublicIP && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    📍 원격: {deviceIdCheck.devicePublicIP}
                                  </div>
                                )}
                              </div>
                            </span>
                          )}

                          {deviceIdCheck.available === false && (
                            <span className="flex items-start gap-1">
                              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <div className="flex-1">
                                {deviceIdCheck.message}
                                {deviceIdCheck.deviceName && (
                                  <span className="ml-1">({deviceIdCheck.deviceName})</span>
                                )}
                              </div>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      관리자명 *
                    </label>
                    <input
                      type="text"
                      value={deviceForm.adminName}
                      onChange={(e) => handleFormChange('adminName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                      placeholder="장치 관리자 이름"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      기본값은 로그인한 사용자명이지만 변경 가능합니다
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    linking ||
                    !deviceForm.deviceId ||
                    !deviceForm.adminName.trim() ||
                    (deviceIdCheck?.available === false)
                  }
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium transition-colors text-sm md:text-base ${linking ||
                    !deviceForm.deviceId ||
                    !deviceForm.adminName.trim() ||
                    (deviceIdCheck && deviceIdCheck.available === false)
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                >
                  <img
                    src="/add.png"
                    alt="Add Icon"
                    className="w-5 h-5"
                  />
                  {linking ? '등록 중...' : '장치 등록하기'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 카메라 관리 탭 */}
        {activeTab === 'streams' && (
          <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-center md:text-left">카메라 관리</h2>

              {/* 모바일용 버튼 그룹 */}
              <div className="flex gap-0 md:gap-3 rounded overflow-hidden md:overflow-visible">
                <button
                  onClick={() => setShowAddStreamForm(!showAddStreamForm)}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-none md:rounded font-medium text-sm md:text-base ${showAddStreamForm
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                    } text-white transition-colors flex items-center justify-center gap-2`}
                >
                  <img
                    src={showAddStreamForm ? '/cancel.png' : '/add.png'}
                    alt={showAddStreamForm ? '취소' : '카메라 추가'}
                    className="w-4 h-4"
                  />
                  {showAddStreamForm ? '취소' : '카메라 추가'}
                </button>

                <button
                  onClick={() => {
                    fetchStreams();
                    fetchStreamStatuses();
                  }}
                  disabled={loading}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-none md:rounded font-medium text-sm md:text-base ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                    } text-white transition-colors flex items-center justify-center gap-2`}
                >
                  <img
                    src={loading ? '/refresh.png' : '/search.png'}
                    alt={loading ? '로딩 중' : '새로고침'}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span className="text-center">{loading ? '로딩 중...' : '새로고침'}</span>
                </button>
              </div>
            </div>

            {/* 스트림 추가 폼 */}
            {showAddStreamForm && (
              <AddStreamForm
                onSuccess={() => {
                  setShowAddStreamForm(false);
                  fetchStreams();
                  fetchStreamStatuses();
                }}
                onCancel={() => setShowAddStreamForm(false)}
              />
            )}

            {/* 스트림 목록 */}
            <StreamList
              streams={streams}
              streamStatuses={streamStatuses}
              selectedStreamId={selectedStreamId}
              onSelectStream={setSelectedStreamId}
              onDeleteStream={handleDeleteStream}
              onRefresh={() => {
                fetchStreams();
                fetchStreamStatuses();
              }}
            />

            {/* 선택된 스트림 뷰어 */}
            {selectedStreamId && (
              <div className="mt-6">
                <MultiStreamViewer
                  streamId={selectedStreamId}
                  onClose={() => setSelectedStreamId(null)}
                />
              </div>
            )}
          </div>
        )}

        {/* 장치 목록 탭 */}
        {activeTab === 'devices' && (
          <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
              <h2 className="text-xl md:text-2xl font-bold">등록된 장치 목록</h2>
              <button
                onClick={fetchDevices}
                className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm md:text-base"
              >
                🔄 새로고침
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl md:text-6xl mb-4">📱</div>
                <p className="text-base md:text-lg mb-2">등록된 장치가 없습니다.</p>
                <p className="text-sm">장치 등록 탭에서 새 장치를 추가해보세요.</p>
                <button
                  onClick={() => setActiveTab('setup')}
                  className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm md:text-base"
                >
                  장치 등록하기
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {devices.map((device) => {
                  const isOnline = device.last_seen_at &&
                    new Date(device.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000;

                  return (
                    <div key={device.device_id} className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3">
                            <h4 className="text-lg md:text-xl font-semibold text-gray-900">
                              {device.device_name}
                            </h4>
                            {device.is_favorite && <span className="text-yellow-500 text-lg">⭐</span>}
                            <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${isOnline
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                              }`}>
                              {isOnline ? '🟢 온라인' : '🔴 오프라인'}
                            </span>
                          </div>

                          <div className="space-y-2 text-sm text-gray-600">
                            {device.device_location && (
                              <p className="flex items-start">
                                <span className="font-medium mr-2 mt-0.5">📍</span>
                                <span className="flex-1">{device.device_location}</span>
                              </p>
                            )}
                            {device.admin_name && (
                              <p className="flex items-start">
                                <span className="font-medium mr-2 mt-0.5">👤</span>
                                <span className="flex-1">{device.admin_name}</span>
                              </p>
                            )}
                            <p className="flex items-start">
                              <span className="font-medium mr-2 mt-0.5">🆔</span>
                              <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all flex-1">
                                {device.device_id}
                              </code>
                            </p>
                            {device.last_seen_at && (
                              <p className="flex items-start">
                                <span className="font-medium mr-2 mt-0.5">🕒</span>
                                <span className="flex-1 text-xs md:text-sm">
                                  {new Date(device.last_seen_at).toLocaleString()}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-2 md:gap-2 w-full md:w-auto">
                          <button className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors">
                            📊 상세보기
                          </button>
                          <button className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors">
                            🔗 스트림 연결
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 장치-스트림 연결 관리 탭 */}
        {activeTab === 'connections' && (
          <div className="p-4 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold ">카메라 연결 관리</h2>
            <DeviceStreamManager />
          </div>
        )}

        {/* 모니터링 탭 */}
        {activeTab === 'monitoring' && (
          <div className="p-4 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold mb-6">실시간 모니터링</h2>

            {/* 현황 카드들 - 모바일 최적화 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm md:text-lg font-semibold text-blue-800">총 장치</h3>
                    <p className="text-xl md:text-3xl font-bold text-blue-600">{devices.length}</p>
                  </div>
                  <div className="text-2xl md:text-4xl">📱</div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm md:text-lg font-semibold text-green-800">온라인</h3>
                    <p className="text-xl md:text-3xl font-bold text-green-600">
                      {devices.filter(d => d.last_seen_at &&
                        new Date(d.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000
                      ).length}
                    </p>
                  </div>
                  <div className="text-2xl md:text-4xl">🟢</div>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm md:text-lg font-semibold text-purple-800">총 스트림</h3>
                    <p className="text-xl md:text-3xl font-bold text-purple-600">{streams.length}</p>
                  </div>
                  <div className="text-2xl md:text-4xl">🎥</div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm md:text-lg font-semibold text-yellow-800">활성</h3>
                    <p className="text-xl md:text-3xl font-bold text-yellow-600">
                      {streams.filter(s => s.is_active).length}
                    </p>
                  </div>
                  <div className="text-2xl md:text-4xl">▶️</div>
                </div>
              </div>
            </div>

            {/* 최근 활동 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 md:p-6 mb-6 md:mb-8">
              <h3 className="text-base md:text-lg font-semibold mb-4">📈 최근 장치 활동</h3>
              {devices.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-3xl md:text-4xl mb-2">📊</div>
                  <p className="text-sm md:text-base">등록된 장치가 없어 활동 내역이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {devices.slice(0, 5).map((device) => {
                    const isOnline = device.last_seen_at &&
                      new Date(device.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000;

                    return (
                      <div key={device.device_id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-3 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm md:text-base block">{device.device_name}</span>
                            {device.device_location && (
                              <span className="text-xs md:text-sm text-gray-500 block md:inline">
                                📍 {device.device_location}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs md:text-sm text-gray-500 md:text-right">
                          {device.last_seen_at
                            ? new Date(device.last_seen_at).toLocaleString()
                            : '연결 기록 없음'
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 빠른 액션 - 모바일 최적화 */}
            <div>
              <h3 className="text-base md:text-lg font-semibold mb-4">⚡ 빠른 액션</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <button
                  onClick={() => setActiveTab('setup')}
                  className="p-4 md:p-6 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg text-blue-800 font-medium transition-colors text-center"
                >
                  <div className="text-2xl md:text-3xl mb-2">🔧</div>
                  <div className="text-sm md:text-base">장치 등록</div>
                </button>

                <button
                  onClick={() => setActiveTab('streams')}
                  className="p-4 md:p-6 bg-green-100 hover:bg-green-200 border border-green-300 rounded-lg text-green-800 font-medium transition-colors text-center"
                >
                  <div className="text-2xl md:text-3xl mb-2">🎥</div>
                  <div className="text-sm md:text-base">스트림 추가</div>
                </button>

                <button
                  onClick={() => {
                    fetchDevices();
                    fetchStreams();
                    fetchStreamStatuses();
                  }}
                  className="p-4 md:p-6 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-lg text-purple-800 font-medium transition-colors text-center"
                >
                  <div className="text-2xl md:text-3xl mb-2">🔄</div>
                  <div className="text-sm md:text-base">새로고침</div>
                </button>

                <button
                  onClick={searchDevices}
                  disabled={loading}
                  className={`p-4 md:p-6 border rounded-lg font-medium transition-colors text-center ${loading
                    ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-100 hover:bg-orange-200 border-orange-300 text-orange-800'
                    }`}
                >
                  <div className="text-2xl md:text-3xl mb-2">🔍</div>
                  <div className="text-sm md:text-base">{loading ? '검색 중...' : '장치 검색'}</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 그리드 뷰어 모달 - 모바일 최적화 */}
      {showGridViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-2 md:p-4">
          <div className="w-full h-full max-w-7xl bg-white rounded-lg overflow-hidden">
            <div className="flex justify-between items-center p-3 md:p-4 border-b">
              <h3 className="text-lg md:text-xl font-semibold">📺 다중 스트림 그리드 뷰어</h3>
              <button
                onClick={() => setShowGridViewer(false)}
                className="px-3 md:px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm md:text-base"
              >
                ✕ 닫기
              </button>
            </div>
            <div className="p-2 md:p-4 h-full">
              <ImprovedMultiGridViewer
                streams={streams}
                onClose={() => setShowGridViewer(false)}
                maxWidth="100%"
                maxHeight="calc(100vh - 120px)"
              />
            </div>
          </div>
        </div>
      )}



      {/* 스크롤바 숨기기 스타일 */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </Layout>
  );
};

export default DeviceSetup;