// hooks/useDeviceActions.tsx
import { useCallback } from 'react';
import { toast } from 'react-toastify';

interface UseDeviceActionsProps {
  toggleFavorite: (deviceId: string) => Promise<boolean>;
  createGroup: (groupName: string, description: string, selectedDeviceIds: string[]) => Promise<boolean>;
  updateGroup: (groupId: string, updates: any) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  refreshDevices: () => Promise<void>;
}

export const useDeviceActions = ({
  toggleFavorite,
  createGroup,
  updateGroup,
  deleteGroup,
  refreshDevices
}: UseDeviceActionsProps) => {
  
  const handleToggleFavorite = useCallback(async (deviceId: string): Promise<void> => {
    try {
      const success = await toggleFavorite(deviceId);
      if (success) {
        toast.success('즐겨찾기가 변경되었습니다.');
      } else {
        toast.error('즐겨찾기 설정에 실패했습니다.');
      }
    } catch (error) {
      console.error('즐겨찾기 토글 오류:', error);
      toast.error('오류가 발생했습니다. 다시 시도해주세요.');
    }
  }, [toggleFavorite]);

  const handleCreateGroup = useCallback(async (
    groupName: string, 
    description: string, 
    selectedDeviceIds: string[]
  ): Promise<boolean> => {
    try {
      const success = await createGroup(groupName, description, selectedDeviceIds);
      if (success) {
        await refreshDevices();
        toast.success(`그룹 "${groupName}"이 성공적으로 생성되었습니다.`);
      } else {
        toast.error('그룹 생성에 실패했습니다.');
      }
      return success;
    } catch (error) {
      console.error('그룹 생성 오류:', error);
      toast.error('그룹 생성 중 오류가 발생했습니다.');
      return false;
    }
  }, [createGroup, refreshDevices]);

  const handleUpdateGroup = useCallback(async (
    groupId: string, 
    updates: any
  ): Promise<boolean> => {
    try {
      const success = await updateGroup(groupId, updates);
      if (success) {
        toast.success('그룹이 성공적으로 수정되었습니다.');
      } else {
        toast.error('그룹 수정에 실패했습니다.');
      }
      return success;
    } catch (error) {
      console.error('그룹 수정 오류:', error);
      toast.error('그룹 수정 중 오류가 발생했습니다.');
      return false;
    }
  }, [updateGroup]);

  const handleDeleteGroup = useCallback(async (groupId: string): Promise<boolean> => {
    if (!window.confirm('정말로 이 그룹을 삭제하시겠습니까?')) {
      return false;
    }
    
    try {
      const success = await deleteGroup(groupId);
      if (success) {
        toast.success('그룹이 성공적으로 삭제되었습니다.');
      } else {
        toast.error('그룹 삭제에 실패했습니다.');
      }
      return success;
    } catch (error) {
      console.error('그룹 삭제 오류:', error);
      toast.error('그룹 삭제 중 오류가 발생했습니다.');
      return false;
    }
  }, [deleteGroup]);

  return {
    handleToggleFavorite,
    handleCreateGroup,
    handleUpdateGroup,
    handleDeleteGroup
  };
};