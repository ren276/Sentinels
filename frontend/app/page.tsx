'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlertTriangle, ShieldCheck, Cpu, HardDrive, Network } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useWsStore } from '@/store/wsStore'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'

import { formatTimestamp, relativeTime, scoreColor, severityColor } from '@/lib/utils'

export default function OverviewPage() {
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiClient.getServices().then(res => res.data),
    refetchInterval: 30000,
  })

  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents', 'active'],
    queryFn: () => apiClient.getIncidents({ status: 'active', limit: 10 }).then(res => res.data),
    refetchInterval: 15000,
  })

  const { latestAnomalies } = useWsStore()
  
  const stats = useMemo(() => {
    const total = services.length
    const critical = services.filter((s: any) => s.health_status === 'critical').length
    const warning = services.filter((s: any) => s.health_status === 'warning').length
    const healthy = total - critical - warning
    return { total, healthy, warning, critical }
  }, [services])

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-mono font-medium tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>
            PLATFORM OVERVIEW
          </h1>
          <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
            SYSTEM HEALTH & ACTIVE ANOMALIES
          </p>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-4 gap-4">
        <StatCard title="TOTAL SERVICES" value={stats.total} icon={Network} color="var(--blue)" />
        <StatCard title="HEALTHY" value={stats.healthy} icon={ShieldCheck} color="var(--emerald)" />
        <StatCard title="WARNING" value={stats.warning} icon={Activity} color="var(--amber)" />
        <StatCard title="CRITICAL" value={stats.critical} icon={AlertTriangle} color="var(--red)" />
      </motion.div>

      <div className="grid grid-cols-3 gap-8">
        {/* Left col - Active Incidents & Anomalies */}
        <div className="col-span-2 space-y-8">
          <Section title="ACTIVE INCIDENTS">
            {incidents.length === 0 ? (
              <div className="py-8 text-center border border-dashed rounded" style={{ borderColor: 'var(--border-strong)' }}>
                <ShieldCheck className="mx-auto mb-2 opacity-50" size={24} style={{ color: 'var(--emerald)' }} />
                <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>ALL SYSTEMS NOMINAL</p>
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map((inc: any) => (
                  <motion.div
                    key={inc.incident_id}
                    layoutId={`inc-${inc.incident_id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 rounded border relative overflow-hidden group"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                  >
                    {inc.severity === 'critical' && <div className="absolute top-0 left-0 w-1 h-full shimmer-bar" />}
                    {inc.severity !== 'critical' && (
                      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: severityColor(inc.severity) }} />
                    )}
                    
                    <div className="pl-3 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded uppercase"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${severityColor(inc.severity)} 15%, transparent)`,
                              color: severityColor(inc.severity),
                            }}>
                            {inc.severity}
                          </span>
                          <span className="font-mono text-sm uppercase tracking-wider text-white">
                            {inc.service_id}
                          </span>
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                            {relativeTime(inc.created_at)}
                          </span>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{inc.summary}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-2xl font-light" style={{ color: scoreColor(inc.anomaly_score_at_trigger) }}>
                          {inc.anomaly_score_at_trigger.toFixed(3)}
                        </p>
                        <p className="text-[10px] font-mono tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
                          Trigger Score
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Section>
          
          <Section title="REAL-TIME ANOMALIES (STREAM)">
            <div className="rounded border bg-black/50 overflow-hidden font-mono text-xs" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="grid grid-cols-4 gap-4 p-3 border-b tracking-wider" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}>
                <span>TIME</span>
                <span>SERVICE</span>
                <span>SCORE</span>
                <span>TYPE</span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {latestAnomalies.map((anom) => (
                    <motion.div
                      key={`${anom.service_id}-${anom.detected_at}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="grid grid-cols-4 gap-4 p-3 border-b border-white/5 transition-colors hover:bg-white/5"
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{formatTimestamp(anom.detected_at)}</span>
                      <span className="text-white">{anom.service_id}</span>
                      <span style={{ color: scoreColor(anom.anomaly_score) }}>{anom.anomaly_score.toFixed(4)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{anom.anomaly_type}</span>
                    </motion.div>
                  ))}
                  {latestAnomalies.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground/50 italic">Waiting for telemetry...</div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Section>
        </div>

        {/* Right col - Services Overview */}
        <div className="space-y-8">
          <Section title="SERVICE STATUS">
            <div className="space-y-2">
              {services.map((svc: any) => (
                <div key={svc.service_id} className="flex items-center justify-between p-3 rounded border transition-colors hover:bg-white/5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full dot-${svc.health_status}`} />
                    <span className="font-mono text-sm tracking-wider" style={{ color: 'var(--text-primary)' }}>{svc.name}</span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded uppercase" style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--text-muted)' }}>
                    {svc.version}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <motion.div
      variants={staggerItem}
      className="p-5 rounded-lg border flex flex-col relative overflow-hidden group"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500">
        <Icon size={120} />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} style={{ color }} />
        <h3 className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>{title}</h3>
      </div>
      <p className="font-mono text-4xl font-light tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </motion.div>
  )
}

function Section({ title, children }: any) {
  return (
    <section>
      <h2 className="font-mono text-xs font-semibold tracking-[0.2em] mb-4 pb-2 border-b" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}
