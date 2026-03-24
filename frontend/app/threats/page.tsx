'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  ChevronRight, 
  Crosshair,
  Activity,
  Radiation,
  Skull
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { relativeTime } from '@/lib/utils'

export default function ThreatsPage() {
  const router = useRouter()
  
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', 'critical-only'],
    queryFn: () => apiClient.getIncidents({ severity: 'critical', status: 'active', limit: 20 }).then(res => res.data),
    refetchInterval: 5000,
  })

  const criticalCount = incidents.length

  return (
    <div className="min-h-screen bg-[#050505] text-white p-8 font-mono">
      {/* HUD Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex justify-between items-end border-b-2 border-error/30 pb-6 mb-12">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-error">
             <Radiation size={32} className="animate-spin-slow" />
             <h1 className="text-5xl font-black tracking-tighter">THREATS</h1>
          </div>
          <p className="text-[10px] tracking-[0.3em] text-error/60 uppercase">High Priority Active Exploits & Outages</p>
        </div>

        <div className="flex gap-8 items-center text-right">
          <div className="flex flex-col">
            <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-widest">Active Threats</span>
            <span className="text-4xl font-bold text-error leading-none">{criticalCount.toString().padStart(2, '0')}</span>
          </div>
          <div className="w-px h-12 bg-outline-variant/20" />
          <div className="flex flex-col">
            <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-widest">System Integrity</span>
            <span className={`text-xl font-bold ${criticalCount > 5 ? 'text-error' : criticalCount > 0 ? 'text-amber-400' : 'text-success'}`}>
                {criticalCount > 5 ? 'CRITICAL' : criticalCount > 0 ? 'COMPROMISED' : 'STABLE'}
            </span>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Main Feed */}
        <div className="col-span-12 lg:col-span-8 flex flex-col space-y-4">
          {isLoading ? (
            <div className="space-y-4">
               {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-error/5 border border-error/10 animate-pulse" />)}
            </div>
          ) : incidents.length > 0 ? (
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
              {incidents.map((inc: any) => (
                <motion.div
                  key={inc.incident_id}
                  variants={staggerItem}
                  onClick={() => router.push(`/incidents/${inc.incident_id}`)}
                  className="group relative bg-[#0A0A0C] border-l-4 border-error p-6 hover:bg-error/[0.03] transition-all cursor-pointer overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Skull size={80} />
                  </div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-4 flex-1">
                      <div className="flex items-center gap-4">
                        <span className="bg-error text-black text-[10px] font-bold px-2 py-0.5 uppercase">PRIORITY_ALPHA</span>
                        <span className="text-error/60 text-[10px]">{inc.incident_id.toUpperCase()}</span>
                        <span className="text-on-surface-variant/40 text-[10px]">{relativeTime(inc.created_at)}</span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-white group-hover:text-error transition-colors">{inc.summary}</h3>
                      
                      <div className="flex gap-12 items-center">
                         <div className="flex flex-col">
                            <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-widest mb-1">Target Cluster</span>
                            <span className="text-xs text-white uppercase tracking-tighter flex items-center gap-2">
                                <Crosshair size={10} className="text-error" /> {inc.service_id}
                            </span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-widest mb-1">Threat Vector</span>
                            <span className="text-xs text-error font-bold uppercase">OUTAGE_DETECTED</span>
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-widest mb-1">Impact Score</span>
                            <span className="text-xs text-white">{(inc.anomaly_score_at_trigger * 100).toFixed(2)}%</span>
                         </div>
                      </div>
                    </div>

                    <div className="h-full flex flex-col justify-between items-end">
                       <button className="flex items-center gap-2 px-4 py-2 bg-error/10 border border-error/50 hover:bg-error hover:text-black transition-all group/btn">
                          <Zap size={14} />
                          <span className="text-[10px] font-bold">INTERVENE</span>
                       </button>
                       <ChevronRight size={20} className="text-error/20 group-hover:text-error group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 border-2 border-dashed border-success/20 text-success/40">
               <ShieldAlert size={64} className="mb-4 opacity-20" />
               <h2 className="text-xl tracking-[0.2em]">NO ACTIVE THREATS</h2>
               <p className="text-[10px] mt-2 tracking-widest uppercase">System parameters within safe thresholds</p>
            </div>
          )}
        </div>

        {/* Right: Threat Intel / Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
           <div className="bg-[#0A0A0C] border border-error/20 p-6 space-y-4">
              <h4 className="text-[10px] font-bold tracking-widest text-error/80 uppercase flex items-center gap-2">
                 <Activity size={12} /> THREAT_LEVEL_TELEMETRY
              </h4>
              <div className="h-40 relative flex items-end gap-1">
                 {[...Array(30)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`flex-1 ${criticalCount > 0 ? 'bg-error/40' : 'bg-success/20'}`} 
                      style={{ height: `${Math.random() * 80 + 20}%` }} 
                    />
                 ))}
              </div>
              <div className="pt-4 border-t border-error/10 grid grid-cols-2 gap-4">
                 <div className="bg-error/5 p-3 border border-error/10">
                    <span className="text-[8px] text-error/60 uppercase block mb-1">MTTD</span>
                    <span className="text-lg font-bold">14.2s</span>
                 </div>
                 <div className="bg-error/5 p-3 border border-error/10">
                    <span className="text-[8px] text-error/60 uppercase block mb-1">Blast Radius</span>
                    <span className="text-lg font-bold">L-4</span>
                 </div>
              </div>
           </div>

           <div className="border border-outline-variant/20 p-6 opacity-40 hover:opacity-100 transition-opacity">
              <h4 className="text-[10px] font-bold tracking-widest uppercase mb-4">THREAT_PROTOCOL_24</h4>
              <ul className="text-[10px] space-y-3 list-disc list-inside">
                 <li>ALPHA: Redirect traffic on 5xx spike</li>
                 <li>BRAVO: Automate model rollback on drift</li>
                 <li>CHARLIE: Execute War Room escalation</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  )
}
