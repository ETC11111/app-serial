// components/GroupCreateModal.tsx - 성능 최적화 버전
import React, { useState, useMemo, useCallback } from 'react';
import { Device } from '../types/device.types';

interface GroupCreateModalProps {
  devices: Device[];
  onClose: () => void;
  onCreateGroup: (groupName: string, description: string, selectedDeviceIds: string[]) => Promise<boolean>;
}

export const GroupCreateModal: React.FC<GroupCreateModalProps> = ({
  devices,
  onClose,
  onCreateGroup
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 🔥 디바이스 검색 및 필터링 (메모이제이션)
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    
    const query = searchQuery.toLowerCase();
    return devices.filter(device => 
      device.device_name.toLowerCase().includes(query) ||
      device.device_id.toLowerCase().includes(query) ||
      device.admin_name?.toLowerCase().includes(query)
    );
  }, [devices, searchQuery]);

  // 🔥 선택 가능한 디바이스 개수 계산
  const selectionStats = useMemo(() => {
    const selected = selectedDeviceIds.length;
    const canSelect = Math.min(6 - selected, filteredDevices.length - selected);
    
    return {
      selected,
      canSelect,
      maxReached: selected >= 6,
      minRequired: selected >= 2
    };
  }, [selectedDeviceIds.length, filteredDevices.length]);

  // 🔥 디바이스 선택 토글 (최적화된)
  const handleDeviceToggle = useCallback((deviceId: string) => {
    setSelectedDeviceIds(prev => {
      if (prev.includes(deviceId)) {
        return prev.filter(id => id !== deviceId);
      } else if (prev.length < 6) {
        return [...prev, deviceId];
      }
      return prev;
    });
  }, []);

  // 🔥 전체 선택/해제
  const handleSelectAll = useCallback(() => {
    if (selectedDeviceIds.length === filteredDevices.length) {
      setSelectedDeviceIds([]);
    } else {
      const newSelection = filteredDevices
        .slice(0, 6)
        .map(device => device.device_id);
      setSelectedDeviceIds(newSelection);
    }
  }, [selectedDeviceIds.length, filteredDevices]);

  // 🔥 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!groupName.trim() || !selectionStats.minRequired) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const success = await onCreateGroup(
        groupName.trim(), 
        description.trim(), 
        selectedDeviceIds
      );
      
      if (success) {
        // 성공시 폼 리셋하고 닫기
        setGroupName('');
        setDescription('');
        setSelectedDeviceIds([]);
        onClose();
      }
    } catch (error) {
      console.error('그룹 생성 오류:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🔥 폼 유효성 검사
  const isFormValid = useMemo(() => {
    return groupName.trim().length > 0 && 
           selectionStats.minRequired && 
           !isSubmitting;
  }, [groupName, selectionStats.minRequired, isSubmitting]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-800">🏭 새 그룹 만들기</h3>
              <p className="text-sm text-gray-600 mt-1">
                디바이스들을 그룹으로 묶어서 한 번에 모니터링하세요
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* 폼 컨텐츠 */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* 기본 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  그룹 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="예: 온실 A동"
                  maxLength={50}
                  required
                />
                <div className="text-xs text-gray-500 mt-1">
                  {groupName.length}/50자
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">설명</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="그룹에 대한 간단한 설명"
                  maxLength={100}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {description.length}/100자
                </div>
              </div>
            </div>

            {/* 선택 상태 표시 */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800">디바이스 선택 현황</h4>
                <div className="flex space-x-2 text-xs">
                  <span className={`px-2 py-1 rounded-full ${
                    selectionStats.minRequired ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    최소 2개 {selectionStats.minRequired ? '✓' : '✗'}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${
                    selectionStats.maxReached ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {selectionStats.selected}/6개 선택됨
                  </span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>📱 총 {devices.length}개 디바이스</span>
                <span>🔍 검색된 {filteredDevices.length}개</span>
                <span>✅ 선택된 {selectionStats.selected}개</span>
              </div>
            </div>

            {/* 디바이스 검색 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                디바이스 검색 및 선택 <span className="text-red-500">*</span>
              </label>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={isSubmitting}
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="디바이스 이름, ID, 관리자로 검색..."
                  />
                  
                  {filteredDevices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      disabled={isSubmitting}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      {selectedDeviceIds.length === filteredDevices.length ? '전체 해제' : '전체 선택'}
                    </button>
                  )}
                </div>

                {/* 디바이스 목록 */}
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="text-4xl mb-2">🔍</div>
                      <p>{searchQuery ? '검색 결과가 없습니다' : '사용 가능한 디바이스가 없습니다'}</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredDevices.map((device) => {
                        const isSelected = selectedDeviceIds.includes(device.device_id);
                        const isDisabled = !isSelected && selectionStats.maxReached;
                        
                        return (
                          <label
                            key={device.device_id}
                            className={`flex items-center space-x-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              isDisabled || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                            } ${isSelected ? 'bg-blue-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => !isDisabled && !isSubmitting && handleDeviceToggle(device.device_id)}
                              disabled={isDisabled || isSubmitting}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900 truncate">
                                  {device.device_name}
                                </span>
                                {isSelected && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                    선택됨
                                  </span>
                                )}
                              </div>
                              
                              <div className="text-xs text-gray-500 space-y-1">
                                <div className="font-mono">{device.device_id}</div>
                                {device.admin_name && (
                                  <div className="flex items-center space-x-1">
                                    <span>👤</span>
                                    <span>{device.admin_name}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="p-6 border-t bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {!selectionStats.minRequired && (
                  <span className="text-red-600">⚠️ 최소 2개 디바이스를 선택해주세요</span>
                )}
                {selectionStats.maxReached && (
                  <span className="text-orange-600">⚠️ 최대 6개까지 선택 가능합니다</span>
                )}
              </div>
              
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-6 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
                >
                  취소
                </button>
                
                <button
                  type="submit"
                  disabled={!isFormValid}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      생성 중...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">🏭</span>
                      그룹 생성
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};