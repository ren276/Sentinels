'use client'
import React from 'react'

interface MonoBadgeProps {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'error' | 'muted'
}

export const MonoBadge = ({ children, variant = 'muted' }: MonoBadgeProps) => {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20'
      case 'warning':
        return 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20'
      case 'error':
        return 'bg-[#ffb4ab]/10 text-[#ffb4ab] border-[#ffb4ab]/20'
      case 'muted':
        return 'bg-[#8e9192]/10 text-[#8e9192] border-[#8e9192]/20'
      default:
        return 'bg-[#8e9192]/10 text-[#8e9192] border-[#8e9192]/20'
    }
  }

  return (
    <span className={`px-2 py-0.5 border text-[9px] font-mono font-bold tracking-widest uppercase ${getStyles()}`}>
      {children}
    </span>
  )
}
