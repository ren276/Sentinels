'use client'
import { useState, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertCircle, 
  Clock, 
  Filter, 
  ChevronRight, 
  Search,
  Activity,
  Zap,
  Play
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { relativeTime, severityColor } from '@/lib/utils'

export default function IncidentsPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [activeRcaId, setActiveRcaId] = useState<string | null>(null)
  const router = useRouter()

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => apiClient.getIncidents({ 
      status: filter === 'all' ? undefined : filter, 
      limit: 50 
    }).then(res => res.data),
    refetchInterval: 10000,
  })

  const filteredIncidents = incidents.filter((inc: any) => 
    inc.summary.toLowerCase().includes(search.toLowerCase()) ||
    inc.service_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-[100vh]">
      <div className={`p-8 w-full flex-1 max-w-7xl mx-auto space-y-6 overflow-y-auto ${activeRcaId ? 'mr-0' : ''}`}>
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
              INCIDENT RESPONSE
            </h1>
            <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
              DETECTED ANOMALIES & ACTIVE OUTAGES
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={14} />
              <input 
                type="text"
                placeholder="SEARCH INCIDENTS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-black/40 border rounded font-mono text-xs w-64 outline-none focus:ring-1"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--blue)' } as any}
              />
            </div>
            
            <div className="flex bg-black/40 rounded border p-1" style={{ borderColor: 'var(--border-strong)' }}>
              {['all', 'active', 'resolved'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded font-mono text-[10px] uppercase tracking-widest transition-colors ${filter === f ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded border animate-pulse bg-white/5" style={{ borderColor: 'var(--border)' }} />
            ))}
          </div>
        ) : (
          <motion.div 
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredIncidents.map((inc: any) => (
                <motion.div
                  key={inc.incident_id}
                  variants={staggerItem}
                  layout
                  onClick={() => router.push(`/incidents/${inc.incident_id}`)}
                  className={`p-5 rounded border group cursor-pointer transition-all hover:bg-white/[0.02] relative overflow-hidden ${activeRcaId === inc.incident_id ? 'ring-1 ring-blue-500/50' : ''}`}
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: severityColor(inc.severity) }} />
                  
                  <div className="flex justify-between items-start gap-6">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                          style={{ 
                            backgroundColor: `color-mix(in srgb, ${severityColor(inc.severity)} 15%, transparent)`,
                            color: severityColor(inc.severity),
                          }}>
                          {inc.severity}
                        </span>
                        <span className="font-mono text-sm uppercase tracking-widest text-white">{inc.service_id}</span>
                        <span className="flex items-center gap-1 text-[10px] font-mono text-muted">
                          <Clock size={10} /> {relativeTime(inc.created_at)}
                        </span>
                       </div>
                      
                      <p className="text-sm font-light leading-relaxed group-hover:text-white transition-colors" style={{ color: 'var(--text-secondary)' }}>
                        {inc.summary}
                      </p>

                      <div className="flex items-center gap-6 pt-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1">Trigger Score</span>
                          <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                            {inc.anomaly_score_at_trigger?.toFixed(4) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1">Status</span>
                          <span className="font-mono text-[10px] uppercase flex items-center gap-1.5" style={{ color: inc.status === 'active' ? 'var(--red)' : 'var(--emerald)' }}>
                            <span className={`w-1.5 h-1.5 rounded-full ${inc.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                            {inc.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/incidents/${inc.incident_id}`)
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group/btn"
                      >
                        <Zap size={12} className="text-blue-400 group-hover/btn:scale-110 transition-transform" />
                        <span className="font-mono text-[10px] uppercase tracking-widest">ENTER WAR ROOM</span>
                      </button>
                      <ChevronRight className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={16} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredIncidents.length === 0 && (
              <div className="py-20 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
                <AlertCircle className="mx-auto mb-3 opacity-20" size={32} />
                <p className="font-mono text-sm tracking-widest text-muted">NO INCIDENTS FOUND</p>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Slide-out RCA Panel — Optimized to only re-render its content during streaming */}
      <AnimatePresence>
        {activeRcaId && (
          <RcaSlideOut activeRcaId={activeRcaId} onClose={() => setActiveRcaId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function RcaSlideOut({ activeRcaId, onClose }: { activeRcaId: string; onClose: () => void }) {
  // Select only the specific RCA update needed for this component
  const rcaData = useWsStore(state => state.rcaUpdates[activeRcaId])

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[500px] h-full border-l flex flex-col flex-shrink-0 z-50 bg-[#0F0F11]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h3 className="font-mono text-xs font-medium tracking-widest" style={{ color: 'var(--text-primary)' }}>ROOT CAUSE ANALYSIS</h3>
          <p className="font-mono text-[10px] text-muted uppercase">Incident: {activeRcaId.slice(0, 8)}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {rcaData ? (
          <>
            <div className="whitespace-pre-wrap">{rcaData.result}</div>
            {rcaData.status === 'streaming' && <span className="inline-block w-2 h-4 ml-1 align-bottom bg-white cursor-blink" />}
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted animate-pulse">
            <Play size={12} /> INITIALIZING LLM REASONING ENGINE...
          </div>
        )}
      </div>
    </motion.div>
  )
}
