import { useState, useEffect } from 'react';
import { DeviceGroup, Device } from '../types/device.types';

const useDeviceGroups = () => {
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // 그룹 목록 조회
  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/devices/groups', {
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.success) {
        setGroups(result.groups || []);
      } else {
        console.error('그룹 조회 실패:', result.error);
        setGroups([]);
      }
    } catch (error) {
      console.error('그룹 조회 오류:', error);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // 그룹 생성
  const createGroup = async (groupName: string, description: string, deviceIds: string[]) => {
    try {
      const response = await fetch('/api/devices/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          groupName,
          description,
          deviceIds
        })
      });

      const result = await response.json();
      
      if (result.success) {
        await fetchGroups(); // 목록 새로고침
        return true;
      } else {
        alert(result.error || '그룹 생성에 실패했습니다.');
        return false;
      }
    } catch (error) {
      console.error('그룹 생성 오류:', error);
      alert('그룹 생성 중 오류가 발생했습니다.');
      return false;
    }
  };

  // 그룹 수정
  const updateGroup = async (groupId: string, updates: Partial<DeviceGroup>) => {
    try {
      const response = await fetch(`/api/devices/groups/${groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          groupName: updates.group_name,
          description: updates.description,
          deviceIds: updates.device_ids
        })
      });

      const result = await response.json();
      
      if (result.success) {
        await fetchGroups(); // 목록 새로고침
        return true;
      } else {
        alert(result.error || '그룹 수정에 실패했습니다.');
        return false;
      }
    } catch (error) {
      console.error('그룹 수정 오류:', error);
      alert('그룹 수정 중 오류가 발생했습니다.');
      return false;
    }
  };

  // 그룹 삭제
  const deleteGroup = async (groupId: string) => {
    try {
      const response = await fetch(`/api/devices/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.success) {
        await fetchGroups(); // 목록 새로고침
        return true;
      } else {
        alert(result.error || '그룹 삭제에 실패했습니다.');
        return false;
      }
    } catch (error) {
      console.error('그룹 삭제 오류:', error);
      alert('그룹 삭제 중 오류가 발생했습니다.');
      return false;
    }
  };

  // 그룹에 속하지 않은 디바이스들 가져오기
  const getUngroupedDevices = (allDevices: Device[]) => {
    const groupedDeviceIds = new Set();
    groups.forEach(group => {
      group.device_ids.forEach(deviceId => groupedDeviceIds.add(deviceId));
    });
    
    return allDevices.filter(device => !groupedDeviceIds.has(device.device_id));
  };

  // 초기 로드
  useEffect(() => {
    fetchGroups();
  }, []);

  return {
    groups,
    loading,
    createGroup,
    updateGroup,
    deleteGroup,
    getUngroupedDevices,
    refetchGroups: fetchGroups
  };
};

export default useDeviceGroups;