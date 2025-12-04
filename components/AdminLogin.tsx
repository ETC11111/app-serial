// components/AdminLogin.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const navigate = useNavigate();
  const { login } = useAdminAuth();

  console.log('🔍 AdminLogin component rendering...'); // 디버깅

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
    setAdminKey('');
    setError('');
    setSuccess('');
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isRegister) {
        // 회원가입 로직
        const response = await fetch('/api/admin/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, name, phone, adminKey })
        });

        const data = await response.json();

        if (data.success) {
          setSuccess('관리자 계정이 생성되었습니다. 로그인해주세요.');
          setTimeout(() => {
            setIsRegister(false);
            resetForm();
          }, 2000);
        } else {
          setError(data.error || data.message || '등록에 실패했습니다.');
        }
      } else {
        // 로그인 로직
        const success = await login(email, password);
        
        if (success) {
          navigate('/admin/dashboard');
        } else {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        }
      }
    } catch (error: any) {
      console.error('Admin auth error:', error);
      // 🔥 구체적인 에러 메시지 표시
      if (error.message) {
        setError(error.message);
      } else {
        setError('서버 연결에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-grid-gray-700 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.5))] -z-10"></div>
      
      <div className="max-w-md w-full space-y-8">
        {/* Logo/Brand Section */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {isRegister ? '관리자 등록' : '관리자 로그인'}
          </h2>
          <p className="text-gray-300 text-base">
            {isRegister ? '새로운 관리자 계정을 생성합니다' : 'SerialFarm 관리자 전용 시스템'}
          </p>
        </div>
        
        {/* Main Form Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
          {/* 성공 메시지 */}
          {success && (
            <div className="bg-green-500/20 border border-green-400 text-green-300 px-4 py-3 rounded-xl flex items-center space-x-2 mb-6">
              <svg className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{success}</span>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-500/20 border border-red-400 text-red-300 px-4 py-3 rounded-xl flex items-center space-x-2 mb-6">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-5">
              {/* 이름 (회원가입시만) */}
              {isRegister && (
                <div className="group">
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-200 mb-2">
                    이름
                  </label>
                  <div className="relative">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required={isRegister}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 
                               focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 
                               transition-all duration-200 backdrop-blur-sm"
                      placeholder="관리자 이름"
                    />
                  </div>
                </div>
              )}
              
              {/* 이메일 */}
              <div className="group">
                <label htmlFor="email" className="block text-sm font-semibold text-gray-200 mb-2">
                  이메일
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 
                             focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 
                             transition-all duration-200 backdrop-blur-sm"
                    placeholder="관리자 이메일"
                  />
                </div>
              </div>

              {/* 전화번호 (회원가입시만) */}
              {isRegister && (
                <div className="group">
                  <label htmlFor="phone" className="block text-sm font-semibold text-gray-200 mb-2">
                    전화번호 (선택사항)
                  </label>
                  <div className="relative">
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 
                               focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 
                               transition-all duration-200 backdrop-blur-sm"
                      placeholder="010-1234-5678"
                    />
                  </div>
                </div>
              )}
              
              {/* 비밀번호 */}
              <div className="group">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-200 mb-2">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 
                             focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 
                             transition-all duration-200 backdrop-blur-sm"
                    placeholder={isRegister ? "8자 이상의 비밀번호" : "비밀번호"}
                  />
                </div>
              </div>

              {/* 관리자 등록 키 (회원가입시만) */}
              {isRegister && (
                <div className="group">
                  <label htmlFor="adminKey" className="block text-sm font-semibold text-gray-200 mb-2">
                    관리자 등록 키
                  </label>
                  <div className="relative">
                    <input
                      id="adminKey"
                      name="adminKey"
                      type="password"
                      required={isRegister}
                      value={adminKey}
                      onChange={(e) => setAdminKey(e.target.value)}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 
                               focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 
                               transition-all duration-200 backdrop-blur-sm"
                      placeholder="관리자 등록 키를 입력하세요"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    관리자 등록을 위한 특별한 키가 필요합니다.
                  </p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white
                         transition-all duration-200 transform ${
                loading
                  ? 'bg-gray-600 cursor-not-allowed scale-100'
                  : 'bg-red-600 hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  처리 중...
                </>
              ) : (
                <>
                  {isRegister ? (
                    <>
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      관리자 등록
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      관리자 로그인
                    </>
                  )}
                </>
              )}
            </button>

            <div className="text-center pt-4">
              <button
                type="button"
                onClick={toggleMode}
                className="text-gray-300 hover:text-white text-sm font-semibold transition-colors duration-200 hover:underline"
              >
                {isRegister 
                  ? '이미 관리자 계정이 있으신가요? 로그인하기' 
                  : '관리자 계정이 없으신가요? 등록하기'
                }
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400">
          <p>© 2024 SerialFarm Admin System. 모든 권리 보유.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;