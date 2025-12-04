// GroupCard.tsx
import React, { memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Device, DeviceGroup } from '../../types/device.types';

interface GroupCardProps {
  group: DeviceGroup;
  groupDevices: Device[];
  onEditGroup: (group: DeviceGroup) => void;
  onToggleGroupFavorite?: (groupId: string) => void;
  isFavorite?: boolean;
}

export const GroupCard = memo<GroupCardProps>(({
  group,
  groupDevices,
  onEditGroup,
  onToggleGroupFavorite,
  isFavorite = false
}) => {
  const handleEditClick = useCallback(() => {
    onEditGroup(group);
  }, [onEditGroup, group]);

  const handleFavoriteClick = useCallback(() => {
    if (onToggleGroupFavorite) {
      onToggleGroupFavorite(group.group_id);
    }
  }, [onToggleGroupFavorite, group.group_id]);

  const remainingSlots = Math.max(0, 6 - groupDevices.length);
  const canAddMore = remainingSlots > 0;

  return (
    <article
      className="bg-white border-2 rounded-xl p-4 shadow-sm col-span-full"
      style={{ borderColor: group.color }}
      aria-label={`그룹 ${group.group_name}`}
    >
      {/* 그룹 헤더 */}
      <header className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3 flex-1">
          <div
            className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
            style={{ backgroundColor: group.color }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-semibold text-gray-800 text-base leading-tight">
                {group.group_name}
              </h3>
              {onToggleGroupFavorite && (
                <button
                  onClick={handleFavoriteClick}
                  className="text-lg hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 rounded"
                  aria-label={isFavorite ? `그룹 ${group.group_name} 즐겨찾기 해제` : `그룹 ${group.group_name} 즐겨찾기 추가`}
                  title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                >
                  {isFavorite ? "⭐" : "☆"}
                </button>
              )}
            </div>
            {group.description && (
              <p className="text-sm text-gray-600 mt-1 leading-tight">
                {group.description}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {groupDevices.length}개 디바이스 • {
                canAddMore
                  ? `${remainingSlots}개 더 추가 가능`
                  : '최대 용량'
              }
            </p>
          </div>
        </div>

        {/* 그룹 액션 버튼 */}
        <nav className="flex space-x-1 flex-shrink-0 ml-2">
          <button
            onClick={handleEditClick}
            className="bg-blue-100 text-blue-600 p-2 rounded-lg hover:bg-blue-200 focus:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
            aria-label={`그룹 ${group.group_name} 편집`}
            title="그룹 편집"
          >
            <img
              src="/edit.png"
              alt="그룹 편집"
              className="w-4 h-4"
            />
          </button>
        </nav>
      </header>

      {/* 그룹 센서 보기 버튼 */}
      <Link
        to={`/group-sensors/${group.group_id}`}
        className="flex items-center justify-center w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 focus:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors shadow-sm mb-3"
        aria-label={`${group.group_name} 그룹 센서 데이터 보기`}
      >
        <img src="/chart.png" alt="그룹 센서 보기" className="w-5 h-5 mr-2" />
        그룹 센서 보기 ({groupDevices.length}개 유닛)
      </Link>

      {/* 포함된 디바이스들을 2x3 그리드로 표시 */}
      <div className="grid grid-cols-2 gap-2" role="list" aria-label="그룹 내 디바이스 목록">
        {groupDevices.map((device: Device) => (
          <GroupDeviceItem key={device.device_id} device={device} />
        ))}

        {/* 빈 슬롯 표시 (최대 6개까지) */}
        {Array.from({ length: remainingSlots }, (_, index) => (
          <EmptySlot key={`empty-${index}`} />
        ))}
      </div>
    </article>
  );
});

GroupCard.displayName = 'GroupCard';

// 🔥 그룹 내 디바이스 아이템 컴포넌트
const GroupDeviceItem = memo<{ device: Device }>(({ device }) => {
  return (
    <div className="bg-gray-50 p-2 rounded-lg" role="listitem">
      <div className="text-center">
        <div className="font-medium text-xs text-gray-800 truncate mb-1" title={device.device_name}>
          {device.device_name}
        </div>
        <div className="text-xs text-gray-500 font-mono truncate mb-2" title={device.device_id}>
          {device.device_id}
        </div>
        <Link
          to={`/sensors/${device.device_id}`}
          className="flex items-center justify-center w-full bg-green-100 text-green-700 py-1 rounded text-xs font-medium hover:bg-green-200 focus:bg-green-200 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors"
          aria-label={`${device.device_name} 센서 데이터 보기`}
          title="센서 데이터 보기"
        >
          <img src="/chart.png" alt="센서 데이터 보기" className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
});

GroupDeviceItem.displayName = 'GroupDeviceItem';

// 🔥 빈 슬롯 컴포넌트
const EmptySlot = memo(() => {
  return (
    <div className="bg-gray-100 border-2 border-dashed border-gray-300 p-2 rounded-lg" role="listitem">
      <div className="text-center text-gray-400 text-xs py-4">
        <img
          src="/add.png"
          alt="추가 아이콘"
          className="w-5 h-5 mx-auto mb-1"
          aria-hidden="true"
        />
        <div>추가 가능</div>
      </div>
    </div>
  );
});

EmptySlot.displayName = 'EmptySlot';