// Layout.tsx - 헤더에 내장된 실시간 알림 시스템 (완전한 버전)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import PrivacyPolicyModal from './PrivacyPolicyModal';

interface LayoutProps {
  children: React.ReactNode;
  onNotificationClick?: () => void;
  onSettingsClick?: () => void;
  maxWidth?: 'narrow' | 'medium' | 'large' | 'wide' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  background?: 'gray' | 'white' | 'transparent';
  className?: string;
  showFooter?: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  onNotificationClick,
  onSettingsClick,
  maxWidth = 'large',
  padding = 'md',
  background = 'gray',
  className = '',
  showFooter = true
}) => {
  const { user, logout } = useAuth();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isSystemHealthy,
    toastNotifications, // 🔥 토스트 알림 사용
    soundEnabled,
    setSoundEnabled,
    autoHideEnabled,
    setAutoHideEnabled
  } = useNotifications();

  const location = useLocation();
  const navigate = useNavigate();

  // 🔥 숫자 값 확인 헬퍼 함수 추가
  const isNumericValue = (value: any): value is number => {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  };

  // 🔥 안전한 숫자 포맷팅 함수
  const formatSafeNumber = (value: any, defaultText: string = '--'): string => {
    if (isNumericValue(value)) {
      return value.toFixed(2);
    }
    return defaultText;
  };

  // 상태 관리
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  
  // 🔥 Capacitor 앱 감지 상태
  const [isCapacitorApp, setIsCapacitorApp] = useState(false);
  const [isAndroidApp, setIsAndroidApp] = useState(false);

  // 🔥 헤더 알림 상태 관리
  const [currentHeaderAlert, setCurrentHeaderAlert] = useState<any>(null);
  const [headerAlertVisible, setHeaderAlertVisible] = useState(false);
  const headerAlertTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 🔥 토스트 알림이 추가될 때 헤더에도 표시
  useEffect(() => {
    if (toastNotifications.length > 0) {
      const latestAlert = toastNotifications[0]; // 가장 최근 알림

      // 헤더 알림 설정
      setCurrentHeaderAlert(latestAlert);
      setHeaderAlertVisible(true);

      // 기존 타이머 클리어
      if (headerAlertTimeoutRef.current) {
        clearTimeout(headerAlertTimeoutRef.current);
      }

      // 자동 숨김 설정 (중요한 알림이 아닌 경우)
      if (latestAlert.autoHide && latestAlert.severity !== 'critical') {
        headerAlertTimeoutRef.current = setTimeout(() => {
          setHeaderAlertVisible(false);
          setTimeout(() => setCurrentHeaderAlert(null), 300); // 애니메이션 후 제거
        }, Math.max(latestAlert.duration || 8000, 5000)); // 최소 5초
      }
    } else {
      // 토스트 알림이 없으면 헤더 알림도 숨김
      setHeaderAlertVisible(false);
      setTimeout(() => setCurrentHeaderAlert(null), 300);
    }

    return () => {
      if (headerAlertTimeoutRef.current) {
        clearTimeout(headerAlertTimeoutRef.current);
      }
    };
  }, [toastNotifications]);

  // 🔥 헤더 알림 수동 닫기
  const closeHeaderAlert = () => {
    setHeaderAlertVisible(false);
    setTimeout(() => setCurrentHeaderAlert(null), 300);

    if (headerAlertTimeoutRef.current) {
      clearTimeout(headerAlertTimeoutRef.current);
      headerAlertTimeoutRef.current = null;
    }
  };

  // 전체화면 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 스타일 클래스 정의
  const maxWidthClasses = {
    narrow: 'w-full max-w-4xl',
    medium: 'w-full max-w-6xl',
    large: 'w-full max-w-7xl',
    wide: 'w-full md:max-w-[85%]',
    full: 'w-full max-w-none'
  };

  const paddingClasses = {
    none: '',
    sm: 'px-1 py-2 sm:px-1 lg:px-1',
    md: 'px-3 py-4 sm:px-6 lg:px-8 xl:px-12',
    lg: 'px-6 py-6 sm:px-8 lg:px-12 xl:px-16'
  };

  const backgroundClasses = {
    gray: 'bg-gray-50',
    white: 'bg-white',
    transparent: 'bg-transparent'
  };

  // 모바일 환경 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 🔥 Capacitor 앱 감지
  useEffect(() => {
    const detectCapacitorApp = () => {
      // Capacitor 앱 감지
      const isCapacitor = !!(window as any).Capacitor || 
                         !!(window as any).cordova || 
                         navigator.userAgent.includes('Capacitor') ||
                         !!document.querySelector('meta[name="capacitor"]');
      
      setIsCapacitorApp(isCapacitor);
      
      // 안드로이드 앱 감지
      const isAndroid = isCapacitor && (
        navigator.userAgent.includes('Android') ||
        navigator.userAgent.includes('android') ||
        /Android/i.test(navigator.userAgent)
      );
      
      setIsAndroidApp(isAndroid);
      
      // body에 클래스 추가
      if (isCapacitor) {
        document.body.classList.add('capacitor-app');
      }
      if (isAndroid) {
        document.body.classList.add('android-app');
      }
    };
    
    detectCapacitorApp();
  }, []);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 라우트 변경시 사이드바 닫기
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // 유틸리티 함수들
  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, []);

  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  }, []);

  const getNotificationIcon = useCallback((type: string) => {
    switch (type) {
      case 'warning': return '⚠️';
      case 'error': return '🚨';
      case 'info': return 'ℹ️';
      case 'success': return '✅';
      case 'sensor_alert': return '🚨';
      case 'sensor_recovery': return '✅';
      default: return '🔔';
    }
  }, []);

  const timeAgo = useCallback((date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return '방금 전';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    return `${Math.floor(diffInSeconds / 86400)}일 전`;
  }, []);

  const getSeverityBadge = useCallback((severity?: string) => {
    if (!severity) return null;

    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      info: 'bg-blue-100 text-blue-800 border-blue-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    const labels = {
      critical: '위험',
      high: '높음',
      warning: '경고',
      medium: '보통',
      info: '정보',
      low: '낮음'
    };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[severity as keyof typeof colors]}`}>
        {labels[severity as keyof typeof labels]}
      </span>
    );
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleNotificationItemClick = useCallback((notification: any) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  }, [markAsRead]);

  // 기본 이벤트 핸들러
  const defaultNotificationClick = useCallback(() => navigate('/alerts'), [navigate]);

  // 네비게이션 메뉴
  const navigationItems = React.useMemo(() => [
    { path: '/home', label: '홈', icon: '/home.png' },
    { path: '/devices', label: '내 장치', icon: '/device.png' },
    { path: '/device-setup', label: '장치 등록', icon: '/plusIcon.png' },
    { path: '/alerts', label: '알림설정', icon: '/bell.png' },
    { path: '/mypage', label: '마이페이지', icon: '/human.png' }
  ], []);

  const isCurrentPage = useCallback((path: string) => {
    if (path === '/devices' && location.pathname.startsWith('/sensors')) return true;
    return location.pathname === path;
  }, [location.pathname]);

  // 시간 표시 컴포넌트
  const TimeDisplay = React.memo(() => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
      const timer = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(timer);
    }, []);

    return (
      <div className="text-right">
        <div className="text-2xl font-mono text-gray-900">
          {formatTime(time)}
        </div>
        <div className="text-xs text-gray-500">실시간 업데이트</div>
      </div>
    );
  });

  // 날짜 표시 컴포넌트
  const DateDisplay = React.memo(() => {
    const [date] = useState(new Date());

    return (
      <div className="text-sm text-gray-500">
        {formatDate(date)}
      </div>
    );
  });

  // 🔥 헤더 알림 컴포넌트
  const HeaderAlert = React.memo(() => {
    if (!currentHeaderAlert) return null;

    // 심각도별 스타일
    const getSeverityStyle = (severity: string) => {
      switch (severity) {
        case 'critical':
          return {
            bg: 'from-red-50 to-red-100',
            border: 'border-red-300',
            text: 'text-red-800',
            icon: '🚨',
            pulse: 'animate-pulse'
          };
        case 'high':
          return {
            bg: 'from-orange-50 to-orange-100',
            border: 'border-orange-300',
            text: 'text-orange-800',
            icon: '⚠️',
            pulse: ''
          };
        case 'medium':
          return {
            bg: 'from-yellow-50 to-yellow-100',
            border: 'border-yellow-300',
            text: 'text-yellow-800',
            icon: '⚠️',
            pulse: ''
          };
        case 'low':
          return {
            bg: 'from-blue-50 to-blue-100',
            border: 'border-blue-300',
            text: 'text-blue-800',
            icon: 'ℹ️',
            pulse: ''
          };
        default:
          return {
            bg: 'from-gray-50 to-gray-100',
            border: 'border-gray-300',
            text: 'text-gray-800',
            icon: '🔔',
            pulse: ''
          };
      }
    };

    const style = getSeverityStyle(currentHeaderAlert.severity);

    return (
      <div
        className={`
          bg-gradient-to-r ${style.bg} border ${style.border} rounded-lg px-4 py-2 
          transition-all duration-300 ease-in-out ${style.pulse}
          ${headerAlertVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-lg">{style.icon}</span>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-sm ${style.text}`}>
                {currentHeaderAlert.title}
              </div>
              <div className={`text-sm ${style.text} opacity-80 truncate`}>
                {currentHeaderAlert.message}
              </div>
              {/* 센서 정보 */}
              {(currentHeaderAlert.deviceName || currentHeaderAlert.sensorName) && (
                <div className={`text-xs ${style.text} opacity-70 mt-1 flex items-center space-x-2`}>
                  {currentHeaderAlert.deviceName && (
                    <span>📟 {currentHeaderAlert.deviceName}</span>
                  )}
                  {currentHeaderAlert.sensorName && (
                    <span>🔧 {currentHeaderAlert.sensorName}</span>
                  )}
                  {isNumericValue(currentHeaderAlert.currentValue) && (
                    <span>📊 {formatSafeNumber(currentHeaderAlert.currentValue)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={closeHeaderAlert}
            className={`ml-3 p-1 rounded hover:bg-white hover:bg-opacity-30 transition-colors ${style.text}`}
            aria-label="알림 닫기"
          >
            ✕
          </button>
        </div>
      </div>
    );
  });

  // 🔥 알림 설정 모달 컴포넌트
  const NotificationSettingsModal = React.memo(() => {
    if (!showNotificationSettings) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">알림 설정</h3>
            <button
              onClick={() => setShowNotificationSettings(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* 소리 알림 설정 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">소리 알림</div>
                <div className="text-sm text-gray-500">센서 알림 발생 시 소리로 알려줍니다</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* 자동 숨김 설정 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">자동 숨김</div>
                <div className="text-sm text-gray-500">일반 알림을 자동으로 숨깁니다 (중요 알림 제외)</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoHideEnabled}
                  onChange={(e) => setAutoHideEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* 알림 상태 */}
            <div className="pt-4 border-t">
              <div className="text-sm text-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span>헤더 알림:</span>
                  <span className="font-medium">{currentHeaderAlert ? '활성' : '없음'}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span>읽지 않은 알림:</span>
                  <span className="font-medium">{unreadCount}개</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>토스트 알림:</span>
                  <span className="font-medium">{toastNotifications.length}개</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowNotificationSettings(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  });

  // 데스크톱 헤더
  const DesktopHeader = React.memo(() => (
    <div className={`bg-white shadow-sm border-b border-gray-200 hidden md:block ${isFullscreen ? 'hidden' : ''}`}>
      <div className="w-full px-4 py-4 mx-auto lg:px-6 xl:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <DateDisplay />

            {/* 🔥 헤더 알림 영역 - 시스템 정상 메시지 제거됨 */}
            <div className="w-auto">
              {currentHeaderAlert ? (
                <HeaderAlert />
              ) : (
                <>
                  {unreadCount > 0 && (
                    <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg px-3 py-1">
                      <span className="text-sm text-red-600 font-medium">
                        {unreadCount}개의 새로운 알림
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <TimeDisplay />

            {/* 알림 설정 버튼 */}
            <button
              onClick={() => setShowNotificationSettings(true)}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              title="알림 설정"
            >
              <img
                src="/settings.png"
                alt="알림 설정"
                className="w-5 h-5"
              />
            </button>


            {/* 알림 버튼 */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <span>
                  <img src="/bell.png" alt="벨 아이콘" className="inline-block w-6 h-6 align-middle" />
                </span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">실시간 센서 알림</h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{notifications.length}개</span>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            모두 읽음
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 10).map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => handleNotificationItemClick(notification)}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${!notification.isRead ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                        >
                          <div className="flex items-start space-x-3">
                            <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-medium text-gray-900 truncate">
                                  {notification.title}
                                </h4>
                                <div className="flex items-center space-x-1">
                                  {getSeverityBadge(notification.severity)}
                                  <span className="text-xs text-gray-500">
                                    {timeAgo(notification.timestamp)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                {notification.deviceName && (
                                  <span>📟 {notification.deviceName}</span>
                                )}
                                {notification.sensorName && notification.sensorChannel !== undefined && (
                                  <span>🔌 {notification.sensorName} (채널 {notification.sensorChannel})</span>
                                )}
                                {isNumericValue(notification.currentValue) && (
                                  <span>📊 현재: {formatSafeNumber(notification.currentValue)}</span>
                                )}
                                {isNumericValue(notification.thresholdValue) && (
                                  <span>🎯 기준: {formatSafeNumber(notification.thresholdValue)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <span className="text-4xl mb-4 block">✅</span>
                        <p className="font-medium mb-2 text-green-600">시스템이 정상 작동 중입니다</p>
                        <p className="text-sm text-gray-500">모든 센서가 정상 범위 내에서 동작하고 있습니다</p>
                      </div>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-4 border-t border-gray-200">
                      <button
                        onClick={onNotificationClick || defaultNotificationClick}
                        className="w-full text-center text-sm text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        모든 알림 보기
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="w-px h-8 bg-gray-300"></div>

            {/* 사용자 메뉴 */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </span>
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {user?.name || '사용자'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {user?.email || 'user@example.com'}
                  </div>
                </div>
                <span className="text-gray-400">▼</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium">
                          {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {user?.name || '사용자'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user?.email || 'user@example.com'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="py-2">
                    <Link to="/mypage" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      <img src="/human.png" alt="프로필 아이콘" className="w-5 h-5 mr-3 inline-block" />
                      프로필 설정
                    </Link>

                    <Link to="/alternative-alerts" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      <img src="/bell.png" alt="알림 아이콘" className="w-5 h-5 mr-3 inline-block" />
                      알림 설정
                    </Link>
                  </div>

                  <div className="py-2 border-t border-gray-200">
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-black hover:bg-red-50"
                    >
                      <img
                        src="/door.png"
                        alt="로그아웃"
                        className="w-4 h-4 mr-3"
                      />
                      로그아웃
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  ));

  // 모바일 헤더
  const MobileHeader = React.memo(() => (
    <header 
      className={`mobile-header md:hidden ${isFullscreen ? 'hidden' : ''} ${isCapacitorApp ? 'capacitor-app' : ''} ${isAndroidApp ? 'android-app' : ''}`}
    >
      <div className="mobile-header-content flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <img src="/menu.png" alt="Menu" className="w-6 h-6" />
        </button>

        <Link to="/home" className="flex items-center">
          <img src="/logo.png" alt="SerialLOG Logo" className="h-6 w-auto" />
        </Link>

        <div className="flex items-center space-x-2">
          {/* 🔥 모바일 헤더 알림 표시 */}
          {currentHeaderAlert && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-red-100 rounded-full">
              <span className="text-sm">🚨</span>
              <span className="text-xs text-red-600 font-medium truncate max-w-20">
                {currentHeaderAlert.severity === 'critical' ? '위험' : '알림'}
              </span>
            </div>
          )}

          {/* 🔥 알림 버튼에 ref 추가하고 드롭다운 구현 */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span>
                <img src="/bell.png" alt="벨 아이콘" className="inline-block w-5 h-5 align-middle" />
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* 🔥 모바일 알림 드롭다운 (전체화면 모달 스타일) */}
            {showNotifications && (
              <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
                <div className="bg-white h-full overflow-y-auto">
                  {/* 헤더 */}
                  <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">실시간 센서 알림</h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">{notifications.length}개</span>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 bg-blue-50 rounded"
                          >
                            모두 읽음
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifications(false)}
                          className="text-gray-500 hover:text-gray-700 p-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 알림 목록 */}
                  <div className="p-4">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => handleNotificationItemClick(notification)}
                          className={`p-4 border border-gray-200 rounded-lg mb-3 hover:bg-gray-50 cursor-pointer transition-colors ${!notification.isRead ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                            }`}
                        >
                          <div className="flex items-start space-x-3">
                            <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-1">
                                <h4 className="text-sm font-medium text-gray-900">
                                  {notification.title}
                                </h4>
                                <div className="ml-2 flex flex-col items-end space-y-1">
                                  {getSeverityBadge(notification.severity)}
                                  <span className="text-xs text-gray-500">
                                    {timeAgo(notification.timestamp)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                {notification.deviceName && (
                                  <span className="bg-gray-100 px-2 py-1 rounded">📟 {notification.deviceName}</span>
                                )}
                                {notification.sensorName && notification.sensorChannel !== undefined && (
                                  <span className="bg-gray-100 px-2 py-1 rounded">🔌 {notification.sensorName} (채널 {notification.sensorChannel})</span>
                                )}
                                {isNumericValue(notification.currentValue) && (
                                  <span className="bg-gray-100 px-2 py-1 rounded">📊 현재: {formatSafeNumber(notification.currentValue)}</span>
                                )}
                                {isNumericValue(notification.thresholdValue) && (
                                  <span className="bg-gray-100 px-2 py-1 rounded">🎯 기준: {formatSafeNumber(notification.thresholdValue)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <span className="text-4xl mb-4 block">✅</span>
                        <p className="font-medium mb-2 text-green-600">시스템이 정상 작동 중입니다</p>
                        <p className="text-sm text-gray-500">모든 센서가 정상 범위 내에서 동작하고 있습니다</p>
                      </div>
                    )}
                  </div>

                  {/* 하단 버튼 */}
                  {notifications.length > 0 && (
                    <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0">
                      <button
                        onClick={() => {
                          setShowNotifications(false);
                          (onNotificationClick || defaultNotificationClick)();
                        }}
                        className="w-full py-3 text-center text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded-lg"
                      >
                        모든 알림 보기
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🔥 모바일 전체 폭 헤더 알림 */}
      {currentHeaderAlert && (
        <div className="px-4 pb-3">
          <div className={`
            bg-gradient-to-r ${(() => {
              switch (currentHeaderAlert.severity) {
                case 'critical': return 'from-red-50 to-red-100 border-red-300';
                case 'high': return 'from-orange-50 to-orange-100 border-orange-300';
                case 'medium': return 'from-yellow-50 to-yellow-100 border-yellow-300';
                case 'low': return 'from-blue-50 to-blue-100 border-blue-300';
                default: return 'from-gray-50 to-gray-100 border-gray-300';
              }
            })()} border rounded-lg p-3
            transition-all duration-300 ease-in-out
            ${headerAlertVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
            ${currentHeaderAlert.severity === 'critical' ? 'animate-pulse' : ''}
          `}>
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2 flex-1 min-w-0">
                <span className="text-lg mt-0.5">
                  {(() => {
                    switch (currentHeaderAlert.severity) {
                      case 'critical': return '🚨';
                      case 'high': return '⚠️';
                      case 'medium': return '⚠️';
                      case 'low': return 'ℹ️';
                      default: return '🔔';
                    }
                  })()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm ${(() => {
                    switch (currentHeaderAlert.severity) {
                      case 'critical': return 'text-red-800';
                      case 'high': return 'text-orange-800';
                      case 'medium': return 'text-yellow-800';
                      case 'low': return 'text-blue-800';
                      default: return 'text-gray-800';
                    }
                  })()}`}>
                    {currentHeaderAlert.title}
                  </div>
                  <div className={`text-sm opacity-80 ${(() => {
                    switch (currentHeaderAlert.severity) {
                      case 'critical': return 'text-red-800';
                      case 'high': return 'text-orange-800';
                      case 'medium': return 'text-yellow-800';
                      case 'low': return 'text-blue-800';
                      default: return 'text-gray-800';
                    }
                  })()}`}>
                    {currentHeaderAlert.message}
                  </div>
                  {/* 모바일 센서 정보 */}
                  {(currentHeaderAlert.deviceName || currentHeaderAlert.sensorName) && (
                    <div className={`text-xs opacity-70 mt-1 ${(() => {
                      switch (currentHeaderAlert.severity) {
                        case 'critical': return 'text-red-800';
                        case 'high': return 'text-orange-800';
                        case 'medium': return 'text-yellow-800';
                        case 'low': return 'text-blue-800';
                        default: return 'text-gray-800';
                      }
                    })()}`}>
                      {currentHeaderAlert.deviceName && `📟 ${currentHeaderAlert.deviceName}`}
                      {currentHeaderAlert.sensorName && ` 🔧 ${currentHeaderAlert.sensorName}`}
                    </div>
                  )}
                </div>
              </div>

              {/* 모바일 닫기 버튼 */}
              <button
                onClick={closeHeaderAlert}
                className={`ml-2 p-1 rounded hover:bg-white hover:bg-opacity-30 transition-colors ${(() => {
                  switch (currentHeaderAlert.severity) {
                    case 'critical': return 'text-red-800';
                    case 'high': return 'text-orange-800';
                    case 'medium': return 'text-yellow-800';
                    case 'low': return 'text-blue-800';
                    default: return 'text-gray-800';
                  }
                })()}`}
                aria-label="알림 닫기"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  ));

  // 모바일 사이드바
  const MobileSidebar = React.memo(() => (
    <>
      {sidebarOpen && !isFullscreen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`
        mobile-sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-45
        ${sidebarOpen && !isFullscreen ? 'translate-x-0' : '-translate-x-full'}
        md:hidden
        ${isCapacitorApp ? 'capacitor-app' : ''} ${isAndroidApp ? 'android-app' : ''}
      `}>
        <div className="mobile-sidebar-header px-4 py-4 border-b bg-blue-600 text-white">
          <div className="flex items-center justify-between">
            <img src="/logo.png" alt="SerialLOG Logo" className="h-8 w-auto" />
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-white hover:bg-blue-700 p-1 rounded"
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="p-4">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = isCurrentPage(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`
                      flex items-center space-x-3 p-3 rounded-lg transition-colors duration-200
                      ${isActive
                        ? 'bg-blue-100 text-blue-600 font-semibold'
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <img src={item.icon} alt={item.label} className="w-6 h-6" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 pt-4 border-t">
            <div className="flex items-center space-x-3 p-3 text-gray-600">

              <div>
                <p className="font-medium">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full mt-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              로그아웃
            </button>
          </div>
        </nav>
      </div>
    </>
  ));

  // 데스크톱 사이드바
  const DesktopSidebar = React.memo(() => (
    <aside className={`hidden md:block fixed left-0 top-0 h-full w-75 bg-white shadow-lg border-r border-gray-100 z-40 ${isFullscreen ? 'hidden' : ''}`}>
      <div className="px-4 py-6.5 border-b border-gray-100 bg-white text-white">
        <Link to="/home" className="flex items-center">
          <img src="/logo.png" alt="SerialLOG Logo" className="h-9 w-auto" />
        </Link>
      </div>

      <nav className="p-3 flex-1 overflow-y-auto mt-10">
        <ul className="space-y-5">
          {navigationItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`
                  flex items-center space-x-2 p-2.5 rounded-lg transition-colors text-sm
                  ${isCurrentPage(item.path)
                    ? 'bg-blue-100 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <img src={item.icon} alt={item.label} className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100 bg-white">
        <button
          onClick={handleLogout}
          className="w-full p-2 text-black hover:bg-red-50 rounded-lg transition-colors text-xs flex items-center justify-center space-x-1"
        >
          <img src="/door.png" alt="로그아웃" className="w-4 h-4" />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  ));

  // 모바일 하단 네비게이션
  const MobileBottomNav = React.memo(() => {
    return (
    <nav 
      className={`mobile-bottom-nav fixed left-0 right-0 bg-white border-t shadow-lg md:hidden z-30 ${isFullscreen ? 'hidden' : ''} ${isCapacitorApp ? 'capacitor-app' : ''} ${isAndroidApp ? 'android-app' : ''}`}
    >
      <div className="grid grid-cols-5 h-16">
        {navigationItems.map((item) => {
          const isActive = isCurrentPage(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                flex flex-col items-center justify-center space-y-1 transition-colors duration-200 select-none
                ${isActive
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
              style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation'
              }}
            >
              <img
                src={item.icon}
                alt={item.label}
                className="w-5 h-5 pointer-events-none"
                loading="eager"
                decoding="sync"
                draggable="false"
              />
              <span className="text-xs font-medium pointer-events-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
    );
  });

  // 컴팩트 푸터 컴포넌트
  const Footer = React.memo(() => (
    <footer className={`bg-white text-gray-900 hidden md:block ${isFullscreen ? 'hidden' : ''} ml-75 border-t border-gray-200`}>
      <div className="w-[100%] max-w-[88%] mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/logo.png" alt="SerialLog Logo" className="h-5 w-auto" />
            <div className="text-xs flex items-center space-x-2">
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="text-gray-600 hover:text-gray-900 transition-colors underline"
              >
                개인정보 보호정책
              </button>
              <span className="text-gray-600">© 2025 SerialLOG</span>
            </div>
          </div>

          <div className="text-right text-xs text-gray-500 leading-relaxed">
            <p>이티컴파니 | 대표: 정영호 | 개인정보보호책임자: 선민관</p>
            <p>전라북도 익산시 서동로 590 2-C</p>
            <p>사업자등록번호: 262-88-00926 | 통신판매업신고번호: 2019-전북익산-0012</p>
            <p>Tel: 063-917-5215 | Fax: 063-722-5215 | Email: project307@naver.com</p>
          </div>
        </div>
      </div>

      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </footer>
  ));

  // 컨테이너 스타일
  const contentContainerClass = `
    ${backgroundClasses[background]}
    min-h-screen 
    w-full 
    overflow-x-hidden
    flex
    flex-col
  `;

  // 메인 콘텐츠 스타일
  const mainContentClass = `
    ${isMobile ? `pt-0 ${isCapacitorApp || isAndroidApp ? 'mobile-content' : 'pb-16'}` : isFullscreen ? 'ml-0 py-0' : 'ml-75 py-0'}
    w-full 
    max-w-full 
    overflow-x-hidden
    ${backgroundClasses[background]}
    flex-1
    ${isCapacitorApp ? 'capacitor-app' : ''}
    ${isAndroidApp ? 'android-app' : ''}
    ${isMobile && isAndroidApp ? 'android-main-content' : ''}
  `;

  // 내부 콘텐츠 클래스
  const innerContentClass = React.useMemo(() => {
    const baseClasses = 'mx-auto w-full';
    const widthClass = maxWidthClasses[maxWidth];
    const paddingClass = paddingClasses[padding];
    const responsiveAdjustment = isMobile ? '' : 'ml-0';

    return `${baseClasses} ${widthClass} ${paddingClass} ${responsiveAdjustment} ${className}`;
  }, [maxWidth, padding, isMobile, className]);

  return (
    <div className={contentContainerClass}>
      {/* 데스크톱 사이드바 */}
      <DesktopSidebar />

      {/* 데스크톱 헤더 */}
      <div className={`hidden md:block ${isFullscreen ? '' : 'ml-75'}`}>
        <DesktopHeader />
      </div>

      {/* 모바일 헤더 */}
      <MobileHeader />

      {/* 모바일 사이드바 */}
      <MobileSidebar />

      {/* 🔥 알림 설정 모달 */}
      <NotificationSettingsModal />

      {/* 메인 콘텐츠 */}
      <main className={mainContentClass}>
        {!isFullscreen && (
          <div className="hidden md:block fixed left-0 top-0 w-75 h-full bg-transparent pointer-events-none z-30"></div>
        )}
        <div className="relative z-10 w-full max-w-full overflow-x-hidden">
          <div className={innerContentClass}>
            {children}
          </div>
        </div>
      </main>

      {/* 모바일 하단 네비게이션 */}
      <MobileBottomNav />

      {/* 푸터 */}
      {showFooter && <Footer />}
    </div>
  );
};

export default React.memo(Layout);