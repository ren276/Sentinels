'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCursorStore } from '@/store/cursorStore'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const router = useRouter()
  // const searchParams = useSearchParams()
  const { setUser } = useAuthStore()
  const { setType } = useCursorStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiClient.login(username, password)
      const { data: user } = await apiClient.me()
      setUser(user)
      
      // Force reload to apply auth state across the app
      window.location.href = '/'
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4"
            style={{ backgroundColor: 'var(--bg-raised)', border: '1px solid var(--border)' }}
          >
            <span className="dot-healthy" />
          </motion.div>
          <h1 className="text-2xl font-mono font-medium tracking-widest mb-2" style={{ color: 'var(--text-primary)' }}>
            SENTINEL
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
            AI System Monitoring Platform
          </p>
        </div>

        <div className="p-6 rounded-lg relative overflow-hidden"
             style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {/* Top border highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, var(--border-strong), transparent)' }} />
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-start gap-2 p-3 text-sm rounded bg-red-500/10 text-red-500 border border-red-500/20"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                USERNAME
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded font-sans transition-colors outline-none"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--blue)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                onMouseEnter={() => setType('hover')}
                onMouseLeave={() => setType('default')}
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="font-mono text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded font-sans transition-colors outline-none"
                style={{
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--blue)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                onMouseEnter={() => setType('hover')}
                onMouseLeave={() => setType('default')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-4 text-sm font-medium rounded transition-all flex items-center justify-center relative overflow-hidden group"
              style={{
                backgroundColor: 'var(--text-primary)',
                color: 'var(--bg-base)',
              }}
              onMouseEnter={() => setType('hover')}
              onMouseLeave={() => setType('default')}
            >
              <span className={`transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}>
                SIGN IN
              </span>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin" size={18} />
                </div>
              )}
            </button>
          </form>
        </div>
      </motion.div>
      <div className="absolute bottom-6 font-mono text-[10px] tracking-widest text-center" style={{ color: 'var(--text-muted)' }}>
        AUTHORIZED PERSONNEL ONLY
      </div>
    </div>
  )
}
