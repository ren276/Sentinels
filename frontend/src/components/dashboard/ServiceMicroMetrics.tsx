'use client'
import React from 'react'

interface ServiceMicroMetricsProps {
  latency: number
  errorRate: number
  cpu: number
  uptime: number
}

export const ServiceMicroMetrics = ({ latency, errorRate, cpu, uptime }: ServiceMicroMetricsProps) => {
  const getLatencyColor = (v: number) => v < 100 ? 'text-[#10B981]' : v < 500 ? 'text-[#fbbf24]' : 'text-[#ffb4ab]'
  const getErrorColor = (v: number) => v < 0.1 ? 'text-[#10B981]' : v < 1.0 ? 'text-[#fbbf24]' : 'text-[#ffb4ab]'
  const getCpuColor = (v: number) => v < 60 ? 'text-[#10B981]' : v < 85 ? 'text-[#fbbf24]' : 'text-[#ffb4ab]'
  const getUptimeColor = (v: number) => v > 99.9 ? 'text-[#10B981]' : v >= 99.0 ? 'text-[#fbbf24]' : 'text-[#ffb4ab]'

  const formatVal = (v: number, unit = '') => {
    if (v === undefined || v === null) return '0' + unit
    // Special handling for fractional percents
    const rounded = Math.round(v * 100) / 100
    return rounded + unit
  }

  return (
    <div className="grid grid-cols-4 gap-2 mt-4">
      <div className="flex flex-col min-w-0">
        <span className="mono-label text-[9px] text-on-surface-variant opacity-60">LAT</span>
        <span className={`font-mono text-[12px] ${getLatencyColor(latency)} truncate`}>{formatVal(latency, 'ms')}</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="mono-label text-[9px] text-on-surface-variant opacity-60">ERR</span>
        <span className={`font-mono text-[12px] ${getErrorColor(errorRate)} truncate`}>{formatVal(errorRate, '%')}</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="mono-label text-[9px] text-on-surface-variant opacity-60">CPU</span>
        <span className={`font-mono text-[12px] ${getCpuColor(cpu)} truncate`}>{formatVal(cpu, '%')}</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="mono-label text-[9px] text-on-surface-variant opacity-60">UPTIME</span>
        <span className={`font-mono text-[12px] ${getUptimeColor(uptime)} truncate`}>{formatVal(uptime, '%')}</span>
      </div>
    </div>
  )
}
