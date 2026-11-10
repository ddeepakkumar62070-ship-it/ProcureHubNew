import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('procurehub_token') || '');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('procurehub_user') || 'null'));

  useEffect(() => {
    if (token) {
      localStorage.setItem('procurehub_token', token);
      api.get('/auth/me').then((response) => {
        setUser(response.data.user);
        localStorage.setItem('procurehub_user', JSON.stringify(response.data.user));
      }).catch((error) => {
        if (error.response?.status === 401) {
          logout();
        }
      });
    } else {
      localStorage.removeItem('procurehub_token');
      localStorage.removeItem('procurehub_user');
      setUser(null);
    }
  }, [token]);

  const login = async (payload) => {
    const response = await api.post('/auth/login', payload);
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('procurehub_user', JSON.stringify(userData));
    return response.data;
  };

  const register = async (payload) => {
    const response = await api.post('/auth/register', payload);
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('procurehub_user', JSON.stringify(userData));
    return response.data;
  };

  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('procurehub_token');
    localStorage.removeItem('procurehub_user');
  };

  const value = useMemo(() => ({ token, user, login, register, logout }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
