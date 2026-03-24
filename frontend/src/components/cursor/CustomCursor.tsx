'use client'
import { useEffect } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useCursorStore } from '@/store/cursorStore'

import { usePathname } from 'next/navigation'

export function CustomCursor() {
  const pathname = usePathname()
  const mx = useMotionValue(-100)
  const my = useMotionValue(-100)
  const { type } = useCursorStore()

  if (pathname !== '/login') return null

  const dotX = useSpring(mx, { stiffness: 1000, damping: 50 })
  const dotY = useSpring(my, { stiffness: 1000, damping: 50 })
  const ringX = useSpring(mx, { stiffness: 150, damping: 15 })
  const ringY = useSpring(my, { stiffness: 150, damping: 15 })

  useEffect(() => {
    const move = (e: MouseEvent) => {
      mx.set(e.clientX)
      my.set(e.clientY)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [mx, my])

  const ringScale = type === 'hover' ? 1.5 : type === 'critical' ? 1.2 : 1
  const ringColor = type === 'critical' ? 'var(--red)' : 'white'
  const ringBoxShadow = type === 'critical' ? '0 0 12px rgba(239,68,68,0.5)' : 'none'

  return (
    <>
      {/* Dot — instant tracking */}
      <motion.div
        className="fixed w-2 h-2 rounded-full bg-white pointer-events-none z-[9999] top-0 left-0"
        style={{
          x: dotX,
          y: dotY,
          translateX: '-50%',
          translateY: '-50%',
          opacity: type === 'hover' ? 0 : 0.6,
        }}
      />
      {/* Ring — spring lag + blend mode */}
      <motion.div
        className="fixed rounded-full border pointer-events-none z-[9999] top-0 left-0"
        style={{
          x: ringX,
          y: ringY,
          translateX: '-50%',
          translateY: '-50%',
          width: '32px',
          height: '32px',
          borderColor: ringColor,
          boxShadow: ringBoxShadow,
          mixBlendMode: 'difference',
          scale: ringScale,
        }}
        animate={{ scale: ringScale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
    </>
  )
}
