'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Users, Shield, Cpu, Activity, Clock, LogOut } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { fadeUp, slideLeft } from '@/lib/animations'
import { useAuthStore } from '@/store/authStore'
import { formatTimestamp } from '@/lib/utils'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'security'>('general')
  const { user, isAdmin } = useAuthStore()

  return (
    <div className="flex h-full max-h-screen">
      {/* Settings Nav */}
      <div className="w-64 border-r p-6 space-y-8" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-base)' }}>
        <div>
          <h2 className="font-mono text-sm tracking-widest text-primary mb-4">SETTINGS</h2>
          <nav className="space-y-1">
            <NavButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={Settings} label="General" />
            {isAdmin() && <NavButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="Users & Access" />}
            <NavButton active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={Shield} label="Security" />
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'general' && <GeneralSettings key="general" />}
          {activeTab === 'users' && isAdmin() && <UsersSettings key="users" />}
          {activeTab === 'security' && <SecuritySettings key="security" />}
        </AnimatePresence>
      </div>
    </div>
  )
}

function NavButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${active ? 'bg-white/10 text-white' : 'text-secondary hover:bg-white/5 hover:text-white'}`}
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        backgroundColor: active ? 'var(--bg-raised)' : 'transparent',
      }}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )
}

function GeneralSettings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings().then(res => res.data),
  })

  if (isLoading) return <div className="animate-pulse font-mono text-xs text-muted">LOADING SETTINGS...</div>

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-xl font-mono text-white mb-1">General Configuration</h3>
        <p className="text-sm text-secondary">Manage platform-wide thresholds and behaviors.</p>
      </div>

      <div className="space-y-6">
        <SettingCard title="Anomaly Target Threshold" description="Minimum score to trigger an incident">
          <input type="number" step="0.05" defaultValue={settings?.anomaly_threshold} className="w-24 px-3 py-1.5 rounded border bg-transparent font-mono text-sm" style={{ borderColor: 'var(--border-strong)' }} />
        </SettingCard>
        
        <SettingCard title="Forecast Horizon" description="Minutes ahead for Prophet/ARIMA projections">
          <div className="flex items-center gap-2">
            <input type="number" defaultValue={settings?.forecast_horizon_minutes} className="w-24 px-3 py-1.5 rounded border bg-transparent font-mono text-sm" style={{ borderColor: 'var(--border-strong)' }} />
            <span className="text-muted text-xs font-mono">MINUTES</span>
          </div>
        </SettingCard>

        <SettingCard title="Ollama Model" description="Local LLM used for Root Cause Analysis">
          <input type="text" defaultValue={settings?.ollama_model} className="w-64 px-3 py-1.5 rounded border bg-transparent font-mono text-sm" style={{ borderColor: 'var(--border-strong)' }} />
        </SettingCard>

        <SettingCard title="Metric Retention" description="Days to keep raw telemetry data">
          <div className="flex items-center gap-2">
            <input type="number" defaultValue={settings?.metric_retention_days} className="w-24 px-3 py-1.5 rounded border bg-transparent font-mono text-sm" style={{ borderColor: 'var(--border-strong)' }} />
            <span className="text-muted text-xs font-mono">DAYS</span>
          </div>
        </SettingCard>
      </div>
      
      <div className="pt-4">
        <button className="px-6 py-2 bg-white text-black rounded text-sm font-medium hover:bg-white/90 transition-colors">Save Changes</button>
      </div>
    </motion.div>
  )
}

function UsersSettings() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.getUsers().then(res => res.data),
  })

  if (isLoading) return <div className="animate-pulse font-mono text-xs text-muted">LOADING USERS...</div>

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-4xl space-y-8">
      <div className="flex justify-between items-center bg-transparent">
        <div>
          <h3 className="text-xl font-mono text-white mb-1">User Management</h3>
          <p className="text-sm text-secondary">Manage system access and roles.</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors">Add User</button>
      </div>

      <div className="rounded border overflow-hidden" style={{ borderColor: 'var(--border-strong)' }}>
        <table className="w-full text-left text-sm font-mono whitespace-nowrap">
          <thead className="bg-black/50 text-xs text-muted border-b uppercase" style={{ borderColor: 'var(--border-strong)' }}>
            <tr>
              <th className="px-4 py-3 font-normal">Username</th>
              <th className="px-4 py-3 font-normal">Role</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 font-normal hidden md:table-cell">Last Login</th>
              <th className="px-4 py-3 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {users.map((u: any) => (
              <tr key={u.user_id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-white">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider
                    ${u.role === 'admin' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider
                    ${u.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'}`}>
                    {u.is_active ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {u.last_login ? formatTimestamp(u.last_login) : 'NEVER'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-blue-500 hover:text-blue-400 uppercase tracking-widest font-bold">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

function SecuritySettings() {
  const { user } = useAuthStore()
  
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-xl font-mono text-white mb-1">Security & Sessions</h3>
        <p className="text-sm text-secondary">Manage passwords and active sessions.</p>
      </div>

      <div className="p-6 rounded border space-y-6" style={{ borderColor: 'var(--border)' }}>
        <h4 className="font-mono text-sm uppercase text-white border-b pb-2" style={{ borderColor: 'var(--border-strong)' }}>Change Password</h4>
        <div className="space-y-4 max-w-sm">
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted uppercase">Current Password</label>
            <input type="password" placeholder="••••••••" className="w-full px-3 py-2 rounded border bg-transparent text-sm" style={{ borderColor: 'var(--border-strong)' }} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted uppercase">New Password</label>
            <input type="password" placeholder="••••••••" className="w-full px-3 py-2 rounded border bg-transparent text-sm" style={{ borderColor: 'var(--border-strong)' }} />
            <p className="text-[10px] font-mono text-muted mt-1">Must contain 8+ chars, 1 uppercase, 1 number, 1 symbol.</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-mono uppercase tracking-widest hover:bg-blue-700 transition-colors">Update Password</button>
        </div>
      </div>
    </motion.div>
  )
}

function SettingCard({ title, description, children }: any) {
  return (
    <div className="p-4 rounded border flex justify-between items-center hover:bg-white/5 transition-colors group" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-surface)' }}>
      <div>
        <p className="font-mono text-sm text-white mb-1 group-hover:text-blue-400 transition-colors">{title}</p>
        <p className="text-xs text-secondary">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}
