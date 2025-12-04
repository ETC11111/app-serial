// components/home/HeaderNotificationBanner.tsx
import React, { useState, useEffect } from 'react';
import { HeaderNotificationBannerProps } from './types/HomeTypes';
import { getNotificationIcon } from './utils/NotificationUtils';

export const HeaderNotificationBanner: React.FC<HeaderNotificationBannerProps> = ({ 
  notifications, 
  compact = false 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const visibleNotifications = notifications.slice(0, 3);

  useEffect(() => {
    if (visibleNotifications.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleNotifications.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [visibleNotifications.length]);

  if (visibleNotifications.length === 0) return null;

  const currentNotification = visibleNotifications[currentIndex];

  if (compact) {
    return (
      <div className="flex items-center space-x-4">
        <span className="text-sm animate-pulse">
          {getNotificationIcon(currentNotification.type)}
        </span>
        <div className="text-xs text-red-700">
          <span className="font-medium">{currentNotification.title}</span>
          <span className="mx-1">•</span>
          <span>{currentNotification.message}</span>
        </div>
        {visibleNotifications.length > 1 && (
          <div className="flex space-x-1">
            {visibleNotifications.map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-red-500' : 'bg-red-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200">
      <div className="max-w-[2200px] mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-lg animate-pulse">
                {getNotificationIcon(currentNotification.type)}
              </span>
              <span className="text-sm font-medium text-red-800">
                실시간 알림
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-sm text-red-700 truncate">
                <span className="font-medium">{currentNotification.title}</span>
                <span className="mx-2">•</span>
                <span>{currentNotification.message}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {visibleNotifications.length > 1 && (
              <div className="flex items-center space-x-1">
                {visibleNotifications.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentIndex ? 'bg-red-500' : 'bg-red-200'
                    }`}
                  />
                ))}
              </div>
            )}
            
            <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">
              {notifications.length}개 알림
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};