// components/Login.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthForm } from '../hooks/useAuth';
import { useSmsAuth } from '../hooks/useSmsAuth';
import { useAuth } from '../contexts/AuthContext';
import PrivacyPolicyModal from './PrivacyPolicyModal';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // 개인정보 처리방침 관련 상태
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showFooterPrivacyModal, setShowFooterPrivacyModal] = useState(false); // 하단 푸터용 모달 상태

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const { user, loading: authLoading, checkAuth } = useAuth();

  // 커스텀 훅 사용 - 완전히 통합
  const {
    loading,
    error,
    success,
    setError,
    setSuccess,
    handleLogin,
    handleRegister
  } = useAuthForm();

  // 자동 로그인 체크 (페이지 로드 시)
  useEffect(() => {
    // 이미 로그인된 경우 리다이렉트
    if (user) {
      if (returnUrl) {
        window.location.href = decodeURIComponent(returnUrl);
      } else {
        window.location.replace('/home');
      }
      return;
    }

    // authLoading이 완료되고 user가 없을 때만 자동 로그인 시도
    if (!authLoading && !user) {
      const attemptAutoLogin = async () => {
        // 토큰이 있는지 확인 (쿠키 또는 localStorage)
        const refreshToken = localStorage.getItem('refreshToken') || 
          document.cookie.split('; ').find(row => row.startsWith('refreshToken='))?.split('=')[1];

        // refreshToken이 있으면 자동 로그인 시도
        if (refreshToken) {
          try {
            await checkAuth();
            // checkAuth 후 user가 설정되면 useEffect가 다시 실행되어 리다이렉트됨
          } catch (error) {
            // 자동 로그인 실패 시 조용히 처리 (사용자가 수동으로 로그인할 수 있도록)
            console.log('자동 로그인 실패, 수동 로그인 필요');
          }
        }
      };

      attemptAutoLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, returnUrl]);

  const {
    phone,
    setPhone,
    verificationCode,
    setVerificationCode,
    isSmsLoading,
    isCodeSent,
    isPhoneVerified,
    timer,
    smsError,
    sendVerification,
    verifyCode,
    formatTime,
    resetSmsState
  } = useSmsAuth();

  // 폼 리셋 - 훅의 상태도 포함
  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setError('');
    setSuccess('');
    setPrivacyAccepted(false);
    setRememberMe(false);
    resetSmsState();
  };

  // 모드 변경 (로그인 ↔ 회원가입)
  const toggleMode = () => {
    setIsRegister(!isRegister);
    resetForm();
  };

  // 개인정보 처리방침 동의 처리
  const handlePrivacyAccept = () => {
    setPrivacyAccepted(true);
    setShowPrivacyModal(false);
  };

  // 개인정보 처리방침 모달 닫기
  const handlePrivacyClose = () => {
    setShowPrivacyModal(false);
  };

  // 하단 푸터용 개인정보 처리방침 모달 닫기
  const handleFooterPrivacyClose = () => {
    setShowFooterPrivacyModal(false);
  };

  // 폼 제출 - 유효성 검사 포함
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 회원가입 시 추가 유효성 검사
    if (isRegister) {
      // 개인정보 처리방침 동의 확인
      if (!privacyAccepted) {
        setError('개인정보 처리방침에 동의해주세요.');
        return;
      }

      if (!name || !phone) {
        setError('모든 필드를 입력해주세요.');
        return;
      }

      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.');
        return;
      }

      if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.');
        return;
      }

      if (!isPhoneVerified) {
        setError('전화번호 인증을 완료해주세요.');
        return;
      }

      const success = await handleRegister({
        email,
        password,
        name,
        phone,
        isPhoneVerified
      });

      if (success) {
        setSuccess('회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.');
        setTimeout(() => {
          setIsRegister(false);
          resetForm();
        }, 2000);
      }
    } else {
      // console.log('🔍 로그인 시도 중...'); // 디버깅용

      const success = await handleLogin(email, password, rememberMe, returnUrl || undefined);

      // console.log('🔍 로그인 결과:', success); // 디버깅용

      if (success) {
        // console.log('✅ 로그인 성공, 리다이렉트 시작'); // 디버깅용

        if (returnUrl) {
          // console.log('🔗 returnUrl로 이동:', returnUrl);
          window.location.href = decodeURIComponent(returnUrl);
        } else {
          // console.log('🏠 /home으로 이동');
          window.location.replace('/home');
        }
      } else {
        // console.log('❌ 로그인 실패');
      }
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,#fff,rgba(255,255,255,0.6))] -z-10"></div>

        <div className="max-w-md w-full space-y-8">
          {/* Logo/Brand Section */}
          <div className="text-center">

            <h1 className="text-1xl font-bold text-gray-900 mb-2">
              {isRegister ? '새로운 시작' : (
                <img
                  src="/logo.png"
                  alt="SerialLogger Logo"
                  className="h-8 inline-block"
                />
              )}
            </h1>
            <p className="text-gray-600 text-base">
              {isRegister ? '계정을 만들어 IoT 여정을 시작하세요' : ''}
            </p>
          </div>

          {/* Main Form Card */}
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
            {/* 성공 메시지 */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center space-x-2 mb-6">
                <svg className="h-5 w-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">{success}</span>
              </div>
            )}

            {/* 에러 메시지 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center space-x-2 mb-6">
                <svg className="h-5 w-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            {/* 리턴 URL 안내 */}
            {returnUrl && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl flex items-center space-x-2 mb-6">
                <svg className="h-5 w-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="text-sm">
                  <span className="font-semibold">장치 등록:</span> 로그인 후 자동으로 장치가 등록됩니다.
                </div>
              </div>
            )}

            {/* 개인정보 처리방침 동의 (회원가입시만) */}
            {isRegister && (
              <div className="mb-6">
                <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border-2 rounded-xl p-4 transition-all duration-200 ${privacyAccepted
                    ? 'border-green-300 bg-gradient-to-r from-green-50 to-emerald-50'
                    : 'border-blue-200 hover:border-blue-300'
                  }`}>
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {privacyAccepted ? (
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 border-2 border-blue-300 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 mb-1">
                        개인정보 처리방침 동의 {privacyAccepted && <span className="text-green-600">(동의완료)</span>}
                      </p>
                      <p className="text-xs text-gray-600">
                        서비스 이용을 위해 개인정보 수집 및 이용에 동의가 필요합니다.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      disabled={privacyAccepted}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${privacyAccepted
                          ? 'bg-green-500 text-white cursor-default'
                          : 'bg-blue-500 hover:bg-blue-600 text-white hover:shadow-md'
                        }`}
                    >
                      {privacyAccepted ? '동의 완료' : '내용 확인 후 동의'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-5">
                {/* 이름 (회원가입시만) */}
                {isRegister && (
                  <div className="group">
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                      이름
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required={isRegister}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!privacyAccepted && isRegister}
                      className={`w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                               transition-all duration-200 group-hover:border-gray-300 ${!privacyAccepted && isRegister ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      placeholder="이름을 입력하세요"
                    />
                  </div>
                )}

                {/* 이메일 */}
                <div className="group">
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    이메일
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!privacyAccepted && isRegister}
                    className={`w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                             transition-all duration-200 group-hover:border-gray-300 ${!privacyAccepted && isRegister ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    placeholder="이메일 주소"
                  />
                </div>

                {/* 전화번호 (회원가입시만) */}
                {isRegister && (
                  <div className="group">
                    <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                      전화번호
                    </label>
                    <div className="flex space-x-2">
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        required={isRegister}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={isPhoneVerified || !privacyAccepted}
                        className={`flex-1 px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                                 transition-all duration-200 group-hover:border-gray-300 ${(isPhoneVerified || !privacyAccepted) ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        placeholder="010-1234-5678"
                      />
                      <button
                        type="button"
                        onClick={() => sendVerification(false)}
                        disabled={isSmsLoading || isPhoneVerified || !privacyAccepted}
                        className={`px-4 py-3 border border-transparent text-sm font-semibold rounded-xl text-white transition-all duration-200 ${isPhoneVerified
                            ? 'bg-green-500'
                            : !privacyAccepted
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400'
                          }`}
                      >
                        {isPhoneVerified ? '인증완료' : isSmsLoading ? '발송중...' : '인증번호'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 인증번호 입력 */}
                {isRegister && isCodeSent && !isPhoneVerified && (
                  <div className="group">
                    <label htmlFor="verificationCode" className="block text-sm font-semibold text-gray-700 mb-2">
                      인증번호
                      {timer > 0 && (
                        <span className="ml-2 text-red-500 text-sm font-medium">
                          ⏰ {formatTime(timer)}
                        </span>
                      )}
                    </label>
                    <div className="flex space-x-2">
                      <input
                        id="verificationCode"
                        name="verificationCode"
                        type="text"
                        maxLength={4}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="flex-1 px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                                 transition-all duration-200 group-hover:border-gray-300"
                        placeholder="4자리 인증번호"
                      />
                      <button
                        type="button"
                        onClick={verifyCode}
                        className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-all duration-200"
                      >
                        확인
                      </button>
                      <button
                        type="button"
                        onClick={() => sendVerification(false)}
                        disabled={isSmsLoading}
                        className="px-3 py-3 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm font-semibold rounded-xl transition-all duration-200"
                      >
                        재발송
                      </button>
                    </div>
                    {smsError && (
                      <p className="mt-2 text-sm text-red-600 font-medium">{smsError}</p>
                    )}
                  </div>
                )}

                {/* 비밀번호 */}
                <div className="group">
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    비밀번호
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!privacyAccepted && isRegister}
                    className={`w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                             transition-all duration-200 group-hover:border-gray-300 ${!privacyAccepted && isRegister ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    placeholder={isRegister ? "6자 이상의 비밀번호" : "비밀번호"}
                  />
                </div>

                {/* 자동 로그인 체크박스 (로그인 모드일 때만) */}
                {!isRegister && (
                  <div className="flex items-center">
                    <input
                      id="rememberMe"
                      name="rememberMe"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                      자동 로그인
                    </label>
                  </div>
                )}

                {/* 비밀번호 확인 (회원가입시만) */}
                {isRegister && (
                  <div className="group">
                    <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                      비밀번호 확인
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required={isRegister}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={!privacyAccepted}
                      className={`w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
                               transition-all duration-200 group-hover:border-gray-300 ${!privacyAccepted ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      placeholder="비밀번호를 다시 입력하세요"
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || (isRegister && (!isPhoneVerified || !privacyAccepted))}
                className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white
                           transition-all duration-200 transform ${loading || (isRegister && (!isPhoneVerified || !privacyAccepted))
                    ? 'bg-gray-400 cursor-not-allowed scale-100'
                    : 'bg-blue-500 hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl'
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
                        회원가입
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1" />
                        </svg>
                        로그인
                      </>
                    )}
                  </>
                )}
              </button>

              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-blue-600 hover:text-blue-700 text-sm font-semibold transition-colors duration-200 hover:underline"
                >
                  {isRegister
                    ? '이미 계정이 있으신가요? 로그인하기'
                    : '계정이 없으신가요? 회원가입하기'
                  }
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-500 space-y-2">
            {/* 개인정보 보호정책 */}
            <div className="flex items-center justify-center">
              <button
                onClick={() => setShowFooterPrivacyModal(true)}
                className="text-gray-400 hover:text-gray-600 underline transition-colors duration-200"
              >
                개인정보 보호정책
              </button>
            </div>

            {/* 회사 정보 - 컴팩트 */}
            <div className="space-y-1">
              <p>© 2025 SerialLog. 모든 권리 보유.</p>
              <div className="text-xs text-gray-400 leading-relaxed">
                <p>이티컴파니 | 대표: 정영호 | 개인정보보호책임자: 선민관</p>
                <p>전라북도 익산시 서동로 590 2-C</p>
                <p>사업자등록번호: 262-88-00926 | 통신판매업신고번호: 2019-전북익산-0012</p>
                <p>Tel: 063-917-5215 | Fax: 063-722-5215 | Email: project307@naver.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 회원가입용 개인정보 처리방침 모달 */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={handlePrivacyClose}
        onAccept={handlePrivacyAccept}
      />

      {/* 하단 푸터용 개인정보 처리방침 모달 */}
      <PrivacyPolicyModal
        isOpen={showFooterPrivacyModal}
        onClose={handleFooterPrivacyClose}
      />
    </>
  );
};

export default Login;