'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Loader2, Eye, EyeOff, ArrowRight, Lock, Mail, Check, Shield } from 'lucide-react'
import Cookies from 'js-cookie'
import { apiClient } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useCursorStore } from '@/store/cursorStore'
import { useQuery } from '@tanstack/react-query'
import { StatusDot } from '@/components/ui/StatusDot'

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'signin' | 'create'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ type: 'invalid' | 'locked' | 'network'; msg: string; unlockIn?: number } | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  
  const router = useRouter()
  const { setUser } = useAuthStore()
  const { setType } = useCursorStore()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealth().then(res => res.data).catch(() => null),
    refetchInterval: 30000,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings().then(res => res.data).catch(() => ({})),
  })

  // Timer for lockout
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (error?.type === 'locked' && error.unlockIn && error.unlockIn > 0) {
      interval = setInterval(() => {
        setError(prev => prev && prev.type === 'locked' ? { ...prev, unlockIn: prev.unlockIn! - 1 } : prev)
      }, 1000)
    } else if (error?.type === 'locked' && error.unlockIn === 0) {
      setError(null)
    }
    return () => clearInterval(interval)
  }, [error])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (error?.type === 'locked') return
    setError(null)
    setLoading(true)

    try {
      if (activeTab === 'signin') {
        let loggedInLocal = false;
        
        // 1. Try local FastAPI backend first (handles seeded 'admin' and 'viewer' accounts)
        try {
            const loginRes = await apiClient.login(username, password)
            if (loginRes.status === 200) {
                loggedInLocal = true
                if (loginRes.data?.access_token) {
                    Cookies.set('sentinel_session', loginRes.data.access_token, { 
                        expires: 1/24,
                        path: '/',
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'Lax'
                    })
                }
                const userRes = await apiClient.me()
                setUser(userRes.data)
                
                // The backend automatically sets the HTTPOnly 'sentinel_session' cookie.
                if (loginRes.data?.refresh_token) {
                    localStorage.setItem('refresh_token', loginRes.data.refresh_token)
                }
                
                window.location.href = '/'
                return
            }
        } catch (e: any) {
             if (e.response?.status === 423) {
                 setError({ type: 'locked', msg: 'Account temporarily locked.', unlockIn: 900 })
                 return
             }
             // Otherwise, fallback to Supabase
        }

        // 2. Fallback to Supabase
        if (!loggedInLocal) {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
              email: username.includes('@') ? username : `${username}@placeholder.com`,
              password,
            })
            if (authError) throw authError
            
            if (data.user && data.session) {
                Cookies.set('sentinel_session', data.session.access_token, { 
                    expires: 1/24,
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'Lax'
                })
    
                setUser({
                    user_id: data.user.id,
                    username: data.user.email?.split('@')[0] || 'user',
                    email: data.user.email || '',
                    role: 'viewer',
                    is_active: true
                })
                
                if (data.session.refresh_token) {
                  localStorage.setItem('refresh_token', data.session.refresh_token)
                }
                
                window.location.href = '/'
            }
        }
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        })
        if (authError) throw authError
        setActiveTab('signin')
        alert('Check your email for confirmation')
      }
    } catch (err: any) {
      setError({ type: 'invalid', msg: err.message || 'Authentication failed.' })
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: 'github') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    if (error) {
        setError({ type: 'invalid', msg: error.message })
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
        await apiClient.forgotPassword(email)
        alert('CHECK YOUR EMAIL')
        setShowForgot(false)
    } catch (err: any) {
        const adminEmail = settings?.admin_email || 'admin@sentinel.local'
        alert(`Contact admin: ${adminEmail}`)
    }
  }

  const handleRequestAccess = async (e: React.FormEvent, reqEmail: string, reqName: string, reason: string) => {
    e.preventDefault()
    try {
        await apiClient.requestAccess({ email: reqEmail, name: reqName, reason })
        alert('REQUEST SUBMITTED. ADMIN WILL CONTACT YOU.')
        setShowAccess(false)
    } catch {
        alert('Failed to submit request.')
    }
  }

  const formatLockout = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const passStrength = Math.min(5, (password.length > 7 ? 1 : 0) + (/[A-Z]/.test(password) ? 1 : 0) + (/[a-z]/.test(password) ? 1 : 0) + (/[0-9]/.test(password) ? 1 : 0) + (/[^A-Za-z0-9]/.test(password) ? 1 : 0))

  return (
    <main className="flex h-screen w-full bg-surface text-on-surface font-sans antialiased overflow-hidden">
      {/* LEFT PANEL */}
      <section 
        className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-16 bg-surface-container-lowest overflow-hidden border-r border-outline-variant/10"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
      >
        {/* Background Dot Grid */}
        <div className="absolute inset-0 dot-grid opacity-[0.05] pointer-events-none z-0" />
        
        {/* Interactive Mouse Pulse */}
        <motion.div 
          className="absolute w-[600px] h-[600px] rounded-full pointer-events-none z-0 blur-[180px] opacity-40"
          animate={{
            x: mousePos.x - 300,
            y: mousePos.y - 300,
          }}
          transition={{ type: 'spring', damping: 40, stiffness: 150, mass: 1 }}
          style={{
            background: 'radial-gradient(circle, rgba(0, 240, 255, 0.1) 0%, transparent 70%)',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="font-mono text-[14px] tracking-[0.4em] text-primary uppercase font-bold">SENTINEL_OS</h1>
            <p className="text-[8px] font-mono text-on-surface-variant/40 tracking-[0.2em]">VERSION: 1.0 // Created by Sandesh Verma</p>
          </div>
        </div>

        <div className="relative z-10 flex flex-col font-mono text-[64px] leading-[0.9] text-primary tracking-tighter uppercase font-black">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.1 }}>Secure.</motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="ml-12 text-on-surface/20">Predictive.</motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} className="ml-6 text-glow">Unyielding.</motion.div>
        </div>

        {/* Floating Stat Chips */}
        <div className="mt-16 grid grid-cols-2 gap-4 max-w-sm relative z-10" style={{ isolation: 'isolate' }}>
          <div className="bg-surface-container-high/60 p-4 glow-border flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest leading-none">Uptime</span>
              <StatusDot status="healthy" size={6} />
            </div>
            <span className="text-xl font-mono text-primary font-bold leading-none tracking-normal">99.998%</span>
          </div>
          <div className="bg-surface-container-high/60 p-4 glow-border flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest leading-none">Latency</span>
              <StatusDot status="healthy" size={6} />
            </div>
            <span className="text-xl font-mono text-on-surface font-bold leading-none tracking-normal">14ms</span>
          </div>
        </div>

        <div className="relative z-10 flex justify-between items-end">
          <div className="space-y-1">
            <p className="font-mono text-[10px] text-primary uppercase tracking-[0.2em] font-bold">NEURAL_SHIELD_ACTIVE</p>
            <p className="font-mono text-[9px] text-on-surface-variant/40 uppercase">Created by Sandesh Verma — Sentinel v1.0</p>
          </div>
          <div className="font-mono text-[10px] text-on-surface-variant/40">© 2026 SENTINEL_CORP</div>
        </div>
      </section>

      {/* RIGHT PANEL */}
      <section className="w-full lg:w-[45%] bg-surface flex flex-col p-8 md:p-16 lg:p-24 justify-center relative">
        <div className="max-w-[420px] w-full mx-auto relative">
          
          <nav className="flex w-full mb-12 relative h-12 items-center bg-surface-container-low">
            <button className={`flex-1 text-center font-sans text-sm font-medium z-10 py-3 transition-colors ${activeTab === 'signin' ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => { setActiveTab('signin'); setError(null) }}>
              Sign in
            </button>
            <button className={`flex-1 text-center font-sans text-sm font-medium z-10 py-3 transition-colors ${activeTab === 'create' ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => { setActiveTab('create'); setError(null) }}>
              Create account
            </button>
            <div className="absolute top-0 bottom-0 w-1/2 bg-surface-container-highest transition-transform duration-300" style={{ transform: `translateX(${activeTab === 'signin' ? '0%' : '100%'})` }} />
          </nav>

          <AnimatePresence mode="wait">
            {activeTab === 'signin' ? (
              <motion.div key="signin" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <div className="space-y-2 mb-10">
                  <h2 className="text-[22px] font-sans font-semibold tracking-tight">Welcome back</h2>
                  <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
                    <span>Sign in to your secure sentinel workspace.</span>
                    <div className="flex items-center gap-1 bg-surface-container-highest/30 px-1.5 py-0.5 border border-outline-variant/30 text-on-surface">
                      <Lock size={10} />
                      <span className="mono-label tracking-tighter">SENTINEL_SECURE</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 mb-8">
                  {['github'].map(provider => {
                    const enabled = true // GitHub is now the only one enabled
                    return (
                      <button key={provider} onClick={() => handleOAuthLogin('github')} className={`flex items-center justify-center py-3 bg-transparent transition-all group ghost-border hover:bg-surface-container-low cursor-pointer`}>
                        {provider === 'github' && <svg className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path></svg>}
                        <span className="ml-3 font-sans text-sm font-medium">Continue with GitHub</span>
                      </button>
                    )
                  })}
                </div>

                <div className="relative flex items-center mb-8">
                  <div className="flex-grow border-t border-outline-variant/20"></div>
                  <span className="flex-shrink mx-4 mono-label text-on-surface-variant/60 lowercase">or continue with email</span>
                  <div className="flex-grow border-t border-outline-variant/20"></div>
                </div>

                <div className="bg-surface-container-lowest p-8 ghost-border">
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Username</label>
                      <input autoFocus className="w-full bg-surface-container-highest border-0 focus:ring-0 px-4 py-3 text-on-surface font-mono text-sm placeholder:text-on-surface-variant/30 outline-none ghost-border ghost-border-focus" placeholder="OPERATOR_ID" type="text" value={username} onChange={e => setUsername(e.target.value)} required disabled={error?.type === 'locked'} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="block mono-label text-on-surface-variant">Password</label>
                        <button type="button" className="mono-label text-primary hover:underline" onClick={() => setShowForgot(true)}>Forgot?</button>
                      </div>
                      <div className="relative">
                        <input className="w-full bg-surface-container-highest border-0 focus:ring-0 px-4 py-3 text-on-surface font-sans text-sm outline-none ghost-border ghost-border-focus" placeholder="••••••••••••" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required disabled={error?.type === 'locked'} />
                        <button className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface" type="button" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={`p-4 border ${error.type === 'invalid' || error.type === 'network' ? 'bg-error-container/20 border-error/50 text-error' : 'bg-amber-900/20 border-amber-500/50 text-amber-400'}`}>
                          <div className="mono-label mb-1 opacity-80">// {error.type === 'locked' ? 'ACCOUNT LOCKED' : error.type === 'network' ? 'CONNECTION REFUSED' : 'AUTHENTICATION FAILED'}</div>
                          <div className="font-sans text-sm flex gap-2 items-center">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error.msg} {error.type === 'locked' && error.unlockIn !== undefined ? formatLockout(error.unlockIn) : ''}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button className="w-full py-4 bg-primary text-on-primary font-sans font-bold uppercase tracking-widest text-xs hover:bg-primary-fixed transition-all phosphor-glow flex items-center justify-center gap-2 group relative disabled:opacity-50" type="submit" disabled={loading || error?.type === 'locked'}>
                      <span className={`transition-opacity flex items-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                        Sign in to Sentinel <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </span>
                      {loading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" size={18} /> <span className="mono-label ml-2">AUTHENTICATING...</span></div>}
                    </button>
                  </form>
                </div>

                <div className="mt-12 pt-8 border-t border-outline-variant/10 text-center">
                  <p className="text-[12px] text-on-surface-variant font-sans">
                    New deployment? 
                    <button className="text-primary hover:underline font-medium ml-1" onClick={() => setShowAccess(true)}>Request access key</button>
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="create" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                {false ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center mb-6 text-on-surface-variant"><Lock size={32} /></div>
                    <h2 className="text-lg font-mono tracking-tight text-on-surface mb-2">ACCOUNT CREATION RESTRICTED</h2>
                    <p className="text-sm font-sans text-on-surface-variant">Contact your administrator to request access.</p>
                  </div>
                ) : (
                  <form className="space-y-5" onSubmit={handleSubmit}>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Username</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 text-on-surface font-mono text-sm outline-none ghost-border ghost-border-focus" type="text" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Email</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 text-on-surface font-mono text-sm outline-none ghost-border ghost-border-focus" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Password</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 text-on-surface font-sans text-sm outline-none ghost-border ghost-border-focus" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                      <div className="flex gap-1 mt-3">
                        {[1,2,3,4,5].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${i <= passStrength ? (passStrength < 3 ? 'bg-error' : passStrength < 5 ? 'bg-amber-400' : 'bg-primary') : 'bg-surface-container-highest'}`} />)}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {[{ l: '8+ chars', v: password.length > 7 }, { l: 'Uppercase', v: /[A-Z]/.test(password) }, { l: 'Lowercase', v: /[a-z]/.test(password) }, { l: 'Number', v: /[0-9]/.test(password) }, { l: 'Special', v: /[^A-Za-z0-9]/.test(password) }].map((req, i) => (
                          <div key={i} className={`flex items-center gap-2 text-[11px] font-mono ${req.v ? 'text-primary' : 'text-on-surface-variant/50'}`}>
                            {req.v ? <Check size={12} /> : <div className="w-3 h-3 border border-current rounded-full" />} {req.l}
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="w-full mt-6 py-4 bg-primary text-on-primary font-sans font-bold uppercase tracking-widest text-xs hover:bg-primary-fixed transition-all" type="submit" disabled={loading || passStrength < 3}>Create account</button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* DIALOGS */}
      <AnimatePresence>
        {showForgot && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface/80 backdrop-blur-sm" onClick={() => setShowForgot(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-surface-container-low w-full max-w-md p-8 ghost-border">
              <h3 className="text-xl font-mono mb-4 text-on-surface uppercase tracking-widest">Forgot Password</h3>
              <form onSubmit={handleForgotPassword}>
                <input className="w-full bg-surface-container-highest px-4 py-3 text-on-surface font-mono text-sm mb-6 outline-none ghost-border ghost-border-focus" placeholder="Enter your email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <div className="flex justify-end gap-4">
                  <button type="button" className="mono-label text-on-surface-variant hover:text-on-surface" onClick={() => setShowForgot(false)}>Cancel</button>
                  <button type="submit" className="bg-primary text-on-primary px-6 py-2 mono-label font-bold">Send reset link</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showAccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface/80 backdrop-blur-sm" onClick={() => setShowAccess(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-surface-container-low w-full max-w-md p-8 ghost-border">
              <h3 className="text-xl font-mono mb-6 text-on-surface uppercase tracking-widest">Request Access</h3>
              <form onSubmit={(e) => {
                const fd = new FormData(e.currentTarget);
                handleRequestAccess(e, fd.get('email') as string, fd.get('name') as string, fd.get('reason') as string);
              }}>
                <input name="name" className="w-full bg-surface-container-highest px-4 py-3 text-on-surface font-mono text-sm mb-4 outline-none ghost-border ghost-border-focus" placeholder="Name" type="text" required />
                <input name="email" className="w-full bg-surface-container-highest px-4 py-3 text-on-surface font-mono text-sm mb-4 outline-none ghost-border ghost-border-focus" placeholder="Email" type="email" required />
                <textarea name="reason" className="w-full bg-surface-container-highest px-4 py-3 text-on-surface font-mono text-sm mb-6 outline-none ghost-border ghost-border-focus resize-none h-24" placeholder="Reason for access" required></textarea>
                <div className="flex justify-end gap-4">
                  <button type="button" className="mono-label text-on-surface-variant hover:text-on-surface" onClick={() => setShowAccess(false)}>Cancel</button>
                  <button type="submit" className="bg-primary text-on-primary px-6 py-2 mono-label font-bold">Submit Request</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  )
}
