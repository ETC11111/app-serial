// components/mypage/WithdrawTab.tsx
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/authService';

const WithdrawTab: React.FC = () => {
  const { logout } = useAuth();
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    if (!password) {
      setError('현재 비밀번호를 입력해주세요.');
      return;
    }

    if (confirmText !== '회원탈퇴') {
      setError('확인 문구를 정확히 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authService.withdraw(password);
      alert('회원탈퇴가 완료되었습니다.');
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wide">
      <div className="bg-white rounded-xl shadow-sm border border-red-200">
        <div className="px-6 py-4 border-b border-red-100 bg-red-50">
          <div className="flex items-center">
            <div className="text-red-500 text-xl mr-3">⚠️</div>
            <h2 className="text-lg font-semibold text-red-900">회원탈퇴</h2>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* 경고 메시지 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-red-800 font-medium mb-2">⚠️ 탈퇴 전 주의사항</h3>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• 탈퇴 시 모든 개인정보가 즉시 삭제됩니다.</li>
              <li>• 장치의 데이터도 함께 삭제됩니다.</li>
              <li>• 동일한 이메일로 재가입이 불가능할 수 있습니다.</li>
              <li>• 탈퇴 처리 후에는 복구가 불가능합니다.</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-center">
                <div className="text-red-500 text-xl mr-3">❌</div>
                <div className="text-sm text-red-700 font-medium">{error}</div>
              </div>
            </div>
          )}

          {!isConfirming ? (
            <div className="text-center py-8">
              <button
                onClick={() => setIsConfirming(true)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                회원탈퇴 진행
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 비밀번호 입력 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  현재 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="현재 비밀번호를 입력하세요"
                />
              </div>

              {/* 확인 문구 입력 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  확인 문구 입력
                </label>
                <p className="text-sm text-gray-600 mb-2">
                  아래에 <span className="font-medium text-red-600">"회원탈퇴"</span>를 정확히 입력해주세요.
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="회원탈퇴"
                />
              </div>

              {/* 버튼 */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleWithdraw}
                  disabled={loading || !password || confirmText !== '회원탈퇴'}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                >
                  {loading ? '처리 중...' : '탈퇴하기'}
                </button>
                <button
                  onClick={() => {
                    setIsConfirming(false);
                    setPassword('');
                    setConfirmText('');
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WithdrawTab;