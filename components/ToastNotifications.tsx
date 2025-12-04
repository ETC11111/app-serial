// components/ToastNotifications.tsx - 레이아웃 상단 토스트 알림
import React, { useEffect, useState } from 'react';
import { useNotifications, ToastNotification } from '../contexts/NotificationContext';

// UI 아이콘 컴포넌트
const UIIcon: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ 
  name, 
  size = 'md', 
  className = '' 
}) => {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  };

  if (!imageError) {
    return (
      <img 
        src={`/${name}.png`} 
        alt={name}
        className={`${sizeClasses[size]} ${className} object-contain`}
        onError={() => setImageError(true)}
      />
    );
  }

  // 폴백 이모지
  const fallbackEmojis = {
    'warning': '⚠️',
    'error': '❌',
    'success': '✅',
    'info': 'ℹ️',
    'bell': '🔔',
    'close': '✕',
    'sensor': '🔧',
    'thermometer': '🌡️',
    'alert': '🚨'
  }[name] || '❓';

  return (
    <span className={`inline-flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {fallbackEmojis}
    </span>
  );
};

// 개별 토스트 알림 컴포넌트
interface ToastItemProps {
  toast: ToastNotification;
  onClose: (id: string) => void;
  isVisible: boolean;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose, isVisible }) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const [progress, setProgress] = useState(100);

  // 자동 진행률 계산
  useEffect(() => {
    if (toast.autoHide && toast.duration > 0) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
        setProgress(remaining);
        
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 50);

      return () => clearInterval(interval);
    }
  }, [toast.autoHide, toast.duration]);

  // 닫기 애니메이션 처리
  const handleClose = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300);
  };

  // 심각도별 스타일
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-500',
          border: 'border-red-600',
          text: 'text-white',
          icon: 'error',
          progressBg: 'bg-red-300'
        };
      case 'high':
        return {
          bg: 'bg-orange-500',
          border: 'border-orange-600',
          text: 'text-white',
          icon: 'warning',
          progressBg: 'bg-orange-300'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-500',
          border: 'border-yellow-600',
          text: 'text-white',
          icon: 'warning',
          progressBg: 'bg-yellow-300'
        };
      case 'low':
        return {
          bg: 'bg-blue-500',
          border: 'border-blue-600',
          text: 'text-white',
          icon: 'info',
          progressBg: 'bg-blue-300'
        };
      default:
        return {
          bg: 'bg-gray-500',
          border: 'border-gray-600',
          text: 'text-white',
          icon: 'info',
          progressBg: 'bg-gray-300'
        };
    }
  };

  const style = getSeverityStyle(toast.severity);

  // 타입별 아이콘
  const getTypeIcon = () => {
    switch (toast.type) {
      case 'sensor_alert':
        return '🚨';
      case 'sensor_recovery':
        return '✅';
      case 'system_error':
        return '❌';
      default:
        return '🔔';
    }
  };

  return (
    <div
      className={`
        relative w-full max-w-md mx-auto mb-3 rounded-lg shadow-lg border-2 overflow-hidden
        transform transition-all duration-300 ease-in-out
        ${style.bg} ${style.border}
        ${isVisible && !isRemoving ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'}
        ${toast.severity === 'critical' ? 'animate-pulse' : ''}
      `}
    >
      {/* 진행률 바 (자동 숨김 알림만) */}
      {toast.autoHide && toast.duration > 0 && (
        <div className="absolute top-0 left-0 h-1 bg-white bg-opacity-30 w-full">
          <div 
            className={`h-full ${style.progressBg} transition-all duration-75 ease-linear`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between">
          {/* 메인 컨텐츠 */}
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            {/* 아이콘 */}
            <div className="flex-shrink-0 mt-0.5">
              <span className="text-xl">
                {getTypeIcon()}
              </span>
            </div>

            {/* 텍스트 컨텐츠 */}
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm ${style.text} mb-1`}>
                {toast.title}
              </div>
              <div className={`text-sm ${style.text} opacity-90 leading-tight`}>
                {toast.message}
              </div>
              
              {/* 센서 정보 */}
              {(toast.deviceName || toast.sensorName) && (
                <div className={`mt-2 text-xs ${style.text} opacity-75 flex items-center space-x-2`}>
                  {toast.deviceName && (
                    <span className="flex items-center space-x-1">
                      <UIIcon name="sensor" size="sm" />
                      <span>{toast.deviceName}</span>
                    </span>
                  )}
                  {toast.sensorName && (
                    <span className="flex items-center space-x-1">
                      <UIIcon name="thermometer" size="sm" />
                      <span>{toast.sensorName}</span>
                    </span>
                  )}
                </div>
              )}

              {/* 값 정보 */}
              {(toast.currentValue !== undefined || toast.thresholdValue !== undefined) && (
                <div className={`mt-1 text-xs ${style.text} opacity-75 font-mono`}>
                  {toast.currentValue !== undefined && (
                    <span>현재값: {toast.currentValue.toFixed(2)}</span>
                  )}
                  {toast.thresholdValue !== undefined && (
                    <span className="ml-2">기준값: {toast.thresholdValue.toFixed(2)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={handleClose}
            className={`flex-shrink-0 ml-2 p-1 rounded hover:bg-white hover:bg-opacity-20 transition-colors ${style.text}`}
            aria-label="알림 닫기"
          >
            <UIIcon name="close" size="sm" />
          </button>
        </div>

        {/* 시간 표시 */}
        <div className={`mt-2 text-xs ${style.text} opacity-60 text-right`}>
          {toast.timestamp.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
};

// 메인 토스트 컨테이너 컴포넌트
const ToastNotifications: React.FC = () => {
  const { toastNotifications, removeToastNotification } = useNotifications();
  const [visibleToasts, setVisibleToasts] = useState<Set<string>>(new Set());

  // 토스트 표시 애니메이션 처리
  useEffect(() => {
    toastNotifications.forEach(toast => {
      if (!visibleToasts.has(toast.id)) {
        // 약간의 지연 후 토스트를 표시하여 애니메이션 효과
        setTimeout(() => {
          setVisibleToasts(prev => new Set([...prev, toast.id]));
        }, 100);
      }
    });
  }, [toastNotifications, visibleToasts]);

  // 토스트 제거 시 visible 상태도 정리
  useEffect(() => {
    const currentToastIds = new Set(toastNotifications.map(t => t.id));
    setVisibleToasts(prev => {
      const newVisible = new Set<string>();
      prev.forEach((id: string) => {
        if (currentToastIds.has(id)) {
          newVisible.add(id);
        }
      });
      return newVisible;
    });
  }, [toastNotifications]);

  // 토스트가 없으면 렌더링하지 않음
  if (toastNotifications.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed top-4 right-4 z-50 max-w-md w-full pointer-events-auto"
      style={{ zIndex: 9999 }}
    >
      {/* 토스트 컨테이너 */}
      <div className="space-y-3">
        {toastNotifications.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={removeToastNotification}
            isVisible={visibleToasts.has(toast.id)}
          />
        ))}
      </div>

      {/* 전체 닫기 버튼 (3개 이상일 때만) */}
      {toastNotifications.length >= 3 && (
        <div className="mt-3 text-center">
          <button
            onClick={() => {
              toastNotifications.forEach(toast => {
                removeToastNotification(toast.id);
              });
            }}
            className="px-3 py-1 bg-gray-800 bg-opacity-75 text-white text-xs rounded-full hover:bg-opacity-90 transition-all duration-200"
          >
            모든 알림 닫기 ({toastNotifications.length})
          </button>
        </div>
      )}
    </div>
  );
};

export default ToastNotifications;