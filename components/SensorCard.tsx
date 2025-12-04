// SensorCard.tsx 수정
interface SensorCardProps {
  title: string;
  value: string | number;
  unit: string;
  color?: string;
  timestamp?: string;
}

export const SensorCard: React.FC<SensorCardProps> = ({ 
  title, 
  value, 
  unit, 
  color = "text-gray-600",
  timestamp 
}) => {
  // 🔥 NaN, null, undefined 값 안전하게 처리
  const displayValue = () => {
    if (value === null || value === undefined || value === '' || 
        (typeof value === 'number' && (isNaN(value) || !isFinite(value)))) {
      return '--';
    }
    return value;
  };

  return (
    <div className="bg-gray-50 p-3 rounded-lg text-center">
      <div className={`text-lg font-bold ${color}`}>
        {displayValue()}{unit}
      </div>
      <div className="text-xs text-gray-500">{title}</div>
      {timestamp && (
        <div className="text-xs text-gray-400 mt-1">
          {new Date(timestamp).toLocaleTimeString('ko-KR')}
        </div>
      )}
    </div>
  );
};