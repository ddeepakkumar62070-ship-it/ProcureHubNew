import axios from 'axios';

const candidatePorts = [5000, 5001, 5002, 5003, 5004, 5005];
const defaultBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: defaultBaseUrl });

const resolveBaseUrl = async () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  for (const port of candidatePorts) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        const discoveredUrl = `http://localhost:${port}/api`;
        api.defaults.baseURL = discoveredUrl;
        return discoveredUrl;
      }
    } catch (error) {
      // continue checking ports; no server found yet
    }
  }

  return defaultBaseUrl;
};

resolveBaseUrl();

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('procurehub_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
