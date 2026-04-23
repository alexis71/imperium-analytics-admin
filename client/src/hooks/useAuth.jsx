import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function boot() {
      if (!api.getToken()) { setLoading(false); return; }
      try {
        const { data } = await api.auth.me();
        setUser(data);
      } catch {
        api.clearTokens();
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  const login = async (email, password) => {
    return api.auth.login(email, password);
  };

  const completeAuth = (payload) => {
    api.setTokens({ accessToken: payload.accessToken, refreshToken: payload.refreshToken });
    setUser(payload.user);
  };

  const logout = async () => {
    try { await api.auth.logout(); } catch {}
    api.clearTokens();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, completeAuth, logout, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
