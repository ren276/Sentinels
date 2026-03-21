'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, CheckCircle2, Search, Cpu, Play } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { formatTimestamp, relativeTime, scoreColor, severityColor } from '@/lib/utils'
import { useWsStore } from '@/store/wsStore'

export default function IncidentsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('all')
  const queryClient = useQueryClient()
  const { rcaUpdates } = useWsStore()

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', filter],
    queryFn: () => apiClient.getIncidents(filter !== 'all' ? { status: filter } : undefined).then(res => res.data),
    refetchInterval: 15_000,
  })

  const ackMutation = useMutation({
    mutationFn: (id: string) => apiClient.acknowledgeAlert(id),
    onSuccess: () => {
      toast.success('Incident Acknowledged')
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
    },
    onError: () => toast.error('Failed to acknowledge incident'),
  })

  const rcaMutation = useMutation({
    mutationFn: (id: string) => apiClient.generateRca(id),
    onSuccess: () => toast.success('RCA Generation Started'),
    onError: () => toast.error('Failed to trigger RCA'),
  })

  // Open / close a drawer for the RCA Streaming Result
  const [activeRcaId, setActiveRcaId] = useState<string | null>(null)

  return (
    <div className="flex h-[100vh]">
      <div className={`p-8 w-full flex-1 max-w-7xl mx-auto space-y-6 overflow-y-auto ${activeRcaId ? 'mr-0' : ''}`}>
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
              INCIDENT RESPONSE
            </h1>
            <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
              TRIAGE AND ROOT CAUSE ANALYSIS
            </p>
          </div>
          
          <div className="flex rounded border overflow-hidden font-mono text-xs" style={{ borderColor: 'var(--border-strong)' }}>
            {['all', 'active', 'acknowledged'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-4 py-1.5 transition-colors uppercase ${filter === f ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-muted hover:text-white'}`}
                style={{ borderLeft: f !== 'all' ? '1px solid var(--border-strong)' : 'none' }}
              >
                {f}
              </button>
            ))}
          </div>
        </motion.div>

        {isLoading ? (
          <div className="py-20 text-center font-mono text-sm text-muted">LOADING INCIDENTS...</div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
            {incidents.map((inc: any) => (
              <motion.div
                key={inc.incident_id}
                variants={staggerItem}
                layout
                className="p-5 rounded border relative group"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                {inc.severity === 'critical' && inc.status === 'active' && <div className="absolute top-0 left-0 w-1 h-full shimmer-bar" />}
                {!(inc.severity === 'critical' && inc.status === 'active') && (
                  <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: severityColor(inc.severity), opacity: inc.status === 'resolved' ? 0.3 : 1 }} />
                )}

                <div className="ml-2 flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded uppercase"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${severityColor(inc.severity)} 15%, transparent)`,
                          color: severityColor(inc.severity),
                        }}>
                        {inc.severity}
                      </span>
                      <span className="font-mono tracking-widest text-primary uppercase">
                        {inc.service_id}
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {formatTimestamp(inc.created_at)} ({relativeTime(inc.created_at)})
                      </span>
                      {inc.status === 'acknowledged' && (
                        <span className="flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-muted">
                          <CheckCircle2 size={12} /> ACKED BY {inc.acknowledged_by}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm font-sans" style={{ color: 'var(--text-secondary)' }}>
                      {inc.summary}
                    </p>
                    
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex items-center gap-2">
                        <Cpu size={14} style={{ color: 'var(--text-muted)' }} />
                        <span className="font-mono text-xs uppercase" style={{ color: 'var(--text-primary)' }}>
                          Score: <span style={{ color: scoreColor(inc.anomaly_score_at_trigger) }}>{inc.anomaly_score_at_trigger.toFixed(4)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {/* Actions */}
                    {inc.status === 'active' && (
                      <button
                        onClick={() => ackMutation.mutate(inc.incident_id)}
                        disabled={ackMutation.isPending}
                        className="px-4 py-1.5 text-xs font-mono tracking-widest uppercase rounded border transition-colors hover:bg-white/10"
                        style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                      >
                        {ackMutation.isPending ? 'ACKING...' : 'ACKNOWLEDGE'}
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setActiveRcaId(inc.incident_id)
                        rcaMutation.mutate(inc.incident_id)
                      }}
                      className="flexItemsCenter gap-2 px-4 py-1.5 text-xs font-mono tracking-widest uppercase rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                    >
                      <ShieldAlert size={14} /> RCA PLAYBOOK
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
            {incidents.length === 0 && (
              <div className="py-20 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
                <p className="font-mono text-sm tracking-widest text-muted">NO INCIDENTS FOUND</p>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Slide-out RCA Panel */}
      <AnimatePresence>
        {activeRcaId && (
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
                <p className="font-mono text-[10px] text-muted uppercase">Incident: {activeRcaId.slice(0,8)}</p>
              </div>
              <button onClick={() => setActiveRcaId(null)} className="p-1 hover:bg-white/10 rounded">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {rcaUpdates[activeRcaId] ? (
                <>
                  <div className="whitespace-pre-wrap">{rcaUpdates[activeRcaId].result}</div>
                  {rcaUpdates[activeRcaId].status === 'streaming' && <span className="inline-block w-2 h-4 ml-1 align-bottom bg-white cursor-blink" />}
                </>
              ) : (
                <div className="flex items-center gap-2 text-muted animate-pulse">
                  <Play size={12} /> INITIALIZING LLM REASONING ENGINE...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
