// All API response types for Sentinel platform

export interface Service {
  service_id: string
  name: string
  environment: 'production' | 'staging' | 'dev'
  version: string
  health_status: 'healthy' | 'warning' | 'critical'
  tags: Record<string, string>
  created_at: string
  updated_at: string
}

export interface Metric {
  id: number
  service_id: string
  metric_name: string
  value: number
  timestamp: string
}

export interface Anomaly {
  anomaly_id: string
  service_id: string
  anomaly_score: number
  if_score: number
  lstm_score: number
  anomaly_type: string
  metric_name: string
  features: Record<string, number>
  detected_at: string
  status: 'active' | 'resolved'
}

export interface Incident {
  incident_id: string
  service_id: string
  severity: 'critical' | 'warning' | 'info'
  summary: string
  status: 'active' | 'acknowledged' | 'resolved'
  anomaly_score_at_trigger: number
  affected_services: string[]
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  resolved_at: string | null
  resolution_note?: string | null
}

export interface Forecast {
  id: number
  service_id: string
  metric_name: string
  predicted_value: number
  confidence_lower: number
  confidence_upper: number
  predicted_at: string
  model_used: 'prophet' | 'arima'
  mae: number
  will_breach: boolean
  breach_threshold: number
}

export interface RcaStatus {
  status: 'not_started' | 'streaming' | 'done' | 'error'
  result: string
  updated_at: string | null
}

export interface User {
  user_id: string
  username: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  is_active: boolean
  created_at: string
  last_login: string | null
  failed_login_attempts: number
  locked_until: string | null
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface ModelRegistryEntry {
  id: number
  model_name: string
  model_type: 'isolation_forest' | 'lstm_ae' | 'prophet' | 'arima'
  service_id: string
  mlflow_run_id: string
  metrics: Record<string, number>
  is_champion: boolean
  challenger_of?: string
  trained_at: string
  promoted_at?: string | null
}

export interface PlatformSettings {
  anomaly_threshold: number
  forecast_horizon_minutes: number
  ollama_model: string
  metric_retention_days: number
  audit_retention_days: number
  alert_throttle_minutes: number
  thresholds: {
    cpu_usage: number
    mem_usage: number
    p95_latency_ms: number
    error_rate: number
  }
}

export interface OllamaStatus {
  connected: boolean
  models: string[]
  active_model: string
}

export interface Runbook {
  id: string
  name: string
  description: string
  risk_level: 'low' | 'medium' | 'high'
  trigger: string
  dry_run_default: boolean
  requires_approval?: boolean
}

// WebSocket event types
export interface WsAnomalyEvent {
  type: 'anomaly_detected'
  service_id: string
  anomaly_score: number
  anomaly_type: string
  detected_at: string
}

export interface WsIncidentEvent {
  type: 'incident_created' | 'incident_updated'
  incident_id: string
  service_id: string
  severity: 'critical' | 'warning' | 'info'
  status: string
}

export interface WsMetricUpdate {
  type: 'metric_update'
  service_id: string
  metrics: Record<string, number>
  timestamp: string
}

export interface WsRcaUpdate {
  type: 'rca_update'
  incident_id: string
  status: string
  result: string
}

export type WsEvent = WsAnomalyEvent | WsIncidentEvent | WsMetricUpdate | WsRcaUpdate
