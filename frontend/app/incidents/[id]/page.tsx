'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { formatTimestamp } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

export default function WarRoomPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [elapsed, setElapsed] = useState('00:00:00')
  const queryClient = useQueryClient()

  const handleAcknowledge = async () => {
    try {
      await apiClient.acknowledgeAlert(id, 'Acknowledged from War Room')
      toast.success('Incident acknowledged')
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
    } catch (err) {
      toast.error('Failed to acknowledge incident')
    }
  }

  const handleResolve = async () => {
    try {
      await apiClient.resolveIncident(id, 'Resolved from War Room')
      toast.success('Incident resolved')
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
    } catch (err) {
      toast.error('Failed to resolve incident')
    }
  }

  const { data: incident, isPending } = useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await apiClient.getIncidents({})
      return res.data.find((i: any) => i.incident_id === id)
    },
    enabled: !!id,
  })

  // WebSocket Live Sync - if status changes via WS, refresh page data
  const incidentUpdate = useWsStore(state => state.latestIncidents.find(i => i.incident_id === id))
  useEffect(() => {
    if (incidentUpdate) {
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
      queryClient.invalidateQueries({ queryKey: ['incident-timeline', id] })
    }
  }, [incidentUpdate, queryClient, id])

  const { data: timeline = [] } = useQuery({
    queryKey: ['incident-timeline', id],
    queryFn: async () => {
      const resp = await apiClient.getIncidents({})
      const inc = resp.data.find((i: any) => i.incident_id === id)
      if (!inc) return []
      const events: any[] = []
      if (inc.created_at) events.push({ timestamp: inc.created_at, event: 'Incident Detected / Anomaly Triggered', source: 'SYSTEM' })
      if (inc.acknowledged_at) events.push({ timestamp: inc.acknowledged_at, event: `Acknowledged by ${inc.acknowledged_by}`, source: 'OPERATOR' })
      if (inc.resolved_at) events.push({ timestamp: inc.resolved_at, event: 'Incident Resolved', source: 'SYSTEM' })
      return events
    },
    enabled: !!id,
    refetchInterval: 5000,
  })

  // Timer simulation
  useEffect(() => {
    if (!incident) return
    const start = new Date(incident.created_at).getTime()
    const int = setInterval(() => {
      const now = new Date().getTime()
      const diff = Math.max(0, Math.floor((now - start) / 1000))
      const h = Math.floor(diff / 3600).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0')
      const s = (diff % 60).toString().padStart(2, '0')
      setElapsed(`${h}:${m}:${s}`)
    }, 1000)
    return () => clearInterval(int)
  }, [incident])


  const rcaData = useWsStore(state => state.rcaUpdates[id])

  const handleGenerateRca = async () => {
    try {
      await apiClient.generateRca(id)
      toast.success('RCA Pipeline started')
    } catch (err) {
      toast.error('Failed to trigger RCA engine')
    }
  }

  if (isPending || !incident) {
    return <div className="h-screen w-full bg-[#121317] flex items-center justify-center font-mono text-[#00dbe9] tracking-widest uppercase">INITIALIZING WAR ROOM...</div>
  }

  return (
    <div className="bg-[#121317] text-[#e3e2e7] font-sans overflow-hidden h-screen flex flex-col">
      {/* TopAppBar */}
      <header className="flex justify-between items-center w-full px-6 h-16 sticky top-0 z-50 border-none bg-[#121317]">
        <div className="flex items-center gap-8">
          <div className="text-xl font-mono tracking-widest text-[#dbfcff]">SENTINEL</div>
          <nav className="hidden md:flex gap-6 items-center">
            <a className="text-[#dbfcff] border-b-2 border-[#dbfcff] pb-1 font-mono text-[11px] uppercase" href="#">WAR ROOM</a>
            <a className="text-[#e3e2e7]/60 font-mono text-[11px] hover:bg-[#292a2e] hover:text-[#dbfcff] transition-colors duration-150 px-2 py-1 uppercase" href="#">METRICS</a>
            <a className="text-[#e3e2e7]/60 font-mono text-[11px] hover:bg-[#292a2e] hover:text-[#dbfcff] transition-colors duration-150 px-2 py-1 uppercase" href="#">TIMELINE</a>
            <a className="text-[#e3e2e7]/60 font-mono text-[11px] hover:bg-[#292a2e] hover:text-[#dbfcff] transition-colors duration-150 px-2 py-1 uppercase" href="#">ASSETS</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/incidents')} className="text-[#b9cacb] hover:text-[#e3e2e7] font-mono text-[11px] px-3 py-2 transition-colors uppercase">
            CLOSE WAR ROOM
          </button>
          <div className="flex gap-4 items-center">
            <span className="material-symbols-outlined text-[#e3e2e7]/60 hover:text-[#dbfcff] cursor-pointer">notifications</span>
            <span className="material-symbols-outlined text-[#e3e2e7]/60 hover:text-[#dbfcff] cursor-pointer">settings</span>
            <span className="material-symbols-outlined text-[#e3e2e7]/60 hover:text-[#dbfcff] cursor-pointer">help</span>
          </div>
        </div>
        <div className="bg-[#1a1b20] h-px w-full absolute bottom-0 left-0"></div>
      </header>

      {/* War Room Toolbar */}
      <div className="bg-[#0d0e12] border-b border-[#3b494b]/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8 font-mono">
          <div className="flex flex-col">
            <span className="text-[#b9cacb] font-mono text-[11px] uppercase">INCIDENT_ID</span>
            <span className="text-[#dbfcff] text-sm font-bold uppercase">{id.split('-')[0]}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#b9cacb] font-mono text-[11px] uppercase">SEVERITY</span>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${incident.severity === 'critical' ? 'bg-[#ffb4ab] animate-pulse shadow-[0_0_8px_rgba(255,180,171,0.6)]' : 'bg-amber-400'}`}></span>
              <span className={`font-bold text-sm uppercase ${incident.severity === 'critical' ? 'text-[#ffb4ab]' : 'text-amber-400'}`}>{incident.severity}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[#b9cacb] font-mono text-[11px] uppercase">STATUS</span>
            <span className="text-[#e3e2e7] text-sm uppercase">{incident.status}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#b9cacb] font-mono text-[11px] uppercase">ELAPSED</span>
            <span className="text-[#e3e2e7] tabular-nums text-sm">{elapsed}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {incident.status !== 'resolved' && (
            <>
              <button 
                onClick={handleAcknowledge}
                disabled={incident.status === 'acknowledged'}
                className="bg-[#343439] text-[#e3e2e7] px-4 py-2 font-mono text-[11px] tracking-widest uppercase hover:bg-[#38393d] transition-colors disabled:opacity-50"
              >
                {incident.status === 'acknowledged' ? 'ACKNOWLEDGED' : 'ACKNOWLEDGE'}
              </button>
              <button 
                onClick={handleResolve}
                className="bg-[#343439] text-[#e3e2e7] px-4 py-2 font-mono text-[11px] tracking-widest uppercase hover:bg-[#38393d] transition-colors"
              >
                DECLARE RESOLVED
              </button>
            </>
          )}
          <button onClick={() => router.push('/incidents')} className="bg-[#93000a] text-[#ffdad6] px-4 py-2 font-mono text-[11px] tracking-widest uppercase hover:opacity-90 transition-opacity">ESCAPE WAR ROOM</button>
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden relative">
        <div className="absolute w-full h-[100px] pointer-events-none opacity-10 bg-gradient-to-b from-transparent via-[#dbfcff] to-transparent animate-[scan_8s_linear_infinite] -top-[100px] z-10" />

        {/* Left Column: Context */}
        <section className="w-[30%] bg-[#121317] flex flex-col border-r border-[#3b494b]/20 overflow-y-auto">
          <div className="p-6 space-y-8">
            <div>
              <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em] mb-4">Incident Context</h2>
              <div className="space-y-4">
                <div className="p-4 bg-[#1a1b20]">
                  <span className="block font-mono text-[11px] uppercase text-[#b9cacb] mb-1">Primary Service</span>
                  <span className="text-[#dbfcff] font-mono text-lg tracking-tight uppercase">{incident.service_id}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#1a1b20]">
                    <span className="block font-mono text-[11px] uppercase text-[#b9cacb] mb-1">Trigger Score</span>
                    <span className="text-[#e3e2e7] font-mono text-sm">{incident.anomaly_score_at_trigger?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="p-4 bg-[#1a1b20]">
                    <span className="block font-mono text-[11px] uppercase text-[#b9cacb] mb-1">Started At</span>
                    <span className="text-[#e3e2e7] font-mono text-[10px]">{formatTimestamp(incident.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em] mb-4">Anomaly Summary</h2>
              <div className="p-6 bg-[#0d0e12] border-l-2 border-[#ffb4ab]">
                <p className="text-[#e3e2e7] leading-relaxed text-sm">
                  {incident.summary}
                </p>
              </div>
            </div>

            <div>
              <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em] mb-4">RCA Pipeline</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-[#292a2e]">
                  <span className="font-mono text-[11px] uppercase text-[#e3e2e7]">RCA Status</span>
                  {!rcaData ? (
                    <button 
                      onClick={handleGenerateRca}
                      className="text-[#00f0ff] font-mono text-xs hover:underline decoration-[#00f0ff]/30 underline-offset-4"
                    >
                      TRIGGER DISCOVERY
                    </button>
                  ) : (
                    <span className="text-[#00dbe9] font-mono text-xs">{rcaData.status.toUpperCase()}</span>
                  )}
                </div>
                {rcaData?.result && (
                  <div className="p-4 bg-[#1a1b20] border-l border-[#00dbe9]/30">
                    <p className="text-xs font-mono text-[#b9cacb] whitespace-pre-wrap leading-relaxed">{rcaData.result}</p>
                    {rcaData.status === 'streaming' && <span className="inline-block w-2 h-4 ml-1 bg-[#dbfcff] animate-pulse align-middle" />}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em] mb-4">Post-Mortem Report</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-[#292a2e]">
                  <span className="font-mono text-[11px] uppercase text-[#e3e2e7]">Report Status</span>
                  {incident.status === 'resolved' ? (
                    <button 
                      onClick={async () => {
                        try {
                          await apiClient.generatePostmortem(id)
                          toast.success('Post-mortem generation started')
                        } catch (err) {
                          toast.error('Failed to trigger report engine')
                        }
                      }}
                      className="text-[#dbfcff] font-mono text-xs hover:underline decoration-[#dbfcff]/30 underline-offset-4"
                    >
                      GENERATE REPORT
                    </button>
                  ) : (
                    <span className="text-[#b9cacb]/40 font-mono text-[10px] italic">RESOLVE INCIDENT FIRST</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-8">
              <div className="w-full h-32 bg-[#0d0e12] border border-[#3b494b]/10 flex items-center justify-center relative overflow-hidden">
                 <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#dbfcff_1px,transparent_1px)] bg-[size:16px_16px]" />
                 <span className="font-mono text-[10px] text-[#b9cacb] uppercase tracking-widest">SYSTEM SCHEMATIC NOT LOADED</span>
              </div>
            </div>
          </div>
        </section>

        {/* Middle Column: Metrics */}
        <section className="w-[45%] bg-[#1a1b20] flex flex-col overflow-y-auto border-r border-[#3b494b]/20">
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em]">Real-time Telemetry</h2>
              <span className="font-mono text-[11px] uppercase text-[#dbfcff]">REFRESH RATE: 1000MS</span>
            </div>

            {/* Metric Card 1: Success Rate */}
            <div className="bg-[#121317] p-6 relative group">
              <div className="flex justify-between mb-4">
                <div>
                  <span className="block font-mono text-[11px] uppercase text-[#b9cacb]">Anomaly Score</span>
                  <span className="text-2xl font-mono text-[#ffb4ab]">{(incident.anomaly_score_at_trigger * 100 || 82).toFixed(1)}%</span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-[11px] uppercase text-[#b9cacb]">Threshold</span>
                  <span className="text-[#e3e2e7]/40 font-mono text-sm">95.0%</span>
                </div>
              </div>
              <div className="h-40 w-full bg-[#0d0e12] overflow-hidden relative">
                {/* SVG mock */}
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 100">
                  <path d="M0 80 L40 82 L80 85 L120 78 L160 15 L200 12 L240 14 L280 11 L320 13 L360 15 L400 14" fill="none" stroke="#ffb4ab" strokeWidth="2" />
                  <path d="M0 80 L40 82 L80 85 L120 78 L160 15 L200 12 L240 14 L280 11 L320 13 L360 15 L400 14 V 100 H 0 Z" fill="url(#grad1)" />
                  <defs>
                    <linearGradient id="grad1" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ffb4ab" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-5">
                  {[...Array(11)].map((_, i) => <div key={i} className="border-r border-[#e3e2e7] h-full" />)}
                </div>
              </div>
            </div>

            {/* High Density Data Table */}
            <div className="bg-[#121317] overflow-hidden">
              <div className="p-4 border-b border-[#3b494b]/20">
                <h3 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-widest">Active Thread Logs</h3>
              </div>
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-[#343439] text-[#b9cacb] uppercase">
                  <tr>
                    <th className="px-4 py-2 font-normal">Thread_ID</th>
                    <th className="px-4 py-2 font-normal">Latency</th>
                    <th className="px-4 py-2 font-normal">State</th>
                    <th className="px-4 py-2 font-normal">Gateway</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3b494b]/10">
                  {[
                    { id: '#TX-9281', lat: '4502ms', state: 'STALLED', gtw: 'STRIPE-US' },
                    { id: '#TX-9282', lat: '510ms', state: 'TIMEOUT', gtw: 'ADYEN-EU' },
                    { id: '#TX-9283', lat: '3982ms', state: 'STALLED', gtw: 'STRIPE-US' }
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-[#dbfcff]/5">
                      <td className="px-4 py-2 text-[#dbfcff]">{row.id}</td>
                      <td className="px-4 py-2">{row.lat}</td>
                      <td className="px-4 py-2"><span className="bg-[#ffb4ab]/10 text-[#ffb4ab] px-1">{row.state}</span></td>
                      <td className="px-4 py-2 text-[#b9cacb]">{row.gtw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </section>

        {/* Right Column: Timeline */}
        <section className="w-[25%] bg-[#121317] flex flex-col overflow-hidden">
          <div className="p-6 h-full flex flex-col">
            <h2 className="font-mono text-[11px] uppercase text-[#b9cacb] tracking-[0.2em] mb-6">Activity Timeline</h2>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              
              {timeline.length === 0 ? (
                <div className="text-[#b9cacb]/40 font-mono text-[10px] text-center pt-8 italic">BUILDING EVENT LOG...</div>
              ) : (
                timeline.map((event: any, idx: number) => (
                  <div key={idx} className="relative pl-6 border-l border-[#3b494b]/50 pb-6 last:pb-0">
                    <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 ${event.source === 'SYSTEM' ? 'bg-[#ffb4ab]' : 'bg-[#dbfcff]'} rounded-full ring-4 ring-[#121317]`} />
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-mono text-[10px] text-[#dbfcff]/80">{formatTimestamp(event.timestamp).split(' ')[1]}</span>
                        <span className="font-mono text-[9px] text-[#b9cacb] uppercase tracking-widest">{event.source}</span>
                      </div>
                      <p className="text-[11px] text-[#e3e2e7] leading-relaxed font-mono">{event.event}</p>
                    </div>
                  </div>
                ))
              )}

            </div>

            <div className="mt-6 pt-4 border-t border-[#3b494b]/30">
              <div className="flex gap-2">
                <input className="flex-1 bg-[#292a2e] border-none text-xs font-mono focus:ring-1 focus:ring-[#00dbe9]/30 placeholder:text-[#b9cacb]/40 text-[#dbfcff] px-3 py-2 outline-none" placeholder="ADD COMMENT..." type="text" />
                <button className="bg-[#dbfcff] text-[#00363a] px-3 flex items-center justify-center font-bold font-mono hover:opacity-90">
                  +
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Status Bar Footer */}
      <footer className="h-8 bg-[#0d0e12] border-t border-[#3b494b]/20 px-6 flex items-center justify-between text-[10px] uppercase font-mono tracking-widest text-[#b9cacb]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse"></span>
            <span>Connection: Encrypted (v3.1)</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Session: 88-XF-9021</span>
          </div>
        </div>
        <div className="opacity-50">Sentinel Unified Command Interface // Build 0x772A</div>
      </footer>
    </div>
  )
}
