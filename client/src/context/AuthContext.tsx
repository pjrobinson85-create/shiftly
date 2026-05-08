import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'FAMILY' | 'WORKER';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: 'FAMILY' | 'WORKER';
  phone?: string;
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

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
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
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
