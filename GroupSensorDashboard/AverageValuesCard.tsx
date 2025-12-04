// components/AverageValuesCard.tsx
import React from 'react';

interface AverageValuesCardProps {
    averageValues: any;
    groupName: string;
    onlineCount: number;
    isMobile: boolean;
}

export const AverageValuesCard: React.FC<AverageValuesCardProps> = ({
    averageValues,
    groupName,
    onlineCount,
    isMobile
}) => {
    if (!averageValues) {
        return (
            <div className="bg-white rounded-lg shadow p-4 lg:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-4">📊 그룹 상태</h3>
                <div className="text-center py-6 sm:py-8">
                    <div className="text-4xl sm:text-6xl mb-4">📡</div>
                    <h4 className="text-lg sm:text-xl font-semibold mb-2 text-gray-800">온라인 디바이스 없음</h4>
                    <p className="text-sm sm:text-base text-gray-500 mb-4">
                        현재 그룹의 모든 디바이스가 오프라인 상태입니다.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center">
                📊 {groupName} 평균값
                <span className="ml-2 text-xs sm:text-sm font-normal text-gray-500">
                    ({onlineCount}개 온라인 디바이스 기준)
                </span>
            </h3>
            <div className={`grid gap-4 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
                {averageValues.temperature && (
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-blue-600">{averageValues.temperature}°C</div>
                        <div className="text-xs sm:text-sm text-blue-700">평균 온도</div>
                    </div>
                )}
                {averageValues.humidity && (
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-green-600">{averageValues.humidity}%</div>
                        <div className="text-xs sm:text-sm text-green-700">평균 습도</div>
                    </div>
                )}
                {averageValues.waterTemp && (
                    <div className="bg-red-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-red-600">{averageValues.waterTemp}°C</div>
                        <div className="text-xs sm:text-sm text-red-700">평균 수온</div>
                    </div>
                )}
                {averageValues.lightLevel && (
                    <div className="bg-yellow-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-yellow-600">{averageValues.lightLevel}</div>
                        <div className="text-xs sm:text-sm text-yellow-700">평균 조도</div>
                    </div>
                )}
                {averageValues.ec && (
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-purple-600">{averageValues.ec}</div>
                        <div className="text-xs sm:text-sm text-purple-700">평균 EC</div>
                    </div>
                )}
                {averageValues.ph && (
                    <div className="bg-indigo-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-indigo-600">{averageValues.ph}</div>
                        <div className="text-xs sm:text-sm text-indigo-700">평균 pH</div>
                    </div>
                )}
                {averageValues.co2 && (
                    <div className="bg-orange-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-orange-600">{averageValues.co2} ppm</div>
                        <div className="text-xs sm:text-sm text-orange-700">평균 CO2</div>
                    </div>
                )}
                {averageValues.pressure && (
                    <div className="bg-violet-50 p-4 rounded-lg text-center">
                        <div className="text-xl sm:text-2xl font-bold text-violet-600">{averageValues.pressure} bar</div>
                        <div className="text-xs sm:text-sm text-violet-700">평균 압력</div>
                    </div>
                )}
            </div>
        </div>
    );
};
export default AverageValuesCard;