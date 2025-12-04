// hooks/useSmsAuth.ts
import { useState, useEffect } from 'react';
import { authService } from '../services/authService';

export const useSmsAuth = () => {
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSmsLoading, setSmsLoading] = useState(false);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [timer, setTimer] = useState(0);
  const [smsError, setSmsError] = useState<string | null>(null);

  // 타이머 효과
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => setTimer(timer - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // 시간 포맷 함수
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 상태 초기화 함수
  const resetSmsState = () => {
    setVerificationCode('');
    setIsCodeSent(false);
    setIsPhoneVerified(false);
    setTimer(0);
    setSmsError(null);
  };

  const sendVerification = async (isUpdate: boolean = false) => {
    if (!phone) {
      setSmsError('전화번호를 입력해주세요.');
      return;
    }

    setSmsLoading(true);
    setSmsError(null);

    try {
      const data = await authService.sendVerification(phone, isUpdate);
      setIsCodeSent(true);
      setTimer(180); // 3분
      
      if (data.testCode) {
        console.log('테스트 인증번호:', data.testCode);
      }
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : '인증번호 발송 중 오류가 발생했습니다.');
    } finally {
      setSmsLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!verificationCode) {
      setSmsError('인증번호를 입력해주세요.');
      return;
    }

    try {
      await authService.verifyPhone(phone, verificationCode);
      setIsPhoneVerified(true);
      setTimer(0);
      setSmsError(null);
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : '인증 확인 중 오류가 발생했습니다.');
    }
  };

  return {
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
  };
};