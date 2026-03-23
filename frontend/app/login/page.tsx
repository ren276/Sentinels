'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useCursorStore } from '@/store/cursorStore'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  const router = useRouter()
  const { setUser } = useAuthStore()
  const { setType } = useCursorStore()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiClient.login(username, password)
      const { data: user } = await apiClient.me()
      setUser(user)
      window.location.href = '/'
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed')
      setLoading(false)
    }
  }

  const handleOAuthLogin = (provider: string) => {
    window.location.href = `http://localhost:8000/api/auth/${provider}`
  }

  return (
    <main className="flex h-screen w-full bg-[#121317] text-[#e3e2e7] font-sans antialiased overflow-hidden">
      {/* LEFT PANEL (55%): The Sentinel Interface */}
      <section 
        className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 bg-[#0d0e12] overflow-hidden"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseEnter={() => setType('default')}
        onMouseLeave={() => setType('default')}
      >
        <div 
          className="absolute w-[400px] h-[400px] rounded-full pointer-events-none z-0"
          style={{
            background: 'radial-gradient(circle, rgba(219, 252, 255, 0.08) 0%, transparent 70%)',
            transform: `translate(calc(${mousePos.x}px - 50%), calc(${mousePos.y}px - 50%)) scale(2.0)`,
            transition: 'opacity 0.2s',
          }}
        />
        {/* Background Dot Grid */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, #3b494b 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}></div>

        {/* Top branding */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="w-2 h-2 bg-[#ffb4ab] rounded-full animate-pulse shadow-[0_0_8px_rgba(255,180,171,0.8)]"></span>
          <h1 className="font-mono text-[13px] tracking-[0.4em] text-[#b9cacb] uppercase">SENTINEL</h1>
        </div>

        {/* Staggered Animated Text */}
        <div className="relative z-10 flex flex-col font-mono text-[56px] leading-[1.1] text-[#dbfcff] tracking-tighter">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.7, delay: 0 }}>Predict</motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 24, opacity: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>failures</motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 48, opacity: 1 }} transition={{ duration: 0.7, delay: 0.3 }}>before</motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.7, delay: 0.45 }} className="drop-shadow-[0_0_15px_rgba(219,252,255,0.3)]">
            they happen.
          </motion.div>

          {/* Live Stat Chips */}
          <div className="mt-12 flex gap-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="bg-[#343439]/40 backdrop-blur-md px-4 py-2 opacity-100 flex items-center gap-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <span className="w-1.5 h-1.5 bg-[#00f0ff] rounded animate-ping"></span>
              <span className="font-mono text-[12px] text-[#e3e2e7] uppercase tracking-wider">14 services</span>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="bg-[#343439]/40 backdrop-blur-md px-4 py-2 opacity-100 flex items-center gap-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <span className="w-1.5 h-1.5 bg-[#ffb4ab] rounded"></span>
              <span className="font-mono text-[12px] text-[#e3e2e7] uppercase tracking-wider">3 incidents</span>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="bg-[#343439]/40 backdrop-blur-md px-4 py-2 opacity-100 flex items-center gap-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <span className="w-1.5 h-1.5 bg-[#dbfcff] rounded"></span>
              <span className="font-mono text-[12px] text-[#e3e2e7] uppercase tracking-wider">99.2% uptime</span>
            </motion.div>
          </div>
        </div>

        {/* Version Tag */}
        <div className="relative z-10">
          <p className="font-mono text-[11px] text-[#b9cacb] uppercase tracking-widest">v1.0.0-STABLE // BUILD_ID: 84920</p>
        </div>

        {/* Decorative Visual Overlay */}
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#00dbe9]/5 blur-[120px] rounded-full pointer-events-none"></div>
      </section>

      {/* RIGHT PANEL (45%): Transactional Logic */}
      <section className="w-full lg:w-[45%] bg-[#121317] flex flex-col p-8 md:p-16 lg:p-24 justify-center relative border-l border-[#3b494b]/20">
        <div className="max-w-[420px] w-full mx-auto relative">
          
          {/* Tab Switcher */}
          <nav className="flex w-full bg-[#1a1b20] mb-12 relative h-12 items-center p-1">
            <button className="flex-1 text-center font-sans text-sm font-medium text-[#dbfcff] z-10 py-2">
              Sign in
            </button>
            <button className="flex-1 text-center font-sans text-sm font-medium text-[#b9cacb] z-10 py-2 hover:text-[#e3e2e7] transition-colors"
                onClick={() => setError("Self-signup is disabled in this environment. Please request an access key.")}>
              Create account
            </button>
            <div className="absolute left-1 top-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-[#343439] transition-all duration-300 pointer-events-none"></div>
          </nav>

          <div className="space-y-2 mb-10">
            <h2 className="text-2xl font-sans font-semibold text-[#e3e2e7] tracking-tight">Welcome back</h2>
            <div className="flex items-center gap-2 text-[13px] text-[#b9cacb]">
              <span>Sign in to your secure sentinel workspace.</span>
              <div className="flex items-center gap-1 bg-[#343439]/30 px-1.5 py-0.5 text-[9px] font-mono border border-[#3b494b]/30">
                <span className="tracking-tighter">SENTINEL_SECURE</span>
              </div>
            </div>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <button onMouseEnter={() => setType('hover')} onMouseLeave={() => setType('default')} onClick={() => handleOAuthLogin('github')} className="flex items-center justify-center py-3 bg-transparent hover:bg-[#1a1b20] transition-all group" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <svg className="w-5 h-5 text-[#b9cacb] group-hover:text-[#e3e2e7]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
              </svg>
            </button>
            <button onMouseEnter={() => setType('hover')} onMouseLeave={() => setType('default')} onClick={() => handleOAuthLogin('google')} className="flex items-center justify-center py-3 bg-transparent hover:bg-[#1a1b20] transition-all group" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <svg className="w-5 h-5 text-[#b9cacb] group-hover:text-[#e3e2e7]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.48 10.92V14.5h6.64c-.28 1.57-1.74 4.59-6.64 4.59-4.22 0-7.66-3.48-7.66-7.79s3.44-7.79 7.66-7.79c2.4 0 4 .99 4.92 1.87l2.79-2.79C18.4 1.03 15.63 0 12.48 0 5.58 0 0 5.58 0 12.48s5.58 12.48 12.48 12.48c7.2 0 12-5.06 12-12.2 0-.82-.09-1.44-.21-2.07l-11.79.01z"></path>
              </svg>
            </button>
            <button onMouseEnter={() => setType('hover')} onMouseLeave={() => setType('default')} onClick={() => handleOAuthLogin('microsoft')} className="flex items-center justify-center py-3 bg-transparent hover:bg-[#1a1b20] transition-all group" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}>
              <svg className="w-5 h-5 text-[#b9cacb] group-hover:text-[#e3e2e7]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"></path>
              </svg>
            </button>
          </div>

          <div className="relative flex items-center mb-8">
            <div className="flex-grow border-t border-[#3b494b]/20"></div>
            <span className="flex-shrink mx-4 font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]/60">or continue with email</span>
            <div className="flex-grow border-t border-[#3b494b]/20"></div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
                <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-start gap-2 p-3 text-sm bg-[#93000a]/20 text-[#ffb4ab]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255, 180, 171, 0.2)' }}
                >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
                </motion.div>
            )}

            <div>
              <label className="block font-mono text-[11px] uppercase tracking-widest text-[#b9cacb] mb-2">Username</label>
              <input 
                autoFocus 
                className="w-full bg-[#343439] border-0 focus:ring-0 px-4 py-3 text-[#e3e2e7] font-sans text-sm placeholder:text-[#b9cacb]/30 outline-none" 
                style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}
                onFocus={(e) => e.target.style.boxShadow = 'inset 0 0 0 1px rgba(219, 252, 255, 0.3)'}
                onBlur={(e) => e.target.style.boxShadow = 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)'}
                placeholder="OPERATOR_ID" 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="block font-mono text-[11px] uppercase tracking-widest text-[#b9cacb]">Password</label>
                <a className="font-mono text-[11px] text-[#dbfcff] hover:underline uppercase tracking-widest" href="#">Forgot?</a>
              </div>
              <div className="relative">
                <input 
                  className="w-full bg-[#343439] border-0 focus:ring-0 px-4 py-3 text-[#e3e2e7] font-sans text-sm outline-none" 
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }}
                  onFocus={(e) => e.target.style.boxShadow = 'inset 0 0 0 1px rgba(219, 252, 255, 0.3)'}
                  onBlur={(e) => e.target.style.boxShadow = 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)'}
                  placeholder="••••••••••••" 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#b9cacb] hover:text-[#e3e2e7]" 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              className="w-full py-4 bg-[#dbfcff] text-[#00363a] font-sans font-bold uppercase tracking-widest text-xs hover:bg-[#7df4ff] transition-all duration-300 shadow-[0_0_20px_rgba(219,252,255,0.15)] flex items-center justify-center gap-2 group relative" 
              type="submit"
              disabled={loading}
              onMouseEnter={() => setType('hover')}
              onMouseLeave={() => setType('default')}
            >
              <span className={`transition-opacity tracking-widest flex items-center gap-2 uppercase ${loading ? 'opacity-0' : 'opacity-100'}`}>
                Sign in to Sentinel <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </span>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin" size={18} />
                </div>
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-[#3b494b]/10 text-center">
            <p className="text-[12px] text-[#b9cacb]">
              New deployment? 
              <button 
                className="text-[#dbfcff] hover:underline font-medium ml-1" 
                onClick={() => {
                  const el = document.getElementById('request-access-dialog');
                  if (el) el.classList.remove('hidden');
                }}
              >
                Request access key
              </button>
            </p>
          </div>
        </div>

        <div className="absolute bottom-6 right-8 opacity-40 pointer-events-none hidden lg:block">
          <span className="font-mono text-[10px] text-[#b9cacb] tracking-wider">v2.4.0-STABLE</span>
        </div>
        <div className="lg:hidden absolute bottom-8 left-0 right-0 text-center">
          <span className="font-mono text-[11px] text-[#b9cacb] tracking-[0.3em] uppercase">Sentinel v2.4.0</span>
        </div>
      </section>

      {/* Basic dialog for request access */}
      <div className="fixed inset-0 z-[100] hidden flex items-center justify-center p-4" id="request-access-dialog">
        <div 
          className="absolute inset-0 bg-[#121317]/80 backdrop-blur-sm" 
          onClick={() => {
            const el = document.getElementById('request-access-dialog');
            if (el) el.classList.add('hidden');
          }}
        ></div>
        <div className="relative bg-[#1a1b20] w-full max-w-md border border-[#3b494b]/30 p-8">
          <h3 className="text-xl font-sans font-semibold mb-4 text-[#dbfcff]">Request Access</h3>
          <p className="text-sm text-[#b9cacb] mb-6">Enter your organization email. A system administrator will review your credentials within 24 hours.</p>
          <input className="w-full bg-[#343439] border-0 px-4 py-3 text-[#e3e2e7] font-sans text-sm mb-6 outline-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(132, 148, 149, 0.2)' }} placeholder="admin@org.com" type="email" />
          <div className="flex justify-end gap-4">
            <button 
              className="font-mono text-[12px] uppercase tracking-widest text-[#b9cacb] hover:text-[#e3e2e7]" 
              onClick={() => {
                const el = document.getElementById('request-access-dialog');
                if (el) el.classList.add('hidden');
              }}
            >
              Cancel
            </button>
            <button className="bg-[#dbfcff] text-[#00363a] px-6 py-2 font-mono text-[12px] uppercase tracking-widest font-bold">Submit Request</button>
          </div>
        </div>
      </div>
    </main>
  )
}
