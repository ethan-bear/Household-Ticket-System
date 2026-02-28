import React, { createContext, useContext, useState, useCallback } from 'react';
import client from '../api/client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'mother' | 'father' | 'employee';
  specialty?: string;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthority: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const res = await client.post('/auth/login', { email, password });
    const u = res.data.data.user as User;
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    await client.post('/auth/logout').catch(() => {});
    setUser(null);
    localStorage.removeItem('user');
    window.location.href = '/login';
  }, []);

  const isAuthority = user?.role === 'mother' || user?.role === 'father';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthority }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
