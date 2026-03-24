'use client'
import { useState, useEffect } from 'react'
import { Send, Check, ChevronDown, ChevronUp, AlertCircle, Plus, Terminal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function IntegrationsSettings() {
  const queryClient = useQueryClient()
  
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings().then(res => res.data).catch(() => ({})),
  })

  const [activeStep, setActiveStep] = useState(1)
  
  // Step 1 State
  const [step1Checks, setStep1Checks] = useState(Array(7).fill(false))
  
  // Step 2 State
  const [webhookUrl, setWebhookUrl] = useState('')
  const [channelName, setChannelName] = useState('#incidents')
  const [botName, setBotName] = useState('Sentinel')
  const [mention, setMention] = useState('@cybersec')
  
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null)
  const urlValid = /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$/.test(webhookUrl)

  // Step 3 State
  const [alerts, setAlerts] = useState({
    critical: true,
    warning: true,
    slo: true,
    postRecovery: false,
    resolution: false
  })
  const [deliveryType, setDeliveryType] = useState('instant')

  useEffect(() => {
    if (settings.SLACK_WEBHOOK_URL) setWebhookUrl(settings.SLACK_WEBHOOK_URL)
    if (settings.SLACK_CHANNEL) setChannelName(settings.SLACK_CHANNEL)
    if (settings.SLACK_DELIVERY_TYPE) setDeliveryType(settings.SLACK_DELIVERY_TYPE)
    if (settings.SLACK_ALERTS) setAlerts(settings.SLACK_ALERTS)
    if (settings.SLACK_ENABLED) setActiveStep(0) // 0 means active/connected mode
  }, [settings])

  const handleTest = async () => {
    if (!webhookUrl || !urlValid) return
    setTesting(true)
    setTestResult(null)
    try {
      await apiClient.testSlackWebhook(webhookUrl)
      setTestResult({ success: true, message: `Message delivered to ${channelName}` })
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.detail || 'Validation failed' })
    } finally {
      setTesting(false)
    }
  }

  const { mutate: activateIntegration, isPending: activating } = useMutation({
    mutationFn: () => apiClient.updateSettings({
      SLACK_ENABLED: true,
      SLACK_WEBHOOK_URL: webhookUrl,
      SLACK_CHANNEL: channelName,
      SLACK_ALERTS: alerts,
      SLACK_DELIVERY_TYPE: deliveryType
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Integration activated successfully')
      setActiveStep(0)
    },
    onError: () => toast.error('Failed to activate integration')
  })

  const { mutate: disconnectIntegration } = useMutation({
    mutationFn: () => apiClient.updateSettings({
      SLACK_ENABLED: false,
      SLACK_WEBHOOK_URL: '',
      SLACK_CHANNEL: ''
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Integration disconnected')
      setActiveStep(1)
      setWebhookUrl('')
    }
  })

  const isActive = settings.SLACK_ENABLED === true

  return (
    <div className="w-full animate-fade-in relative z-10 flex flex-col gap-8">
      
      {/* Visual Pipeline Diagram */}
      <div className="bg-surface-container-low p-8 flex flex-col items-center">
        <div className="flex w-full max-w-2xl justify-between items-center relative">
          
          <div className="absolute top-1/2 left-10 right-10 h-0.5 -translate-y-1/2 z-0">
             <div className="w-full h-full bg-outline-variant/30 flex items-center overflow-hidden">
               {isActive && <div className="w-[200%] h-full flex" style={{ animation: 'slide-right 2s linear infinite' }}>
                 <div className="w-full h-full bg-[linear-gradient(90deg,transparent_0%,var(--primary)_50%,transparent_100%)] opacity-50"></div>
               </div>}
             </div>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 bg-surface ${isActive ? 'border-primary text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
              <Terminal size={20} />
            </div>
            <span className="mono-label text-on-surface">SENTINEL</span>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`w-12 h-12 bg-surface rounded-lg flex items-center justify-center border-2 rotate-45 ${isActive ? 'border-primary' : 'border-outline-variant'}`}>
              <div className={`w-3 h-3 rounded-full -rotate-45 ${isActive ? 'bg-primary' : 'bg-outline-variant'}`} />
            </div>
            <span className="mono-label text-on-surface">WEBHOOK</span>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center border-2 bg-surface ${isActive ? 'border-primary text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
              <span className="font-bold text-lg">#</span>
            </div>
            <span className="mono-label text-on-surface">SLACK_CH</span>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{__html:`
          @keyframes slide-right {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0); }
          }
        `}} />

        {/* Status Chips Row */}
        <div className="mt-10 flex flex-wrap items-center gap-4 justify-center">
           {isActive ? (
             <span className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 mono-label flex items-center gap-2">
               ACTIVE
             </span>
           ) : (
             <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant mono-label">
               INACTIVE
             </span>
           )}
           <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant mono-label">
             LAST_SYNC: {isActive ? '2 MIN AGO' : 'NEVER'}
           </span>
           <span className="px-3 py-1 bg-surface-container-low text-on-surface-variant mono-label">
             PROTO_STAT: {isActive ? 'CONNECTED' : 'DISCONNECTED'}
           </span>
        </div>
      </div>

      {isActive ? (
        <div className="bg-primary/5 p-8 flex flex-col items-center text-center gap-6">
           <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary">
             <Check size={32} />
           </div>
           <div>
             <h2 className="text-xl font-sans font-bold text-primary mb-2">Integration Active</h2>
             <p className="text-sm font-mono text-on-surface-variant tracking-widest uppercase">Target: {channelName}</p>
             <p className="text-sm font-sans text-on-surface mt-4">Sentinel is actively forwarding incident alerts and system digests to your connected Slack workspace.</p>
           </div>
           
           <div className="flex gap-4 mt-4">
             <button onClick={handleTest} className="bg-surface-container px-6 py-3 mono-label text-on-surface hover:text-primary transition-colors disabled:opacity-50" disabled={testing}>
               {testing ? 'SENDING...' : 'SEND TEST ALERT'}
             </button>
             <button onClick={() => confirm('Are you sure you want to disconnect Slack?') && disconnectIntegration()} className="bg-error-container/20 text-error px-6 py-3 mono-label hover:bg-error/20 transition-colors">
               DISCONNECT
             </button>
           </div>
           
           {testResult && (
             <div className="mt-4 font-mono text-xs text-primary">{testResult.message}</div>
           )}
        </div>
      ) : (
        <div className="space-y-4">
          <StepHeader num={1} title="Create Slack Application" active={activeStep === 1} setStep={() => setActiveStep(activeStep === 1 ? 0 : 1)} />
          <AnimatePresence>
            {activeStep === 1 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="bg-surface-container-low p-6 space-y-4 font-mono text-sm text-on-surface">
                  {[
                    "Navigate to api.slack.com/apps",
                    "Create New App → From scratch",
                    "Name app 'Sentinel' and select your workspace",
                    "Go to 'Incoming Webhooks' and toggle ON",
                    "Click 'Add New Webhook to Workspace'",
                    "Select the target channel and click 'Allow'",
                    "Copy the generated Webhook URL"
                  ].map((text, i) => (
                    <div key={i} className="flex items-start gap-4 cursor-pointer" onClick={() => setStep1Checks(prev => { const n=[...prev]; n[i]=!n[i]; return n })}>
                      <div className={`w-5 h-5 flex items-center justify-center border mt-0.5 shrink-0 ${step1Checks[i] ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant text-transparent bg-surface-container-highest'}`}>
                         <Check size={14} />
                      </div>
                      <span className={`${step1Checks[i] ? 'text-on-surface-variant line-through opacity-70' : 'text-on-surface'}`}>{i+1}. {text}</span>
                    </div>
                  ))}
                  
                  <div className="pt-6 mt-6 border-t border-outline-variant/30 flex justify-end">
                    <button onClick={() => setActiveStep(2)} className="bg-primary text-on-primary px-8 py-3 mono-label font-bold disabled:opacity-50" disabled={step1Checks.some(c => !c)}>
                      CONTINUE TO STEP 02
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <StepHeader num={2} title="Webhook Endpoint Input" active={activeStep === 2} setStep={() => setActiveStep(activeStep === 2 ? 0 : 2)} />
          <AnimatePresence>
            {activeStep === 2 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="bg-surface-container-low p-6 space-y-6">
                  <div>
                    <input 
                      className={`w-full bg-surface-container-highest border px-4 py-4 font-mono text-sm placeholder:text-on-surface-variant/30 focus:ring-1 outline-none transition-all ${webhookUrl ? (urlValid ? 'border-primary/50 focus:ring-primary/40 text-primary' : 'border-error/50 focus:ring-error/40 text-error') : 'border-outline-variant/30 focus:ring-primary/40 text-on-surface'}`}
                      placeholder="https://hooks.slack.com/services/..." 
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                    {webhookUrl && !urlValid && <p className="text-error text-[10px] font-mono mt-2 uppercase tracking-widest">Invalid webhook URL format</p>}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Channel Name</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 font-mono text-sm text-on-surface outline-none ghost-border-focus" value={channelName} onChange={e=>setChannelName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Bot Display Name</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 font-mono text-sm text-on-surface outline-none ghost-border ghost-border-focus" value={botName} onChange={e=>setBotName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block mono-label text-on-surface-variant mb-2">Mention on Critical</label>
                      <input className="w-full bg-surface-container-highest border-0 px-4 py-3 font-mono text-sm text-on-surface outline-none ghost-border ghost-border-focus" value={mention} onChange={e=>setMention(e.target.value)} />
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <button onClick={handleTest} disabled={testing || !urlValid} className="bg-surface-container-highest text-on-surface hover:bg-surface-container px-6 py-3 mono-label border border-outline-variant/30 disabled:opacity-50">
                      {testing ? 'TESTING...' : 'TEST CONNECTION'}
                    </button>
                    {testResult && (
                      <span className={`mono-label px-3 py-1 ${testResult.success ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error'}`}>
                        {testResult.success ? 'CONF' : 'FAIL'}: {testResult.message}
                      </span>
                    )}
                  </div>
                  
                  <div className="pt-6 mt-6 border-t border-outline-variant/30 flex justify-end">
                    <button onClick={() => setActiveStep(3)} className="bg-primary text-on-primary px-8 py-3 mono-label font-bold disabled:opacity-50" disabled={!testResult?.success}>
                      CONTINUE TO STEP 03
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <StepHeader num={3} title="Final Configuration" active={activeStep === 3} setStep={() => setActiveStep(activeStep === 3 ? 0 : 3)} />
          <AnimatePresence>
            {activeStep === 3 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="bg-surface-container-low p-6 space-y-8">
                  
                  <div className="space-y-4">
                    <h4 className="mono-label text-on-surface-variant mb-4">ALERT PARAMETERS</h4>
                    <ToggleRow label="Critical Failures" active={alerts.critical} onClick={() => setAlerts(p => ({...p, critical: !p.critical}))} />
                    <ToggleRow label="Warning Digest" active={alerts.warning} onClick={() => setAlerts(p => ({...p, warning: !p.warning}))} />
                    <ToggleRow label="SLO Breach" active={alerts.slo} onClick={() => setAlerts(p => ({...p, slo: !p.slo}))} />
                    <ToggleRow label="Post-Recovery" active={alerts.postRecovery} onClick={() => setAlerts(p => ({...p, postRecovery: !p.postRecovery}))} />
                    <ToggleRow label="Resolution Logs" active={alerts.resolution} onClick={() => setAlerts(p => ({...p, resolution: !p.resolution}))} />
                  </div>

                  <div className="space-y-4">
                    <h4 className="mono-label text-on-surface-variant mb-4">DELIVERY TYPE</h4>
                    <div className="flex gap-4">
                      <div onClick={() => setDeliveryType('instant')} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${deliveryType === 'instant' ? 'border-primary' : 'border-outline-variant group-hover:border-on-surface-variant'}`}>
                          {deliveryType === 'instant' && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className={`font-sans text-sm transition-colors ${deliveryType === 'instant' ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}>Instant delivery</span>
                      </div>
                      
                      <div onClick={() => setDeliveryType('hourly')} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${deliveryType === 'hourly' ? 'border-primary' : 'border-outline-variant group-hover:border-on-surface-variant'}`}>
                          {deliveryType === 'hourly' && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className={`font-sans text-sm transition-colors ${deliveryType === 'hourly' ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}>Hourly batch</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-outline-variant/30 flex justify-end">
                    <button onClick={() => activateIntegration()} disabled={activating} className="bg-primary text-on-primary px-8 py-4 mono-label font-bold tracking-widest hover:bg-primary-fixed transition-colors flex items-center gap-2">
                       {activating ? 'ACTIVATING...' : 'ACTIVATE INTEGRATION'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}

    </div>
  )
}

function StepHeader({ num, title, active, setStep }: { num: number, title: string, active: boolean, setStep: () => void }) {
  return (
    <div className={`p-6 cursor-pointer flex justify-between items-center transition-colors ${active ? 'bg-surface-container-high' : 'bg-surface-container-low hover:bg-surface-container-high'}`} onClick={setStep}>
      <div className="flex items-center gap-4">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] ${active ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container-highest text-on-surface-variant'}`}>
          0{num}
        </div>
        <h3 className={`font-sans font-bold text-lg ${active ? 'text-e3e2e7' : 'text-on-surface-variant'}`}>{title}</h3>
      </div>
      {active ? <ChevronUp className="text-on-surface-variant" size={20} /> : <ChevronDown className="text-on-surface-variant" size={20} />}
    </div>
  )
}

function ToggleRow({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 cursor-pointer group" onClick={onClick}>
      <span className="font-sans text-sm text-on-surface transition-colors">{label}</span>
      <div className={`w-10 h-5 flex items-center px-0.5 transition-colors ${active ? 'bg-primary justify-end' : 'bg-surface-container-highest justify-start'}`}>
        <div className="w-4 h-4 bg-surface" />
      </div>
    </div>
  )
}
