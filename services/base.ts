// services/base.ts
export class BaseService {
  public getBaseUrl(): string {
    return '/api';
  }

  // 🔥 인증 헤더 처리 개선 (쿠키 우선, Authorization 헤더 백업)
  protected getAuthHeaders() {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  // 🔥 응답 처리 개선 (토큰 만료 처리 포함)
  protected async handleResponse(response: Response) {
    // 🔥 404 에러는 센서 데이터 없음을 의미하므로 조용히 처리
    if (response.status === 404) {
      const error = await response.json().catch(() => ({ error: '센서 데이터 없음' }));
      throw new Error(error.error || '센서 데이터 없음');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      
      // 🔥 토큰 만료 또는 인증 실패 시 자동 로그아웃
      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        // 토큰 만료인 경우 리프레시 시도
        if (error.error?.includes('만료')) {
          try {
            // 순환 참조 방지를 위해 직접 fetch 호출
            const refreshResponse = await fetch(`${this.getBaseUrl()}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            });
            
            if (refreshResponse.ok) {
              const result = await refreshResponse.json();
              if (result.success && result.accessToken) {
                localStorage.setItem('accessToken', result.accessToken);
                return;
              }
            }
          } catch {
            // 리프레시 실패시 로그인 페이지로
          }
          window.location.href = '/login';
        }
      }
      
      // 🔥 구체적인 에러 메시지 전달
      const errorMessage = error.error || error.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }
    return response.json();
  }
}