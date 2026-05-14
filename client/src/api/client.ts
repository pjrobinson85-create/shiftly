import axios from 'axios';

const api = axios.create({
  baseURL: '/shiftly/api',
  withCredentials: true, // send cookies (refresh token) to server
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('shiftly_token');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let pendingRequests: Array<{ resolve: (token: string) => void; reject: () => void }> = [];

// Auto-refresh on 401 — exchange refresh token for new access token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Already retried? Don't loop.
    if (originalRequest._retried) {
      return Promise.reject(error);
    }

    // Not a 401? Pass through.
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // No stored token at all — force re-login.
    if (!localStorage.getItem('shiftly_token')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Another request is already refreshing — queue this one.
      return new Promise<string>((resolve, reject) => {
        pendingRequests.push({ resolve, reject });
      }).then(() => api(originalRequest)).catch(reject);
    }

    originalRequest._retried = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post('/shiftly/api/auth/refresh', {}, { withCredentials: true });
      localStorage.setItem('shiftly_token', data.accessToken);

      // Resolve all queued requests.
      pendingRequests.forEach(({ resolve }) => resolve(data.accessToken));
      pendingRequests = [];

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch {
      // Refresh failed — clear token, force re-login.
      localStorage.removeItem('shiftly_token');
      pendingRequests.forEach(({ reject }) => reject());
      pendingRequests = [];
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
