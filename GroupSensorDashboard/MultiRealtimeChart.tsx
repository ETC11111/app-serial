// components/MultiRealtimeChart.tsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MultiRealtimeChartProps {
    historicalData: any[];
    deviceSensorData: any[];
    activeCharts: Array<'temp' | 'humidity' | 'water' | 'light' | 'ec' | 'ph' | 'co2' | 'pressure'>;
}

export const MultiRealtimeChart: React.FC<MultiRealtimeChartProps> = ({
    historicalData,
    deviceSensorData,
    activeCharts
}) => {
    // 차트 색상
    const chartColors = {
        temp: '#2563eb',
        humidity: '#16a34a',
        water: '#dc2626',
        light: '#d97706',
        ec: '#7c3aed',
        ph: '#059669',
        co2: '#ea580c',
        pressure: '#8b5cf6',
        soil_ph: '#dc2626',
        soil_ec: '#7c3aed',
        soil_temp: '#2563eb',
        soil_humidity: '#16a34a'
    };

    // 차트 데이터 생성
    const getMultiChartData = () => {
        if (historicalData.length === 0) return [];
        const currentOnlineDevices = deviceSensorData.filter(d => d.isOnline && d.sensorData);
        if (currentOnlineDevices.length === 0) return [];

        return historicalData.map(point => {
            const result: any = { time: point.time, timestamp: point.timestamp };

            activeCharts.forEach(chartType => {
                currentOnlineDevices.forEach((deviceData) => {
                    const deviceKey = deviceData.device.device_name.replace(/\s/g, '_');
                    const sensorType = chartType === 'temp' ? 'temperature' :
                        chartType === 'humidity' ? 'humidity' :
                            chartType === 'water' ? 'waterTemp' :
                                chartType === 'light' ? 'lightLevel' :
                                    chartType === 'ec' ? 'ec' :
                                        chartType === 'co2' ? 'co2' :
                                            chartType === 'pressure' ? 'pressure' :
                                                chartType === 'soil_ph' ? 'soil_ph' :
                                                    chartType === 'soil_ec' ? 'soil_ec' :
                                                        chartType === 'soil_temp' ? 'soil_temp' :
                                                            chartType === 'soil_humidity' ? 'soil_humidity' : 'ph';
                    
                    const dataKey = `${deviceKey}_${sensorType}`;
                    if (point.hasOwnProperty(dataKey) && point[dataKey] !== undefined) {
                        const value = point[dataKey];
                        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                            const chartKey = `${chartType}_${deviceData.device.device_name}`;
                            result[chartKey] = value;
                        }
                    }
                });
            });

            return result;
        }).filter(item => Object.keys(item).length > 2);
    };

    const chartData = getMultiChartData();
    const currentOnlineDevices = deviceSensorData.filter(d => d.isOnline && d.sensorData);

    if (chartData.length === 0 || currentOnlineDevices.length === 0) {
        return (
            <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
                <p className="text-gray-500">온라인 디바이스가 없거나 데이터를 수집하는 중...</p>
            </div>
        );
    }

    return (
        <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
                    <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} orientation="left" />
                    {activeCharts.length > 1 && (
                        <YAxis yAxisId="right" stroke="#6b7280" fontSize={12} orientation="right" />
                    )}
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                    />
                    <Legend />
                    {activeCharts.map((chartType, chartIndex) => 
                        currentOnlineDevices.map((deviceData, deviceIndex) => {
                            const chartKey = `${chartType}_${deviceData.device.device_name}`;
                            const baseColor = chartColors[chartType];
                            
                            // 차트 타입에 따른 라벨 생성
                            const getChartLabel = (type: string) => {
                                const labels: Record<string, string> = {
                                    'temp': '공기온도',
                                    'humidity': '공기습도',
                                    'water': '수온',
                                    'light': '조도',
                                    'ec': 'EC',
                                    'ph': 'pH',
                                    'co2': 'CO2',
                                    'pressure': '압력',
                                    'soil_ph': '토양pH',
                                    'soil_ec': '토양EC',
                                    'soil_temp': '토양온도',
                                    'soil_humidity': '토양습도'
                                };
                                return labels[type] || type;
                            };
                            
                            return (
                                <Line
                                    key={chartKey}
                                    type="monotone"
                                    dataKey={chartKey}
                                    name={`${deviceData.device.device_name} - ${getChartLabel(chartType)}`}
                                    stroke={baseColor}
                                    strokeWidth={2}
                                    dot={{ r: 2 }}
                                    activeDot={{ r: 4 }}
                                    connectNulls={false}
                                    yAxisId={chartIndex < activeCharts.length / 2 ? "left" : "right"}
                                    strokeDasharray={deviceIndex > 0 ? "5,5" : "0"}
                                />
                            );
                        })
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
export default MultiRealtimeChart;