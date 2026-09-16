import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';

interface User {
  id: string;
  username: string;
  email?: string | null;
  name: string;
  role: 'FAMILY' | 'WORKER';
  isAdmin?: boolean;
  canEditCarePlan?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  // Exposed so pages (e.g. Account / change-password) can swap in a fresh
  // access token after the server rotates it.
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
}

interface RegisterData {
  username: string;
  password: string;
  name: string;
  role: 'FAMILY' | 'WORKER';
  email?: string;
  phone?: string;
  inviteCode?: string;
  confirmPassword?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('shiftly_token'));
  const [loading, setLoading] = useState(true);

  // Load user profile on mount if we have a token
  useEffect(() => {
    async function fetchUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        setUser(data);
      } catch {
        localStorage.removeItem('shiftly_token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [token]);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('shiftly_token', data.accessToken);
    setToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    // New backend returns accessToken directly on register
    if (response.data.accessToken) {
      localStorage.setItem('shiftly_token', response.data.accessToken);
      setToken(response.data.accessToken);
      setUser(response.data.user);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout'); // revoke refresh token on server
    } catch {
      // ignore — still clear local state
    }
    localStorage.removeItem('shiftly_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout, setToken, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
