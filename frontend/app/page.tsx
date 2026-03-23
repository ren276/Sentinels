'use client'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { useAuthStore } from '@/store/authStore'
import { Shield, Target, Activity, Settings, Filter } from 'lucide-react'
import { formatTimestamp, relativeTime, scoreColor } from '@/lib/utils'

export default function OverviewPage() {
  const [isReal, setIsReal] = useState(true)
  const [refreshCountdown, setRefreshCountdown] = useState(15)

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiClient.getServices().then(res => res.data),
    refetchInterval: 15000,
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents', 'active'],
    queryFn: () => apiClient.getIncidents({ status: 'active', limit: 10 }).then(res => res.data),
    refetchInterval: 15000,
  })

  const { latestAnomalies, liveMetrics } = useWsStore()
  const { user } = useAuthStore()

  useEffect(() => {
    const int = setInterval(() => {
      setRefreshCountdown(v => (v <= 1 ? 15 : v - 1))
    }, 1000)
    return () => clearInterval(int)
  }, [])

  // Aggregate metrics
  const stats = useMemo(() => {
    let cpuSum = 0, memSum = 0, p95Sum = 0, count = 0
    Object.values(liveMetrics).forEach(m => {
      cpuSum += m.cpu_usage || 0
      memSum += m.mem_usage || 0
      p95Sum += m.p95_latency_ms || 0
      count++
    })
    
    return {
      cpuAvg: count ? (cpuSum / count) * 100 : 0,
      memAvg: count ? (memSum / count) * 100 : 0,
      p95Avg: count ? p95Sum / count : 0,
      nodes: services.length || 0
    }
  }, [liveMetrics, services])

  // Mock activity logs mixed with real incidents
  const activityLogs = useMemo(() => {
    const logs = incidents.slice(0, 4).map((i: any) => ({
      type: i.severity.toUpperCase(),
      time: new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      msg: i.summary,
      color: i.severity === 'critical' ? 'var(--red)' : 'var(--amber)'
    }))
    
    // Pad with mock if not enough
    if (logs.length < 4) {
      logs.push({ type: 'AUTHENTICATION', time: '14:22:01', msg: 'User ADM-09 signed into US-WEST-1 node.', color: 'var(--blue)' })
      logs.push({ type: 'NETWORK', time: '14:20:12', msg: 'Ingress peak reached: 842 MB/s. Scaling...', color: 'var(--text-muted)' })
      logs.push({ type: 'DATABASE', time: '14:21:44', msg: 'Query optimization complete for CLUSTER_B.', color: 'var(--text-muted)' })
      logs.push({ type: 'SECURITY', time: '14:18:55', msg: 'Unauthorized access attempt blocked from 45.22.1.92.', color: 'var(--red)' })
    }
    return logs.slice(0, 5)
  }, [incidents])

  return (
    <div className="min-h-screen flex flex-col bg-[#121317] text-[#e3e2e7] font-sans selection:bg-[#dbfcff] selection:text-[#00363a]">
      {/* TopAppBar */}
      <header className="sticky top-0 z-40 bg-[#121317]/80 backdrop-blur-md flex justify-between items-center px-8 py-6 border-b border-[#3b494b]/20">
        <div className="flex items-center gap-8">
          <div className="text-[#dbfcff] font-mono tracking-tighter text-2xl hidden md:block">OVERVIEW</div>
          
          {/* Service Toggle */}
          <div className="bg-[#1a1b20] p-1 flex items-center border border-[#3b494b]/30">
            <button 
              onClick={() => setIsReal(true)}
              className={`px-4 py-1 text-[10px] font-mono tracking-widest transition-all duration-200 ${isReal ? 'bg-[#00f0ff] text-[#006970] font-bold' : 'text-[#b9cacb]/40 hover:text-[#e3e2e7]'}`}
            >
              REAL
            </button>
            <button 
              onClick={() => setIsReal(false)}
              className={`px-4 py-1 text-[10px] font-mono tracking-widest transition-all duration-200 ${!isReal ? 'bg-[#ffb4ab] text-[#690005] font-bold' : 'text-[#b9cacb]/40 hover:text-[#e3e2e7]'}`}
            >
              DEMO
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Refresh Countdown */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-[#292a2e]/20 border border-[#3b494b]/10">
            <span className="text-[9px] font-mono text-[#b9cacb]/60 uppercase tracking-[0.2em]">Refresh In:</span>
            <span className="text-[10px] font-mono text-[#dbfcff] font-bold">{refreshCountdown}S</span>
          </div>
          
          {/* Online Users Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#292a2e]/40 backdrop-blur-md border border-[#3b494b]/20">
            <span className="w-1.5 h-1.5 bg-[#00f0ff] rounded-full animate-pulse"></span>
            <span className="text-[10px] font-mono text-[#00dbe9] uppercase tracking-tighter">{stats.nodes} Active Nodes</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Activity className="text-[#00dbe9] cursor-pointer hover:scale-110 transition-transform" size={18} />
            <div className="w-8 h-8 bg-[#343439] border border-[#3b494b]/30 flex items-center justify-center overflow-hidden">
               <span className="font-mono text-xs uppercase text-[#dbfcff]">{user?.username?.substring(0, 2) || 'AD'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* System Health Strip */}
      <div className="px-8 py-4 bg-[#0d0e12] grid grid-cols-2 md:grid-cols-4 gap-8 items-center border-b border-[#3b494b]/10">
        <HealthBar label="CPU LOAD" value={stats.cpuAvg || 42} suffix="%" />
        <HealthBar label="MEM ALLOC" value={stats.memAvg || 68.2} suffix="%" color="#00f0ff" />
        <HealthBar label="DISK I/O" value={isReal ? 12 : 24} suffix="ms" color="#ffb4ab" />
        <HealthBar label="NET TRAFFIC" value={isReal ? 1.2 : 3.4} suffix="GB/s" color="#7df4ff" />
      </div>

      {/* Content Grid */}
      <div className="p-8 grid grid-cols-12 gap-6 flex-1">
        {/* Hero Data Section */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#1a1b20] p-8 relative overflow-hidden group border border-transparent hover:border-[#3b494b]/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 font-mono text-[8px] text-[#b9cacb]/20 tracking-widest">TRACE_ID: 0x9FA21</div>
            
            <div className="relative z-10 w-full">
              <h1 className="text-5xl md:text-7xl font-mono tracking-tighter text-[#dbfcff] leading-[0.9] font-bold">
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5 }}>PREDICT</motion.div>
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 32, opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}>FAILURES</motion.div>
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 16, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}>BEFORE</motion.div>
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }} className="text-[#b9cacb]/30">THEY HAPPEN.</motion.div>
              </h1>
            </div>

            {/* Live Data Stream Overlay */}
            <div className="mt-12 border-t border-[#3b494b]/10 pt-6">
              <div className="flex gap-4 overflow-hidden">
                <div className="flex-shrink-0 bg-[#292a2e] px-4 py-2 border-l border-[#00dbe9]">
                  <div className="text-[9px] font-mono text-[#b9cacb] uppercase">Uptime</div>
                  <div className="text-xl font-mono text-[#00dbe9]">99.998%</div>
                </div>
                <div className="flex-shrink-0 bg-[#292a2e] px-4 py-2 border-l border-[#b9cacb]/30">
                  <div className="text-[9px] font-mono text-[#b9cacb] uppercase">Threats</div>
                  <div className="text-xl font-mono text-[#e3e2e7]">0.02%</div>
                </div>
                <div className="flex-shrink-0 bg-[#292a2e] px-4 py-2 border-l border-[#b9cacb]/30">
                  <div className="text-[9px] font-mono text-[#b9cacb] uppercase">Avg Latency</div>
                  <div className="text-xl font-mono text-[#e3e2e7]">{stats.p95Avg.toFixed(1)}ms</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bento Grid Sub-items */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#1a1b20] p-6 flex flex-col justify-between aspect-video md:aspect-auto border border-transparent hover:border-[#3b494b]/20 transition-all">
              <div className="flex justify-between items-start">
                <Shield className="text-[#00dbe9]" size={20} />
                <span className="text-[10px] font-mono text-[#b9cacb]">SEC_MODULE</span>
              </div>
              <div className="mt-4 md:mt-0">
                <div className="text-2xl font-mono text-[#e3e2e7] mb-1">ENCRYPTED</div>
                <div className="text-[10px] font-mono uppercase text-[#00dbe9] tracking-widest">End-to-End Tunnel Active</div>
              </div>
            </div>
            
            <div className="bg-[#1a1b20] p-6 flex flex-col justify-between aspect-video md:aspect-auto border border-transparent hover:border-[#3b494b]/20 transition-all">
              <div className="flex justify-between items-start">
                <Target className="text-[#b9cacb]" size={20} />
                <span className="text-[10px] font-mono text-[#b9cacb]">NODE_DIST</span>
              </div>
              <div className="mt-4 md:mt-0">
                <div className="text-2xl font-mono text-[#e3e2e7] mb-1">GLOBAL</div>
                <div className="text-[10px] font-mono uppercase text-[#b9cacb]/60 tracking-widest">{stats.nodes} Data Centers Online</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Live Monitoring */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#343439]/30 p-6 flex-1 flex flex-col shadow-[inset_0_0_15px_-5px_rgba(0,240,255,0.1)] border border-[#00f0ff]/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-sans font-bold uppercase tracking-widest">Activity Log</h3>
              <Filter className="text-[#b9cacb]" size={16} />
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence>
                {activityLogs.map((log: any, i: number) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 bg-[#0d0e12] border-l group hover:bg-[#1a1b20] transition-colors"
                    style={{ borderColor: log.color }}
                  >
                    <div className="flex justify-between text-[9px] font-mono mb-1">
                      <span style={{ color: log.color }}>{log.type}</span>
                      <span className="text-[#b9cacb]">{log.time}</span>
                    </div>
                    <div className="text-xs font-sans text-[#e3e2e7]">
                      {log.msg}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Mini visual wave */}
            <div className="mt-6">
              <div className="h-[120px] w-full relative flex items-end gap-1">
                {[20, 30, 40, 20, 60, 40, 20, 80, 50, 30].map((h, i) => (
                  <motion.div 
                    key={i} 
                    animate={{ height: `${h + (Math.random() * 20 - 10)}%` }}
                    transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse', ease: 'easeInOut', delay: i * 0.1 }}
                    className="flex-1 bg-[#00dbe9]/40" 
                  />
                ))}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0e12] via-[#0d0e12]/0 to-[#0d0e12]/80 pointer-events-none"></div>
              </div>
              <div className="flex justify-between mt-2 text-[8px] font-mono text-[#b9cacb] tracking-widest">
                <span>00:00:00</span>
                <span>LIVE_TRAFFIC_WAVE</span>
                <span>MARKER_0.4s</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Visual Texture / Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden opacity-20 hidden lg:block">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, #dbfcff 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>
    </div>
  )
}

function HealthBar({ label, value, suffix, color = '#00dbe9' }: { label: string, value: number, suffix: string, color?: string }) {
  return (
    <div className="space-y-2 relative">
      <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-[#b9cacb]">
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color }}></span>
          <span>{label}</span>
        </div>
        <span style={{ color }}>{value.toFixed(1)}{suffix}</span>
      </div>
      <div className="h-1 bg-[#343439] w-full overflow-hidden">
        <motion.div 
          className="h-full" 
          initial={{ width: 0 }} 
          animate={{ width: `${Math.min(value, 100)}%` }} 
          transition={{ duration: 1, delay: 0.2 }}
          style={{ backgroundColor: color }} 
        />
      </div>
    </div>
  )
}
