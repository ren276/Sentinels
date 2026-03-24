'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Search, ChevronRight, Server, Activity } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/animations'
import { useCursorStore } from '@/store/cursorStore'

export default function ServicesPage() {
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { setType } = useCursorStore()

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiClient.getServices().then((res) => res.data),
  })

  const filtered = services.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.service_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-mono font-black tracking-tighter text-on-surface mb-1">
            SERVICES
          </h1>
          <p className="text-sm font-mono tracking-wider" style={{ color: 'var(--text-muted)' }}>
            MONITORED MICROSERVICES AND INFRASTRUCTURE
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" size={16} />
          <input
            type="text"
            placeholder="SEARCH SERVICES..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 text-sm font-mono uppercase bg-transparent border rounded outline-none transition-colors w-64"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
            onFocus={(e) => e.target.style.borderColor = 'var(--blue)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-strong)'}
            onMouseEnter={() => setType('hover')}
            onMouseLeave={() => setType('default')}
          />
        </div>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((svc: any) => (
          <motion.div
            key={svc.service_id}
            variants={staggerItem}
            onClick={() => router.push(`/services/${svc.service_id}`)}
            className="p-5 rounded border cursor-pointer transition-all hover:-translate-y-1 group"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              setType('hover')
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              setType('default')
            }}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-black/40 border" style={{ borderColor: 'var(--border-strong)' }}>
                  <Server size={18} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-medium uppercase text-white group-hover:text-blue-400 transition-colors">
                    {svc.name}
                  </h3>
                  <p className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    ID: {svc.service_id}
                  </p>
                </div>
              </div>
              <span className={`w-2 h-2 rounded-full dot-${svc.health_status}`} />
            </div>

            <div className="flex items-center gap-2 mb-4">
              {Object.entries(svc.tags).map(([k, v]: any) => (
                <span key={k} className="px-2 py-0.5 text-[10px] font-mono uppercase rounded border"
                  style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}>
                  {k}:{v}
                </span>
              ))}
            </div>

            <div className="pt-4 border-t flex justify-between items-center" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                <Activity size={12} />
                <span className="text-xs font-mono uppercase">View Telemetry</span>
              </div>
              <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" style={{ color: 'var(--blue)' }} />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
