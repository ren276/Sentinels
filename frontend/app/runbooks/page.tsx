'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, AlertTriangle, CheckCircle2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'

export default function RunbooksPage() {
  const { data: runbooks = [], isLoading } = useQuery({
    queryKey: ['runbooks'],
    queryFn: () => apiClient.getRunbooks().then((res) => res.data),
  })

  // Selected runbook for execution modal
  const [selected, setSelected] = useState<any>(null)
  const [dryRun, setDryRun] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<any>(null)

  const executeMutation = useMutation({
    mutationFn: () => apiClient.executeRunbook(selected.id, {
      dry_run: dryRun,
      confirmed: confirmed,
    }),
    onSuccess: (res) => {
      setResult(res.data)
      if (res.data.status === 'executed') toast.success('Runbook executed successfully')
      else if (res.data.status === 'dry_run') toast.info('Dry run completed')
      else if (res.data.status === 'requires_confirmation') toast.error('Confirmation required')
    },
    onError: () => toast.error('Failed to execute runbook'),
  })

  if (isLoading) return <div className="p-8 font-mono text-sm text-muted animate-pulse">LOADING RUNBOOKS...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
          OPERATIONAL RUNBOOKS
        </h1>
        <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
          AUTOMATED MITIGATION PROTOCOLS
        </p>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {runbooks.map((rb: any) => (
          <motion.div
            key={rb.id}
            variants={staggerItem}
            className="p-5 rounded border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded bg-white/5 border border-white/10">
                  <BookOpen size={18} style={{ color: 'var(--blue)' }} />
                </div>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded border"
                  style={{
                    backgroundColor: rb.risk_level === 'high' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    borderColor: rb.risk_level === 'high' ? 'var(--red)' : 'var(--blue)',
                    color: rb.risk_level === 'high' ? 'var(--red)' : 'var(--blue)',
                  }}>
                  {rb.risk_level} RISK
                </span>
              </div>
              <h3 className="font-mono text-sm font-medium uppercase text-white mb-2">{rb.name}</h3>
              <p className="font-sans text-sm text-secondary mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                {rb.description}
              </p>
              
              <div className="mb-6 p-3 rounded font-mono text-xs bg-black/50 border border-white/5" style={{ color: 'var(--text-muted)' }}>
                <span className="text-emerald-500">TRIGGER: </span>{rb.trigger}
              </div>
            </div>

            <button
              onClick={() => {
                setSelected(rb)
                setDryRun(rb.dry_run_default)
                setConfirmed(false)
                setResult(null)
              }}
              className="w-full py-2 font-mono text-xs tracking-widest uppercase rounded border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
            >
              CONFIGURE EXECUTION
            </button>
          </motion.div>
        ))}
      </motion.div>

      {/* Execution Modal */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg p-6 rounded border bg-[#0F0F11] border-[#27272A] shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6 border-b pb-4 border-[#27272A]">
                <div>
                  <h2 className="font-mono text-lg font-medium text-white tracking-wide uppercase">{selected.name}</h2>
                  <p className="font-mono text-[10px] text-muted tracking-widest mt-1 uppercase">Execution Configuration</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 text-muted hover:text-white transition-colors">✕</button>
              </div>

              {!result ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded border border-[#27272A] bg-black/30">
                    <div>
                      <h4 className="font-mono text-sm text-white mb-1">Dry Run Mode</h4>
                      <p className="font-sans text-xs text-muted">Simulate actions without side effects.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                      <div className="w-9 h-5 bg-[#27272A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {selected.risk_level === 'high' && !dryRun && (
                    <div className="p-4 rounded border border-red-500/30 bg-red-500/5 space-y-3">
                      <div className="flex items-center gap-2 text-red-500">
                        <AlertTriangle size={16} />
                        <span className="font-mono text-xs uppercase font-bold tracking-wider">High Risk Action</span>
                      </div>
                      <p className="font-sans text-xs text-red-400">This action requires explicit confirmation to proceed as it may affect production availability.</p>
                      
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="rounded border-red-500/50 bg-black/50 text-red-500" />
                        <span className="font-mono text-xs text-red-200 uppercase">I confirm execution of this runbook</span>
                      </label>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <button onClick={() => setSelected(null)} className="px-4 py-2 font-mono text-xs uppercase text-muted hover:text-white transition-colors">Cancel</button>
                    <button
                      onClick={() => executeMutation.mutate()}
                      disabled={executeMutation.isPending || (selected.risk_level === 'high' && !dryRun && !confirmed)}
                      className="flex items-center gap-2 px-6 py-2 font-mono text-xs font-semibold uppercase tracking-widest rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {executeMutation.isPending ? 'EXECUTING...' : 'EXECUTE'}
                      <Play size={12} fill="currentColor" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-4 rounded border ${result.status === 'executed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'}`}>
                    <div className="flex items-center gap-2 mb-2 font-mono text-xs uppercase tracking-widest font-bold">
                      <CheckCircle2 size={16} /> {result.status}
                    </div>
                    {result.would_execute && (
                      <pre className="mt-4 p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] overflow-x-auto text-muted">
                        {JSON.stringify(result.would_execute, null, 2)}
                      </pre>
                    )}
                    {result.results && (
                      <pre className="mt-4 p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] overflow-x-auto text-muted">
                        {JSON.stringify(result.results, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex justify-end pt-4">
                    <button onClick={() => { setSelected(null); setResult(null) }} className="px-6 py-2 font-mono text-xs uppercase bg-white/10 text-white rounded hover:bg-white/20 transition-colors">Close</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
