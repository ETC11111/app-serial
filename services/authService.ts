// services/authService.ts
import { BaseService } from './base';

export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
}

export interface UserPhone {
  id: string;
  phone: string;
  is_verified: boolean;
  is_primary: boolean;
  created_at: string;
  verified_at?: string | null;
}

class AuthService extends BaseService {
  // === 인증 관련 === 
  async login(email: string, password: string, rememberMe: boolean = false, returnUrl?: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        email, 
        password, 
        rememberMe,
        ...(returnUrl && { returnUrl })
      })
    });
    
    const result = await this.handleResponse(response);
    
    // 🔥 accessToken을 localStorage에도 저장 (백업용)
    if (result.success && result.accessToken) {
      localStorage.setItem('accessToken', result.accessToken);
      
      // 자동 로그인 선택 시 refreshToken도 localStorage에 저장
      // Capacitor 앱 호환성: 응답에서 받거나 쿠키에서 가져오기
      if (rememberMe) {
        // 1. 응답에서 refreshToken 확인 (우선순위)
        const refreshToken = result.refreshToken || 
          // 2. 쿠키에서 refreshToken 가져오기 (백업)
          document.cookie
            .split('; ')
            .find(row => row.startsWith('refreshToken='))?.split('=')[1];
        
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
      } else {
        // 자동 로그인 미선택 시 refreshToken 제거
        localStorage.removeItem('refreshToken');
      }
    }
    
    return result;
  }

  async register(userData: any) {
    const response = await fetch(`${this.getBaseUrl()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userData)
    });
    return this.handleResponse(response);
  }

  async logout() {
    try {
      const response = await fetch(`${this.getBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      return this.handleResponse(response);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      throw error;
    }
  }

  async refreshToken() {
    const response = await fetch(`${this.getBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    const result = await this.handleResponse(response);
    
    if (result.success && result.accessToken) {
      localStorage.setItem('accessToken', result.accessToken);
      
      // refreshToken도 업데이트 (쿠키에서 가져와서 localStorage에 저장)
      const refreshToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('refreshToken='))?.split('=')[1];
      
      if (refreshToken && localStorage.getItem('refreshToken')) {
        localStorage.setItem('refreshToken', refreshToken);
      }
    }
    
    return result;
  }

  async getMe() {
    const response = await fetch(`${this.getBaseUrl()}/auth/me`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 SMS 인증번호 발송 (기존: 메인 번호 변경/회원가입 등 공용)
  async sendVerification(phone: string, isUpdate: boolean = false) {
    const response = await fetch(`${this.getBaseUrl()}/auth/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, isUpdate })
    });
    return this.handleResponse(response);
  }

  // 🔥 SMS 인증 확인 (기존: 메인 번호 변경/회원가입 등 공용)
  async verifyPhone(phone: string, code: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/verify-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, code })
    });
    return this.handleResponse(response);
  }

  // 🔥 전화번호 업데이트 (기존: 메인 번호 업데이트)
  async updatePhone(phone: string, isPhoneVerified: boolean) {
    const response = await fetch(`${this.getBaseUrl()}/auth/update-phone`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ phone, isPhoneVerified })
    });
    return this.handleResponse(response);
  }

  // 🔥 기본정보 업데이트
  async updateProfile(data: { name: string }) {
    const response = await fetch(`${this.getBaseUrl()}/auth/update-profile`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  // 🔥 회원탈퇴
  async withdraw(password: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/withdraw`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    return this.handleResponse(response);
  }

  // 🔥 탈퇴 미리보기
  async withdrawPreview() {
    const response = await fetch(`${this.getBaseUrl()}/auth/withdraw/preview`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    return this.handleResponse(response);
  }

  // =========================
  // 📱 다중 전화번호 (서브 번호) 기능
  // 백엔드 라우트:
  //   GET    /api/auth/phones
  //   POST   /api/auth/phones/send              { phone }
  //   POST   /api/auth/phones/verify            { phone, code, setPrimary? }
  //   PUT    /api/auth/phones/:id/primary
  //   DELETE /api/auth/phones/:id
  // =========================

  // 목록 조회
  async getPhones(): Promise<{ success: boolean; phones: UserPhone[] }> {
    const response = await fetch(`${this.getBaseUrl()}/auth/phones`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    return this.handleResponse(response);
  }

  // 서브 번호 인증번호 발송
  async sendPhoneVerificationForSub(phone: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/phones/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone }),
    });
    return this.handleResponse(response);
  }

  // 서브 번호 인증 확인 (+옵션: 메인으로 승격)
  async verifySubPhone(phone: string, code: string, setPrimary: boolean = false) {
    const response = await fetch(`${this.getBaseUrl()}/auth/phones/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, code, setPrimary }),
    });
    return this.handleResponse(response);
  }

  // 특정 서브 번호를 메인으로 지정
  async setPrimaryPhone(id: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/phones/${id}/primary`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    return this.handleResponse(response);
  }

  // 서브 번호 삭제 (메인은 삭제 불가)
  async deletePhone(id: string) {
    const response = await fetch(`${this.getBaseUrl()}/auth/phones/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include',
    });
    return this.handleResponse(response);
  }
}

// 기존 객체 형태로 export (기존 코드 호환성 유지)
const authServiceInstance = new AuthService();

export const authService = {
  // === 기존 기능 ===
  login: async (email: string, password: string, rememberMe: boolean = false, returnUrl?: string | null) => {
    return await authServiceInstance.login(email, password, rememberMe, returnUrl || undefined);
  },

  register: async (userData: {
    email: string;
    password: string;
    name: string;
    phone: string;
    isPhoneVerified: boolean;
  }) => {
    return await authServiceInstance.register(userData);
  },

  getMe: async () => {
    return await authServiceInstance.getMe();
  },

  logout: async () => {
    return await authServiceInstance.logout();
  },

  sendVerification: async (phone: string, isUpdate: boolean = false) => {
    return await authServiceInstance.sendVerification(phone, isUpdate);
  },

  verifyPhone: async (phone: string, code: string) => {
    return await authServiceInstance.verifyPhone(phone, code);
  },

  updatePhone: async (phone: string, isPhoneVerified: boolean) => {
    return await authServiceInstance.updatePhone(phone, isPhoneVerified);
  },

  refreshToken: async () => {
    return await authServiceInstance.refreshToken();
  },

  updateProfile: async (data: { name: string }) => {
    return await authServiceInstance.updateProfile(data);
  },

  withdraw: async (password: string) => {
    return await authServiceInstance.withdraw(password);
  },

  withdrawPreview: async () => {
    return await authServiceInstance.withdrawPreview();
  },

  // === 다중 전화번호(서브) 신규 기능 ===
  getPhones: async () => {
    return await authServiceInstance.getPhones();
  },

  sendPhoneVerificationForSub: async (phone: string) => {
    return await authServiceInstance.sendPhoneVerificationForSub(phone);
  },

  verifySubPhone: async (phone: string, code: string, setPrimary: boolean = false) => {
    return await authServiceInstance.verifySubPhone(phone, code, setPrimary);
  },

  setPrimaryPhone: async (id: string) => {
    return await authServiceInstance.setPrimaryPhone(id);
  },

  deletePhone: async (id: string) => {
    return await authServiceInstance.deletePhone(id);
  },
};
