// hooks/useAuth.ts
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

export const useAuthForm = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (email: string, password: string, rememberMe: boolean = false, returnUrl?: string | null) => {
    setLoading(true);
    setError('');
    
    try {
      const result = await authService.login(email, password, rememberMe, returnUrl);
      
      if (result.success) {
        return true;
      } else {
        setError(result.error || '로그인에 실패했습니다.');
        return false;
      }
    } catch (err: any) {
      // 🔥 구체적인 에러 메시지 표시
      if (err.message) {
        setError(err.message);
      } else {
        setError('네트워크 오류가 발생했습니다.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (userData: any) => {
    setLoading(true);
    setError('');
    
    try {
      const result = await authService.register(userData);
      
      if (result.success) {
        setSuccess('회원가입이 완료되었습니다.');
        return true;
      } else {
        setError(result.error || '회원가입에 실패했습니다.');
        return false;
      }
    } catch (err: any) {
      // 🔥 구체적인 에러 메시지 표시
      if (err.message) {
        setError(err.message);
      } else {
        setError('네트워크 오류가 발생했습니다.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    success,
    setError,
    setSuccess,
    handleLogin,
    handleRegister
  };
};