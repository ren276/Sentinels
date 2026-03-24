'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Plus, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { relativeTime } from '@/lib/utils'
import type { Slo } from '@/types'

function HealthRing({ pct }: { pct: number }) {
  const size = 56, r = 22, stroke = 4
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 99 ? 'var(--emerald)' : pct >= 95 ? 'var(--amber)' : 'var(--red)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-raised)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{ fill: color, fontSize: 10, fontFamily: 'var(--font-dm-mono)', fontWeight: 600 }}>
        {pct.toFixed(1)}%
      </text>
    </svg>
  )
}

function SloCard({ slo }: { slo: Slo }) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const { data: history = [] } = useQuery({
    queryKey: ['slo-history', slo.slo_id],
    queryFn: () => apiClient.getSloHistory(slo.slo_id, 7).then(r => r.data),
    enabled: expanded,
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteSlo(slo.slo_id),
    onSuccess: () => {
      toast.success('SLO deactivated')
      queryClient.invalidateQueries({ queryKey: ['slos'] })
    },
  })

  const pct = slo.compliance_pct ?? 100
  const budget = slo.error_budget_remaining_pct ?? 100
  const budgetColor = budget >= 50 ? 'var(--emerald)' : budget >= 15 ? 'var(--amber)' : 'var(--red)'

  const metricLabel = (() => {
    const op = slo.comparison === 'less_than' ? '<' : '>'
    if (slo.metric_name === 'error_rate') return `error_rate ${op} ${(slo.target_value * 100).toFixed(2)}%`
    if (slo.metric_name === 'p95_latency_ms') return `p95_latency ${op} ${slo.target_value}ms`
    if (slo.metric_name === 'cpu_usage') return `cpu_usage ${op} ${(slo.target_value * 100).toFixed(0)}%`
    return `${slo.metric_name} ${op} ${slo.target_value}`
  })()

  return (
    <motion.div variants={staggerItem} layout className="border rounded overflow-hidden"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface)' }}>
      <div className="p-4 flex items-center gap-4">
        <HealthRing pct={pct} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-semibold uppercase" style={{ color: 'var(--text-primary)' }}>{slo.name}</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-muted)' }}>
              {slo.service_id}
            </span>
          </div>
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono)' }}>{metricLabel}</p>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Error Budget</p>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-raised)' }}>
                  <div className="h-full rounded-full" style={{ width: `${budget}%`, backgroundColor: budgetColor }} />
                </div>
                <span className="font-mono text-[11px]" style={{ color: budgetColor, fontFamily: 'var(--font-dm-mono)' }}>{budget.toFixed(1)}%</span>
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Window</p>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{slo.window_days}d</span>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Budget Used</p>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-mono)' }}>
                {Math.round(slo.error_budget_consumed_minutes ?? 0)}m
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button id={`del-slo-${slo.slo_id}`} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
            className="p-1.5 rounded hover:bg-red-500/10 transition-colors" title="Deactivate">
            <Trash2 size={13} style={{ color: 'var(--red)' }} />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded hover:bg-white/10 transition-colors">
            {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ borderTop: '1px solid var(--border)' }}>
            <div className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>COMPLIANCE HISTORY (7 DAYS)</p>
              {history.length === 0 ? (
                <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>No snapshots yet — computed every 15 min.</p>
              ) : (
                <div className="flex items-end gap-1 h-16">
                  {[...history].reverse().slice(0, 48).map((snap: any, i: number) => {
                    const h = Math.max(4, (snap.compliance_pct / 100) * 64)
                    const c = snap.compliance_pct >= 99 ? 'var(--emerald)' : snap.compliance_pct >= 95 ? 'var(--amber)' : 'var(--red)'
                    return <div key={i} title={`${snap.compliance_pct.toFixed(2)}%`}
                      style={{ height: h, backgroundColor: c, width: 6, borderRadius: 2, flexShrink: 0 }} />
                  })}
                </div>
              )}
              <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Created by {slo.created_by} · {relativeTime(slo.created_at)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function CreateSloModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ service_id: '', name: '', metric_name: 'error_rate', target_value: '0.01', comparison: 'less_than', window_days: '30' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const createMutation = useMutation({
    mutationFn: () => apiClient.createSlo({ ...form, target_value: parseFloat(form.target_value), window_days: parseInt(form.window_days) }),
    onSuccess: () => { toast.success('SLO created'); queryClient.invalidateQueries({ queryKey: ['slos'] }); onClose() },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-[420px] rounded border p-6 space-y-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm font-medium tracking-widest uppercase" style={{ color: 'var(--text-primary)' }}>CREATE SLO</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        {[{ k: 'service_id', l: 'Service ID', p: 'api-gateway' }, { k: 'name', l: 'SLO Name', p: 'Error Rate SLO' }].map(f => (
          <div key={f.k}>
            <label className="block font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{f.l}</label>
            <input id={`slo-${f.k}`} value={(form as any)[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.p}
              className="w-full px-3 py-1.5 rounded border bg-transparent font-mono text-xs outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          {[['metric_name', 'Metric', ['error_rate','p95_latency_ms','cpu_usage','mem_usage']],
            ['comparison', 'Comparison', ['less_than','greater_than']]].map(([k, l, opts]) => (
            <div key={k as string}>
              <label className="block font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{l as string}</label>
              <select id={`slo-${k}`} value={(form as any)[k as string]} onChange={e => set(k as string, e.target.value)}
                className="w-full px-3 py-1.5 rounded border font-mono text-xs outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-raised)' }}>
                {(opts as string[]).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {[['target_value','Target Value','0.01'],['window_days','Window (days)','30']].map(([k,l,p]) => (
            <div key={k}>
              <label className="block font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{l}</label>
              <input id={`slo-${k}`} value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={p}
                className="w-full px-3 py-1.5 rounded border bg-transparent font-mono text-xs outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-1.5 font-mono text-xs uppercase rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
          <button id="slo-submit" onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.service_id || !form.name}
            className="flex-1 py-1.5 font-mono text-xs uppercase rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {createMutation.isPending ? 'CREATING...' : 'CREATE SLO'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function SlosPage() {
  const [showModal, setShowModal] = useState(false)
  const { data: slos = [], isLoading } = useQuery<Slo[]>({
    queryKey: ['slos'],
    queryFn: () => apiClient.getSlos().then(r => r.data),
    refetchInterval: 60_000,
  })
  const healthy = slos.filter((s: Slo) => (s.compliance_pct ?? 100) >= 99).length
  const atRisk = slos.filter((s: Slo) => { const p = s.compliance_pct ?? 100; return p >= 95 && p < 99 }).length
  const breached = slos.filter((s: Slo) => (s.compliance_pct ?? 100) < 95).length

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 relative z-10">
      <div className="fixed inset-0 dot-grid opacity-[0.03] pointer-events-none z-[-1]" />
      
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-mono font-black tracking-tighter text-on-surface mb-1 flex items-center gap-3">
            <Target size={28} className="text-primary" />SLO STATUS
          </h1>
          <p className="text-[10px] font-mono tracking-[0.3em] text-on-surface-variant uppercase">SERVICE_LEVEL_OBJECTIVES // COMPLIANCE_CORE</p>
        </div>
        <button id="btn-create-slo" onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 border border-primary/30 font-mono text-[10px] uppercase tracking-[0.2em] bg-primary/5 text-primary hover:bg-primary/10 transition-all font-bold">
          <Plus size={14} /> NEW_OBJECTIVE
        </button>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-3 gap-6">
        {[
          { label: 'HEALTHY_NODES', value: healthy, color: 'text-primary', sub: '>= 99.9%' },
          { label: 'AT_RISK_NODES', value: atRisk, color: 'text-amber-400', sub: '95.0% - 99.8%' },
          { label: 'BREACH_DETECTED', value: breached, color: 'text-error', sub: '< 95.0%' },
        ].map(s => (
          <motion.div key={s.label} variants={staggerItem} className="p-6 bg-surface-container-low glow-border flex flex-col justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-4 font-bold">{s.label}</p>
              <p className={`font-mono text-4xl font-black ${s.color}`}>{s.value.toString().padStart(2, '0')}</p>
            </div>
            <p className="font-mono text-[8px] text-on-surface-variant/40 mt-4 tracking-widest">{s.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low" />)}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
          {slos.map((slo: Slo) => <SloCard key={slo.slo_id} slo={slo} />)}
          {slos.length === 0 && (
            <div className="py-32 text-center border-2 border-dashed border-outline-variant/10">
              <Target size={48} className="mx-auto mb-6 text-on-surface-variant/20" />
              <p className="font-mono text-sm tracking-[0.4em] text-on-surface-variant uppercase">NO_ACTIVE_CORE_SLOS</p>
              <button onClick={() => setShowModal(true)} className="mt-8 text-primary font-mono text-[10px] uppercase tracking-widest hover:underline underline-offset-8">Initialize First Objective</button>
            </div>
          )}
        </motion.div>
      )}
      <AnimatePresence>{showModal && <CreateSloModal onClose={() => setShowModal(false)} />}</AnimatePresence>
    </div>
  )
}
