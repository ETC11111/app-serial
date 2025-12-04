// components/ChartSelector.tsx
import React from 'react';

interface ChartSelectorProps {
    activeCharts: Array<'temp' | 'humidity' | 'water' | 'light' | 'ec' | 'ph' | 'co2' | 'pressure' | 'soil_ph' | 'soil_ec' | 'soil_temp' | 'soil_humidity'>;
    onToggleChart: (chartType: 'temp' | 'humidity' | 'water' | 'light' | 'ec' | 'ph' | 'co2' | 'pressure' | 'soil_ph' | 'soil_ec' | 'soil_temp' | 'soil_humidity') => void;
    onSelectAll: () => void;
    onReset: () => void;
}

export const ChartSelector: React.FC<ChartSelectorProps> = ({
    activeCharts,
    onToggleChart,
    onSelectAll,
    onReset
}) => {
    const chartOptions = [
        { key: 'temp', label: '공기온도', color: 'bg-blue-500', icon: '🌡️' },
        { key: 'humidity', label: '공기습도', color: 'bg-green-500', icon: '💧' },
        { key: 'water', label: '수온', color: 'bg-red-500', icon: '🌊' },
        { key: 'light', label: '조도', color: 'bg-yellow-500', icon: '☀️' },
        { key: 'ec', label: 'EC', color: 'bg-purple-500', icon: '⚡' },
        { key: 'ph', label: 'pH', color: 'bg-emerald-500', icon: '🧪' },
        { key: 'co2', label: 'CO2', color: 'bg-orange-500', icon: '💨' },
        { key: 'pressure', label: '압력', color: 'bg-violet-500', icon: '📊' },
        { key: 'soil_ph', label: '토양pH', color: 'bg-red-600', icon: '🌱' },
        { key: 'soil_ec', label: '토양EC', color: 'bg-purple-600', icon: '⚡' },
        { key: 'soil_temp', label: '토양온도', color: 'bg-blue-600', icon: '🌡️' },
        { key: 'soil_humidity', label: '토양습도', color: 'bg-green-600', icon: '💧' }
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <button
                        onClick={onSelectAll}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                        전체 선택
                    </button>
                    <button
                        onClick={onReset}
                        className="px-2 py-1 bg-gray-500 text-white rounded text-xs font-medium hover:bg-gray-600 transition-colors"
                    >
                        초기화
                    </button>
                </div>
                
                <div className="text-xs text-gray-600">
                    <span className="font-medium text-blue-600">{activeCharts.length}개</span> 선택됨
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {chartOptions.map(chart => (
                    <button
                        key={chart.key}
                        onClick={() => onToggleChart(chart.key as any)}
                        className={`flex items-center px-2 py-1.5 rounded text-xs font-medium transition-all duration-200 ${
                            activeCharts.includes(chart.key as any)
                                ? `${chart.color} text-white shadow-md transform scale-105`
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        <span className="mr-1">{chart.icon}</span>
                        <span>{chart.label}</span>
                        {activeCharts.includes(chart.key as any) && (
                            <span className="ml-1 text-xs">✓</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};
export default ChartSelector;