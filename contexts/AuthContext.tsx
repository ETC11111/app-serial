// contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '../services/authService';

interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      // console.log('🔍 AuthContext - checkAuth 시작');
      
      const result = await authService.getMe();
      
      // console.log('🔍 AuthContext - 응답 데이터:', result);
      
      if (result.success) {
        setUser(result.user);
        // console.log('✅ AuthContext - 사용자 설정됨:', result.user);
      }
    } catch (error) {
      // console.error('❌ AuthContext - Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const result = await authService.login(email, password);
      
      if (result.success) {
        setUser(result.user);
        return true;
      }
      return false;
    } catch (error) {
      // console.error('Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      // console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  const updateUser = (newUser: User) => {
    setUser(newUser);
    // console.log('🔄 AuthContext - 사용자 정보 업데이트됨:', newUser);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};