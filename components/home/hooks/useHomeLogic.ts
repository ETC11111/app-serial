// components/home/hooks/useHomeLogic.ts - 초기화 로직 개선으로 그룹 선택 유지
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Device, DeviceGroup } from '../../../types/device.types';
import { FlexibleSensorData } from '../../../types/sensor.types';
import { FavoriteItem } from '../types/HomeTypes';
import { globalSettingsApi } from '../../../services/greenhouseApi';

interface UseHomeLogicProps {
  devices: Device[];
  groups: DeviceGroup[];
  selectedDevice: Device | null;
  latestData: FlexibleSensorData | null;
  handleDeviceSelect: (device: Device) => void;
}

export const useHomeLogic = ({
  devices,
  groups,
  selectedDevice,
  latestData,
  handleDeviceSelect
}: UseHomeLogicProps) => {
  // 상태 관리
  const [favoriteGroups, setFavoriteGroups] = useState<DeviceGroup[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedFavoriteType, setSelectedFavoriteType] = useState<'device' | 'group' | null>(null);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);
  const [isLoadingLastSelection, setIsLoadingLastSelection] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  // 🔥 사용자가 수동으로 선택했는지 추적하는 상태 추가
  const [userHasManuallySelected, setUserHasManuallySelected] = useState(false);

  // 안정적인 즐겨찾기 장치 목록 (의존성 최소화)
  const favoriteDevices = useMemo(() => 
    devices.filter((device: Device) => device.is_favorite),
    [devices]
  );

  // 장치 상태 계산 함수 (useCallback으로 최적화)
  const getDeviceStatusText = useCallback((device: Device): string => {
    if (!device?.last_seen_at) return '상태 불명';

    const lastSeen = new Date(device.last_seen_at);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

    if (diffMinutes < 5) return '온라인';
    if (diffMinutes < 30) return '최근 활동';
    return '오프라인';
  }, []);

  // 안정적인 즐겨찾기 아이템 생성 (의존성 분리)
  const favoriteItems = useMemo((): FavoriteItem[] => {
    const items: FavoriteItem[] = [];

    // 즐겨찾기 디바이스 추가
    favoriteDevices.forEach(device => {
      if (!device?.device_id) return; // 안전성 체크

      items.push({
        type: 'device',
        id: device.device_id,
        name: device.device_name || '이름 없음',
        description: device.device_type || '디바이스',
        devices: [device],
        onlineCount: getDeviceStatusText(device) === '온라인' ? 1 : 0,
        totalCount: 1
      });
    });

    // 즐겨찾기 그룹 추가
    favoriteGroups.forEach(group => {
      if (!group?.group_id || !group?.device_ids) return; // 안전성 체크

      const groupDevices = devices.filter(device => 
        group.device_ids.includes(device.device_id)
      );
      const onlineDevices = groupDevices.filter(device => 
        getDeviceStatusText(device) === '온라인'
      );
      
      items.push({
        type: 'group',
        id: group.group_id,
        name: group.group_name || '그룹 이름 없음',
        description: group.description || '그룹',
        devices: groupDevices,
        color: group.color,
        onlineCount: onlineDevices.length,
        totalCount: groupDevices.length
      });
    });

    return items.sort((a, b) => {
      if (a.onlineCount !== b.onlineCount) {
        return b.onlineCount - a.onlineCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [favoriteDevices, favoriteGroups, devices, getDeviceStatusText]);

  // localStorage 폴백 함수 (의존성 최소화)
  const restoreFromLocalStorage = useCallback(() => {
    try {
      const savedData = localStorage.getItem('lastSelectedFavorite');
      if (!savedData) return null;

      const { type, id } = JSON.parse(savedData);
      return { type, id };
    } catch (error) {
      console.log('localStorage 복원 실패:', error);
      return null;
    }
  }, []);

  // DB에서 전역 설정 로드 (의존성 분리)
  const loadGlobalSettings = useCallback(async () => {
    try {
      setIsLoadingLastSelection(true);
      const response = await globalSettingsApi.getGlobalSettings();
      
      console.log('🔄 전역 설정 로드:', response);
      
      if (response.success && response.settings.lastSelectedDevice) {
        const { deviceId } = response.settings.lastSelectedDevice;
        return { type: 'device', id: deviceId };
      }

      // 즐겨찾기 그룹 정보 복원
      if (response.success && response.settings.favoriteGroupIds) {
        localStorage.setItem('groupFavorites', JSON.stringify(response.settings.favoriteGroupIds));
        
        const favoriteGroupsList = groups.filter(group => 
          response.settings.favoriteGroupIds[group.group_id]
        );
        setFavoriteGroups(favoriteGroupsList);
      }

      return null;
    } catch (error) {
      console.error('전역 설정 로드 실패:', error);
      return restoreFromLocalStorage();
    } finally {
      setIsLoadingLastSelection(false);
      setHasInitialized(true);
    }
  }, [groups, restoreFromLocalStorage]);

  // 🔥 최종 수정된 즐겨찾기 선택 핸들러
  const handleFavoriteItemSelect = useCallback(async (item: FavoriteItem) => {
    try {
      console.log('🎯 즐겨찾기 선택 (사용자 수동):', item.name, item.type);
      
      // 🔥 사용자가 수동으로 선택했음을 표시
      setUserHasManuallySelected(true);
      
      setSelectedFavoriteType(item.type);
      setSelectedFavoriteId(item.id);

      // localStorage 백업
      const favoriteData = {
        type: item.type,
        id: item.id,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('lastSelectedFavorite', JSON.stringify(favoriteData));

      if (item.type === 'device' && item.devices.length > 0) {
        // 디바이스 직접 선택 시에만 handleDeviceSelect 호출
        const device = item.devices[0];
        if (device) {
          console.log('📱 디바이스 선택:', device.device_name);
          handleDeviceSelect(device);
          
          // DB에 저장
          try {
            await globalSettingsApi.saveLastSelectedDevice(item.id, 'home');
            console.log('💾 DB에 마지막 선택 장치 저장 완료:', item.id);
          } catch (dbError) {
            console.error('DB 저장 실패:', dbError);
          }
        }
      } else if (item.type === 'group') {
        // 🔥 그룹 선택 시에는 자동 디바이스 선택하지 않음
        console.log('👥 그룹 선택됨, 자동 디바이스 선택 방지:', item.name);
        console.log('📝 그룹 선택 정보 로컬 저장 완료');
      }
    } catch (error) {
      console.error('즐겨찾기 선택 처리 실패:', error);
    }
  }, [handleDeviceSelect]);

  // 즐겨찾기 그룹 로드 (useCallback 최적화)
  const loadFavoriteGroups = useCallback(() => {
    try {
      const favoriteGroupIds = JSON.parse(localStorage.getItem('groupFavorites') || '{}');
      const favoriteGroupsList = groups.filter(group => favoriteGroupIds[group.group_id]);
      setFavoriteGroups(favoriteGroupsList);
    } catch (error) {
      console.error('즐겨찾기 그룹 로드 실패:', error);
      setFavoriteGroups([]);
    }
  }, [groups]);

  // 🔥 수정된 초기 설정 복원 로직 - 사용자 수동 선택 고려
  const applyLastSelection = useCallback(async (selectionData: { type: string; id: string } | null) => {
    if (!selectionData || favoriteItems.length === 0) return;

    const { type, id } = selectionData;
    const item = favoriteItems.find(item => item.type === type && item.id === id);
    
    if (item) {
      console.log('✅ 마지막 선택 복원 (자동):', item.name, item.type);
      setSelectedFavoriteType(item.type);
      setSelectedFavoriteId(item.id);
      
      // 🔥 디바이스인 경우에만 자동 선택
      if (item.type === 'device' && item.devices.length > 0) {
        handleDeviceSelect(item.devices[0]);
      } else if (item.type === 'group') {
        // 🔥 그룹 복원 시에는 디바이스 자동 선택 하지 않음
        console.log('👥 그룹 복원됨 (자동), 그룹 대시보드 모드로 전환:', item.name);
      }
    } else {
      console.log('⚠️ 마지막 선택 항목이 즐겨찾기에 없음');
    }
  }, [favoriteItems, handleDeviceSelect]);

  // Effects
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (groups.length > 0) {
      loadFavoriteGroups();
    }
  }, [groups, loadFavoriteGroups]);

  // 🔥 수정된 초기화 로직 - 사용자 수동 선택을 존중
  useEffect(() => {
    // 사용자가 수동으로 선택했다면 자동 복원하지 않음
    if (userHasManuallySelected) {
      console.log('🔒 사용자가 수동 선택했으므로 자동 복원 건너뜀');
      return;
    }

    // 이미 초기화되었거나 선택된 상태가 있으면 건너뜀
    if (hasInitialized || selectedFavoriteType) {
      return;
    }

    // 초기 로드시에만 마지막 선택 복원
    if (favoriteItems.length > 0 && !selectedDevice) {
      console.log('🔄 초기 로드: 마지막 선택 복원 시도');
      loadGlobalSettings().then(applyLastSelection);
    }
  }, [
    favoriteItems.length, 
    selectedDevice, 
    hasInitialized, 
    selectedFavoriteType,
    userHasManuallySelected, // 🔥 의존성 추가
    loadGlobalSettings, 
    applyLastSelection
  ]);

  return {
    // 상태
    favoriteGroups,
    isMobile,
    selectedFavoriteType,
    selectedFavoriteId,
    isLoadingLastSelection,
    userHasManuallySelected, // 🔥 플래그 반환 추가
    
    // 데이터
    favoriteItems,
    favoriteDevices,
    
    // 함수들
    getDeviceStatusText,
    handleFavoriteItemSelect
  };
};