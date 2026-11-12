import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const TOKEN_KEY = 'procurehub_token';
const USER_KEY = 'procurehub_user';
const AuthContext = createContext();

const readStoredUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  } catch {
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(readStoredUser);
  const [authReady, setAuthReady] = useState(() => !sessionStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    let active = true;
    if (!token) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      setUser(null);
      setAuthReady(true);
      return () => { active = false; };
    }

    setAuthReady(false);
    api.get('/auth/me').then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }).catch((error) => {
      if (!active) return;
      if (error.response?.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        setToken('');
        setUser(null);
      }
    }).finally(() => {
      if (active) setAuthReady(true);
    });

    return () => { active = false; };
  }, [token]);

  const acceptSession = ({ token: newToken, user: userData }) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    setAuthReady(true);
  };

  const login = async (payload) => {
    const response = await api.post('/auth/login', payload);
    acceptSession(response.data);
    return response.data;
  };

  const register = async (payload) => {
    const response = await api.post('/auth/register', payload);
    acceptSession(response.data);
    return response.data;
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken('');
    setUser(null);
    setAuthReady(true);
  };

  const value = useMemo(
    () => ({ token, user, authReady, login, register, logout }),
    [token, user, authReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
