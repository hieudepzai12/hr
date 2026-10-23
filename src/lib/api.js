'use client';

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
export const SESSION_EXPIRED_EVENT = 'otis:session-expired';

// Share concurrent reads only. Do not cache responses or authorization decisions.
const pendingAlerts = new Map();
export function getTaskAlerts(userId) {
  if (!pendingAlerts.has(userId)) {
    const pending = api.get('/tasks/alerts').finally(() => {
      if (pendingAlerts.get(userId) === pending) pendingAlerts.delete(userId);
    });
    pendingAlerts.set(userId, pending);
  }
  return pendingAlerts.get(userId);
}

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
