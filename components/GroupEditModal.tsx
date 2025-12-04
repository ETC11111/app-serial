// src/components/GroupEditModal.tsx

import React, { useState } from 'react';
import { Device, DeviceGroup } from '../types/device.types';

interface GroupEditModalProps {
  group: DeviceGroup;
  allDevices: Device[];
  onClose: () => void;
  onUpdateGroup: (groupId: string, updatedGroup: Partial<DeviceGroup>) => void;
  onDeleteGroup: (groupId: string) => void;
}

export const GroupEditModal: React.FC<GroupEditModalProps> = ({
  group,
  allDevices,
  onClose,
  onUpdateGroup,
  onDeleteGroup
}) => {
  const [groupName, setGroupName] = useState(group.group_name);
  const [description, setDescription] = useState(group.description || '');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(group.device_ids);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 그룹에 속하지 않은 디바이스들 + 현재 그룹의 디바이스들
  const availableDevices = allDevices.filter(device =>
    !group.device_ids.includes(device.device_id) || selectedDeviceIds.includes(device.device_id)
  );

  const handleDeviceToggle = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : prev.length < 6 // 최대 6개 제한
          ? [...prev, deviceId]
          : prev
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (groupName.trim() && selectedDeviceIds.length >= 2 && selectedDeviceIds.length <= 6) {
      onUpdateGroup(group.group_id, {
        group_name: groupName.trim(),
        description: description.trim(),
        device_ids: selectedDeviceIds
      });
      onClose();
    }
  };

  const handleDelete = () => {
    onDeleteGroup(group.group_id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">그룹 편집</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* 그룹 이름 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                그룹 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 온실 A동"
                required
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium mb-2">설명</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="그룹에 대한 설명을 입력하세요"
                rows={3}
              />
            </div>

            {/* 그룹 색상 */}
            <div>
              <label className="block text-sm font-medium mb-2">그룹 색상</label>
              <div
                className="w-8 h-8 rounded-full border-2 border-gray-300"
                style={{ backgroundColor: group.color }}
                title={`현재 색상: ${group.color}`}
              />
            </div>

            {/* 디바이스 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                디바이스 선택 <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-1">
                  (2~6개 선택 가능)
                </span>
              </label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                {availableDevices.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    사용 가능한 디바이스가 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableDevices.map((device) => {
                      const isSelected = selectedDeviceIds.includes(device.device_id);
                      const isDisabled = !isSelected && selectedDeviceIds.length >= 6;

                      return (
                        <label
                          key={device.device_id}
                          className={`flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => !isDisabled && handleDeviceToggle(device.device_id)}
                            disabled={isDisabled}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{device.device_name}</div>
                            <div className="text-xs text-gray-500">{device.device_id}</div>
                          </div>
                          {isSelected && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              선택됨
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className="text-gray-500">
                  선택된 디바이스: {selectedDeviceIds.length}/6개
                </span>
                {selectedDeviceIds.length >= 6 && (
                  <span className="text-orange-600 font-medium">
                    최대 6개까지 선택 가능
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            {/* 삭제 버튼 */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              <img src="/trash.png" alt="그룹 삭제" className="w-5 h-5 mr-2" />
              그룹 삭제
            </button>

            {/* 저장/취소 버튼 */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={
                  !groupName.trim() ||
                  selectedDeviceIds.length < 2 ||
                  selectedDeviceIds.length > 6
                }
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                저장
              </button>
            </div>
          </div>
        </form>

        {/* 삭제 확인 모달 */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
              <h4 className="text-lg font-semibold mb-3">그룹 삭제 확인</h4>
              <p className="text-gray-600 mb-4">
                '<span className="font-medium">{group.group_name}</span>' 그룹을 정말로 삭제하시겠습니까?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                그룹을 삭제해도 디바이스는 삭제되지 않습니다.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};