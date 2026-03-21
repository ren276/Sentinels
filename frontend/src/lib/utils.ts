import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatValue(metric: string, value: number): string {
  if (metric.includes('latency')) return `${value.toFixed(0)}ms`
  if (metric.includes('rate') || metric.includes('usage')) return `${(value * 100).toFixed(1)}%`
  if (metric.includes('per_second')) return `${value.toFixed(0)}/s`
  return value.toFixed(2)
}

export function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--red)'
  if (score >= 0.4) return 'var(--amber)'
  return 'var(--emerald)'
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'var(--red)'
    case 'warning': return 'var(--amber)'
    case 'info': return 'var(--blue)'
    default: return 'var(--text-muted)'
  }
}

// Deterministic color from username hash for avatar
const AVATAR_COLORS = [
  '#27272A', '#1D4ED8', '#059669', '#D97706', '#DC2626', '#7C3AED',
]
export function avatarColor(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  return name.split(/[\s-]/).map((w) => w[0]?.toUpperCase() ?? '').join('').slice(0, 2)
}
