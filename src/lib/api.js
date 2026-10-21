'use client';

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
export const SESSION_EXPIRED_EVENT = 'otis:session-expired';

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('hr_user');
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  }
);

export default api;
