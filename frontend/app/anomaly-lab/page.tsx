'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Microscope, AlertTriangle, ChevronRight, Info } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { relativeTime, scoreColor } from '@/lib/utils'
import type { Anomaly, AnomalyExplanation } from '@/types'

function ShapBar({ feature, value, shap_value, direction, maxAbs }: {
  feature: string; value: number; shap_value: number; direction: string; maxAbs: number
}) {
  const barWidth = maxAbs > 0 ? Math.abs(shap_value) / maxAbs * 100 : 0
  const barColor = direction === 'positive' ? 'var(--red)' : 'var(--blue)'

  const formatVal = (f: string, v: number) => {
    if (f.includes('rate') || f.includes('usage')) return `${(v * 100).toFixed(2)}%`
    if (f.includes('latency')) return `${v.toFixed(0)}ms`
    if (f.includes('per_second')) return `${v.toFixed(0)}/s`
    return v.toFixed(3)
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-36 flex-shrink-0">
        <p className="font-mono text-[11px] truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-mono)' }}>
          {feature}
        </p>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-3 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-raised)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded"
            style={{ backgroundColor: barColor, opacity: 0.85 }}
          />
        </div>
        <div className="w-20 text-right flex-shrink-0">
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono)' }}>
            {formatVal(feature, value)}
          </span>
        </div>
        <div className="w-14 text-right flex-shrink-0">
          <span className="font-mono text-[10px]" style={{ color: barColor, fontFamily: 'var(--font-dm-mono)' }}>
            {shap_value > 0 ? '+' : ''}{shap_value.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  )
}

function ExplanationPanel({ anomalyId }: { anomalyId: string }) {
  const { data: explanation, isLoading } = useQuery<AnomalyExplanation>({
    queryKey: ['anomaly-explanation', anomalyId],
    queryFn: () => apiClient.getAnomalyExplanation(anomalyId).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-2 p-4 animate-pulse">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-4 rounded" style={{ backgroundColor: 'var(--bg-raised)', width: `${60 + (i % 4) * 10}%` }} />
        ))}
      </div>
    )
  }

  if (!explanation) return null

  if (!explanation.has_explanation) {
    const fv = explanation.feature_values ?? {}
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4 p-3 rounded border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-raised)' }}>
          <Info size={13} style={{ color: 'var(--amber)' }} />
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            SHAP explanation not available — models need to be trained first. Showing raw feature values.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(fv).map(([k, v]) => (
            <div key={k} className="flex justify-between items-center p-2 rounded" style={{ backgroundColor: 'var(--bg-raised)' }}>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono)' }}>{k}</span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-mono)' }}>{(v as number).toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const maxAbs = Math.max(...explanation.explanation.map(e => Math.abs(e.shap_value)), 0.001)

  return (
    <div className="p-4 space-y-4">
      {/* Score summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'COMBINED', value: explanation.combined_score, color: scoreColor(explanation.combined_score ?? 0) },
          { label: 'IF SCORE', value: explanation.if_score, color: 'var(--amber)' },
          { label: 'LSTM SCORE', value: explanation.lstm_score, color: 'var(--blue)' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded border text-center" style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
            <p className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            <p className="font-mono text-lg font-bold" style={{ color: s.color, fontFamily: 'var(--font-dm-mono)' }}>
              {s.value != null ? s.value.toFixed(3) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Top contributor */}
      {explanation.top_contributor && (
        <div className="flex items-center gap-2 p-3 rounded border" style={{ borderColor: 'var(--red)', backgroundColor: 'color-mix(in srgb, var(--red) 8%, transparent)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--red)' }} />
          <p className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
            Top contributor: <span className="font-bold" style={{ color: 'var(--red)', fontFamily: 'var(--font-dm-mono)' }}>{explanation.top_contributor}</span>
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>FEATURE IMPACT</p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color: 'var(--red)' }}>
            <div className="w-3 h-2 rounded" style={{ backgroundColor: 'var(--red)' }} />+ pushes anomaly score up
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color: 'var(--blue)' }}>
            <div className="w-3 h-2 rounded" style={{ backgroundColor: 'var(--blue)' }} />− pulls score down
          </span>
        </div>
      </div>

      {/* SHAP bars */}
      <div className="space-y-0.5 border rounded p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-base)' }}>
        {explanation.explanation.map((e) => (
          <ShapBar key={e.feature} {...e} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  )
}

function AnomalyRow({ anomaly, isSelected, onSelect }: { anomaly: Anomaly; isSelected: boolean; onSelect: () => void }) {
  const score = anomaly.anomaly_score
  const color = scoreColor(score)

  return (
    <motion.div variants={staggerItem} layout>
      <button
        id={`anomaly-row-${anomaly.anomaly_id}`}
        onClick={onSelect}
        className="w-full text-left p-4 rounded border transition-colors hover:bg-white/5"
        style={{
          backgroundColor: isSelected ? 'var(--bg-raised)' : 'var(--bg-surface)',
          borderColor: isSelected ? 'var(--blue)' : 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded border flex items-center justify-center flex-shrink-0"
              style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
              <span className="font-mono text-xs font-bold" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
                {score.toFixed(2)}
              </span>
            </div>
            <div>
              <p className="font-mono text-sm uppercase font-semibold" style={{ color: 'var(--text-primary)' }}>
                {anomaly.service_id}
              </p>
              <p className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                {anomaly.anomaly_type} · {relativeTime(anomaly.detected_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>IF / LSTM</p>
              <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-mono)' }}>
                {anomaly.if_score.toFixed(3)} / {anomaly.lstm_score.toFixed(3)}
              </p>
            </div>
            <ChevronRight size={14} style={{ color: isSelected ? 'var(--blue)' : 'var(--text-muted)', transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-x border-b rounded-b overflow-hidden"
            style={{ borderColor: 'var(--blue)' }}
          >
            <ExplanationPanel anomalyId={anomaly.anomaly_id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AnomalyLabPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: anomalies = [], isLoading } = useQuery<Anomaly[]>({
    queryKey: ['recent-anomalies'],
    queryFn: () => apiClient.getRecentAnomalies(50).then(r => r.data),
    refetchInterval: 30_000,
  })

  const toggle = (id: string) => setSelectedId(s => s === id ? null : id)

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <h1 className="text-2xl font-mono font-medium tracking-wide mb-1 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          <Microscope size={22} style={{ color: 'var(--blue)' }} />ANOMALY LAB
        </h1>
        <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
          SHAP EXPLAINABILITY · FEATURE IMPORTANCE · SCORE BREAKDOWN
        </p>
      </motion.div>

      <div className="p-4 rounded border font-mono text-xs" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--blue)' }}>ℹ</span>
        {' '}Click any anomaly to expand its SHAP explanation. Positive values (red) push the anomaly score up. Negative values (blue) are normal indicators. SHAP requires a trained Isolation Forest model.
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded border animate-pulse" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }} />
          ))}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-2">
          {anomalies.map((a: Anomaly) => (
            <AnomalyRow
              key={a.anomaly_id}
              anomaly={a}
              isSelected={selectedId === a.anomaly_id}
              onSelect={() => toggle(a.anomaly_id)}
            />
          ))}
          {anomalies.length === 0 && (
            <div className="py-20 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
              <Microscope size={32} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <p className="font-mono text-sm tracking-widest" style={{ color: 'var(--text-muted)' }}>NO ANOMALIES DETECTED</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
