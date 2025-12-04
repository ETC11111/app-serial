import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from './Layout';
import { deviceService } from '../services/deviceService';
import { Device } from '../types/device.types'; // 🔥 Device 타입 import

const DeviceSettings: React.FC = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  
  // 🔥 DeviceDetail 대신 Device 타입 사용
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // 수정 기능 관련 state
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    deviceName: '',
    adminName: '',
    deviceLocation: '' // 🔥 추가
  });

  useEffect(() => {
    if (deviceId) {
      fetchDeviceDetail();
    }
  }, [deviceId]);

  // 🔥 폼 초기화 함수 - Device 타입 사용
  const initializeEditForm = (deviceData: Device) => {
    setEditForm({
      deviceName: deviceData.device_name,
      adminName: deviceData.admin_name || '',
      deviceLocation: deviceData.device_location || '' // 🔥 추가
    });
  };

  const fetchDeviceDetail = async () => {
    try {
      setLoading(true);
      
      const result = await deviceService.getDeviceDetail(deviceId!);
      
      if (result.success) {
        setDevice(result.device);
        initializeEditForm(result.device);
        console.log('✅ 장치 상세 정보 로드됨:', result.device);
      } else {
        console.error('❌ 장치 정보 로드 실패:', result.error);
        alert(result.error || '장치 정보를 불러올 수 없습니다.');
        navigate('/devices');
      }
    } catch (error) {
      console.error('장치 정보 가져오기 오류:', error);
      alert('네트워크 오류가 발생했습니다.');
      navigate('/devices');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDevice = async () => {
    if (!device) return;
    
    // 입력 검증
    if (!editForm.deviceName.trim()) {
      alert('장치 이름을 입력해주세요.');
      return;
    }
    
    if (editForm.deviceName.trim().length > 255) {
      alert('장치 이름은 255자를 초과할 수 없습니다.');
      return;
    }
    
    if (editForm.adminName && editForm.adminName.trim().length > 100) {
      alert('관리자 이름은 100자를 초과할 수 없습니다.');
      return;
    }

    // 🔥 위치 정보 검증 추가
    if (editForm.deviceLocation && editForm.deviceLocation.trim().length > 255) {
      alert('위치 정보는 255자를 초과할 수 없습니다.');
      return;
    }

    try {
      setUpdating(true);
      
      const result = await deviceService.updateDevice(deviceId!, {
        deviceName: editForm.deviceName.trim(),
        adminName: editForm.adminName.trim() || undefined,
        deviceLocation: editForm.deviceLocation.trim() || undefined // 🔥 추가
      });
      
      if (result.success) {
        // 🔥 로컬 상태 업데이트 - Device 타입 준수
        const updatedDevice: Device = {
          ...device,
          device_name: editForm.deviceName.trim(),
          admin_name: editForm.adminName.trim() || undefined,
          device_location: editForm.deviceLocation.trim() || undefined // 🔥 추가
        };
        setDevice(updatedDevice);
        setEditing(false);
        
        alert('장치 정보가 성공적으로 수정되었습니다.');
        console.log('✅ 장치 정보 수정 완료:', result.updatedDevice);
      } else {
        alert(result.error || '장치 정보 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('장치 정보 수정 오류:', error);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEdit = () => {
    if (device) {
      initializeEditForm(device);
    }
    setEditing(false);
  };

  const handleDeleteDevice = async () => {
    if (!device) return;
    
    if (deleteConfirmText !== device.device_name) {
      alert('장치 이름을 정확히 입력해주세요.');
      return;
    }

    try {
      setDeleting(true);
      
      const result = await deviceService.deleteDevice(deviceId!);
      
      if (result.success) {
        alert(`장치 "${result.deletedDevice?.deviceName}"가 성공적으로 삭제되었습니다.`);
        navigate('/devices');
      } else {
        alert(result.error || '장치 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('장치 삭제 오류:', error);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  // 🔥 함수들도 Device 타입 사용
  const getDeviceStatusColor = (device: Device) => {
    if (!device.last_seen_at) return 'bg-gray-400';
    
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return 'bg-green-400';
    if (diffMinutes < 30) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  const getDeviceStatusText = (device: Device) => {
    if (!device.last_seen_at) return '상태 불명';
    
    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return '온라인';
    if (diffMinutes < 30) return '최근 활동';
    return '오프라인';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>장치 정보 로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!device) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">장치를 찾을 수 없습니다</h1>
            <Link to="/devices" className="text-blue-600 hover:text-blue-700">
              장치 목록으로 돌아가기
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-8">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <Link 
                to="/devices" 
                className="mr-4 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-3xl font-bold">장치 설정</h1>
            </div>
            
            {device.is_favorite && (
              <span className="text-yellow-500 text-2xl" title="즐겨찾기 장치">⭐</span>
            )}
          </div>

          {/* 🔥 장치 정보 카드 - 수정 가능하도록 변경 */}
          <div className="bg-gray-50 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              {editing ? (
                <input
                  type="text"
                  value={editForm.deviceName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, deviceName: e.target.value }))}
                  className="text-xl font-semibold bg-white border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="장치 이름"
                />
              ) : (
                <h2 className="text-xl font-semibold">{device.device_name}</h2>
              )}
              
              {/* 상태 표시 */}
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full ${getDeviceStatusColor(device)} mr-2`}></div>
                <span className="text-sm font-medium">{getDeviceStatusText(device)}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Device ID:</span>
                <span className="ml-2 font-mono bg-gray-200 px-2 py-1 rounded">
                  {device.device_id}
                </span>
              </div>
              
              {/* 🔥 관리자 이름 수정 가능 */}
              <div>
                <span className="font-medium text-gray-700">관리자:</span>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.adminName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, adminName: e.target.value }))}
                    className="ml-2 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="관리자 이름 (선택사항)"
                  />
                ) : (
                  <span className="ml-2">{device.admin_name || '설정되지 않음'}</span>
                )}
              </div>

              {/* 🔥 위치 정보 표시 및 편집 추가 */}
              <div className="md:col-span-2">
                <span className="font-medium text-gray-700">위치:</span>
                {editing ? (
                  <input
                    type="text"
                    value={editForm.deviceLocation}
                    onChange={(e) => setEditForm(prev => ({ ...prev, deviceLocation: e.target.value }))}
                    className="ml-2 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full max-w-md"
                    placeholder="장치 위치 (예: 1번 온실, A동 2층)"
                  />
                ) : (
                  <span className="ml-2">
                    {device.device_location || '위치 정보 없음'}
                    {!device.device_location && (
                      <span className="text-gray-500 text-xs ml-2">(편집하여 위치 설정)</span>
                    )}
                  </span>
                )}
              </div>
              
              <div>
                <span className="font-medium text-gray-700">등록일:</span>
                <span className="ml-2">{new Date(device.created_at).toLocaleString()}</span>
              </div>
              
              {device.last_seen_at && (
                <div>
                  <span className="font-medium text-gray-700">마지막 접속:</span>
                  <span className="ml-2">{new Date(device.last_seen_at).toLocaleString()}</span>
                </div>
              )}
              
              {device.last_seen_ip && (
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-700">마지막 IP:</span>
                  <span className="ml-2 font-mono">{device.last_seen_ip}</span>
                </div>
              )}
            </div>
          </div>

          {/* 🔥 액션 버튼들 - 수정 모드에 따라 변경 */}
          <div className="space-y-4">
            {editing ? (
              /* 수정 모드 버튼들 */
              <div className="flex space-x-4">
                <button 
                  onClick={handleUpdateDevice}
                  disabled={updating}
                  className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                    updating 
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {updating ? '저장 중...' : '✅ 변경사항 저장'}
                </button>
                
                <button 
                  onClick={handleCancelEdit}
                  disabled={updating}
                  className="flex-1 bg-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-400 transition-colors font-medium disabled:opacity-50"
                >
                  ❌ 취소
                </button>
              </div>
            ) : (
              /* 일반 모드 버튼들 */
              <>
                <button 
                  onClick={() => setEditing(true)}
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  📝 장치 정보 변경
                </button>
                
                <Link
                  to={`/sensors/${device.device_id}`}
                  className="block w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium text-center"
                >
                  📊 센서 데이터 보기
                </Link>
                
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  🗑️ 장치 삭제
                </button>
              </>
            )}
          </div>
        </div>

        {/* 삭제 확인 모달 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4 text-red-600">⚠️ 장치 삭제 확인</h3>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  정말로 "<strong>{device.device_name}</strong>" 장치를 삭제하시겠습니까?
                </p>
                
                <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                  <p className="text-red-700 text-sm">
                    <strong>주의:</strong> 이 작업은 되돌릴 수 없습니다. 
                    장치와 관련된 모든 데이터(센서 데이터, 알림 설정 등)가 영구적으로 삭제됩니다.
                  </p>
                </div>
                
                <p className="text-sm text-gray-600 mb-2">
                  삭제를 확인하려면 장치 이름을 정확히 입력해주세요:
                </p>
                
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={device.device_name}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  disabled={deleting}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                
                <button
                  onClick={handleDeleteDevice}
                  disabled={deleting || deleteConfirmText !== device.device_name}
                  className={`flex-1 px-4 py-2 rounded font-medium transition-colors ${
                    deleting || deleteConfirmText !== device.device_name
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DeviceSettings;