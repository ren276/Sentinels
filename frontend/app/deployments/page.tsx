'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Rocket, Plus, X, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { relativeTime, formatTimestamp } from '@/lib/utils'
import type { Deployment } from '@/types'

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  success: { color: 'var(--emerald)', icon: CheckCircle2 },
  failed:  { color: 'var(--red)',     icon: AlertTriangle },
  rollback:{ color: 'var(--amber)',   icon: RotateCcw },
}

function DeployModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: services = [] } = useQuery({ 
    queryKey: ['services'], 
    queryFn: () => apiClient.getServices().then(r => r.data) 
  })
  
  const [form, setForm] = useState({
    service_id: '', version: '', previous_version: '',
    deployed_by: '', environment: 'production',
    status: 'success', commit_hash: '', deploy_notes: '',
  })
  
  // Set default service_id once services load
  useEffect(() => {
    if (services.length > 0 && !form.service_id) {
       setForm(f => ({ ...f, service_id: services[0].service_id }))
    }
  }, [services])

  const createMutation = useMutation({
    mutationFn: () => apiClient.createDeployment(form),
    onSuccess: (res) => {
      const count = res.data.correlated_anomalies
      toast.success(`Deployment registered${count > 0 ? ` · ${count} correlated anomalies found` : ''}`)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      onClose()
    },
    onError: (e: any) => {
       const detail = e?.response?.data?.detail
       toast.error(typeof detail === 'string' ? detail : 'Failed to register deployment')
    },
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-[520px] rounded-xl border p-8 space-y-6 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--text-primary)' }}>
              REGISTER DEPLOYMENT
            </h2>
            <p className="text-[10px] font-mono text-muted uppercase mt-0.5">Link deployment events with system anomalies</p>
          </div>
          <button onClick={onClose} className="p-2 transition-colors hover:bg-white/5 rounded-full text-muted"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5 opacity-50" style={{ color: 'var(--text-primary)' }}>Service</label>
            <select
              id="deploy-service"
              value={form.service_id}
              onChange={e => set('service_id', e.target.value)}
              className="w-full px-4 py-2 rounded border bg-black/40 font-mono text-xs outline-none focus:ring-1"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--blue)' } as any}
            >
              {services.map((s: any) => (
                <option key={s.service_id} value={s.service_id} className="bg-zinc-900">{s.name} ({s.service_id})</option>
              ))}
            </select>
          </div>

          {[
            { key: 'version', label: 'Version', placeholder: 'e.g. v2.1.0' },
            { key: 'previous_version', label: 'Prev Version', placeholder: 'e.g. v2.0.9' },
            { key: 'deployed_by', label: 'Deployed By', placeholder: 'Name or CI Tool' },
            { key: 'commit_hash', label: 'Commit Hash', placeholder: 'Short hash' },
          ].map(field => (
            <div key={field.key}>
              <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5 opacity-50" style={{ color: 'var(--text-primary)' }}>
                {field.label}
              </label>
              <input
                id={`deploy-${field.key}`}
                value={(form as any)[field.key]}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-4 py-2 rounded border bg-black/40 font-mono text-xs outline-none focus:ring-1"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--blue)' } as any}
              />
            </div>
          ))}

          <div>
            <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5 opacity-50" style={{ color: 'var(--text-primary)' }}>Status</label>
            <select
              id="deploy-status"
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="w-full px-4 py-2 rounded border bg-black/40 font-mono text-xs outline-none focus:ring-1"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--blue)' } as any}
            >
              <option value="success" className="bg-zinc-900 text-emerald-500">Success</option>
              <option value="failed" className="bg-zinc-900 text-red-500">Failed</option>
              <option value="rollback" className="bg-zinc-900 text-amber-500">Rollback</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-1.5 opacity-50" style={{ color: 'var(--text-primary)' }}>Release Notes</label>
          <textarea
            id="deploy-notes"
            value={form.deploy_notes}
            onChange={e => set('deploy_notes', e.target.value)}
            rows={3}
            placeholder="Briefly describe what changed..."
            className="w-full px-4 py-2 rounded border bg-black/40 font-mono text-xs outline-none resize-none focus:ring-1"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--blue)' } as any}
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button onClick={onClose} className="flex-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest rounded border transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button
            id="deploy-submit"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.service_id || !form.version || !form.deployed_by}
            className="flex-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-widest rounded bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:grayscale"
          >
            {createMutation.isPending ? 'REGISTERING...' : 'REGISTER DEPLOYMENT'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function DeploymentsPage() {
  const [showModal, setShowModal] = useState(false)

  const { data: deployments = [], isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => apiClient.getDeployments(100).then(r => r.data),
    refetchInterval: 30_000,
  })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-medium tracking-wide mb-1 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Rocket size={22} style={{ color: 'var(--blue)' }} />
            DEPLOYMENTS
          </h1>
          <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
            EVENT CORRELATION &amp; ANOMALY IMPACT ANALYSIS
          </p>
        </div>
        <button
          id="btn-register-deployment"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded border font-mono text-xs uppercase tracking-widest bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
          style={{ borderColor: 'var(--blue)' }}
        >
          <Plus size={14} /> REGISTER DEPLOYMENT
        </button>
      </motion.div>

      {/* Stats bar */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-3 gap-4">
        {[
          { label: 'TOTAL', value: deployments.length, color: 'var(--text-primary)' },
          { label: 'SUCCEEDED', value: deployments.filter((d: Deployment) => d.status === 'success').length, color: 'var(--emerald)' },
          { label: 'WITH ANOMALIES', value: deployments.filter((d: Deployment) => (d.correlated_anomaly_count ?? 0) > 0).length, color: 'var(--amber)' },
        ].map(s => (
          <div key={s.label} className="p-4 rounded border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="font-mono text-2xl font-bold" style={{ color: s.color, fontFamily: 'var(--font-dm-mono)' }}>{s.value}</p>
          </div>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded border animate-pulse" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }} />
          ))}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {deployments.map((dep: Deployment) => {
            const cfg = STATUS_CONFIG[dep.status] ?? STATUS_CONFIG.success
            const StatusIcon = cfg.icon
            const hasAnomalies = (dep.correlated_anomaly_count ?? 0) > 0

            return (
              <motion.div
                key={dep.deployment_id}
                variants={staggerItem}
                layout
                className="p-4 rounded border flex items-center gap-4 relative"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: hasAnomalies ? 'var(--amber)' : 'var(--border)' }}
              >
                <div className="w-1 h-full absolute left-0 top-0 rounded-l" style={{ backgroundColor: cfg.color }} />
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <StatusIcon size={14} style={{ color: cfg.color }} />
                    <span className="font-mono text-sm uppercase font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {dep.service_name ?? dep.service_id}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                      {dep.previous_version ? `${dep.previous_version} → ${dep.version}` : dep.version}
                    </span>
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: `color-mix(in srgb, ${cfg.color} 15%, transparent)` }}>
                      {dep.status}
                    </span>
                    {hasAnomalies && (
                      <span className="flex items-center gap-1 font-mono text-[10px] uppercase px-2 py-0.5 rounded" style={{ color: 'var(--amber)', backgroundColor: 'color-mix(in srgb, var(--amber) 15%, transparent)' }}>
                        <AlertTriangle size={10} /> {dep.correlated_anomaly_count} ANOMALIES
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>by {dep.deployed_by}</span>
                    {dep.commit_hash && <span className="font-mono" style={{ fontFamily: 'var(--font-dm-mono)' }}>#{dep.commit_hash.slice(0, 7)}</span>}
                    <span>{dep.environment}</span>
                    {dep.deploy_notes && <span className="truncate max-w-[200px]">{dep.deploy_notes}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono)' }}>
                    {formatTimestamp(dep.deployed_at)}
                  </p>
                  <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {relativeTime(dep.deployed_at)}
                  </p>
                </div>
              </motion.div>
            )
          })}
          {deployments.length === 0 && (
            <div className="py-20 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
              <p className="font-mono text-sm tracking-widest text-muted">NO DEPLOYMENTS REGISTERED</p>
              <p className="font-mono text-xs mt-2 text-muted">Register a deployment to begin correlating with anomalies.</p>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>{showModal && <DeployModal onClose={() => setShowModal(false)} />}</AnimatePresence>
    </div>
  )
}
