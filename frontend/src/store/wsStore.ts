import { create } from 'zustand'
import type { WsAnomalyEvent, WsIncidentEvent, WsRcaUpdate } from '@/types'

interface WsStore {
  connected: boolean
  latestAnomalies: WsAnomalyEvent[]
  latestIncidents: WsIncidentEvent[]
  rcaUpdates: Record<string, WsRcaUpdate>
  liveMetrics: Record<string, Record<string, number>>
  lastSeenAlertTs: number
  setConnected: (v: boolean) => void
  addAnomaly: (event: WsAnomalyEvent) => void
  addIncident: (event: WsIncidentEvent) => void
  updateRca: (incidentId: string, update: WsRcaUpdate) => void
  updateMetrics: (serviceId: string, metrics: Record<string, number>) => void
  markAlertsAsSeen: (ts?: number) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  latestAnomalies: [],
  latestIncidents: [],
  rcaUpdates: {},
  liveMetrics: {},
  lastSeenAlertTs: typeof window !== 'undefined' ? Number(localStorage.getItem('lastSeenAlertTs') || 0) : 0,
  setConnected: (v) => set({ connected: v }),
  addAnomaly: (event) =>
    set((state) => {
      // Avoid duplicate keys in UI by checking if this exact anomaly was already added
      const exists = state.latestAnomalies.some(
        (a) => a.service_id === event.service_id && a.detected_at === event.detected_at
      )
      if (exists) return state
      return {
        latestAnomalies: [event, ...state.latestAnomalies.slice(0, 49)],
      }
    }),
  addIncident: (event) =>
    set((state) => {
      // If incident exists, update it instead of adding a new one (prevents duplicate keys)
      const exists = state.latestIncidents.some((i) => i.incident_id === event.incident_id)
      if (exists) {
        return {
          latestIncidents: state.latestIncidents.map((i) =>
            i.incident_id === event.incident_id ? event : i
          ),
        }
      }
      return {
        latestIncidents: [event, ...state.latestIncidents.slice(0, 49)],
      }
    }),
  updateRca: (incidentId, update) =>
    set((state) => ({
      rcaUpdates: { ...state.rcaUpdates, [incidentId]: update },
    })),
  updateMetrics: (serviceId, metrics) =>
    set((state) => ({
      liveMetrics: {
        ...state.liveMetrics,
        [serviceId]: { ...state.liveMetrics[serviceId], ...metrics },
      },
    })),
  markAlertsAsSeen: (ts) =>
    set((state) => {
      const finalTs = ts || Date.now()
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastSeenAlertTs', finalTs.toString())
      }
      return { lastSeenAlertTs: finalTs }
    }),
}))
