'use client'
import React from 'react'

interface StatusDotProps {
  status: 'healthy' | 'warning' | 'critical' | 'offline'
  size?: number
}

export const StatusDot = ({ status, size = 8 }: StatusDotProps) => {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return 'bg-[#10B981]' // emerald
      case 'warning': return 'bg-[#fbbf24]' // amber
      case 'critical': return 'bg-[#ffb4ab]' // error token
      case 'offline': return 'bg-[#8e9192]' // muted
      default: return 'bg-[#8e9192]'
    }
  }

  const getAnimation = () => {
    switch (status) {
      case 'healthy': return 'animate-[ping_3s_linear_infinite]'
      case 'warning': return 'animate-pulse'
      case 'critical': return 'animate-[pulse_0.8s_ease-in-out_infinite]'
      case 'offline': return ''
      default: return ''
    }
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {status !== 'offline' && (
        <div 
          className={`absolute inset-0 rounded-full opacity-75 ${getStatusColor()} ${getAnimation()}`}
        />
      )}
      <div 
        className={`relative rounded-full ${getStatusColor()}`} 
        style={{ width: size, height: size }}
      />
    </div>
  )
}
