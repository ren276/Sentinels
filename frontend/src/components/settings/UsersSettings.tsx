'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { UserPlus, AlertTriangle, MoreVertical, ShieldCheck, Activity } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatTimestamp } from '@/lib/utils'

export function UsersSettings() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers().then(res => res.data),
  })

  if (isLoading) return <div className="animate-pulse font-mono text-xs text-[#b9cacb] tracking-widest uppercase">LOADING USERS...</div>

  return (
    <div className="w-full max-w-7xl animate-fade-in relative z-10">
      {/* Asymmetric Header Layout */}
      <div className="grid grid-cols-12 gap-8 mb-12 items-end">
        <div className="col-span-12 lg:col-span-8">
          <div className="text-5xl font-mono tracking-tighter text-[#dbfcff] leading-[0.9] font-bold">
            <div className="ml-0">MANAGE</div>
            <div className="ml-8 text-[#b9cacb]/40">OPERATORS.</div>
            <div className="ml-4">PROTOCOL_04.</div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 flex justify-end">
          <button className="bg-[#dbfcff] text-[#00363a] px-6 py-4 font-mono text-xs uppercase tracking-widest font-bold flex items-center gap-3 hover:brightness-110 active:scale-95 transition-all">
            <UserPlus size={18} />
            CREATE USER
          </button>
        </div>
      </div>

      {/* Pending Requests Banner */}
      <div className="mb-10 bg-[#1a1b20] border-l-4 border-[#ffcec7] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start gap-4">
          <AlertTriangle className="text-[#ffcec7] mt-1 shrink-0" size={24} />
          <div>
            <h3 className="text-sm font-bold text-[#ffcec7] uppercase tracking-widest font-mono">Pending Access Requests</h3>
            <p className="text-xs text-[#b9cacb] mt-1 font-sans">1 node is requesting elevated system privileges. Review required immediately.</p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button className="flex-1 md:flex-none text-[10px] font-mono tracking-widest px-4 py-2 bg-[#343439] focus:outline-none hover:bg-[#38393d] transition-colors uppercase text-[#e3e2e7]">View Table</button>
          <button className="flex-1 md:flex-none text-[10px] font-mono tracking-widest px-4 py-2 bg-[#ffcec7] text-[#c1000a] font-bold hover:brightness-110 transition-all uppercase shadow-[0_0_15px_rgba(255,206,199,0.3)]">Approve All</button>
        </div>
      </div>

      {/* Bento Grid - User Management Main */}
      <div className="grid grid-cols-12 gap-6">
        {/* Table Section */}
        <div className="col-span-12 lg:col-span-7 bg-[#1a1b20] p-1 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-[#343439]/30">
                <tr>
                  <th className="px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-[#b9cacb]">Operator</th>
                  <th className="px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-[#b9cacb]">Role Protocol</th>
                  <th className="px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-[#b9cacb] text-right">Status</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3b494b]/20">
                {users.map((u: any) => (
                  <tr key={u.user_id} className={`hover:bg-[#343439]/20 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 flex items-center justify-center font-mono text-xs ${u.role === 'admin' ? 'bg-[#93000a]/20 text-[#ffb4ab]' : 'bg-[#00f0ff]/10 text-[#00f0ff]'}`}>
                          {u.username.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div className={`text-sm font-bold text-[#e3e2e7] ${!u.is_active ? 'line-through' : ''}`}>{u.username}</div>
                          <div className="text-[10px] font-mono text-[#b9cacb]/60">{u.email || 'user@sentinel.sys'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2 py-1 text-[10px] font-mono tracking-widest uppercase ${u.role === 'admin' ? 'text-[#ffb4ab] bg-[#93000a]/10 border border-[#ffb4ab]/20' : 'text-[#00dbe9] bg-[#00f0ff]/10 border border-[#00f0ff]/20'}`}>
                        {u.role === 'admin' ? 'Root Admin' : 'Lead Analyst'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      {u.is_active ? (
                        <span className="text-xs text-[#00f0ff] font-mono animate-pulse uppercase tracking-widest">Active</span>
                      ) : (
                        <span className="text-[10px] text-[#ffb4ab] font-mono uppercase tracking-widest">Suspended</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button className="text-[#b9cacb] hover:text-[#dbfcff] transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create User Overlay Layout */}
        <div className="col-span-12 lg:col-span-5 bg-[#0d0e12] p-8 relative overflow-hidden group border border-[#3b494b]/20">
          <div className="absolute top-0 right-0 p-4">
            <span className="text-[10px] font-mono text-[#00dbe9]/40 uppercase tracking-[0.3em]">Module: 0x2A</span>
          </div>
          <h2 className="text-lg font-bold uppercase tracking-widest font-mono text-[#dbfcff] mb-6">User Provisioning</h2>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-mono uppercase text-[#b9cacb] tracking-widest">Identification (Email)</label>
              <input className="w-full bg-[#343439] border-none focus:ring-1 focus:ring-[#00dbe9] text-sm p-4 placeholder:text-[#b9cacb]/30 text-[#e3e2e7] outline-none" placeholder="operator@sentinel.sys" type="text" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-mono uppercase text-[#b9cacb] tracking-widest">Protocol Level</label>
                <select className="w-full bg-[#343439] border-none focus:ring-1 focus:ring-[#00dbe9] text-xs p-4 font-mono uppercase text-[#e3e2e7] outline-none placeholder-[#b9cacb]">
                  <option>L2 Analyst</option>
                  <option>L3 Architect</option>
                  <option>L4 Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-mono uppercase text-[#b9cacb] tracking-widest">Invite Trigger</label>
                <div className="flex items-center h-[52px] bg-[#343439] px-4 justify-between cursor-pointer">
                  <span className="text-[10px] font-mono uppercase text-[#b9cacb]/60">SMTP</span>
                  <div className="w-8 h-4 bg-[#00f0ff]/20 relative">
                    <div className="absolute top-0 right-0 h-4 w-4 bg-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.6)]"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#1a1b20] p-4 border-l-2 border-[#00dbe9]/40">
              <p className="text-[10px] font-mono text-[#b9cacb] leading-relaxed uppercase tracking-wide">
                <span className="text-[#dbfcff] font-bold">Protocol Info:</span> L2 Analysts can modify system thresholds but cannot purge historical telemetry logs. Requires biometrics for destructive actions.
              </p>
            </div>

            <button className="w-full bg-[#dbfcff] hover:brightness-110 text-[#00363a] transition-all p-4 text-[10px] font-mono font-bold tracking-[0.2em] uppercase shadow-[0_0_15px_rgba(219,252,255,0.1)]">
              Execute Invitation
            </button>
          </div>
        </div>

        {/* Technical Specs */}
        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-6 mt-2">
          <div className="bg-[#1a1b20] p-6 flex flex-col justify-between border border-transparent hover:border-[#3b494b]/30 transition-colors">
            <div>
              <Activity className="text-[#00dbe9] mb-4" size={24} />
              <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-[#e3e2e7]">Authentication Nodes</h4>
            </div>
            <div className="mt-8 space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-mono text-[#b9cacb] uppercase">OAuth Latency</span>
                <span className="text-sm font-mono text-[#dbfcff]">12ms</span>
              </div>
              <div className="w-full bg-[#343439] h-1">
                <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} transition={{ duration: 1, delay: 0.2 }} className="bg-[#00dbe9] h-full w-[85%]"></motion.div>
              </div>
            </div>
          </div>
          <div className="bg-[#1a1b20] p-6 flex flex-col justify-between border border-transparent hover:border-[#3b494b]/30 transition-colors">
            <div>
              <ShieldCheck className="text-[#00dbe9] mb-4" size={24} />
              <h4 className="text-xs font-bold uppercase tracking-widest font-mono text-[#e3e2e7]">Security Compliance</h4>
            </div>
            <div className="mt-8 space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-mono text-[#b9cacb] uppercase">MFA Adoption</span>
                <span className="text-sm font-mono text-[#dbfcff]">100%</span>
              </div>
              <div className="w-full bg-[#343439] h-1">
                <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1, delay: 0.4 }} className="bg-[#00dbe9] h-full w-full"></motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
