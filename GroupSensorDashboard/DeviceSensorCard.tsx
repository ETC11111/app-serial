// components/DeviceSensorCard.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { SensorCard } from '../components/SensorCard';

interface DeviceSensorCardProps {
    deviceData: {
        device: any;
        sensorData: any;
        isOnline: boolean;
        lastError?: string;
    };
    extractStandardValues: (sensorData: any) => any;
    onRefresh: () => void;
    isMobile: boolean;
}

export const DeviceSensorCard: React.FC<DeviceSensorCardProps> = ({
    deviceData,
    extractStandardValues,
    onRefresh,
    isMobile
}) => {
    return (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            {/* 디바이스 헤더 */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${deviceData.isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <div>
                        <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-800">
                            📱 {deviceData.device.device_name}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{deviceData.device.device_id}</p>
                        {deviceData.device.admin_name && (
                            <p className="text-xs text-gray-500">👤 {deviceData.device.admin_name}</p>
                        )}
                        {deviceData.sensorData && (
                            <p className="text-xs text-gray-500">🔌 {deviceData.sensorData.sensor_count || 0}개 센서</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${deviceData.isOnline
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                        {deviceData.isOnline ? '온라인' : '오프라인'}
                    </span>
                    <Link
                        to={`/sensors/${deviceData.device.device_id}`}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-blue-600 transition-colors whitespace-nowrap"
                    >
                        상세보기
                    </Link>
                </div>
            </div>

            {/* 센서 데이터 */}
            {deviceData.sensorData ? (
                <div className="space-y-4">
                    <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {(() => {
                            const values = extractStandardValues(deviceData.sensorData);
                            return (
                                <>
                                    {values.temperature !== null && (
                                        <SensorCard
                                            title="온도"
                                            value={values.temperature.toFixed(1)}
                                            unit="°C"
                                            color="text-blue-600"
                                            timestamp={deviceData.sensorData.receivedAt}
                                        />
                                    )}
                                    {values.humidity !== null && (
                                        <SensorCard
                                            title="습도"
                                            value={values.humidity.toFixed(1)}
                                            unit="%"
                                            color="text-green-600"
                                        />
                                    )}
                                    {values.waterTemp !== null && (
                                        <SensorCard
                                            title="수온"
                                            value={values.waterTemp.toFixed(1)}
                                            unit="°C"
                                            color="text-red-600"
                                        />
                                    )}
                                    {values.lightLevel !== null && (
                                        <SensorCard
                                            title="조도"
                                            value={Math.round(values.lightLevel).toString()}
                                            unit=" lux"
                                            color="text-yellow-600"
                                        />
                                    )}
                                    {values.ec !== null && (
                                        <SensorCard
                                            title="EC"
                                            value={values.ec.toFixed(3)}
                                            unit=" mS/cm"
                                            color="text-purple-600"
                                        />
                                    )}
                                    {values.ph !== null && (
                                        <SensorCard
                                            title="pH"
                                            value={values.ph.toFixed(2)}
                                            unit=""
                                            color="text-indigo-600"
                                        />
                                    )}
                                    {values.co2 !== null && (
                                        <SensorCard
                                            title="CO2"
                                            value={Math.round(values.co2).toString()}
                                            unit=" ppm"
                                            color="text-orange-600"
                                        />
                                    )}
                                    {values.pressure !== null && (
                                        <SensorCard
                                            title="압력"
                                            value={values.pressure.toFixed(2)}
                                            unit=" bar"
                                            color="text-violet-600"
                                        />
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* 센서 상세 정보 */}
                    {deviceData.sensorData.sensors && deviceData.sensorData.sensors.length > 0 && (
                        <details className="mt-4">
                            <summary className="flex items-center cursor-pointer text-xs sm:text-sm font-medium text-gray-700 hover:text-gray-900">
                                🔍 전체 센서 상세 정보 ({deviceData.sensorData.sensors.length}개)
                            </summary>
                            <div className="mt-2 space-y-2 bg-gray-50 p-3 rounded-lg">
                                {deviceData.sensorData.sensors.map((sensor: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center space-x-2">
                                            <span className={`w-2 h-2 rounded-full ${sensor.active ? 'bg-green-400' : 'bg-red-400'}`}></span>
                                            <span className="font-mono">{sensor.name}</span>
                                            <span className="text-gray-500">CH{sensor.channel}</span>
                                        </div>
                                        <div className="text-gray-700">
                                            {sensor.values && sensor.values.length > 0
                                                ? sensor.values.map((v: any) => Number(v).toFixed(2)).join(', ')
                                                : '--'
                                            }
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            ) : (
                <div className="text-center py-4 sm:py-6 text-gray-500">
                    <div className="text-2xl sm:text-3xl lg:text-4xl mb-2">
                        {deviceData.isOnline ? '📡' : '⚠️'}
                    </div>
                    <p className="text-xs sm:text-sm font-medium mb-1">
                        {deviceData.isOnline ? '센서 데이터 대기 중...' : '디바이스 오프라인'}
                    </p>
                    <p className="text-xs text-gray-400 mb-3 px-2">
                        {deviceData.lastError || '디바이스 연결 상태를 확인해주세요'}
                    </p>
                    <button
                        onClick={onRefresh}
                        className="inline-flex items-center justify-center px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-500 text-white text-xs sm:text-sm rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                    >
                        <span className="mr-1">🔄</span>
                        재시도
                    </button>
                </div>
            )}

            {/* 마지막 업데이트 시간 */}
            {deviceData.device.last_seen_at && (
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 text-center">
                    마지막 접속: {new Date(deviceData.device.last_seen_at).toLocaleString('ko-KR')}
                </div>
            )}
        </div>
    );
};
export default DeviceSensorCard;