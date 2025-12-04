// components/sensor/SensorIcon.tsx

import React, { useState } from 'react';
import { getSensorIcon, isSensorIconPng } from '../../types/sensor.types';

interface SensorIconProps {
  sensorType: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const SensorIcon: React.FC<SensorIconProps> = ({ 
  sensorType, 
  size = 'md', 
  className = '' 
}) => {
  const [imageError, setImageError] = useState(false);
  const icon = getSensorIcon(sensorType);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  if (isSensorIconPng(sensorType) && !imageError) {
    return (
      <img
        src={icon}
        alt={`센서 ${sensorType}`}
        className={`${sizeClasses[size]} ${className} object-contain`}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <span className={`${textSizes[size]} ${className}`}>
      {icon}
    </span>
  );
};