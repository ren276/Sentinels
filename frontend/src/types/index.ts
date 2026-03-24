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
  provider?: string
  avatar_url?: string
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
  created_at: string
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

export interface WsPingEvent {
  type: 'ping'
}

export interface WsPongEvent {
  type: 'pong'
}

export type WsEvent = WsAnomalyEvent | WsIncidentEvent | WsMetricUpdate | WsRcaUpdate | WsPingEvent | WsPongEvent

// ─── Feature types ─────────────────────────────────────────────────────────

export interface PostMortem {
  id: string
  incident_id: string
  generated_by: string
  status: 'generating' | 'done' | 'error' | 'not_started'
  content: string
  impact_duration_minutes: number | null
  affected_services: string[]
  timeline_events: Array<{ timestamp: string; event: string }>
  created_at: string
  updated_at: string
}

export interface PostMortemStatus {
  status: 'not_started' | 'generating' | 'done' | 'error'
  content: string
  postmortem_id?: string
  updated_at?: string
}

export interface Deployment {
  deployment_id: string
  service_id: string
  service_name?: string
  version: string
  previous_version: string | null
  deployed_by: string
  environment: string
  status: 'success' | 'failed' | 'rollback'
  commit_hash: string | null
  deploy_notes: string | null
  deployed_at: string
  correlated_anomaly_count?: number
}

export interface Slo {
  slo_id: string
  service_id: string
  name: string
  metric_name: string
  target_value: number
  comparison: 'less_than' | 'greater_than'
  window_days: number
  is_active: boolean
  created_at: string
  created_by: string
  // Compliance fields (merged in list endpoint)
  compliance_pct?: number
  error_budget_remaining_pct?: number
  error_budget_consumed_minutes?: number
  good_minutes?: number
  bad_minutes?: number
  data_points?: number
}

export interface SloSnapshot {
  id: number
  slo_id: string
  compliance_pct: number
  error_budget_remaining_pct: number
  error_budget_consumed_minutes: number
  good_minutes: number
  bad_minutes: number
  snapshot_at: string
  window_start: string | null
  window_end: string | null
}

export interface ShapValue {
  feature: string
  value: number
  shap_value: number
  direction: 'positive' | 'negative'
}

export interface AnomalyExplanation {
  anomaly_id: string
  has_explanation: boolean
  top_contributor?: string
  if_score?: number
  lstm_score?: number
  combined_score?: number
  explanation: ShapValue[]
  feature_values?: Record<string, number>
}

