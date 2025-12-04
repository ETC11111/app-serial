// components/sensor/SensorCard.tsx

import React, { useState, useEffect, useRef } from 'react';
import { DetectedSensor } from '../../types/sensor.types';
import { SensorIcon } from './SensorIcon';
import { getSensorValueMetadata, formatValue } from '../../utils/sensorUtils';
import { sensorLabelsApi } from '../../services/greenhouseApi';

interface SensorCardProps {
  sensor: DetectedSensor;
  valueIndex: number;
  value: number | string;
  isAnimating: boolean;
  allSensors?: DetectedSensor[]; // 전체 센서 리스트 (중복 체크용)
  deviceId?: string; // DB 저장을 위한 deviceId
}

export const SensorCard: React.FC<SensorCardProps> = ({
  sensor,
  valueIndex,
  value,
  isAnimating,
  allSensors = [],
  deviceId
}) => {
  const metadata = getSensorValueMetadata(sensor.type, valueIndex);
  const [isEditing, setIsEditing] = useState(false);
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // localStorage 키 생성 (sensor_id + type + valueIndex로 고유하게)
  const storageKey = `sensor_label_${sensor.sensor_id || sensor.name}_${sensor.type}_${valueIndex}`;
  // DB 키 생성 (동일한 형식)
  const dbKey = `${sensor.sensor_id || sensor.name}_${sensor.type}_${valueIndex}`;
  
  // DB와 localStorage에서 커스텀 라벨 로드
  useEffect(() => {
    const loadLabel = async () => {
      setIsLoading(true);
      
      // 1. DB에서 먼저 로드 시도
      if (deviceId) {
        try {
          const response = await sensorLabelsApi.getLabels(deviceId);
          if (response.success && response.hasLabels && response.labels) {
            const dbLabel = response.labels[dbKey];
            if (dbLabel) {
              setCustomLabel(dbLabel);
              // DB에서 가져온 값을 localStorage에도 동기화
              try {
                localStorage.setItem(storageKey, dbLabel);
              } catch (error) {
                console.warn('localStorage 동기화 실패:', error);
              }
              setIsLoading(false);
              return;
            }
          }
        } catch (error) {
          console.warn('DB에서 라벨 로드 실패, localStorage 확인:', error);
        }
      }
      
      // 2. DB에 없으면 localStorage에서 로드
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setCustomLabel(saved);
        }
      } catch (error) {
        console.error('localStorage에서 라벨 로드 실패:', error);
      }
      
      setIsLoading(false);
    };
    
    loadLabel();
  }, [deviceId, storageKey, dbKey]);
  
  // 편집 모드일 때 input에 포커스
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  if (!metadata) return null;
  if (value === null || value === undefined || value === '') return null;

  const isStringValue = typeof value === 'string';
  const isNumberValue = typeof value === 'number' && !isNaN(value);
  
  if (!isStringValue && !isNumberValue) return null;

  const formattedValue = isStringValue ? value : formatValue(value as number, metadata.unit);

  // 동일 타입 센서가 여러 개인지 확인
  const sameTypeSensors = allSensors.filter(s => s.type === sensor.type);
  const hasMultipleSameType = sameTypeSensors.length > 1;
  
  // 표시할 라벨 결정
  const displayLabel = customLabel || metadata.label;
  const labelWithChannel = hasMultipleSameType 
    ? `${displayLabel}(${sensor.channel || 1}번)`
    : displayLabel;

  // 편집 시작
  const handleStartEdit = () => {
    setEditingValue(customLabel || metadata.label);
    setIsEditing(true);
  };

  // 라벨 저장 (DB + localStorage)
  const handleSaveLabel = async () => {
    const trimmedValue = editingValue.trim();
    setIsSaving(true);
    
    try {
      if (trimmedValue !== '' && trimmedValue !== metadata.label) {
        // 1. localStorage에 저장 (즉시 반영)
        try {
          localStorage.setItem(storageKey, trimmedValue);
        } catch (error) {
          console.warn('localStorage 저장 실패:', error);
        }
        
        // 2. DB에 저장 시도
        if (deviceId) {
          try {
            await sensorLabelsApi.saveLabel(
              deviceId,
              sensor.sensor_id || sensor.name,
              sensor.type,
              valueIndex,
              trimmedValue
            );
            console.log('✅ DB에 라벨 저장 완료');
          } catch (error) {
            console.warn('DB 저장 실패 (localStorage는 저장됨):', error);
            // DB 저장 실패해도 localStorage는 저장되어 있으므로 계속 진행
          }
        }
        
        setCustomLabel(trimmedValue);
      } else {
        // 빈 값이거나 원래 값과 같으면 삭제
        // 1. localStorage에서 제거
        try {
          localStorage.removeItem(storageKey);
        } catch (error) {
          console.warn('localStorage 삭제 실패:', error);
        }
        
        // 2. DB에서도 제거 시도 (빈 문자열로 저장하여 삭제 효과)
        if (deviceId) {
          try {
            await sensorLabelsApi.saveLabel(
              deviceId,
              sensor.sensor_id || sensor.name,
              sensor.type,
              valueIndex,
              '' // 빈 문자열로 저장하여 삭제
            );
            console.log('✅ DB에서 라벨 삭제 완료');
          } catch (error) {
            console.warn('DB 삭제 실패:', error);
          }
        }
        
        setCustomLabel(null);
      }
    } catch (error) {
      console.error('라벨 저장 중 오류:', error);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  // Enter 키로 저장, Escape로 취소
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditingValue(customLabel || metadata.label); // 원래 값으로 복원
    }
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl p-6 
        transition-all duration-300 
        hover:scale-105 
        ${metadata.lightBg}
        border border-white/50 
      `}
      style={{
        '--sensor-color': metadata.rgb,
        animation: isAnimating ? 'colorIntensify 1s ease-in-out' : undefined
      } as React.CSSProperties & { '--sensor-color': string }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className={`p-2 rounded-lg ${metadata.lightBg} ${metadata.iconColor}`}>
            <SensorIcon sensorType={sensor.type} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={handleSaveLabel}
                onKeyDown={handleKeyDown}
                className={`w-full text-sm font-medium ${metadata.textColor} bg-transparent border-b-2 border-current outline-none`}
                style={{ color: metadata.primary }}
              />
            ) : (
              <div className="flex items-center space-x-1 group">
                <h4 className={`text-sm font-medium ${metadata.textColor} truncate`}>
                  {labelWithChannel}
                </h4>
                <button
                  onClick={handleStartEdit}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded"
                  title="라벨 편집"
                >
                  <svg 
                    className="w-3 h-3" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    style={{ color: metadata.primary }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {isStringValue ? (
          <div className={`text-lg font-bold ${metadata.textColor} break-words`}>
            {formattedValue}
          </div>
        ) : (
          <div className={`text-3xl font-bold ${metadata.textColor} flex items-baseline space-x-1`}>
            <span>{formattedValue}</span>
            {metadata.unit && (
              <span className="text-lg font-medium opacity-80">
                {metadata.unit}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4">
        <div 
          className="w-2 h-2 rounded-full" 
          style={{ backgroundColor: metadata.primary }}
        />
      </div>

      <div
        className="absolute bottom-0 right-0 w-20 h-20 opacity-10 rounded-full blur-xl transform translate-x-10 translate-y-10"
        style={{ backgroundColor: metadata.primary }}
      />
    </div>
  );
};