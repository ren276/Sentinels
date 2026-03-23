'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Download, Play, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { formatTimestamp, relativeTime, severityColor } from '@/lib/utils'
import type { Incident, PostMortemStatus } from '@/types'

function PostMortemPanel({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: pm } = useQuery<PostMortemStatus>({
    queryKey: ['postmortem', incident.incident_id],
    queryFn: () => apiClient.getPostmortem(incident.incident_id).then(r => r.data),
    enabled: open,
    refetchInterval: (query) => {
      const data = query.state.data as PostMortemStatus | undefined
      return data?.status === 'generating' ? 2000 : false
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => apiClient.generatePostmortem(incident.incident_id),
    onSuccess: () => {
      toast.success('Post-mortem generation started')
      queryClient.invalidateQueries({ queryKey: ['postmortem', incident.incident_id] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed to generate post-mortem'),
  })

  const handleExport = async () => {
    try {
      const res = await apiClient.exportPostmortem(incident.incident_id)
      const blob = new Blob([res.data], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `postmortem-${incident.incident_id.slice(0, 8)}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  const statusIcon = pm?.status === 'done'
    ? <CheckCircle2 size={12} style={{ color: 'var(--emerald)' }} />
    : pm?.status === 'generating'
    ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Play size={12} style={{ color: 'var(--amber)' }} /></motion.div>
    : pm?.status === 'error'
    ? <AlertCircle size={12} style={{ color: 'var(--red)' }} />
    : null

  return (
    <motion.div
      variants={staggerItem}
      layout
      className="border rounded overflow-hidden"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <div
            className="w-1 h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: severityColor(incident.severity), opacity: incident.status === 'resolved' ? 1 : 0.4 }}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase font-semibold" style={{ color: severityColor(incident.severity) }}>
                {incident.severity}
              </span>
              <span className="font-mono text-sm uppercase text-primary">{incident.service_id}</span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                {relativeTime(incident.created_at)}
              </span>
            </div>
            <p className="font-sans text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {incident.summary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pl-4">
          {statusIcon && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
              {statusIcon} {pm?.status}
            </span>
          )}
          {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="p-4 space-y-4">
              {/* Action bar */}
              <div className="flex items-center gap-3">
                {incident.status !== 'resolved' && (
                  <p className="font-mono text-xs text-muted">Post-mortems require a resolved incident.</p>
                )}
                {incident.status === 'resolved' && (
                  <>
                    <button
                      id={`gen-pm-${incident.incident_id}`}
                      onClick={() => generateMutation.mutate()}
                      disabled={generateMutation.isPending || pm?.status === 'generating'}
                      className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest rounded border transition-colors hover:bg-white/10 disabled:opacity-50"
                      style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                    >
                      {pm?.status === 'generating' ? 'GENERATING...' : pm?.status === 'done' ? 'REGENERATE' : 'GENERATE POST-MORTEM'}
                    </button>
                    {pm?.status === 'done' && (
                      <button
                        id={`export-pm-${incident.incident_id}`}
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono uppercase tracking-widest rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                      >
                        <Download size={12} /> EXPORT .MD
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Content area */}
              {pm?.status === 'generating' && !pm.content && (
                <div className="space-y-2 animate-pulse">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-3 rounded" style={{ backgroundColor: 'var(--bg-raised)', width: `${70 + i * 5}%` }} />
                  ))}
                </div>
              )}

              {pm?.content && (
                <pre
                  className="font-mono text-xs leading-relaxed whitespace-pre-wrap p-4 rounded border overflow-auto max-h-[500px]"
                  style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {pm.content}
                  {pm.status === 'generating' && <span className="inline-block w-2 h-3 ml-1 bg-white cursor-blink align-bottom" />}
                </pre>
              )}

              {!pm?.content && pm?.status === 'not_started' && (
                <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  No post-mortem generated yet. Click GENERATE to create one using Ollama.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function PostMortemsPage() {
  const [filter, setFilter] = useState<'all' | 'resolved'>('resolved')

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ['incidents-for-pm', filter],
    queryFn: () => apiClient.getIncidents(
      filter === 'resolved' ? { status: 'resolved', limit: 100 } : { limit: 100 }
    ).then(r => r.data),
    refetchInterval: 30_000,
  })

  const resolvedOnly = incidents.filter((i: Incident) => i.status === 'resolved')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-medium tracking-wide mb-1 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <FileText size={22} style={{ color: 'var(--blue)' }} />
            POST-MORTEMS
          </h1>
          <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
            AI-GENERATED INCIDENT ANALYSIS
          </p>
        </div>
        <div className="flex rounded border overflow-hidden font-mono text-xs" style={{ borderColor: 'var(--border-strong)' }}>
          {(['resolved', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 transition-colors uppercase ${filter === f ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-muted hover:text-white'}`}
              style={{ borderLeft: f !== 'resolved' ? '1px solid var(--border-strong)' : 'none' }}
            >
              {f === 'resolved' ? 'Resolved Only' : 'All Incidents'}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="p-4 rounded border font-mono text-xs" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--blue)' }}>ℹ</span>
        {' '}Post-mortems are AI-generated using Ollama (llama3.2:3b). They combine RCA, timeline, and metric data into a structured document. Only resolved incidents can have post-mortems generated.
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="h-full animate-pulse" style={{ backgroundColor: 'var(--bg-raised)' }} />
            </div>
          ))}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {resolvedOnly.map((inc: Incident) => (
            <PostMortemPanel key={inc.incident_id} incident={inc} />
          ))}
          {resolvedOnly.length === 0 && (
            <div className="py-20 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
              <p className="font-mono text-sm tracking-widest text-muted">NO RESOLVED INCIDENTS FOUND</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
