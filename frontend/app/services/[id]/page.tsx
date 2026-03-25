'use client'
import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { apiClient } from '@/lib/api'
import { fadeUp } from '@/lib/animations'
import { formatTimestamp } from '@/lib/utils'
import { AlertTriangle, Clock, Cpu, HardDrive } from 'lucide-react'

// Override recharts default styles via css or strictly passed props
const CHART_THEME = {
  grid: 'rgba(255,255,255,0.05)',
  text: 'var(--text-muted)',
  tooltipBg: 'var(--bg-raised)',
  tooltipBorder: 'var(--border-strong)',
}

export default function ServiceDetailPage() {
  const { id } = useParams()
  const [windowMins, setWindowMins] = useState(60)

  const { data: service } = useQuery({
    queryKey: ['service', id],
    queryFn: () => apiClient.getService(id as string).then(res => res.data),
  })

  // We request 'all' metrics for the service so we get everything at once
  const { data: metrics = [] } = useQuery({
    queryKey: ['service', id, 'metrics', windowMins],
    queryFn: () => apiClient.getServiceMetrics(id as string, windowMins, 'all').then(res => res.data),
    refetchInterval: 30000,
  })

  // Format data for charts: group by timestamp, flatten metrics into columns
  const chartData = useMemo(() => {
    if (!metrics.length) return []
    const grouped = metrics.reduce((acc: any, curr: any) => {
      const ts = formatTimestamp(curr.timestamp)
      if (!acc[ts]) acc[ts] = { time: ts, original_ts: curr.timestamp }
      acc[ts][curr.metric_name] = curr.value
      return acc
    }, {})
    // Sort by time
    return Object.values(grouped).sort((a: any, b: any) => new Date(a.original_ts).getTime() - new Date(b.original_ts).getTime())
  }, [metrics])

  if (!service) return <div className="p-8 animate-pulse text-muted">LOADING DATA_LINK...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded border flex flex-shrink-0 items-center justify-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)' }}>
            <span className={`w-3 h-3 rounded-full dot-${service.health_status}`} />
          </div>
          <div>
            <h1 className="text-2xl font-mono font-medium tracking-wide uppercase text-white mb-1">
              {service.name}
            </h1>
            <div className="flex items-center gap-3 font-mono text-xs uppercase" style={{ color: 'var(--text-muted)' }}>
              <span>ID: {service.service_id}</span>
              <span>•</span>
              <span>VER: {service.version}</span>
              <span>•</span>
              <span>ENV: {service.environment}</span>
            </div>
          </div>
        </div>
        
        {/* Time window toggles */}
        <div className="flex rounded border overflow-hidden font-mono text-xs" style={{ borderColor: 'var(--border-strong)' }}>
          {[15, 60, 360, 1440].map((mins) => {
            const active = windowMins === mins
            const label = mins < 60 ? `${mins}M` : mins === 60 ? '1H' : mins === 360 ? '6H' : '24H'
            return (
              <button
                key={mins}
                onClick={() => setWindowMins(mins)}
                className={`px-4 py-1.5 transition-colors ${active ? 'bg-blue-600 text-white' : 'hover:bg-white/5 text-muted hover:text-white'}`}
                style={{ borderLeft: mins !== 15 ? '1px solid var(--border-strong)' : 'none' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* Metrics Layout in Grid */}
      <div className="grid grid-cols-2 gap-6">
        <TelemetryChart 
          title="CPU ALLOCATION (%)" 
          data={chartData} 
          dataKey="cpu_usage" 
          color="var(--blue)" 
          icon={Cpu} 
          format={(v: number) => (v * 100).toFixed(1) + '%'} 
        />
        <TelemetryChart 
          title="MEMORY USAGE (%)" 
          data={chartData} 
          dataKey="mem_usage" 
          color="var(--emerald)" 
          icon={HardDrive} 
          format={(v: number) => (v * 100).toFixed(1) + '%'} 
        />
        <TelemetryChart 
          title="95TH PERCENTILE LATENCY" 
          data={chartData} 
          dataKey="p95_latency_ms" 
          color="var(--amber)" 
          icon={Clock} 
          format={(v: number) => v?.toFixed(0) + 'ms'} 
        />
        <TelemetryChart 
          title="ERROR RATE THRESHOLD" 
          data={chartData} 
          dataKey="error_rate" 
          color="var(--red)" 
          icon={AlertTriangle} 
          format={(v: number) => (v * 100).toFixed(2) + '%'} 
        />
      </div>
    </div>
  )
}

function TelemetryChart({ title, data, dataKey, color, icon: Icon, format }: any) {
  // Simple custom tooltip for aesthetic
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 border rounded font-mono text-xs" style={{ backgroundColor: CHART_THEME.tooltipBg, borderColor: CHART_THEME.tooltipBorder }}>
          <p className="mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-white">
            <span style={{ color }}>{dataKey.toUpperCase()}</span>:{' '}
            {format(payload[0].value ?? 0)}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="p-5 rounded border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-6">
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
        <h3 className="font-mono text-xs font-semibold tracking-[0.1em] text-white">
          {title}
        </h3>
      </div>
      <div className="h-48 w-full">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center font-mono text-xs text-muted-foreground">
            AWAITING TELEMETRY...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_THEME.grid} />
              <XAxis 
                dataKey="time" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: CHART_THEME.text, fontFamily: 'var(--font-dm-mono)' }} 
                minTickGap={30}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: CHART_THEME.text, fontFamily: 'var(--font-dm-mono)' }} 
                tickFormatter={format}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Line 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color} 
                strokeWidth={2} 
                dot={false} 
                activeDot={{ r: 4, fill: color, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
                animationDuration={1500}
                animationEasing="ease-out"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
