const BASE = '/api/v1';
const STORAGE_TOKEN = 'ia_access_token';
const STORAGE_REFRESH = 'ia_refresh_token';

async function request(path, opts = {}) {
  const token = localStorage.getItem(STORAGE_TOKEN);
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token && !opts.skipAuth) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...opts, headers });
  const contentType = res.headers.get('Content-Type') || '';
  const data = contentType.includes('json') ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const msg = (typeof data === 'object' ? data.error : data) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  request,
  getToken: () => localStorage.getItem(STORAGE_TOKEN),
  setTokens: ({ accessToken, refreshToken }) => {
    if (accessToken) localStorage.setItem(STORAGE_TOKEN, accessToken);
    if (refreshToken) localStorage.setItem(STORAGE_REFRESH, refreshToken);
  },
  clearTokens: () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_REFRESH);
  },

  health: () => request('/health', { skipAuth: true }),

  auth: {
    login: (email, password) => request('/auth/login', {
      method: 'POST', skipAuth: true, body: JSON.stringify({ email, password }),
    }),
    mfaSetup: (setupToken) => request('/auth/mfa/setup', {
      method: 'POST', skipAuth: true, body: JSON.stringify({ setupToken }),
    }),
    mfaEnable: (setupToken, code) => request('/auth/mfa/enable', {
      method: 'POST', skipAuth: true, body: JSON.stringify({ setupToken, code }),
    }),
    mfaVerify: (mfaToken, code) => request('/auth/mfa/verify', {
      method: 'POST', skipAuth: true, body: JSON.stringify({ mfaToken, code }),
    }),
    changePassword: (password) => request('/auth/change-password', {
      method: 'POST', body: JSON.stringify({ password }),
    }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: localStorage.getItem(STORAGE_REFRESH) }),
    }),
  },

  dashboard: {
    stats: () => request('/dashboard/stats'),
  },

  webhooks: {
    events: (filters = {}) => {
      const q = Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      return request(`/webhooks-inbox/events${q ? '?' + q : ''}`);
    },
    detail: (id) => request(`/webhooks-inbox/events/${id}`),
  },

  audit: {
    list: (filters = {}) => {
      const q = Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      return request(`/audit-log${q ? '?' + q : ''}`);
    },
    detail: (id) => request(`/audit-log/${id}`),
  },
};

export default api;
