'use client'
import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { StatusDot } from '@/components/ui/StatusDot'
import { MonoBadge } from '@/components/ui/MonoBadge'
import { ServiceSparkline } from './ServiceSparkline'
import { ServiceMicroMetrics } from './ServiceMicroMetrics'

interface ServiceCardProps {
  service: {
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
  index: number
}

export const ServiceHealthCard = ({ service, index }: ServiceCardProps) => {
  const router = useRouter()
  const [prevStatus, setPrevStatus] = useState(service.status)

  useEffect(() => {
    if (service.status !== prevStatus) {
      setPrevStatus(service.status)
    }
  }, [service.status, prevStatus])

  const isCritical = service.status === 'critical'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.3, 
        delay: index * 0.03, // 30ms stagger
        ease: 'easeOut'
      }}
      onClick={() => router.push(`/services/${service.id}`)}
      className={`
        relative p-4 bg-surface-container transition-all duration-150 cursor-pointer overflow-hidden
        ghost-border group hover:bg-surface-container-high
        ${isCritical ? 'border-l-2 border-[#ffb4ab] bg-[#93000a]/5' : ''}
      `}
    >
      {/* Header Row */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <motion.div
            key={service.status}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <StatusDot status={service.status} />
          </motion.div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface truncate max-w-[120px]">
            {service.name}
          </span>
        </div>
        
        <motion.div
          key={`${service.id}-badge-${service.status}`}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <MonoBadge variant={
            service.status === 'healthy' ? 'success' :
            service.status === 'warning' ? 'warning' :
            service.status === 'critical' ? 'error' : 'muted'
          }>
            {service.status}
          </MonoBadge>
        </motion.div>
      </div>

      {/* Sparkline */}
      <div className="mb-4">
        <ServiceSparkline data={service.metrics?.history || []} status={service.status} />
      </div>

      {/* Micro Metrics */}
      <ServiceMicroMetrics 
        latency={service.metrics?.latency_ms || 0}
        errorRate={(service.metrics?.error_rate || 0) * 100}
        cpu={service.metrics?.cpu_percent || 0}
        uptime={service.metrics?.uptime_percent || 0}
      />
    </motion.div>
  )
}

export const ServiceHealthCardSkeleton = () => (
  <div className="p-4 bg-surface-container ghost-border animate-pulse">
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-on-surface-variant/20" />
        <div className="h-3 w-20 bg-on-surface-variant/20" />
      </div>
      <div className="h-4 w-12 bg-on-surface-variant/20" />
    </div>
    <div className="h-8 w-full bg-on-surface-variant/10 mb-4" />
    <div className="grid grid-cols-4 gap-2 mt-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="space-y-1">
          <div className="h-2 w-6 bg-on-surface-variant/20" />
          <div className="h-3 w-10 bg-on-surface-variant/10" />
        </div>
      ))}
    </div>
  </div>
)
