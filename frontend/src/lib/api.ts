import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000',
  withCredentials: true,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// Request: add auth header from cookie
api.interceptors.request.use((config) => {
  // Cookies handled by withCredentials; but also support
  // explicit token for SSR fallback
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/access_token=([^;]+)/)
    if (match) {
      config.headers.Authorization = `Bearer ${match[1]}`
    }
  }
  return config
})

// Response: handle errors
let isRefreshing = false

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true
      isRefreshing = true
      try {
        await axios.post(
          '/api/auth/refresh',
          {},
          { withCredentials: true }
        )
        isRefreshing = false
        return api(original)
      } catch {
        isRefreshing = false
        useAuthStore.getState().clearAuth()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }
    }

    if (error.response?.status === 403) {
      toast.error('Insufficient permissions')
    } else if (error.response?.status === 429) {
      toast.warning('Too many requests — please slow down')
    } else if (error.response?.status >= 500) {
      toast.error('Server error, please try again')
    } else if (!error.response) {
      toast.error('Cannot connect to server — is the backend running?')
    }

    return Promise.reject(error)
  }
)

export default api

// ── Typed API helpers ────────────────────────────────────────────

export const apiClient = {
  // Auth
  login: async (username: string, password: string) => {
    const res = await api.post('/api/v1/auth/login', { username, password })
    if (res.data?.access_token) {
      document.cookie = `access_token=${res.data.access_token}; path=/; max-age=3600; SameSite=Lax`
    }
    return res
  },
  logout: () => api.post('/api/v1/auth/logout'),
  me: () => api.get('/api/v1/auth/me'),

  // Services
  getServices: () => api.get('/api/v1/services'),
  getService: (id: string) => api.get(`/api/v1/services/${id}`),
  getServiceMetrics: (id: string, window_minutes = 60, metric = 'all') =>
    api.get(`/api/v1/services/${id}/metrics`, { params: { window_minutes, metric } }),
  getServiceAnomalies: (id: string, limit = 50) =>
    api.get(`/api/v1/services/${id}/anomalies`, { params: { limit } }),
  getServiceForecast: (id: string, metric = 'cpu_usage') =>
    api.get(`/api/v1/services/${id}/forecast`, { params: { metric } }),

  // Incidents
  getIncidents: (params?: { status?: string; severity?: string; limit?: number }) =>
    api.get('/api/v1/incidents', { params }),
  getIncident: (id: string) => api.get(`/api/v1/incidents/${id}`),
  generateRca: (incidentId: string) =>
    api.post(`/api/v1/incidents/${incidentId}/rca/generate`),
  getRcaStatus: (incidentId: string) =>
    api.get(`/api/v1/incidents/${incidentId}/rca`),

  // Alerts
  acknowledgeAlert: (incidentId: string, note?: string) =>
    api.post('/api/v1/alerts/acknowledge', { incident_id: incidentId, note }),
  resolveIncident: (incidentId: string, note?: string) =>
    api.post('/api/v1/incidents/resolve', { incident_id: incidentId, note }),
  testSlackWebhook: (webhook_url: string) =>
    api.post('/api/v1/slack/test', { webhook_url }),

  // Runbooks
  getRunbooks: () => api.get('/api/v1/runbooks'),
  executeRunbook: (id: string, body: object) =>
    api.post(`/api/v1/runbooks/${id}/execute`, body),

  // ML
  getModels: () => api.get('/api/v1/ml/models'),
  getExperiments: () => api.get('/api/v1/ml/experiments'),
  triggerTraining: () => api.post('/api/v1/ml/train'),
  getOllamaStatus: () => api.get('/api/v1/ollama/status'),

  // Forecasts
  getForecasts: () => api.get('/api/v1/forecasts'),

  // Users (admin)
  getUsers: () => api.get('/api/v1/users'),
  createUser: (body: object) => api.post('/api/v1/users', body),
  updateUser: (id: string, body: object) => api.put(`/api/v1/users/${id}`, body),
  deleteUser: (id: string) => api.delete(`/api/v1/users/${id}`),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/api/v1/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  // Settings
  getSettings: () => api.get('/api/v1/settings'),
  updateSettings: (body: object) => api.put('/api/v1/settings', body),

  // Chaos (dev only)
  injectChaos: (service: string, type: string, duration_minutes = 15) =>
    api.post('/api/v1/chaos/inject', { service, type, duration_minutes }),

  // Recent anomalies
  getRecentAnomalies: (limit = 50) =>
    api.get('/api/v1/anomalies/recent', { params: { limit } }),

  // Feature 1 — Post-mortems
  generatePostmortem: (incidentId: string) =>
    api.post(`/api/v1/incidents/${incidentId}/postmortem/generate`),
  getPostmortem: (incidentId: string) =>
    api.get(`/api/v1/incidents/${incidentId}/postmortem`),
  exportPostmortem: (incidentId: string) =>
    api.get(`/api/v1/incidents/${incidentId}/postmortem/export`, { responseType: 'blob' }),

  // Feature 2 — Deployments
  createDeployment: (body: object) =>
    api.post('/api/v1/deployments', body),
  getDeployments: (limit = 50) =>
    api.get('/api/v1/deployments', { params: { limit } }),
  getServiceDeployments: (serviceId: string, limit = 20) =>
    api.get(`/api/v1/services/${serviceId}/deployments`, { params: { limit } }),

  // Feature 3 — SLOs
  getSlos: (serviceId?: string) =>
    api.get('/api/v1/slos', { params: serviceId ? { service_id: serviceId } : undefined }),
  createSlo: (body: object) =>
    api.post('/api/v1/slos', body),
  deleteSlo: (sloId: string) =>
    api.delete(`/api/v1/slos/${sloId}`),
  getSloHistory: (sloId: string, days = 30) =>
    api.get(`/api/v1/slos/${sloId}/history`, { params: { days } }),

  // Feature 4 — Anomaly explanation
  getAnomalyExplanation: (anomalyId: string) =>
    api.get(`/api/v1/anomalies/${anomalyId}/explanation`),
}

