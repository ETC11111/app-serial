// components/mypage/ProfileTab.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSmsAuth } from '../../hooks/useSmsAuth';
import { authService, UserPhone } from '../../services/authService';

interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

const ProfileTab: React.FC = () => {
  const { updateUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [phonesLoading, setPhonesLoading] = useState(true);
  const [phones, setPhones] = useState<UserPhone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 기본정보 수정 관련
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [editName, setEditName] = useState('');
  const [basicUpdateLoading, setBasicUpdateLoading] = useState(false);

  // 기본 전화번호 변경 관련 (기존 유지)
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);

  // SMS 인증 훅 (기존 유지)
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

  // 서브 전화번호 추가용 상태
  const [newPhone, setNewPhone] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newIsSending, setNewIsSending] = useState(false);
  const [newIsCodeSent, setNewIsCodeSent] = useState(false);
  const [newIsVerifying, setNewIsVerifying] = useState(false);
  const [newTimer, setNewTimer] = useState(0);
  const [newSmsError, setNewSmsError] = useState<string | null>(null);
  const [setPrimaryOnAdd, setSetPrimaryOnAdd] = useState(false);

  useEffect(() => {
    fetchUserInfo();
    fetchPhones();
  }, []);

  // 사용자 정보 로드
  const fetchUserInfo = async () => {
    try {
      const data = await authService.getMe();
      setUser(data.user);
      updateUser(data.user);
      setEditName(data.user.name);
    } catch {
      setError('사용자 정보 로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 다중 전화번호 목록 로드
  const fetchPhones = async () => {
    try {
      const { phones } = await authService.getPhones();
      setPhones(phones);
    } catch {
      // 목록이 없거나 실패해도 화면 전체 실패는 아님
    } finally {
      setPhonesLoading(false);
    }
  };

  // 기본정보 수정 시작
  const handleStartBasicEdit = () => {
    setIsEditingBasic(true);
    setEditName(user?.name || '');
    setError(null);
    setSuccess(null);
  };

  // 기본정보 수정 취소
  const handleCancelBasicEdit = () => {
    setIsEditingBasic(false);
    setEditName(user?.name || '');
  };

  // 기본정보 업데이트
  const handleUpdateBasic = async () => {
    if (!editName.trim()) return setError('이름을 입력해주세요.');
    if (editName.trim() === user?.name) return setError('변경된 내용이 없습니다.');

    setBasicUpdateLoading(true);
    setError(null);

    try {
      const data = await authService.updateProfile({ name: editName.trim() });
      setUser(data.user);
      updateUser(data.user);
      setSuccess('기본정보가 성공적으로 변경되었습니다.');
      setIsEditingBasic(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '기본정보 변경 중 오류가 발생했습니다.');
    } finally {
      setBasicUpdateLoading(false);
    }
  };

  // 기본 전화번호 변경 모드 시작
  const handleStartPhoneEdit = () => {
    setIsEditingPhone(true);
    setPhone(user?.phone || '');
    resetSmsState();
    setError(null);
    setSuccess(null);
  };

  // 기본 전화번호 변경 취소
  const handleCancelPhoneEdit = () => {
    setIsEditingPhone(false);
    resetSmsState();
  };

  // 현재 번호와 동일한지 체크
  const handleSendVerificationForUpdate = async () => {
    if (!phone) return;
    if (phone === user?.phone) return setError('현재 전화번호와 동일합니다.');

    setError(null);
    await sendVerification(true); // isUpdate = true (기존 훅 사용)
  };

  // 기본 전화번호 업데이트
  const handleUpdatePhone = async () => {
    if (!isPhoneVerified) return setError('전화번호 인증을 완료해주세요.');
    setUpdateLoading(true);
    setError(null);

    try {
      const data = await authService.updatePhone(phone, isPhoneVerified);
      setUser(data.user);
      updateUser(data.user);
      setSuccess('전화번호가 성공적으로 변경되었습니다.');
      handleCancelPhoneEdit();
      // 메인 번호 바뀌면 목록에도 반영되도록
      fetchPhones();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전화번호 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdateLoading(false);
    }
  };

  // ====== 서브 번호 추가/인증 ======
  const sendNewPhoneCode = async () => {
    setNewSmsError(null);
    if (!newPhone) return;
    try {
      setNewIsSending(true);
      const res = await authService.sendPhoneVerificationForSub(newPhone);
      setNewIsCodeSent(true);
      // 간단 타이머(3분)
      setNewTimer(180);
      const id = setInterval(() => {
        setNewTimer((t) => {
          if (t <= 1) { clearInterval(id); return 0; }
          return t - 1;
        });
      }, 1000);
      setSuccess(res.message);
    } catch (e: any) {
      setNewSmsError(e?.response?.data?.error || '인증번호 발송 중 오류가 발생했습니다.');
    } finally {
      setNewIsSending(false);
    }
  };

  const verifyNewPhone = async () => {
    setNewSmsError(null);
    if (!newPhone || !newCode) return;
    try {
      setNewIsVerifying(true);
      await authService.verifySubPhone(newPhone, newCode, setPrimaryOnAdd);
      setSuccess(setPrimaryOnAdd ? '번호가 인증되어 메인으로 설정되었습니다.' : '번호가 인증되었습니다.');
      // 초기화 & 갱신
      setNewPhone('');
      setNewCode('');
      setNewIsCodeSent(false);
      setNewTimer(0);
      fetchUserInfo();
      fetchPhones();
    } catch (e: any) {
      setNewSmsError(e?.response?.data?.error || '인증 확인 중 오류가 발생했습니다.');
    } finally {
      setNewIsVerifying(false);
    }
  };

  const formatNewTime = (t: number) => {
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ====== 메인지정/삭제 ======
  const makePrimary = async (id: string) => {
    try {
      await authService.setPrimaryPhone(id);
      setSuccess('메인 전화번호가 변경되었습니다.');
      fetchUserInfo();
      fetchPhones();
    } catch (e: any) {
      setError(e?.response?.data?.error || '메인 번호 변경 중 오류가 발생했습니다.');
    }
  };

  const removePhone = async (id: string) => {
    try {
      await authService.deletePhone(id);
      setSuccess('전화번호가 삭제되었습니다.');
      fetchPhones();
    } catch (e: any) {
      setError(e?.response?.data?.error || '전화번호 삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">로딩 중...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <div className="text-lg text-red-600">사용자 정보를 불러올 수 없습니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 알림 메시지 */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-center">
            <div className="text-green-500 text-xl mr-3">✅</div>
            <div className="text-sm text-green-700 font-medium">{success}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center">
            <div className="text-red-500 text-xl mr-3">❌</div>
            <div className="text-sm text-red-700 font-medium">{error}</div>
          </div>
        </div>
      )}

      {/* 기본정보 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img
                src="/human.png"
                alt="사용자 아이콘"
                className="w-6 h-6 mr-3"
              />
              <h2 className="text-lg font-semibold text-gray-900">기본정보</h2>
            </div>
            {!isEditingBasic && (
              <button
                onClick={handleStartBasicEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                수정
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              이름
            </label>
            {!isEditingBasic ? (
              <div className="text-gray-900 py-3 px-4 bg-gray-50 rounded-lg border">
                {user.name}
              </div>
            ) : (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="이름을 입력하세요"
              />
            )}
          </div>

          {/* 이메일 (수정 불가) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              이메일
            </label>
            <div className="text-gray-600 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
              {user.email}
              <span className="ml-2 text-xs text-gray-500">(변경 불가)</span>
            </div>
          </div>

          {/* 기본정보 수정 버튼 */}
          {isEditingBasic && (
            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleUpdateBasic}
                disabled={basicUpdateLoading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {basicUpdateLoading ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={handleCancelBasicEdit}
                disabled={basicUpdateLoading}
                className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 전화번호 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img
                src="/device.png"
                alt="디바이스 아이콘"
                className="w-6 h-6 mr-3"
              />
              <h2 className="text-lg font-semibold text-gray-900">전화번호</h2>
            </div>
            {!isEditingPhone && (
              <button
                onClick={handleStartPhoneEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                변경
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-6">
          {!isEditingPhone ? (
            <div className="text-gray-900 py-3 px-4 bg-gray-50 rounded-lg border">
              {user.phone || '등록된 전화번호가 없습니다.'}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 새 전화번호 입력 */}
              <div className="flex space-x-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isPhoneVerified}
                  className={`flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isPhoneVerified ? 'bg-gray-100' : ''
                    }`}
                  placeholder="새 전화번호 입력"
                />
                <button
                  type="button"
                  onClick={handleSendVerificationForUpdate}
                  disabled={isSmsLoading || isPhoneVerified}
                  className={`px-6 py-3 text-sm font-medium rounded-lg text-white transition-colors ${isPhoneVerified
                    ? 'bg-green-600'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
                    }`}
                >
                  {isPhoneVerified ? '인증완료' : isSmsLoading ? '발송중...' : '인증번호'}
                </button>
              </div>

              {/* 인증번호 입력 */}
              {isCodeSent && !isPhoneVerified && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    인증번호
                    {timer > 0 && (
                      <span className="ml-2 text-red-500 text-sm font-medium">
                        ⏰ {formatTime(timer)}
                      </span>
                    )}
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      maxLength={4}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="4자리 인증번호"
                    />
                    <button
                      type="button"
                      onClick={verifyCode}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={handleSendVerificationForUpdate}
                      disabled={isSmsLoading}
                      className="px-4 py-3 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      재발송
                    </button>
                  </div>
                  {smsError && (
                    <p className="mt-2 text-sm text-red-600">{smsError}</p>
                  )}
                </div>
              )}

              {/* 저장/취소 버튼 */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleUpdatePhone}
                  disabled={!isPhoneVerified || updateLoading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {updateLoading ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={handleCancelPhoneEdit}
                  disabled={updateLoading}
                  className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🔥 추가 전화번호(서브) 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img src="/device.png" alt="폰" className="w-6 h-6 mr-3" />
              <h2 className="text-lg font-semibold text-gray-900">추가 전화번호(서브)</h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* 목록 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              등록된 번호 목록
            </label>
            <div className="space-y-2">
              {phonesLoading ? (
                <div className="text-gray-500">불러오는 중...</div>
              ) : phones.length === 0 ? (
                <div className="text-gray-500">등록된 추가 번호가 없습니다.</div>
              ) : (
                phones.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="text-gray-900">{p.phone}</div>
                      <div className="text-xs text-gray-500">
                        {p.is_primary ? '메인' : '서브'} · {p.is_verified ? '인증됨' : '미인증'}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!p.is_primary && p.is_verified && (
                        <button
                          onClick={() => makePrimary(p.id)}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded"
                        >
                          메인으로
                        </button>
                      )}
                      {!p.is_primary && (
                        <button
                          onClick={() => removePhone(p.id)}
                          className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 추가/인증 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              새 전화번호 추가
            </label>
            <div className="flex space-x-2">
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ex) 01012345678"
              />
              <button
                onClick={sendNewPhoneCode}
                disabled={newIsSending || newIsCodeSent}
                className="px-6 py-3 text-sm font-medium rounded-lg text-white transition-colors bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
              >
                {newIsSending ? '발송중...' : newIsCodeSent ? '발송완료' : '인증번호'}
              </button>
            </div>
            {newIsCodeSent && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  인증번호
                  {newTimer > 0 && (
                    <span className="ml-2 text-red-500 text-sm font-medium">
                      ⏰ {formatNewTime(newTimer)}
                    </span>
                  )}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    maxLength={4}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="4자리 인증번호"
                  />
                  <label className="flex items-center space-x-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={setPrimaryOnAdd}
                      onChange={(e) => setSetPrimaryOnAdd(e.target.checked)}
                    />
                    <span>인증 후 메인으로 설정</span>
                  </label>
                  <button
                    onClick={verifyNewPhone}
                    disabled={newIsVerifying}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {newIsVerifying ? '확인 중...' : '확인'}
                  </button>
                </div>
                {newSmsError && <p className="mt-2 text-sm text-red-600">{newSmsError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 계정 정보 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center">
            <img
              src="/info.png"
              alt="정보 아이콘"
              className="w-6 h-6 mr-3"
            />
            <h2 className="text-lg font-semibold text-gray-900">계정 정보</h2>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="flex justify-between py-2">
              <span className="font-medium">계정 ID:</span>
              <span>{user.id}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-medium">가입일:</span>
              <span>계정 생성 정보는 추후 추가 예정</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileTab;