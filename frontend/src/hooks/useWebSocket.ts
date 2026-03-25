'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useWsStore } from '@/store/wsStore'
import { useAuthStore } from '@/store/authStore'
import type { WsEvent } from '@/types'

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttempt = useRef(0)
  const { user } = useAuthStore()
  const { setConnected, addAnomaly, addIncident, updateRca, updateMetrics } = useWsStore()

  const connect = useCallback(async () => {
    const baseWsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000/ws/live'
    
    // 1. Try cookie
    let token = ''
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/sentinel_session=([^;]+)/)
      if (match) token = match[1]
    }

    // 2. Try Supabase session (localStorage fallback)
    if (!token) {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        token = session.access_token
      }
    }

    if (!token) {
      console.warn('[WS] No access token found. Aborting connection.')
      setConnected(false)
      return
    }

    try {
      const wsUrl = `${baseWsUrl}?token=${token}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttempt.current = 0
        // Ping every 30s
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 30_000)
      }

      ws.onmessage = (ev) => {
        try {
          const event: WsEvent = JSON.parse(ev.data)
          switch (event.type) {
            case 'pong':
              return
            case 'ping':
              ws.send('ping')
              break
            case 'anomaly_detected':
              addAnomaly(event)
              break
            case 'incident_created':
            case 'incident_updated':
              addIncident(event)
              break
            case 'rca_update':
              updateRca(event.incident_id, event)
              break
            case 'metric_update':
              updateMetrics(event.service_id, event.metrics)
              break
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        // Only attempt reconnect if this is still the active connection
        if (wsRef.current !== ws) return

        setConnected(false)
        if (pingRef.current) clearInterval(pingRef.current)
        
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)]
        reconnectAttempt.current++
        
        setTimeout(() => {
          // Check again before reconnecting
          if (wsRef.current === ws) {
             connect()
          }
        }, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setConnected(false)
    }
  }, [user, setConnected, addAnomaly, addIncident, updateRca, updateMetrics])

  useEffect(() => {
    connect()
    return () => {
      if (pingRef.current) clearInterval(pingRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
