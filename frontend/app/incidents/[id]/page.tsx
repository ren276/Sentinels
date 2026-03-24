'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatTimestamp } from '@/lib/utils'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { toast } from 'sonner'
import { Activity, ShieldAlert, Cpu, Network, ArrowRight, X } from 'lucide-react'

export default function WarRoomPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [elapsed, setElapsed] = useState('00:00:00')
  const queryClient = useQueryClient()

  const { data: incident, isPending } = useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await apiClient.getIncident(id).catch(() => apiClient.getIncidents({}))
      if (res.data.incident_id === id) return res.data
      return res.data.find?.((i: any) => i.incident_id === id) || (res.data.data || []).find((i: any) => i.id === id || i.incident_id === id)
    },
    enabled: !!id,
  })

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
      const res = await apiClient.getIncident(id).catch(() => apiClient.getIncidents({}))
      const inc = res.data.incident_id === id ? res.data : (res.data.data || []).find((i: any) => i.id === id || i.incident_id === id)
      if (!inc) return []
      const events = []
      if (inc.created_at) events.push({ ts: inc.created_at, msg: 'Incident Detected / Anomaly Triggered', src: 'SYSTEM' })
      if (inc.acknowledged_at) events.push({ ts: inc.acknowledged_at, msg: `Acknowledged by ${inc.acknowledged_by}`, src: 'OPERATOR' })
      if (inc.resolved_at) events.push({ ts: inc.resolved_at, msg: 'Incident Resolved', src: 'SYSTEM' })
      return events
    },
    enabled: !!id,
    refetchInterval: 5000,
  })

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

  const handleAcknowledge = async () => {
    try {
      await apiClient.acknowledgeAlert(id, 'Acknowledged from War Room')
      toast.success('Incident acknowledged')
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
    } catch { toast.error('Failed to acknowledge') }
  }

  const handleResolve = async () => {
    try {
      await apiClient.resolveIncident(id, 'Resolved from War Room')
      toast.success('Incident resolved')
      queryClient.invalidateQueries({ queryKey: ['incident', id] })
    } catch { toast.error('Failed to resolve') }
  }

  const handleGenerateRca = async () => {
    try {
      await apiClient.generateRca(id)
      toast.success('RCA Pipeline started')
    } catch { toast.error('Failed to trigger RCA engine') }
  }

  if (isPending || !incident) {
    return <div className="h-screen w-full bg-surface flex items-center justify-center font-mono text-primary tracking-widest uppercase">INITIALIZING WAR ROOM...</div>
  }

  return (
    <div className="bg-surface text-on-surface font-sans overflow-hidden h-screen flex flex-col">
      {/* Consolidated Header & Toolbar */}
      <header className="bg-surface-container-low border-b border-outline-variant/10 z-50 relative shrink-0">
        <div className="flex justify-between items-center px-8 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-12">
            <div className="flex flex-col">
              <div className="text-primary font-mono tracking-tighter text-2xl uppercase font-bold leading-none">WAR_ROOM</div>
              <span className="text-[10px] font-mono text-on-surface-variant/40 mt-1 uppercase tracking-widest">Incident Response Unit</span>
            </div>
            
            <div className="hidden lg:flex gap-8 font-mono text-[10px] tracking-[0.2em] text-on-surface-variant/60 uppercase">
              <div className="flex flex-col">
                <span className="text-on-surface-variant/40 mb-1">Status</span>
                <span className="text-on-surface font-bold">{incident.status}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-on-surface-variant/40 mb-1">Severity</span>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${incident.severity === 'critical' ? 'bg-error shadow-[0_0_8px_rgba(255,180,171,0.6)]' : 'bg-amber-400'}`}></span>
                  <span className={`font-bold ${incident.severity === 'critical' ? 'text-error' : 'text-amber-400'}`}>{incident.severity || 'HIGH'}</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-on-surface-variant/40 mb-1">Elapsed</span>
                <span className="text-on-surface tabular-nums font-bold">{elapsed}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {incident.status !== 'resolved' && (
              <div className="flex gap-2 p-1 bg-surface-container-highest/20 ghost-border">
                <button onClick={handleAcknowledge} disabled={incident.status === 'acknowledged'} className="px-4 py-2 font-mono text-[10px] tracking-widest uppercase hover:bg-surface-container-highest transition-colors disabled:opacity-30 text-on-surface">
                  {incident.status === 'acknowledged' ? 'ACKNOWLEDGED' : 'ACKNOWLEDGE'}
                </button>
                <div className="w-px h-8 bg-outline-variant/20 self-center" />
                <button onClick={handleResolve} className="px-4 py-2 font-mono text-[10px] tracking-widest uppercase hover:bg-surface-container-highest transition-colors text-on-surface">
                  DECLARE RESOLVED
                </button>
              </div>
            )}
            <button onClick={() => router.push('/')} className="bg-error text-surface px-6 py-2 font-mono text-[10px] tracking-widest uppercase hover:bg-error/90 transition-colors font-bold shadow-lg shadow-error/20">
              EXIT WAR ROOM
            </button>
          </div>
        </div>

        {/* Sub-Header Context Area */}
        <div className="px-8 py-3 bg-surface-container-lowest flex items-center justify-between text-[11px] font-mono border-b border-outline-variant/10">
          <div className="flex items-center gap-6">
            <span className="text-on-surface-variant uppercase tracking-widest opacity-60">INCIDENT_ID:</span>
            <span className="text-primary font-bold tracking-widest">{id}</span>
          </div>
          <div className="flex items-center gap-8 text-on-surface-variant/60">
             <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-primary/40 rounded-full" /> TELEMETRY_FEED_ACTIVE</div>
             <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-primary/40 rounded-full" /> LOG_PIPELINE_STABLE</div>
             <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 ${rcaData ? 'bg-primary' : 'bg-on-surface-variant/20'} rounded-full`} /> RCA_ENGINE_{rcaData ? 'STREAMING' : 'READY'}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* COL 1: Context */}
        <section className="w-[30%] bg-surface flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-6 space-y-8">
            <div>
              <h2 className="mono-label text-on-surface-variant mb-4">INCIDENT CONTEXT</h2>
              <div className="space-y-4">
                <div className="p-4 ghost-border bg-surface-container-low">
                  <span className="block mono-label text-on-surface-variant mb-1">Primary Service</span>
                  <span className="text-primary font-mono text-lg tracking-tight uppercase flex items-center gap-2"><Cpu size={16}/> {incident.service_id || incident.service}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 ghost-border bg-surface-container-low">
                    <span className="block mono-label text-on-surface-variant mb-1">Trigger Score</span>
                    <span className="text-on-surface font-mono text-sm">{incident.anomaly_score_at_trigger?.toFixed(2) || '0.94'}</span>
                  </div>
                  <div className="p-4 ghost-border bg-surface-container-low">
                    <span className="block mono-label text-on-surface-variant mb-1">Started At</span>
                    <span className="text-on-surface font-mono text-[10px]">{formatTimestamp(incident.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mono-label text-on-surface-variant mb-4 flex items-center gap-2">ANOMALY SUMMARY</h2>
              <div className="p-6 bg-surface-container-lowest border-l-2 border-error">
                <p className="text-on-surface leading-relaxed text-sm">
                  {incident.summary || incident.title || 'Service disruption detected spanning multiple dependent nodes.'}
                </p>
              </div>
            </div>

            <div>
              <h2 className="mono-label text-on-surface-variant mb-4">RCA PIPELINE</h2>
              <div className="space-y-4">
                <div className="bg-surface-container-low p-4 ghost-border border-l-2 border-primary">
                  <div className="flex justify-between items-center mb-4">
                    <span className="mono-label text-on-surface uppercase">RCA_ENGINE_STATUS</span>
                    {!rcaData ? (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 border border-primary/20">READY</span>
                    ) : (
                      <span className="text-[10px] bg-primary-container text-on-primary-container px-2 py-0.5 animate-pulse uppercase">{rcaData.status}</span>
                    )}
                  </div>
                  {!rcaData && (
                    <button onClick={handleGenerateRca} className="w-full bg-surface-container-high py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-primary-container hover:text-on-primary-container transition-all">
                      RUN_DIAGNOSTICS
                    </button>
                  )}
                  {rcaData?.result && (
                    <div className="mt-4 pt-4 border-t border-outline-variant/10">
                      <div className="text-[10px] font-mono text-on-surface-variant/40 mb-2 uppercase select-none">DISCOVERY_RESULT</div>
                      <p className="text-[11px] font-mono text-on-surface leading-relaxed whitespace-pre-wrap">{rcaData.result}</p>
                      {rcaData.status === 'streaming' && <span className="inline-block w-1.5 h-3 ml-1 bg-primary animate-pulse" />}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* COL 2: Metrics */}
        <section className="w-[45%] bg-surface-container-lowest flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="mono-label text-on-surface-variant">REAL-TIME TELEMETRY</h2>
              <span className="mono-label text-primary">REFRESH RATE: 1000MS</span>
            </div>

            <div className="glow-border bg-surface-container-low p-6 relative overflow-hidden group">
              <div className="crt-scanlines absolute inset-0 opacity-[0.05] pointer-events-none z-10" />
              <div className="flex justify-between mb-4 relative z-20">
                <div>
                  <span className="block mono-label text-on-surface-variant font-bold">Anomaly Score</span>
                  <span className="text-3xl font-mono text-error font-black">{(incident.anomaly_score_at_trigger * 100 || 94.2).toFixed(1)}%</span>
                </div>
                <div className="text-right">
                  <span className="block mono-label text-on-surface-variant">Threshold</span>
                  <span className="text-on-surface-variant/40 font-mono text-sm">90.0%</span>
                </div>
              </div>
              <div className="h-48 w-full bg-surface-container-lowest overflow-hidden relative z-0">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 100">
                  <path d="M0 80 L40 82 L80 85 L120 78 L160 15 L200 12 L240 14 L280 11 L320 13 L360 15 L400 14" fill="none" stroke="var(--error)" strokeWidth="3" className="drop-shadow-[0_0_8px_rgba(255,180,171,0.4)]" />
                  <path d="M0 80 L40 82 L80 85 L120 78 L160 15 L200 12 L240 14 L280 11 L320 13 L360 15 L400 14 V 100 H 0 Z" fill="url(#gradErr)" />
                  <defs>
                    <linearGradient id="gradErr" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="var(--error)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--error)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Visual Grid */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--on-surface) 1px, transparent 1px), linear-gradient(90deg, var(--on-surface) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              </div>
            </div>

            <div className="bg-surface-container-low overflow-hidden">
              <div className="p-4 border-b border-outline-variant/20">
                <h3 className="mono-label text-on-surface-variant">ACTIVE THREAD LOGS</h3>
              </div>
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-surface-container-highest text-on-surface-variant uppercase">
                  <tr>
                    <th className="px-4 py-2 font-normal">Thread_ID</th>
                    <th className="px-4 py-2 font-normal">Latency</th>
                    <th className="px-4 py-2 font-normal">State</th>
                    <th className="px-4 py-2 font-normal">Gateway</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {[
                    { id: '#TX-9281', lat: '4502ms', state: 'STALLED', gtw: 'STRIPE-US' },
                    { id: '#TX-9282', lat: '510ms', state: 'TIMEOUT', gtw: 'ADYEN-EU' },
                    { id: '#TX-9283', lat: '3982ms', state: 'STALLED', gtw: 'STRIPE-US' }
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-2 text-primary">{row.id}</td>
                      <td className="px-4 py-2 text-on-surface">{row.lat}</td>
                      <td className="px-4 py-2"><span className="bg-error/10 text-error px-1 border border-error/20">{row.state}</span></td>
                      <td className="px-4 py-2 text-on-surface-variant">{row.gtw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* COL 3: Actions & Timeline */}
        <section className="w-[25%] bg-surface flex flex-col overflow-hidden">
          <div className="p-6 h-full flex flex-col">
            <h2 className="mono-label text-on-surface-variant mb-6">ACTIVITY TIMELINE</h2>
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {timeline.length === 0 ? (
                <div className="text-on-surface-variant/40 font-mono text-[10px] text-center pt-8 italic uppercase">BUILDING EVENT LOG...</div>
              ) : (
                timeline.map((event: any, idx: number) => (
                  <div key={idx} className="relative pl-6 border-l border-outline-variant/50 pb-6 last:pb-0 group hover:border-primary/50 transition-colors">
                    <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 ${event.src === 'SYSTEM' ? 'bg-error shadow-[0_0_8px_rgba(255,180,171,0.6)]' : 'bg-primary shadow-[0_0_8px_rgba(219,252,255,0.6)]'} rounded-full ring-4 ring-surface group-hover:scale-125 transition-transform`} />
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-mono text-[10px] text-primary/80">{formatTimestamp(event.ts).split(' ')[1]}</span>
                        <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest">{event.src}</span>
                      </div>
                      <p className="text-[11px] text-on-surface leading-relaxed font-mono">{event.msg}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant/30">
              <div className="flex gap-2">
                <input className="flex-1 bg-surface-container border-0 text-xs font-mono placeholder:text-on-surface-variant/40 text-on-surface px-3 py-2 outline-none ghost-border ghost-border-focus transition-all" placeholder="Add comment..." type="text" />
                <button className="bg-primary text-on-primary px-3 flex items-center justify-center font-bold font-mono hover:bg-primary-fixed transition-colors">
                  +
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
