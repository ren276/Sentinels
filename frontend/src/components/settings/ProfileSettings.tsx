'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { Check, Copy } from 'lucide-react'

export function ProfileSettings({ currentTab, onChangeTab }: { currentTab: string, onChangeTab: (t: string) => void }) {
  const { user } = useAuthStore()
  const [copied, setCopied] = useState(false)

  const copyId = () => {
    navigator.clipboard.writeText(`SENTINEL_USER_092`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Placeholder security content if Security tab is active
  const renderContent = () => {
    if (currentTab === 'security') {
      return (
        <form className="space-y-10 animate-fade-in">
          <div className="space-y-4">
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#b9cacb] mb-6 border-b border-[#3b494b]/20 pb-2">Change Password</h4>
            <div className="grid grid-cols-1 gap-8 max-w-sm">
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]">Current Password</label>
                <input className="w-full bg-[#343439] border-none text-[#e3e2e7] p-4 focus:ring-1 focus:ring-[#00dbe9]/30 focus:bg-[#38393d] transition-all font-sans text-sm" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]">New Password</label>
                <input className="w-full bg-[#343439] border-none text-[#e3e2e7] p-4 focus:ring-1 focus:ring-[#00dbe9]/30 focus:bg-[#38393d] transition-all font-sans text-sm" type="password" placeholder="••••••••" />
                <p className="text-[10px] font-mono text-[#b9cacb]/60 mt-1 uppercase">Must contain 8+ chars, 1 uppercase, 1 symbol.</p>
              </div>
            </div>
            <div className="pt-4">
              <button className="px-8 py-3 bg-[#00dbe9] text-[#00363a] font-sans font-bold text-sm shadow-[0_0_20px_rgba(219,252,255,0.15)] hover:shadow-[0_0_25px_rgba(219,252,255,0.25)] transition-all">
                Update Password
              </button>
            </div>
          </div>
        </form>
      )
    }

    return (
      <form className="space-y-10 animate-fade-in">
        <div className="flex items-center gap-8 group">
          <div className="relative">
            <div className="w-24 h-24 bg-[#343439] flex items-center justify-center relative overflow-hidden ring-1 ring-[#3b494b]/20">
              <div className="w-full h-full flex items-center justify-center font-mono text-2xl text-[#dbfcff]">
                {user?.username.substring(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#dbfcff] border-4 border-[#0d0e12]"></div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#b9cacb]">Auth Provider</span>
              <div className="bg-[#292a2e] px-2 py-0.5 flex items-center gap-1.5 border border-[#3b494b]/30">
                <span className="text-[9px] font-mono font-bold text-[#e3e2e7]">INTERNAL</span>
              </div>
            </div>
            <div className="flex items-center gap-2 group/id">
              <h3 className="text-xl font-mono text-[#dbfcff]">SENTINEL_USER_{user?.user_id?.substring(0,6) || 'LOCAL'}</h3>
              <button 
                type="button" 
                onClick={copyId} 
                className="opacity-0 group-hover/id:opacity-100 transition-opacity p-1 text-[#b9cacb] hover:text-[#dbfcff]" title="Copy ID"
              >
                {copied ? <Check size={14} className="text-[#00f0ff]" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-[#b9cacb] font-sans">Active since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'OCT_2023'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]">Display Name</label>
            <input className="w-full bg-[#343439] border-none text-[#e3e2e7] p-4 focus:ring-1 focus:ring-[#00dbe9]/30 focus:bg-[#38393d] transition-all font-sans text-sm" type="text" defaultValue={user?.username || ''} />
          </div>
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]">System Email</label>
            <input className="w-full bg-[#1a1b20] border-none text-[#b9cacb]/60 p-4 font-sans text-sm cursor-not-allowed" readOnly type="email" value={user?.email || 'admin@sentinel.ai'} />
          </div>
        </div>

        <div className="space-y-4">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-[#b9cacb]">Security Credentials</label>
          <div className="p-6 bg-[#343439] flex items-center justify-between group cursor-pointer hover:bg-[#38393d] transition-colors" onClick={() => onChangeTab('security')}>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-[#b9cacb]">lock</span>
              <div>
                <div className="text-sm font-sans text-[#e3e2e7]">Password Control</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00f0ff]"></span>
                  <div className="text-[10px] font-mono text-[#00f0ff] uppercase tracking-widest">Managed by Native Auth</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-[#3b494b]/10">
          <h4 className="font-mono text-[10px] uppercase tracking-widest text-[#b9cacb] mb-6">Metadata Clusters</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#1a1b20] border border-transparent hover:border-[#dbfcff]/20 transition-colors">
              <div className="text-[9px] font-mono text-[#b9cacb]/40 mb-1 uppercase tracking-widest">ACCESS_LVL</div>
              <div className="text-sm font-mono text-[#dbfcff] uppercase">{user?.role === 'admin' ? 'LVL_4_ADMIN' : 'LVL_2_OP'}</div>
            </div>
            <div className="p-4 bg-[#1a1b20] border border-transparent hover:border-[#dbfcff]/20 transition-colors">
              <div className="text-[9px] font-mono text-[#b9cacb]/40 mb-1 uppercase tracking-widest">LAST_SYNC</div>
              <div className="text-sm font-mono text-[#e3e2e7]">JUST_NOW</div>
            </div>
            <div className="p-4 bg-[#1a1b20] border border-transparent hover:border-[#dbfcff]/20 transition-colors">
              <div className="text-[9px] font-mono text-[#b9cacb]/40 mb-1 uppercase tracking-widest">MFA_STAT</div>
              <div className="text-sm font-mono text-[#e3e2e7]">DISABLED</div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-[#3b494b]/10">
          <button className="group flex items-center gap-2 text-[#ffb4ab] hover:text-[#ffb4ab]/80 font-mono text-[10px] tracking-widest uppercase transition-all" type="button" onClick={() => confirm('Deactivate?')}>
             <span className="hover:underline decoration-[#ffb4ab] underline-offset-4">DEACTIVATE NODE</span>
          </button>
          <div className="flex gap-4">
            <button className="px-8 py-3 bg-[#343439] text-[#e3e2e7] font-sans font-medium text-sm hover:bg-[#38393d] transition-colors" type="button">Cancel</button>
            <button className="px-8 py-3 bg-[#dbfcff] text-[#00363a] font-sans font-bold text-sm shadow-[0_0_20px_rgba(219,252,255,0.15)] hover:shadow-[0_0_25px_rgba(219,252,255,0.25)] transition-all" type="submit">Save Profile</button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 w-full max-w-7xl">
      {/* Left Editorial Panel */}
      <div className="lg:col-span-5 space-y-12">
        <div className="space-y-4">
          <h1 className="text-5xl font-mono tracking-tighter leading-tight text-[#dbfcff]">
            <span className="block ml-0">SYSTEM</span>
            <span className="block ml-8 opacity-60">IDENTITY</span>
            <span className="block ml-4">PROFILE</span>
          </h1>
          <p className="text-[#b9cacb] font-sans max-w-xs mt-6 text-sm leading-relaxed">
            Configure your terminal presence and authentication credentials within the Sentinel ecosystem.
          </p>
        </div>
        
        <div className="space-y-4 pt-12">
          <div className="bg-[#343439]/40 backdrop-blur-md p-4 flex items-center justify-between border-l-2 border-[#dbfcff]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse"></div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#e3e2e7]">Live Status: Connected</span>
            </div>
            <span className="text-[10px] font-mono text-[#b9cacb]">0.14ms LATENCY</span>
          </div>
          <div className="bg-[#343439]/30 p-4 border-l-2 border-[#3b494b]/30">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-1 text-[#b9cacb]/60">Node Location</div>
            <div className="text-sm font-sans text-[#e3e2e7] tracking-wider">NORTH_ATLANTIC_EDGE_04</div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="lg:col-span-7 bg-[#0d0e12] p-8 lg:p-12 shadow-2xl relative border border-[#3b494b]/20">
        <div className="flex bg-[#1a1b20] mb-12 relative overflow-hidden">
          <button 
            onClick={() => onChangeTab('profile')}
            className={`flex-1 relative z-10 px-6 py-3 font-sans font-medium text-sm transition-colors ${currentTab === 'profile' ? 'text-[#dbfcff] bg-[#343439]' : 'text-[#b9cacb] hover:text-[#e3e2e7]'}`}
          >
            Profile
          </button>
          <button 
            onClick={() => onChangeTab('security')}
            className={`flex-1 relative z-10 px-6 py-3 font-sans font-medium text-sm transition-colors ${currentTab === 'security' ? 'text-[#dbfcff] bg-[#343439]' : 'text-[#b9cacb] hover:text-[#e3e2e7]'}`}
          >
            Security
          </button>
          <button 
             onClick={() => onChangeTab('integrations')}
             className={`flex-1 relative z-10 px-6 py-3 font-sans font-medium text-sm transition-colors ${currentTab === 'integrations' ? 'text-[#dbfcff] bg-[#343439]' : 'text-[#b9cacb] hover:text-[#e3e2e7]'}`}
          >
            Integrations
          </button>
        </div>

        {renderContent()}
      </div>
    </div>
  )
}
