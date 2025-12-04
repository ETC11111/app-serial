// contexts/AdminAuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface Admin {
  id: string;
  email: string;
  name: string;
  phone?: string;
  created_at: string;
  last_login: string;
}

interface AdminAuthContextType {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

interface AdminAuthProviderProps {
  children: ReactNode;
}

export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    console.log('AdminAuth: Checking authentication...');
    try {
      const token = localStorage.getItem('adminToken');
      console.log('AdminAuth: Token found:', !!token);
      
      if (!token) {
        console.log('AdminAuth: No token, setting loading to false');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      console.log('AdminAuth: Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('AdminAuth: Response data:', data);
        
        if (data.success) {
          setAdmin(data.admin);
          console.log('AdminAuth: Admin set successfully');
        } else {
          localStorage.removeItem('adminToken');
          console.log('AdminAuth: Invalid response, token removed');
        }
      } else {
        localStorage.removeItem('adminToken');
        console.log('AdminAuth: Response not ok, token removed');
      }
    } catch (error) {
      console.error('AdminAuth: Check failed:', error);
      localStorage.removeItem('adminToken');
    } finally {
      console.log('AdminAuth: Setting loading to false');
      setLoading(false);
    }
  }, []); // 의존성 배열을 빈 배열로 변경

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('adminToken', data.accessToken);
        setAdmin(data.admin);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Admin login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Admin logout error:', error);
    } finally {
      localStorage.removeItem('adminToken');
      setAdmin(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []); // checkAuth는 useCallback으로 메모이제이션되어 있으므로 빈 배열 사용

  const value = {
    admin,
    loading,
    login,
    logout,
    checkAuth
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};