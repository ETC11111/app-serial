// App.tsx
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Login from './components/Login';
import Home from './components/Home';
import DeviceList from './components/DeviceList';
import DeviceSetup from './components/DeviceSetup';
import SensorDashboard from './components/SensorDashboard';
import LoadingSpinner from './components/LoadingSpinner';
import MyPage from './components/MyPage';
import StreamViewer from './components/StreamViewer'; // 기존 단일 스트림 뷰어
import StreamManager from './components/StreamManager'; // 🔥 새로운 다중 스트림 관리자
import AlternativeAlertsPage from './components/AlternativeAlertsPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DeviceProvider } from './contexts/DeviceContext';
import { NotificationProvider } from './contexts/NotificationContext'; // 🔥 추가
import { setupHttpInterceptor } from './utils/httpInterceptor';
import DeviceSettings from './components/DeviceSettings';
import GroupSensorDashboard from './GroupSensorDashboard/GroupSensorDashboard';
import DeviceStreamManager from './components/DeviceStreamManager';
import DeviceStreamTest from './components/DeviceStreamTest';
import GroupStreamTest from './components/GroupStreamTest';
import ModbusControlTest from './components/ModbusControlTest';

// Admin 관련 임포트
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/admin/AdminDashboard';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import UserManagement from './components/admin/UserManagement';

// 🔥 기존 단일 스트림 페이지 (레거시)
const StreamPage: React.FC = () => {
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          실시간 CCTV 스트림 (레거시)
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          기존 단일 스트림 뷰어입니다. 새로운 스트림 관리는 /streams를 이용하세요.
        </p>
      </div>
      <StreamViewer autoStart={true} />
    </div>
  );
};

// 🔥 새로운 다중 스트림 관리 페이지
const StreamsPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <StreamManager />
    </div>
  );
};

// 보호된 라우트 컴포넌트
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// 공개 라우트 (로그인된 사용자는 홈으로 리다이렉트)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (user) {
    return <Navigate to="/home" replace />;
  }
  
  return <>{children}</>;
};

// 루트 경로 리다이렉트 컴포넌트
const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return <Navigate to={user ? "/home" : "/login"} replace />;
};

// Admin 라우트 컴포넌트
const AdminApp: React.FC = () => {
  return (
    <AdminAuthProvider>
      <AdminRoutes />
    </AdminAuthProvider>
  );
};

// AdminAuthProvider 내부에서 사용할 수 있는 컴포넌트들
const AdminRoutes: React.FC = () => {
  const { admin, loading } = useAdminAuth();
  const currentPath = window.location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        <span className="text-white ml-4">Loading Admin...</span>
      </div>
    );
  }

  // 로그인 페이지
  if (['/admin/login', '/admin', '/admin/'].includes(currentPath)) {
    if (admin) {
      window.location.href = '/admin/dashboard';
      return null;
    }
    return <AdminLogin />;
  }

  // 관리자가 로그인된 상태에서만 접근 가능한 페이지들
  if (!admin) {
    window.location.href = '/admin/login';
    return null;
  }

  // 대시보드 페이지
  if (currentPath === '/admin/dashboard') {
    return <AdminDashboard />;
  }

  // 사용자 관리 페이지
  if (currentPath === '/admin/users') {
    return <UserManagement />;
  }

  // 🔥 관리자용 레거시 스트림 페이지
  if (currentPath === '/admin/stream') {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="container mx-auto py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">관리자 - CCTV 모니터링 (레거시)</h1>
              <div className="space-x-2">
                <button
                  onClick={() => window.location.href = '/admin/streams'}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  새 스트림 관리
                </button>
                <button
                  onClick={() => window.location.href = '/admin/dashboard'}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  대시보드로 돌아가기
                </button>
              </div>
            </div>
            <StreamViewer autoStart={true} />
          </div>
        </div>
      </div>
    );
  }

  // 🔥 관리자용 새로운 스트림 관리 페이지
  if (currentPath === '/admin/streams') {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="container mx-auto py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">관리자 - 스트림 관리 시스템</h1>
              <div className="space-x-2">
                <button
                  onClick={() => window.location.href = '/admin/stream'}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  레거시 뷰어
                </button>
                <button
                  onClick={() => window.location.href = '/admin/dashboard'}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  대시보드로 돌아가기
                </button>
              </div>
            </div>
            <StreamManager />
          </div>
        </div>
      </div>
    );
  }

  // 시스템 로그 페이지
  if (currentPath === '/admin/logs') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">시스템 로그</h2>
          <p className="text-gray-600">시스템 로그 페이지는 곧 구현될 예정입니다.</p>
          <button
            onClick={() => window.location.href = '/admin/dashboard'}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 기본 리다이렉션 (알 수 없는 admin 경로)
  if (currentPath.startsWith('/admin/')) {
    window.location.href = '/admin/dashboard';
    return null;
  }

  // 기본 리다이렉션
  window.location.href = '/admin/dashboard';
  return null;
};

// 일반 사용자 라우트 - 🔥 NotificationProvider 추가 및 모든 라우트 통합
const UserApp: React.FC = () => {
  return (
    <AuthProvider>
      <DeviceProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/modbus-control" element={
              <ProtectedRoute>
                <ModbusControlTest />
              </ProtectedRoute>
            } />
            <Route path="/login" element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } />
            
            <Route path="/home" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            
            <Route path="/devices" element={
              <ProtectedRoute>
                <DeviceList />
              </ProtectedRoute>
            } />
            
            <Route path="/device-setup" element={
              <ProtectedRoute>
                <DeviceSetup />
              </ProtectedRoute>
            } />
            
            <Route path="/device-streams" element={
              <ProtectedRoute>
                <DeviceStreamManager />
              </ProtectedRoute>
            } />

            <Route path="/device-stream-test" element={
              <ProtectedRoute>
                <DeviceStreamTest />
              </ProtectedRoute>
            } />
            
            <Route path="/group-stream-test" element={
              <ProtectedRoute>
                <GroupStreamTest />
              </ProtectedRoute>
            } />
            
            <Route path="/sensors/:deviceId" element={
              <ProtectedRoute>
                <SensorDashboard />
              </ProtectedRoute>
            } />

            <Route path="/alerts" element={
              <ProtectedRoute>
                <AlternativeAlertsPage />
              </ProtectedRoute>
            } />
            
            <Route path="/mypage" element={
              <ProtectedRoute>
                <MyPage />
              </ProtectedRoute>
            } />

            <Route path="/devices/:deviceId/settings" element={
              <ProtectedRoute>
                <DeviceSettings />
              </ProtectedRoute>
            } />

            <Route path="/group-sensors/:groupId" element={
              <ProtectedRoute>
                <GroupSensorDashboard />
              </ProtectedRoute>
            } />

            {/* 🔥 기존 단일 스트림 페이지 (레거시) */}
            <Route path="/stream" element={
              <ProtectedRoute>
                <StreamPage />
              </ProtectedRoute>
            } />

            {/* 🔥 새로운 다중 스트림 관리 페이지 - 메인 */}
            <Route path="/streams" element={
              <ProtectedRoute>
                <StreamsPage />
              </ProtectedRoute>
            } />
            <Route path="/alternative-alerts" element={<AlternativeAlertsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </DeviceProvider>
    </AuthProvider>
  );
};

// 라우트 분기 컴포넌트
const AppRouter: React.FC = () => {
  const location = useLocation();
  
  // admin 경로인지 확인
  if (location.pathname.startsWith('/admin')) {
    return <AdminApp />;
  }
  
  // 일반 사용자 경로
  return <UserApp />;
};

// Deep Link 처리 컴포넌트 - 최소한만 유지
const DeepLinkHandler: React.FC = () => {
  // Deep Link 기능 비활성화 (문제 발생 시 주석 처리)
  // const navigate = useNavigate();
  // useEffect(() => {
  //   // Capacitor 앱인지 확인
  //   const isCapacitor = Capacitor.isNativePlatform();
  //   if (isCapacitor) {
  //     // Deep Link 처리 로직
  //   }
  // }, [navigate]);

  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    // HTTP 인터셉터 설정
    setupHttpInterceptor();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 safe-area-container">
        <DeepLinkHandler />
        <AppRouter />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </div>
    </Router>
  );
};

export default App;