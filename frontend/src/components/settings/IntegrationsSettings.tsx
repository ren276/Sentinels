'use client'
import { useState } from 'react'
import { Send, Check } from 'lucide-react'
import { apiClient } from '@/lib/api'

export function IntegrationsSettings() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  const handleTest = async () => {
    if (!webhookUrl) return
    setTesting(true)
    setTestResult(null)
    try {
      await apiClient.testSlackWebhook(webhookUrl)
      setTestResult({ success: true, message: 'Webhook validated. Test message sent.' })
    } catch (err: any) {
      setTestResult({ success: false, message: err.response?.data?.detail || 'Validation failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="w-full max-w-7xl animate-fade-in relative z-10">
      <div className="mb-12">
        <h1 className="text-5xl font-mono tracking-tighter text-[#dbfcff] mb-2 leading-[0.9]">
          <span className="block ml-0">SETTINGS_</span>
          <span className="block ml-8 opacity-60">NOTIFICATION_GATEWAY</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Panel: Connectivity & Config */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#1a1b20] p-6 flex flex-col gap-4 border-l-2 border-[#dbfcff]">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#b9cacb]">Protocol Status</span>
              <div className="flex items-center gap-2 bg-[#343439]/40 backdrop-blur-md px-3 py-1 border border-[#3b494b]/30">
                <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse"></span>
                <span className="text-[10px] font-mono text-[#dbfcff] uppercase">Active</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-mono text-[#e3e2e7]">SLACK_INTEGRATION</div>
              <div className="text-[11px] font-sans text-[#b9cacb] mt-1">v1.2.4 Webhook Collector</div>
            </div>
          </div>

          <div className="bg-[#0d0e12] p-6 border-l-2 border-[#3b494b]/50">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[#dbfcff] mb-6">Alert Parameters</h3>
            <div className="space-y-6">
              {[
                { title: 'Critical Failures', sub: 'Instant delivery', on: true },
                { title: 'Warning Digest', sub: 'Hourly batch', on: false },
                { title: 'Resolution Logs', sub: 'Post-recovery', on: true },
                { title: 'SLO Breach', sub: 'Threshold: 99.9%', on: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-sans font-medium text-[#e3e2e7]">{item.title}</p>
                    <p className="text-[10px] font-mono text-[#b9cacb] uppercase">{item.sub}</p>
                  </div>
                  <div className={`w-10 h-5 flex items-center px-0.5 cursor-not-allowed ${item.on ? 'bg-[#00f0ff]/20 justify-end' : 'bg-[#343439] justify-start'}`}>
                    <div className={`w-4 h-4 ${item.on ? 'bg-[#dbfcff]' : 'bg-[#b9cacb]/40'}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Interaction Panel: 3-Step Setup */}
        <div className="lg:col-span-8 bg-[#1a1b20] p-8 border-l-2 border-[#00f0ff]/30">
          <div className="flex items-center justify-between mb-8">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-[#b9cacb]">Integration Pipeline</div>
            <div className="font-mono text-[10px] text-[#dbfcff] bg-[#343439]/50 px-2 py-1">STEP_02_IN_PROGRESS</div>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="relative pl-12 border-l border-[#3b494b]">
              <div className="absolute -left-[9px] top-0 w-4 h-4 bg-[#dbfcff]"></div>
              <div className="mb-4">
                <span className="text-[10px] font-mono text-[#dbfcff] uppercase">Step 01</span>
                <h4 className="text-lg font-sans font-semibold text-[#e3e2e7] mt-1">Create Slack Application</h4>
                <p className="text-sm text-[#b9cacb] max-w-xl mt-2 leading-relaxed">
                  Navigate to your Slack API dashboard and create a new application for your workspace. Enable 'Incoming Webhooks' in the feature settings.
                </p>
              </div>
              <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="inline-block bg-[#343439] px-4 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-[#38393d] transition-colors text-[#e3e2e7]">
                API_DASHBOARD_LINK
              </a>
            </div>

            {/* Step 2 (Active) */}
            <div className="relative pl-12 border-l border-[#dbfcff]">
              <div className="absolute -left-[9px] top-0 w-4 h-4 bg-[#dbfcff] ring-4 ring-[#dbfcff]/20"></div>
              <div className="mb-6">
                <span className="text-[10px] font-mono text-[#dbfcff] uppercase">Step 02</span>
                <h4 className="text-lg font-sans font-semibold text-[#e3e2e7] mt-1">Webhook Endpoint Input</h4>
                <p className="text-sm text-[#b9cacb] max-w-xl mt-2 leading-relaxed">
                  Paste your generated Slack Webhook URL below. This endpoint will receive encrypted JSON payloads from the SENTINEL engine.
                </p>
              </div>
              <div className="flex flex-col gap-4 max-w-2xl">
                <div className="relative w-full">
                  <input 
                    className="w-full bg-[#343439] border-0 px-4 py-4 font-mono text-sm text-[#dbfcff] placeholder:text-[#b9cacb]/30 focus:ring-1 focus:ring-[#00dbe9]/40 focus:bg-[#38393d] outline-none transition-all" 
                    placeholder="https://hooks.slack.com/services/T000.../B000.../XXX..." 
                    type="password"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                </div>
                {testResult && (
                  <div className={`p-3 text-sm font-mono border-l-2 ${testResult.success ? 'bg-[#00f0ff]/10 border-[#00f0ff] text-[#dbfcff]' : 'bg-[#ffb4ab]/10 border-[#ffb4ab] text-[#ffb4ab]'}`}>
                    {testResult.success ? <Check size={16} className="inline mr-2" /> : null}
                    {testResult.message}
                  </div>
                )}
                <div className="flex gap-4">
                  <button onClick={handleTest} disabled={testing || !webhookUrl} className="flex-1 bg-[#dbfcff] text-[#00363a] font-mono text-[11px] uppercase tracking-widest py-4 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    {testing ? 'TESTING...' : 'VALIDATE_ENDPOINT'}
                  </button>
                  <button onClick={handleTest} disabled={testing || !webhookUrl} className="px-8 border border-[#3b494b] text-[#e3e2e7] font-mono text-[11px] uppercase tracking-widest py-4 hover:bg-[#343439] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                    <Send size={16} /> TEST_WEBHOOK
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative pl-12 border-l border-[#3b494b] opacity-40">
              <div className="absolute -left-[9px] top-0 w-4 h-4 bg-[#343439]"></div>
              <div>
                <span className="text-[10px] font-mono text-[#b9cacb] uppercase">Step 03</span>
                <h4 className="text-lg font-sans font-semibold text-[#e3e2e7] mt-1">Final Configuration</h4>
                <p className="text-sm text-[#b9cacb] max-w-xl mt-2 leading-relaxed">
                  Map your SENTINEL environments (Production, Staging) to specific Slack channels and assign escalation owners.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
