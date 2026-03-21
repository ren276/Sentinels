'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Area, ComposedChart, ResponsiveContainer, Tooltip } from 'recharts'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { formatTimestamp, formatValue } from '@/lib/utils'

const CHART_THEME = {
  grid: 'rgba(255,255,255,0.05)',
  text: 'var(--text-muted)',
}

export default function ForecastsPage() {
  const { data: forecasts = [], isLoading } = useQuery({
    queryKey: ['forecasts'],
    queryFn: () => apiClient.getForecasts().then((res) => res.data),
  })

  // Group forecasts by service and metric
  const groupedForecasts = useMemo(() => {
    const groups: any = {}
    forecasts.forEach((f: any) => {
      const key = `${f.service_id}-${f.metric_name}`
      if (!groups[key]) {
        groups[key] = {
          serviceId: f.service_id,
          metricName: f.metric_name,
          modelUsed: f.model_used,
          mae: f.mae,
          breachThreshold: f.breach_threshold,
          willBreach: false,
          data: []
        }
      }
      if (f.will_breach) groups[key].willBreach = true
      groups[key].data.push({
        time: formatTimestamp(f.predicted_at),
        original_ts: f.predicted_at,
        value: f.predicted_value,
        lower: f.confidence_lower,
        upper: f.confidence_upper,
        isBreach: f.predicted_value > f.breach_threshold
      })
    })

    // Sort data points inside each group
    Object.values(groups).forEach((g: any) => {
      g.data.sort((a: any, b: any) => new Date(a.original_ts).getTime() - new Date(b.original_ts).getTime())
    })

    return Object.values(groups)
  }, [forecasts])

  if (isLoading) return <div className="p-8 font-mono text-sm text-muted animate-pulse">LOADING PROJECTIONS...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
          PREDICTIVE FORECASTS
        </h1>
        <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
          30-MINUTE HORIZON CAPACITY PLANNING
        </p>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-6">
        {groupedForecasts.map((group: any) => (
          <motion.div
            key={`${group.serviceId}-${group.metricName}`}
            variants={staggerItem}
            className="p-5 rounded border"
            style={{
              backgroundColor: group.willBreach ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-surface)',
              borderColor: group.willBreach ? 'var(--red)' : 'var(--border)'
            }}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-mono text-sm uppercase tracking-wide text-white">{group.serviceId}</h3>
                <p className="font-mono text-[10px] uppercase text-muted tracking-widest">{group.metricName} • {group.modelUsed}</p>
              </div>
              {group.willBreach ? (
                <div className="flex justify-center items-center px-2 py-1 rounded bg-red-500/20 text-red-500 font-mono text-[10px] tracking-widest overflow-hidden relative">
                  <AlertTriangle size={12} className="mr-1" /> BREACH PREDICTED
                  <div className="absolute inset-0 shimmer-bar z-[-1] opacity-20" />
                </div>
              ) : (
                <div className="flex justify-center items-center px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 font-mono text-[10px] tracking-widest">
                  STABLE TRAJECTORY
                </div>
              )}
            </div>

            <div className="h-48 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={group.data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
                  <XAxis 
                    dataKey="time"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: CHART_THEME.text, fontFamily: 'var(--font-dm-mono)' }}
                    minTickGap={20}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: CHART_THEME.text, fontFamily: 'var(--font-dm-mono)' }} 
                    domain={['auto', 'auto']}
                  />
                  {/* Threshold Line */}
                  <Line type="step" dataKey={() => group.breachThreshold} stroke="var(--red)" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  
                  {/* Confidence Interval Area */}
                  <Area type="monotone" dataKey="upper" stroke="none" fill="var(--blue)" fillOpacity={0.1} isAnimationActive={false} />
                  <Area type="monotone" dataKey="lower" stroke="none" fill="var(--bg-surface)" fillOpacity={1} isAnimationActive={false} />
                  
                  {/* Predicted Line */}
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="var(--blue)" 
                    strokeWidth={2} 
                    dot={false}
                    animationDuration={2000}
                    animationEasing="linear"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 flex justify-between font-mono text-[10px] text-muted">
              <span>Threshold: {formatValue(group.metricName, group.breachThreshold)}</span>
              <span>MAE: {group.mae.toFixed(4)}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

import { useMemo } from 'react'
