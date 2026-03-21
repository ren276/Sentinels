'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useWsStore } from '@/store/wsStore'
import type { WsEvent } from '@/types'

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttempt = useRef(0)
  const { setConnected, addAnomaly, addIncident, updateRca, updateMetrics } = useWsStore()

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    if (!wsUrl) return

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttempt.current = 0
        // Ping every 30s
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30_000)
      }

      ws.onmessage = (ev) => {
        try {
          const event: WsEvent = JSON.parse(ev.data)
          if ((event as { type: string }).type === 'pong') return

          switch (event.type) {
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
        setConnected(false)
        if (pingRef.current) clearInterval(pingRef.current)
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)]
        reconnectAttempt.current++
        setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      setConnected(false)
    }
  }, [setConnected, addAnomaly, addIncident, updateRca, updateMetrics])

  useEffect(() => {
    connect()
    return () => {
      if (pingRef.current) clearInterval(pingRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
