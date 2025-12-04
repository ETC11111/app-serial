// utils/httpInterceptor.ts
import { authService } from '../services/authService';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  
  failedQueue = [];
};

// 🔥 토큰 만료 시 자동 갱신 처리
export const setupHttpInterceptor = () => {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const isSensorApi = url.includes('/api/sensors/') || url.includes('/sensors/');
      
      const response = await originalFetch(...args);
      
      // 🔥 센서 데이터 관련 404는 정상적인 상황이므로 조용히 처리
      // 🔥 브라우저 콘솔에 404 로그가 표시되지 않도록 조용히 반환
      if (response.status === 404 && isSensorApi) {
        // 🔥 센서 데이터 관련 404는 정상적인 상황이므로 조용히 처리
        // 🔥 Response 객체를 그대로 반환하되, 콘솔 로그는 남기지 않음
        return response;
      }
      
      // 🔥 400 에러 디버깅 추가
      if (response.status === 400) {
        const options = args[1];
        
        console.error('🔍 400 에러 발생:', {
          url,
          method: options?.method,
          headers: options?.headers,
          body: options?.body,
          status: response.status
        });
        
        // 응답 내용도 확인
        const responseText = await response.clone().text();
        console.error('🔍 400 에러 응답:', responseText);
      }
      // 401 에러이고 리프레시 토큰이 있는 경우
      if (response.status === 401 && !isRefreshing) {
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (refreshToken) {
          if (isRefreshing) {
            // 이미 리프레시 중이면 대기
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            }).then(() => {
              // 리프레시 완료 후 원래 요청 재시도
              return originalFetch(...args);
            });
          }

          isRefreshing = true;

          try {
            await authService.refreshToken();
            processQueue();
            
            // 원래 요청 재시도
            return originalFetch(...args);
          } catch (error) {
            processQueue(error);
            
            // 리프레시 실패 시 로그인 페이지로
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            
            throw error;
          } finally {
            isRefreshing = false;
          }
        }
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  };
};