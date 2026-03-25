'use client'
import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { ServiceHealthCard, ServiceHealthCardSkeleton } from './ServiceHealthCard'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'

interface ServiceData {
  id: string
  name: string
  status: 'healthy' | 'warning' | 'critical' | 'offline'
  metrics: {
    latency_ms: number
    error_rate: number
    cpu_percent: number
    uptime_percent: number
    history: number[]
  }
}

export const ServiceHealthGrid = () => {
  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE = 9

  const { data: services, isLoading, isError, refetch } = useQuery({
    queryKey: ['services-grid'],
    queryFn: async () => {
      const res = await apiClient.getServices()
      const data = res.data?.data || res.data || []
      return data.map((s: any) => ({
        id: s.id || s.service_id,
        name: s.name || 'unknown service',
        status: (s.health_status || s.status || 'offline').toLowerCase(),
        metrics: {
          latency_ms: s.live_metrics?.latency_ms || s.metrics?.latency_ms || 0,
          error_rate: s.live_metrics?.error_rate || s.metrics?.error_rate || 0,
          cpu_percent: s.live_metrics?.cpu_percent || s.metrics?.cpu_percent || 0,
          uptime_percent: s.live_metrics?.uptime_percent || s.metrics?.uptime_percent || 99.9,
          history: s.metrics?.history || Array.from({ length: 24 }).map(() => Math.random() * 100)
        }
      })) as ServiceData[]
    },
    refetchInterval: 30000,
    staleTime: 29000,
  })

  const counts = useMemo(() => {
    if (!services) return null
    return {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      warning: services.filter(s => s.status === 'warning').length,
      critical: services.filter(s => s.status === 'critical').length,
    }
  }, [services])

  const paginatedServices = useMemo(() => {
    if (!services) return []
    const start = page * ITEMS_PER_PAGE
    return services.slice(start, start + ITEMS_PER_PAGE)
  }, [services, page])

  const totalPages = Math.ceil((services?.length || 0) / ITEMS_PER_PAGE)

  // ... loading and error states ...
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-full bg-surface-container-high/20 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <ServiceHealthCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-error/20 bg-error/5 h-full">
        <div className="font-mono text-error text-[10px] tracking-[0.2em] mb-4 uppercase">
          CONNECTION ERROR — CANNOT REACH BACKEND
        </div>
        <button 
          onClick={() => refetch()}
          className="px-6 py-2 bg-on-surface text-surface font-mono text-[10px] uppercase tracking-widest hover:bg-primary transition-colors"
        >
          RETRY_CONNECTION
        </button>
      </div>
    )
  }

  if (!services || services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-surface-container-low border border-outline-variant/10 h-full">
        <div className="mono-label text-on-surface-variant/40 mb-2">NO SERVICES REGISTERED</div>
        <div className="text-[10px] font-mono text-on-surface-variant/60 mb-6 font-medium">Add a service to begin monitoring</div>
        <Link 
          href="/services/new"
          className="flex items-center gap-2 px-6 py-2 bg-surface-container-highest text-primary border border-primary/20 hover:border-primary transition-all group"
        >
          <Plus size={14} className="group-hover:rotate-90 transition-transform" />
          <span className="font-mono text-[10px] uppercase tracking-widest">[+ ADD SERVICE]</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Grid Header */}
      <div className="flex justify-between items-center mb-4 px-1">
        <div className="flex items-center gap-4">
          <div className="mono-label text-on-surface-variant">SERVICES</div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-surface-container-high border border-outline-variant/20">
              <button 
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:hover:text-on-surface-variant transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[9px] text-on-surface uppercase tracking-widest px-2">
                PAGE {page + 1}/{totalPages}
              </span>
              <button 
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:hover:text-on-surface-variant transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        
        {counts && (
          <div className="font-mono text-[11px] flex gap-2 items-center">
            <span className="hidden sm:inline">{counts.total} total</span>
            <span className="text-on-surface-variant/40 hidden sm:inline">·</span>
            <span className="text-[#10B981]">{counts.healthy} healthy</span>
            <span className="text-on-surface-variant/40">·</span>
            <span className="text-[#fbbf24]">{counts.warning} warning</span>
            <span className="text-on-surface-variant/40">·</span>
            <span className="text-[#ffb4ab]">{counts.critical} critical</span>
          </div>
        )}
      </div>

      {/* Grid Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-outline-variant/10">
        <AnimatePresence mode="wait">
          <motion.div 
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="contents" // Use contents to avoid breaking the grid layout
          >
            {paginatedServices.map((service, i) => (
              <ServiceHealthCard key={service.id} service={service} index={i} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Pagination Dots (Mobility/Touch friendly) */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === page ? 'bg-primary w-4' : 'bg-on-surface-variant/20 hover:bg-on-surface-variant/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
