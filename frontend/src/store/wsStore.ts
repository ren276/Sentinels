import { create } from 'zustand'
import type { WsAnomalyEvent, WsIncidentEvent, WsRcaUpdate } from '@/types'

interface WsStore {
  connected: boolean
  latestAnomalies: WsAnomalyEvent[]
  latestIncidents: WsIncidentEvent[]
  rcaUpdates: Record<string, WsRcaUpdate>
  liveMetrics: Record<string, Record<string, number>>
  setConnected: (v: boolean) => void
  addAnomaly: (event: WsAnomalyEvent) => void
  addIncident: (event: WsIncidentEvent) => void
  updateRca: (incidentId: string, update: WsRcaUpdate) => void
  updateMetrics: (serviceId: string, metrics: Record<string, number>) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  latestAnomalies: [],
  latestIncidents: [],
  rcaUpdates: {},
  liveMetrics: {},
  setConnected: (v) => set({ connected: v }),
  addAnomaly: (event) =>
    set((state) => ({
      latestAnomalies: [event, ...state.latestAnomalies.slice(0, 49)],
    })),
  addIncident: (event) =>
    set((state) => ({
      latestIncidents: [event, ...state.latestIncidents.slice(0, 49)],
    })),
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
}))
