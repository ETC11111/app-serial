// components/GroupHeader.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { DeviceGroup } from '../types/device.types';

interface GroupHeaderProps {
    group: DeviceGroup;
    statusCounts: {
        total: number;
        online: number;
        offline: number;
    };
    streamCount: number;
    lastUpdate: Date | null;
    onRefresh: () => void;
    isMobile: boolean;
}

export const GroupHeader: React.FC<GroupHeaderProps> = ({
    group,
    statusCounts,
    streamCount,
    lastUpdate,
    onRefresh,
    isMobile
}) => {
    return (
        <div className="bg-white rounded-lg shadow p-4 lg:p-6 flex-shrink-0">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                        <div>
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 truncate">
                                {group.group_name} 모니터링
                            </h1>
                            {group.description && (
                                <p className="text-gray-600 mt-1 text-sm sm:text-base">{group.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm">
                                <span className="text-gray-600">
                                    총 <span className="font-semibold text-blue-600">{statusCounts.total}대</span>
                                </span>
                                <span className="text-gray-600">
                                    온라인 <span className="font-semibold text-green-600">{statusCounts.online}대</span>
                                </span>
                                <span className="text-gray-600">
                                    스트림 <span className="font-semibold text-purple-600">{streamCount}개</span>
                                </span>
                                {statusCounts.offline > 0 && (
                                    <span className="text-gray-600">
                                        오프라인 <span className="font-semibold text-red-600">{statusCounts.offline}대</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col lg:items-end space-y-2 mt-4 lg:mt-0 flex-shrink-0">
                    {lastUpdate && (
                        <div className="flex items-center space-x-2 text-xs sm:text-sm">
                            <div className={`w-2 h-2 rounded-full ${statusCounts.online > 0 ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                            <span className="text-gray-600">
                                업데이트: {lastUpdate.toLocaleTimeString('ko-KR')}
                            </span>
                        </div>
                    )}

                    <div className="flex space-x-2">
                        <button
                            onClick={onRefresh}
                            className="flex items-center space-x-1 px-3 py-1 bg-blue-500 text-white text-xs sm:text-sm rounded hover:bg-blue-600 transition-colors"
                        >
                            <span>🔄 새로고침</span>
                        </button>
                        <Link
                            to="/devices"
                            className="px-3 py-1 bg-gray-500 text-white text-xs sm:text-sm rounded hover:bg-gray-600 transition-colors"
                        >
                            ← 목록
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default GroupHeader;