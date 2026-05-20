import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Attach admin token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export const authAPI = {
  login: async (data) => ({ data: { token: 'mock_admin_token', admin: { id: 1, email: data.email, role: 'super_admin' } } }),
};

export const agentAPI = {
  getAll: async (params) => ({ data: { agents: [{ id: '1', full_name: 'John Doe', mobile: '9999999999', status: 'approved', agent_id_code: 'TFP-1001', completed_tasks: 42, aadhaar_status: 'verified' }] } }),
  getById: async (id) => ({ data: { agent: { id: '1', full_name: 'John Doe', mobile: '9999999999', status: 'approved' } } }),
  approve: async (id) => ({ data: { success: true } }),
  reject: async (id, reason) => ({ data: { success: true } }),
  suspend: async (id) => ({ data: { success: true } }),
  verifyAadhaar: async (agentId, action, reason) => ({ data: { success: true } }),
};

export const taskAPI = {
  getAll: async (params) => ({ data: { tasks: [{ id: 't1', title: 'Document Verification', status: 'pending', payout: 250, created_at: new Date() }] } }),
  create: async (data) => ({ data: { success: true } }),
  approve: async (id, feedback) => ({ data: { success: true } }),
  reject: async (id, feedback) => ({ data: { success: true } }),
};

export const paymentAPI = {
  getPending: async () => ({ data: { pending_earnings: [{ id: 'e1', agent_name: 'John Doe', amount: 250, task_title: 'Document Verification', date: new Date() }] } }),
  release: async (earning_ids) => ({ data: { success: true } }),
};

export const analyticsAPI = {
  get: async () => ({ data: { 
    totalAgents: 150, activeToday: 42, tasksCompleted: 1205, totalPayouts: 45000,
    completionTrend: [{ date: 'Mon', tasks: 12 }, { date: 'Tue', tasks: 19 }, { date: 'Wed', tasks: 3 }],
    topAgents: [{ agent_id_code: 'TFP-1001', full_name: 'John Doe', total_tasks: 42, earnings: 4500 }]
  } }),
};

export const locationAPI = {
  getLiveAgents: async () => ({ data: { agents: [{ id: '1', full_name: 'John Doe', lat: 28.6139, lng: 77.2090, status: 'online' }] } }),
};
