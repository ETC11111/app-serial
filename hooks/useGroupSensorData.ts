// hooks/useGroupSensorData.ts
import { useState, useEffect } from 'react';
import { deviceService } from '../services/deviceService';
import { DeviceGroup, Device } from '../types/device.types';
import { FlexibleSensorData, DetectedSensor, SensorType } from '../types/sensor.types';

interface DeviceSensorData {
    device: Device;
    sensorData: FlexibleSensorData | null;
    isOnline: boolean;
    lastError?: string;
}

interface HistoricalData {
    timestamp: string;
    time: string;
    [key: string]: string | number;
}

export const useGroupSensorData = (groupId: string | undefined) => {
    const [group, setGroup] = useState<DeviceGroup | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [deviceSensorData, setDeviceSensorData] = useState<DeviceSensorData[]>([]);
    const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    // 🔥 센서 값 추출 함수 - 타입 안전성 개선
    const extractSensorValue = (sensors: DetectedSensor[], sensorType: SensorType, valueIndex: number = 0): number | null => {
        const sensor = sensors.find(s => s.type === sensorType && s.active);
        if (!sensor || !sensor.values || sensor.values.length <= valueIndex) {
            return null;
        }
        
        const value = sensor.values[valueIndex];
        
        // 🔥 string | number를 number로 안전하게 변환
        if (typeof value === 'number') {
            return isNaN(value) || !isFinite(value) ? null : value;
        } else if (typeof value === 'string') {
            const numValue = parseFloat(value);
            return isNaN(numValue) || !isFinite(numValue) ? null : numValue;
        }
        
        return null;
    };

    // 🔥 센서 데이터에서 표준 값들 추출 - 안전한 SensorType 사용
    const extractStandardValues = (sensorData: FlexibleSensorData) => {
        const sensors = sensorData.sensors || [];
        return {
            temperature: extractSensorValue(sensors, 1 as SensorType, 0) ?? 
                        extractSensorValue(sensors, 4 as SensorType, 1) ?? 
                        extractSensorValue(sensors, 5 as SensorType, 0) ?? 
                        extractSensorValue(sensors, 11 as SensorType, 0),
            humidity: extractSensorValue(sensors, 1 as SensorType, 1) ?? 
                     extractSensorValue(sensors, 4 as SensorType, 2) ?? 
                     extractSensorValue(sensors, 11 as SensorType, 1),
            lightLevel: extractSensorValue(sensors, 2 as SensorType, 0),
            waterTemp: extractSensorValue(sensors, 3 as SensorType, 0),
            ec: extractSensorValue(sensors, 3 as SensorType, 1),
            ph: extractSensorValue(sensors, 3 as SensorType, 2),
            co2: extractSensorValue(sensors, 4 as SensorType, 0),
            // 토양센서 값들 (pH, EC, 온도, 습도 순서)
            soil_ph: extractSensorValue(sensors, 19 as SensorType, 0),
            soil_ec: extractSensorValue(sensors, 19 as SensorType, 1),
            soil_temp: extractSensorValue(sensors, 19 as SensorType, 2),
            soil_humidity: extractSensorValue(sensors, 19 as SensorType, 3),
            // 🔥 SensorType에 6이 없는 경우를 대비해 조건부 처리
            pressure: (() => {
                try {
                    return extractSensorValue(sensors, 6 as SensorType, 2) ?? 
                           extractSensorValue(sensors, 12 as SensorType, 0);
                } catch {
                    // SensorType에 6이 정의되지 않은 경우 fallback
                    return extractSensorValue(sensors, 12 as SensorType, 0);
                }
            })()
        };
    };

    // 개별 디바이스 센서 데이터 조회
    const fetchSingleDeviceSensorData = async (device: Device): Promise<DeviceSensorData> => {
        try {
            const response = await fetch(`/api/sensors/${device.device_id}`, {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    return {
                        device,
                        sensorData: result.data,
                        isOnline: true,
                        lastError: undefined
                    };
                }
            }
            
            return {
                device,
                sensorData: null,
                isOnline: false,
                lastError: response.status === 404 ? '센서 데이터 없음' : `HTTP ${response.status}`
            };
        } catch (error) {
            return {
                device,
                sensorData: null,
                isOnline: false,
                lastError: 'Network error'
            };
        }
    };

    // 그룹 데이터 로드
    const fetchGroupData = async () => {
        if (!groupId) return;

        try {
            setLoading(true);
            const result = await deviceService.getGroupSensors(groupId);
            if (result.success) {
                setGroup(result.group);
                setDevices(result.devices);
                setError(null);
            } else {
                setError(result.error || '그룹 데이터를 불러올 수 없습니다.');
            }
        } catch (error) {
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 모든 센서 데이터 조회
    const fetchAllSensorData = async () => {
        if (!devices.length) return;

        try {
            setError(null);
            const promises = devices.map(device => fetchSingleDeviceSensorData(device));
            const results = await Promise.all(promises);
            
            setDeviceSensorData(results);
            setLastUpdate(new Date());

            // 히스토리 데이터 업데이트
            const onlineDevices = results.filter(d => d.sensorData && d.isOnline);
            if (onlineDevices.length > 0) {
                const newHistoryPoint: HistoricalData = {
                    timestamp: new Date().toISOString(),
                    time: new Date().toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                };

                onlineDevices.forEach((deviceData) => {
                    const deviceKey = deviceData.device.device_name.replace(/\s/g, '_');
                    const values = extractStandardValues(deviceData.sensorData!);

                    Object.entries(values).forEach(([key, value]) => {
                        if (value !== null && !isNaN(value) && isFinite(value)) {
                            newHistoryPoint[`${deviceKey}_${key}`] = Number(value.toFixed(2));
                        }
                    });
                });

                setHistoricalData(prev => [...prev, newHistoryPoint].slice(-20));
            }
        } catch (error) {
            console.error('센서 데이터 조회 실패:', error);
        }
    };

    // 평균값 계산
    const getAverageValues = () => {
        const onlineDevices = deviceSensorData.filter(d => d.sensorData && d.isOnline);
        if (onlineDevices.length === 0) return null;

        const sensorValues = {
            temperature: [] as number[],
            humidity: [] as number[],
            waterTemp: [] as number[],
            lightLevel: [] as number[],
            ec: [] as number[],
            ph: [] as number[],
            co2: [] as number[],
            pressure: [] as number[],
            soil_ph: [] as number[],
            soil_ec: [] as number[],
            soil_temp: [] as number[],
            soil_humidity: [] as number[]
        };

        onlineDevices.forEach(deviceData => {
            const values = extractStandardValues(deviceData.sensorData!);
            Object.entries(values).forEach(([key, value]) => {
                if (value !== null && !isNaN(value) && isFinite(value) && key in sensorValues) {
                    (sensorValues as any)[key].push(value);
                }
            });
        });

        const averages: any = {};
        Object.entries(sensorValues).forEach(([key, values]) => {
            if (values.length > 0) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                if (key === 'lightLevel' || key === 'co2') {
                    averages[key] = Math.round(avg).toString();
                } else if (key === 'ec') {
                    averages[key] = avg.toFixed(3);
                } else if (key === 'ph') {
                    averages[key] = avg.toFixed(2);
                } else {
                    averages[key] = avg.toFixed(1);
                }
            }
        });

        return Object.keys(averages).length > 0 ? averages : null;
    };

    // 상태 카운트
    const getStatusCounts = () => {
        const online = deviceSensorData.filter(d => d.isOnline).length;
        const total = devices.length;
        return { online, offline: total - online, total };
    };

    // 초기 데이터 로딩
    useEffect(() => {
        if (groupId) {
            fetchGroupData();
        }
    }, [groupId]);

    useEffect(() => {
        if (group && devices.length > 0) {
            fetchAllSensorData();
            const interval = setInterval(fetchAllSensorData, 10000);
            return () => clearInterval(interval);
        }
    }, [group, devices]);

    return {
        // 상태
        group,
        devices,
        deviceSensorData,
        historicalData,
        loading,
        error,
        lastUpdate,
        
        // 계산된 값들
        averageValues: getAverageValues(),
        statusCounts: getStatusCounts(),
        
        // 함수들
        fetchGroupData,
        fetchAllSensorData,
        extractStandardValues
    };
};