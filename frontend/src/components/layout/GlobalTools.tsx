'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Bell, Moon, Sun, X, Activity } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

export function GlobalTools() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [theme, setTheme] = useState('dark')
  const [searchQ, setSearchQ] = useState('')
  const router = useRouter()

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const { data: anomalies = [] } = useQuery({
    queryKey: ['recent-anomalies'],
    queryFn: () => apiClient.getRecentAnomalies(5).then(res => res.data).catch(() => []),
    refetchInterval: 15000,
  })

  const toggleTheme = () => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('invert')
      setTheme('light')
    } else {
      root.classList.remove('invert')
      setTheme('dark')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQ) return
    router.push(`/services?q=${encodeURIComponent(searchQ)}`)
    setSearchOpen(false)
  }

  return (
    <>
      <div className="flex items-center gap-4 text-[#b9cacb]">
        <button onClick={() => setSearchOpen(true)} className="hover:text-[#dbfcff] transition-colors tooltip-trigger" title="Search (Cmd+K)">
          <Search size={16} />
        </button>
        <div className="relative">
          <button onClick={() => setNotifOpen(!notifOpen)} className="hover:text-[#dbfcff] transition-colors relative tooltip-trigger" title="Notifications">
            <Bell size={16} />
            {anomalies.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00f0ff] rounded-full animate-pulse shadow-[0_0_8px_rgba(0,240,255,0.6)]"></span>}
          </button>
          
          <AnimatePresence>
            {notifOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
                className="absolute bottom-full left-0 mb-4 w-80 bg-[#1a1b20] border border-[#3b494b] shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-3 bg-[#0d0e12] border-b border-[#3b494b]/50 text-[10px] font-mono uppercase tracking-widest text-[#dbfcff] flex justify-between items-center">
                  <span>System Alerts</span>
                  <button onClick={() => setNotifOpen(false)}><X size={14} /></button>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {anomalies.length > 0 ? anomalies.map((a: any) => (
                    <div key={a.anomaly_id} className="p-3 border-b border-[#3b494b]/20 hover:bg-[#343439]/30 transition-colors cursor-pointer" onClick={() => router.push('/incidents')}>
                      <div className="flex items-center gap-2 mb-1">
                        <Activity size={12} className="text-[#ffb4ab]" />
                        <span className="font-mono text-[10px] text-[#ffb4ab]">ANOMALY DETECTED</span>
                      </div>
                      <p className="text-xs text-[#e3e2e7] font-sans truncate">{a.service_id}: Metric deviation</p>
                      <span className="font-mono text-[9px] text-[#b9cacb] opacity-60">Score: {(a.anomaly_score ?? 0).toFixed(3)}</span>
                    </div>
                  )) : (
                    <div className="p-6 text-center font-mono text-[10px] text-[#b9cacb] uppercase tracking-widest">
                      SYSTEM NOMINAL
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={toggleTheme} className="hover:text-[#dbfcff] transition-colors tooltip-trigger" title="Toggle Theme (Invert Protocol)">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSearchOpen(false)} 
              className="absolute inset-0 bg-[#0d0e12]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-xl bg-[#1a1b20] border border-[#00f0ff]/30 shadow-[0_0_50px_rgba(0,240,255,0.1)] overflow-hidden"
            >
              <form onSubmit={handleSearch} className="flex items-center p-4 border-b border-[#3b494b]/30">
                <Search className="text-[#00f0ff] mr-3" size={20} />
                <input 
                  autoFocus 
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="SEARCH SYSTEM DIRECTORY..." 
                  className="w-full bg-transparent border-none text-[#dbfcff] font-mono text-lg focus:outline-none placeholder:text-[#b9cacb]/30"
                />
                <button type="button" onClick={() => setSearchOpen(false)} className="bg-[#343439] hover:bg-[#38393d] p-1 font-mono text-[10px] uppercase text-[#b9cacb] px-2 ml-2 transition-colors">ESC</button>
              </form>
              <div className="p-4 bg-[#0d0e12]">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]/60">Quick Commands</p>
                <div className="mt-2 space-y-1">
                  <button onClick={() => { router.push('/incidents'); setSearchOpen(false) }} className="w-full text-left px-3 py-2 font-mono text-xs text-[#e3e2e7] hover:bg-[#343439] hover:text-[#00f0ff] transition-colors uppercase tracking-widest flex items-center justify-between">
                    <span>View Active Incidents</span>
                  </button>
                  <button onClick={() => { router.push('/settings'); setSearchOpen(false) }} className="w-full text-left px-3 py-2 font-mono text-xs text-[#e3e2e7] hover:bg-[#343439] hover:text-[#00f0ff] transition-colors uppercase tracking-widest flex items-center justify-between">
                    <span>System Settings</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
