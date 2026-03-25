'use client'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { useAuthStore } from '@/store/authStore'
import { Shield, Target, Database, Activity, Filter, ArrowUp, ArrowDown, Bell, Globe, ShieldCheck } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { ServiceHealthGrid } from '@/components/dashboard/ServiceHealthGrid'

export default function OverviewPage() {
  const [isReal, setIsReal] = useState(true)
  const [time, setTime] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState(30)
  
  // API Connections
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => apiClient.getServices().then(res => res.data?.data || res.data || []), refetchInterval: 30000 })
  const { data: activeIncidents = [] } = useQuery({ queryKey: ['incidents', 'active'], queryFn: () => apiClient.getIncidents({ status: 'active', limit: 10 }).then(res => res.data?.data || res.data || []), refetchInterval: 10000 })
  const { data: systemMetricsData } = useQuery({ queryKey: ['metrics', 'system-host'], queryFn: () => apiClient.getServiceMetrics('system-host', 60, 'all').then(res => res.data?.data || res.data || []), refetchInterval: 30000 })

  const { latestAnomalies, connected, liveMetrics } = useWsStore()
  const { user } = useAuthStore()

  useEffect(() => {
    setMounted(true)
    setTime(new Date())
    const int = setInterval(() => {
      setTime(new Date())
      setRefreshCountdown(v => (v <= 1 ? 30 : v - 1))
    }, 1000)
    return () => clearInterval(int)
  }, [])

  // Process system-host metrics
  const systemMetrics = Array.isArray(systemMetricsData) ? systemMetricsData : []
  const currentMetrics = useMemo(() => {
    const latest = systemMetrics.length > 0 ? systemMetrics[systemMetrics.length - 1] : { cpu_usage: 0, mem_usage: 0, network_tx_bytes: 0, network_rx_bytes: 0 }
    const sparklines = systemMetrics.slice(-30).map(m => ({
      cpu: m.cpu_usage || 0,
      mem: m.mem_usage || 0,
      net: ((m.network_rx_bytes || 0) + (m.network_tx_bytes || 0)) / (1024 * 1024)
    }))
    const paddedSparklines = sparklines.length > 0 ? sparklines : Array.from({length: 30}).map(() => ({ cpu: 0, mem: 0, net: 0 }))
    return {
      cpu: latest.cpu_usage || 0,
      mem: latest.mem_usage || 0,
      net: ((latest.network_rx_bytes || 0) + (latest.network_tx_bytes || 0)) / (1024 * 1024),
      sparklines: paddedSparklines
    }
  }, [systemMetrics])

  const activityFeed = useMemo(() => {
    const formatTime = (d: number) => new Date(d).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const feed: any[] = []
    const incidentData = Array.isArray(activeIncidents) ? activeIncidents : []
    
    incidentData.forEach((i: any) => feed.push({
      id: `inc-${i.incident_id || i.id || Math.random()}`,
      ts: new Date(i.created_at).getTime(),
      timeStr: formatTime(new Date(i.created_at).getTime()),
      level: i.severity === 'critical' ? 'error' : 'warning',
      msg: `[INCIDENT] ${i.title || i.summary}`
    }))
    
    latestAnomalies.forEach((a: any) => feed.push({
      id: `anom-${a.timestamp || Math.random()}`,
      ts: new Date(a.detected_at || Date.now()).getTime(),
      timeStr: formatTime(new Date(a.detected_at || Date.now()).getTime()),
      level: a.score > 0.8 ? 'error' : 'warning',
      msg: `[ANOMALY] Service ${a.service_id} score ${a.score?.toFixed(2)}`
    }))

    return feed.slice(0, 50)
  }, [activeIncidents, latestAnomalies])

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface font-sans antialiased overflow-hidden relative">
      {/* Background Texture */}
      <div className="fixed inset-0 dot-grid opacity-[0.05] pointer-events-none z-0" />

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 lg:left-64 right-0 z-50 bg-transparent flex justify-between items-center px-8 py-6">
        <div className="flex items-center gap-8">
          <div className="text-primary font-mono tracking-tighter text-2xl hidden md:block uppercase">DASHBOARD</div>
          <div className="bg-surface-container-low p-1 flex items-center border border-outline-variant/30 relative z-10">
            <button 
              onClick={() => setIsReal(true)}
              className={`px-4 py-1 text-[10px] font-mono tracking-widest transition-all duration-200 ${isReal ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant/40 hover:text-on-surface'}`}
            > REAL </button>
            <button 
              onClick={() => setIsReal(false)}
              className={`px-4 py-1 text-[10px] font-mono tracking-widest transition-all duration-200 ${!isReal ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant/40 hover:text-on-surface'}`}
            > DEMO </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-surface-container-high/20 border border-outline-variant/10">
            <span className="text-[9px] font-mono text-on-surface-variant/60 uppercase tracking-[0.2em]">Refresh In:</span>
            <span className="text-[10px] font-mono text-primary font-bold">{refreshCountdown}S</span>
          </div>

          <div className="text-[14px] font-mono text-primary tracking-widest flex items-center gap-2">
            <span>{mounted && time ? time.toLocaleTimeString('en-US', { hour12: false }) : '--:--:--'} UTC</span>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-primary-container shadow-[0_0_8px_rgba(219,252,255,0.4)]' : 'bg-on-surface-variant'}`}></span>
          </div>
        </div>
      </header>

      {/* System Health Strip */}
      <div className="mt-24 px-8 py-4 bg-surface-container-lowest grid grid-cols-2 md:grid-cols-4 gap-8 items-center border-y border-outline-variant/10 relative z-10">
        <HealthMeter 
          label="CPU LOAD" 
          value={Math.round((liveMetrics['system-host']?.cpu_usage || currentMetrics.cpu) * 100)} 
        />
        <HealthMeter 
          label="MEM ALLOC" 
          value={Math.round((liveMetrics['system-host']?.mem_usage || currentMetrics.mem) * 100)} 
          unit="%" 
        />
        <HealthMeter 
          label="DISK I/O" 
          value={Math.round(liveMetrics['system-host']?.disk_latency || 12)} 
          unit="ms" 
          maxValue={50}
        />
        <HealthMeter 
          label="NET TRAFFIC" 
          value={Math.round(liveMetrics['system-host']?.net_throughput || currentMetrics.net)} 
          unit="MB/s" 
          maxValue={1000}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
        <div className="grid grid-cols-12 gap-6">
          
          {/* Service Health Grid Section */}
          <div className="col-span-12 lg:col-span-8 flex flex-col h-[500px] lg:h-[600px] bg-surface-container-low/30 p-4">
            <ServiceHealthGrid />
          </div>

          <div className="col-span-12 lg:col-span-4 bg-surface-container-highest/30 p-6 flex flex-col glow-border relative overflow-hidden h-[500px] lg:h-[600px] group/feed">
            <div className="crt-scanlines absolute inset-0 opacity-[0.03] pointer-events-none" />
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h3 className="text-sm font-sans font-bold uppercase tracking-widest text-primary">Activity Log</h3>
              <span className="text-on-surface-variant text-[10px] font-mono opacity-40">0x4F2</span>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
              {activityFeed.length > 0 ? activityFeed.map((log) => (
                <div key={log.id} className="p-3 bg-surface-container-lowest border-l border-primary/40 group hover:bg-surface-container-low transition-colors">
                  <div className="flex justify-between text-[9px] font-mono mb-1">
                    <span className="text-primary truncate">{log.msg.substring(0, 20)}</span>
                    <span className="text-on-surface-variant shrink-0">{log.timeStr}</span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant/80 truncate">{log.msg}</div>
                </div>
              )) : (
                <div className="text-on-surface-variant/40 font-mono text-[10px] text-center mt-10 tracking-widest">NO_LOGS_DETECTED</div>
              )}
            </div>
            
            <div className="mt-auto pt-6 border-t border-outline-variant/10 relative z-10">
              <div className="h-16 w-full relative flex items-end gap-0.5">
                {[20, 40, 60, 30, 80, 50, 20, 90, 40, 30, 50, 70, 40, 60].map((h, i) => (
                  <div key={i} className="flex-1 bg-primary/20" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Extra Metrics Row */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <MetricCard 
              title="NETWORK THROUGHPUT" 
              value={currentMetrics.net} 
              unit="MB/S" 
              dataKey="net" 
              data={currentMetrics.sparklines} 
              colors={{ low: '#4ecb71', mid: '#f5c518', high: 'var(--error)' }} 
            />
            <MetricCard 
              title="SECURITY_MODULE" 
              value={99.2} 
              unit="%" 
              dataKey="cpu" 
              data={currentMetrics.sparklines} 
              colors={{ low: '#4ecb71', mid: '#f5c518', high: 'var(--error)' }} 
            >
              <div className="text-[10px] font-mono uppercase text-primary tracking-widest mt-1">End-to-End Tunnel Active</div>
            </MetricCard>
          </div>
        </div>
      </div>

      {/* BOTTOM BANNER */}
      <div className="bg-primary text-on-primary py-3 px-8 flex justify-between items-center relative overflow-hidden shrink-0 shadow-[0_0_20px_rgba(219,252,255,0.2)]">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)', backgroundSize: '200% 100%', animation: 'shimmer 2s infinite linear' }}></div>
        <div className="font-mono font-bold tracking-[0.2em] uppercase text-[11px] relative z-10">SENTINEL_DASHBOARD v1.0 — Created by Sandesh Verma</div>
        <div className="bg-on-primary text-primary px-3 py-1 font-mono text-[9px] uppercase tracking-widest rounded-full relative z-10 shadow-lg">BUILD_REF: 1.0.0</div>
      </div>
    </div>
  )
}

function FlashValue({ value, unit, color, unitSize = 'text-xl' }: { value: string | number, unit?: string, color?: string, unitSize?: string }) {
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 150)
    return () => clearTimeout(t)
  }, [value])
  return (
    <span style={{ color, opacity: flash ? 0.5 : 1, transition: 'opacity 150ms' }}>
      {value}<span className={`${unitSize} text-on-surface-variant/50 ml-1 tracking-normal`}>{unit}</span>
    </span>
  )
}

function MetricCard({ title, value, unit, dataKey, data, colors, children }: { title: string, value: number, unit: string, dataKey: string, data: any[], colors: { low: string, mid: string, high: string }, children?: React.ReactNode }) {
  const color = value > 90 ? colors.high : value > 70 ? colors.mid : colors.low

  return (
    <div className="bg-surface-container-low p-6 relative flex flex-col justify-between h-[160px] overflow-hidden group border border-transparent hover:border-outline-variant/20 transition-all">
       <span className="mono-label text-on-surface-variant z-10 transition-colors group-hover:text-on-surface font-bold uppercase tracking-widest">{title}</span>
       <div className="z-10 mt-auto">
         <div className="font-mono text-4xl tracking-tighter origin-left">
           <FlashValue value={value.toFixed(1)} unit={unit} color={color} unitSize="text-lg" />
         </div>
         <div className="mt-1 h-0.5 bg-surface-container-highest/30 w-full overflow-hidden">
            <div className="h-full transition-all duration-300" style={{ backgroundColor: color, width: `${Math.min(100, (value / 1000) * 100)}%`, boxShadow: `0 0 8px ${color}44` }}></div>
         </div>
         {children}
       </div>
       
       <div className="absolute inset-x-0 bottom-0 h-[60px] opacity-20 group-hover:opacity-60 transition-opacity z-0 pointer-events-none">
         <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
           <LineChart data={data}>
             <Line type="stepAfter" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
           </LineChart>
         </ResponsiveContainer>
       </div>
    </div>
  )
}

function HealthMeter({ label, value, unit = '%', maxValue = 100 }: { label: string, value: number, unit?: string, maxValue?: number }) {
  const percentage = Math.min(100, Math.max(0, (value / maxValue) * 100))
  const isCritical = percentage > 85
  const isWarning = percentage > 60
  
  const colorStyle = isCritical ? 'var(--error)' : isWarning ? '#f5c518' : '#4ecb71'
  const shadowColor = isCritical ? 'rgba(255,180,171,0.6)' : isWarning ? 'rgba(245,197,24,0.4)' : 'rgba(78,203,113,0.4)'
  const textColor = isCritical ? 'text-error' : isWarning ? 'text-[#f5c518]' : 'text-[#4ecb71]'

  return (
    <div className="space-y-2 relative group">
      <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-on-surface-variant transition-colors group-hover:text-on-surface">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: colorStyle, boxShadow: `0 0 8px ${shadowColor}`, animation: isCritical ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none' }}></span>
          <span>{label}</span>
        </div>
        <span className={`${textColor} font-bold transition-all duration-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.5)]`}>
          <FlashValue value={value} unit={unit} unitSize="text-[10px]" />
        </span>
      </div>
      <div className="h-1.5 bg-surface-container-highest/40 w-full overflow-hidden border border-outline-variant/10 relative">
        <div className="h-full transition-all duration-700 ease-out relative z-10" style={{ width: `${percentage}%`, backgroundColor: colorStyle, boxShadow: `0 0 12px ${shadowColor}` }}>
           <div className="absolute inset-0 bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
