'use client'
import { useEffect, useRef, useState } from 'react'

export function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<Element | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, ...options }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [options])

  return { ref, isInView }
}
