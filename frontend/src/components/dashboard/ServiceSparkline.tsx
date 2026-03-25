'use client'
import React from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface ServiceSparklineProps {
  data: number[]
  status: 'healthy' | 'warning' | 'critical' | 'offline'
}

export const ServiceSparkline = ({ data, status }: ServiceSparklineProps) => {
  const chartData = data.slice(-24).map((val, i) => ({ value: val, id: i }))
  
  const getLineColor = () => {
    switch (status) {
      case 'healthy': return '#00dbe9' // primary-fixed-dim
      case 'warning': return '#ffd166' // warning
      case 'critical': return '#ffb4ab' // error token
      case 'offline': return '#8e9192' // muted
      default: return '#00dbe9'
    }
  }

  return (
    <div className="h-8 w-full opacity-80">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={chartData}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={getLineColor()} 
            strokeWidth={1.5} 
            dot={false} 
            isAnimationActive={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
