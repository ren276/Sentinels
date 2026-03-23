'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, CheckCircle2, ChevronRight, Activity, Globe, Webhook, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'

const steps = [
  { id: 'database', label: 'Database Connection', icon: Activity },
  { id: 'urls', label: 'Monitored URLs', icon: Globe },
  { id: 'slack', label: 'Slack Integration', icon: Webhook },
]

export default function SetupGuidePage() {
  const router = useRouter()
  const [activeStep, setActiveStep] = useState(0)
  const [status, setStatus] = useState<Record<string, 'pending' | 'success' | 'error'>>({
    database: 'pending',
    urls: 'pending',
    slack: 'pending'
  })

  // URL State
  const [urlInput, setUrlInput] = useState('')
  const [monitoredUrls, setMonitoredUrls] = useState<{ id: number, url: string, active: boolean }[]>([])

  // Slack State
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testingWebhook, setTestingWebhook] = useState(false)

  useEffect(() => {
    // Check DB on load
    apiClient.getServices().then(() => {
      setStatus(s => ({ ...s, database: 'success' }))
      if (activeStep === 0) setActiveStep(1)
    }).catch(() => {
      setStatus(s => ({ ...s, database: 'error' }))
    })

    // Fetch existing URLs
    apiClient.getSettings().then((res) => {
      // Assuming settings contains monitored URLs or we fetch from a specific endpoint
      if (res.data?.monitored_urls?.length) {
         setStatus(s => ({ ...s, urls: 'success' }))
      }
    }).catch(console.error)
  }, [activeStep])

  const handleAddUrl = async () => {
    if (!urlInput) return
    // Mock API call to add URL
    setMonitoredUrls([...monitoredUrls, { id: Date.now(), url: urlInput, active: true }])
    setUrlInput('')
    setStatus(s => ({ ...s, urls: 'success' }))
  }

  const handleTestSlack = async () => {
    if (!webhookUrl) return
    setTestingWebhook(true)
    try {
      await apiClient.testSlackWebhook(webhookUrl)
      setStatus(s => ({ ...s, slack: 'success' }))
    } catch {
      setStatus(s => ({ ...s, slack: 'error' }))
    } finally {
      setTestingWebhook(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#121317] text-[#e3e2e7] flex items-center justify-center p-6 font-sans">
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Progress Tracker */}
        <div className="lg:col-span-4 space-y-8">
          <div>
            <h1 className="text-3xl font-mono text-[#dbfcff] font-bold tracking-tight mb-2 uppercase">Sentinel Setup</h1>
            <p className="text-[#b9cacb] text-sm font-mono tracking-widest uppercase">System Initialization</p>
          </div>
          
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[15px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-[#3b494b]/30">
            {steps.map((step, index) => {
              const isActive = index === activeStep
              const isPast = index < activeStep
              const Icon = step.icon
              const currentStatus = status[step.id]

              return (
                <div key={step.id} className="relative flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center bg-[#121317] z-10 transition-colors ${
                    isActive ? 'border-[#00dbe9] text-[#00dbe9]' : 
                    isPast || currentStatus === 'success' ? 'border-emerald-500 text-emerald-500' : 'border-[#3b494b] text-[#3b494b]'
                  }`}>
                    {currentStatus === 'success' ? <Check size={14} /> : <Icon size={14} />}
                  </div>
                  <div>
                    <h3 className={`font-mono text-sm uppercase tracking-widest ${isActive ? 'text-[#dbfcff] font-bold' : 'text-[#b9cacb]'}`}>{step.label}</h3>
                    <p className={`text-[10px] font-mono uppercase tracking-[0.2em] ${currentStatus === 'success' ? 'text-emerald-500' : currentStatus === 'error' ? 'text-[#ffb4ab]' : 'text-[#b9cacb]/50'}`}>
                      {currentStatus === 'success' ? 'Connected' : currentStatus === 'error' ? 'Failed' : 'Pending'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Side: Active Step Content */}
        <div className="lg:col-span-8 bg-[#1a1b20] border border-[#3b494b]/30 p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#343439]">
            <motion.div 
              className="h-full bg-[#00dbe9]"
              initial={{ width: '0%' }}
              animate={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 1: DATABASE */}
            {activeStep === 0 && (
              <motion.div key="db" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-mono text-[#dbfcff] uppercase">Core Database</h2>
                  <p className="text-sm text-[#b9cacb]">Sentinel requires a PostgreSQL database to store telemetry, alerts, and settings.</p>
                </div>
                
                <div className="bg-[#0d0e12] p-6 border-l-2 border-[#00dbe9] font-mono text-sm">
                  {status.database === 'success' ? (
                    <div className="flex items-center gap-3 text-emerald-400">
                      <CheckCircle2 size={18} /> DATABASE CONNECTION ESTABLISHED
                    </div>
                  ) : status.database === 'error' ? (
                     <div className="flex items-center gap-3 text-[#ffb4ab]">
                      <span className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-pulse" /> CONNECTION FAILED
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-[#dbfcff] opacity-70">
                      <Loader2 size={18} className="animate-spin" /> PROBING DATABASE...
                    </div>
                  )}
                </div>

                <div className="pt-8 flex justify-end">
                  <button onClick={() => setActiveStep(1)} disabled={status.database !== 'success'} className="bg-[#dbfcff] text-[#00363a] px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all">
                    Continue <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: URLS */}
            {activeStep === 1 && (
               <motion.div key="url" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                 <div className="space-y-2">
                  <h2 className="text-xl font-mono text-[#dbfcff] uppercase">Monitored Services</h2>
                  <p className="text-sm text-[#b9cacb]">Add HTTP/HTTPS endpoints for active synthetic monitoring.</p>
                </div>
                
                <div className="flex gap-4">
                  <input 
                    type="url" 
                    placeholder="https://api.production.com/health" 
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="flex-1 bg-[#343439] border-none text-[#e3e2e7] px-4 py-3 font-mono text-sm focus:ring-1 focus:ring-[#00dbe9] outline-none"
                  />
                  <button onClick={handleAddUrl} className="bg-[#343439] hover:bg-[#38393d] border border-[#3b494b]/50 px-6 py-3 font-mono text-xs uppercase tracking-widest text-[#dbfcff] transition-colors">
                    Add
                  </button>
                </div>

                {monitoredUrls.length > 0 && (
                  <div className="bg-[#0d0e12] border border-[#3b494b]/20">
                    <table className="w-full text-left font-mono text-xs">
                      <tbody>
                        {monitoredUrls.map((m) => (
                           <tr key={m.id} className="border-b border-[#3b494b]/10 last:border-0 hover:bg-[#1a1b20]">
                             <td className="p-4 text-[#e3e2e7]">{m.url}</td>
                             <td className="p-4 text-right">
                               <span className="text-emerald-400 bg-emerald-400/10 px-2 py-1 uppercase tracking-widest">Active</span>
                             </td>
                           </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="pt-8 flex justify-between">
                  <button onClick={() => setActiveStep(0)} className="text-[#b9cacb] hover:text-[#e3e2e7] font-mono text-xs uppercase tracking-widest transition-colors py-3">Back</button>
                  <button onClick={() => setActiveStep(2)} className="bg-[#dbfcff] text-[#00363a] px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all">
                    {monitoredUrls.length > 0 ? 'Continue' : 'Skip for now'} <ChevronRight size={16} />
                  </button>
                </div>
               </motion.div>
            )}

            {/* STEP 3: SLACK */}
            {activeStep === 2 && (
               <motion.div key="slack" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                 <div className="space-y-2">
                  <h2 className="text-xl font-mono text-[#dbfcff] uppercase">Notification Gateway</h2>
                  <p className="text-sm text-[#b9cacb]">Configure Slack Webhook to receive instant RCA reports and Critical Alerts.</p>
                </div>

                <div className="space-y-4">
                   <div className="relative">
                     <input 
                      type="password"
                      placeholder="https://hooks.slack.com/services/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="w-full bg-[#343439] border-none text-[#e3e2e7] px-4 py-3 font-mono text-sm focus:ring-1 focus:ring-[#00dbe9] outline-none"
                     />
                   </div>
                   <button onClick={handleTestSlack} disabled={testingWebhook || !webhookUrl} className="w-full bg-[#0d0e12] border border-[#3b494b]/50 text-[#dbfcff] py-3 font-mono text-xs uppercase tracking-widest hover:bg-[#343439] transition-colors disabled:opacity-50">
                     {testingWebhook ? 'Testing...' : 'Test Webhook'}
                   </button>
                </div>

                {status.slack === 'success' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 font-mono text-sm text-emerald-400 flex items-center gap-3">
                    <CheckCircle2 size={16} /> VERIFIED SUCCESSFULLY
                  </div>
                )}
                {status.slack === 'error' && (
                  <div className="bg-[#93000a]/20 border border-[#ffb4ab]/20 p-4 font-mono text-sm text-[#ffb4ab] flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-pulse" /> VALIDATION FAILED
                  </div>
                )}

                <div className="pt-8 flex justify-between border-t border-[#3b494b]/20 mt-8">
                  <button onClick={() => setActiveStep(1)} className="text-[#b9cacb] hover:text-[#e3e2e7] font-mono text-xs uppercase tracking-widest transition-colors py-3">Back</button>
                  <button onClick={() => router.push('/')} className="bg-[#dbfcff] text-[#00363a] px-8 py-3 font-mono text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(219,252,255,0.2)] hover:shadow-[0_0_20px_rgba(219,252,255,0.4)] transition-all">
                    Complete Setup
                  </button>
                </div>
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
