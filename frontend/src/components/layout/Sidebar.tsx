'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, BarChart2, Bell, Globe, Shield, AlertOctagon,
  Database, FileText, LifeBuoy, Settings, Users, Brain, LogOut, ChevronLeft, ChevronRight,
  ShieldCheck
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useWsStore } from '@/store/wsStore'
import { apiClient } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { GlobalTools } from './GlobalTools'

const NAV_ITEMS = [
  { group: 'GLOBAL', items: [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard, shortcut: '⌘D' },
    { label: 'SLO Status', href: '/slos', icon: BarChart2, shortcut: '⌘S' },
    { label: 'Alerts', href: '/incidents', icon: Bell, hasBadge: true, shortcut: '⌘I' },
  ]},
  { group: 'NETWORK', items: [
    { label: 'Services', href: '/services', icon: Globe, shortcut: '⌘O' },
    { label: 'Anomaly Lab', href: '/anomaly-lab', icon: Shield, shortcut: '⌘L' },
    { label: 'Threats', href: '/threats', icon: AlertOctagon, shortcut: '⌘T' },
  ]},
  { group: 'SYSTEM', items: [
    { label: 'Database', href: '/services/postgres-local', icon: Database, shortcut: '⌘B' },
    { label: 'Runbooks', href: '/runbooks', icon: FileText, shortcut: '⌘R' },
    { label: 'Support', href: '/support', icon: LifeBuoy, shortcut: '⌘?' },
    { label: 'Settings', href: '/settings', icon: Settings, shortcut: '⌘,' },
  ]},
]

const ADMIN_ITEMS = [
  { label: 'Users', href: '/settings?tab=users', icon: Users, shortcut: '⌘U' },
  { label: 'ML Models', href: '/ml', icon: Brain, shortcut: '⌘M' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, setUser, clearAuth, isAdmin } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const { connected, latestAnomalies, latestIncidents, lastSeenAlertTs, markAlertsAsSeen } = useWsStore()

  useWebSocket()

  const isWarRoom = pathname.startsWith('/incidents/') && pathname !== '/incidents'

  useEffect(() => {
    if (!user && document.cookie.includes('sentinel_session')) {
      apiClient.me().then(res => {
        setUser(res.data)
      }).catch(() => {
        clearAuth()
      })
    }
  }, [user, setUser, clearAuth])

  const handleLogout = async () => {
    try { await apiClient.logout() } catch {}
    clearAuth()
    router.push('/login')
  }

  const w = sidebarCollapsed ? 80 : 256
  if (isWarRoom) return null

  return (
    <motion.aside
      layout
      animate={{ width: w }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="hidden lg:flex flex-col h-screen flex-shrink-0 bg-surface py-8 z-50"
    >
      <div className="px-8 mb-12 flex justify-between items-center">
        {!sidebarCollapsed && (
          <div>
            <div className="text-lg font-mono text-primary flex items-center gap-3">
              <ShieldCheck size={20} fill="currentColor" />
              <span>SENTINEL</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest font-mono text-on-surface-variant/60 mt-1">v2.4.0-STABLE</div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded transition-colors text-on-surface-variant hover:text-on-surface"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {NAV_ITEMS.map((group) => (
          <div key={group.group} className="mb-4">
            {!sidebarCollapsed && (
              <p className="px-8 mb-2 font-mono text-[10px] font-medium tracking-widest text-on-surface-variant/40 uppercase">
                {group.group}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                
                // Dynamic unread logic
                const newestTs = Math.max(
                  latestIncidents[0] ? new Date(latestIncidents[0].created_at).getTime() : 0,
                  latestAnomalies[0] ? new Date(latestAnomalies[0].detected_at).getTime() : 0
                )
                const showBadge = item.hasBadge && newestTs > lastSeenAlertTs

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => item.label === 'Alerts' && markAlertsAsSeen(newestTs)}
                      className={`group flex items-center gap-4 py-4 transition-all duration-200 relative ${
                        sidebarCollapsed ? 'justify-center px-4' : 'px-8'
                      } ${
                        active 
                          ? 'text-primary bg-surface-container-high' 
                          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                      {!sidebarCollapsed && (
                        <span className="text-[10px] uppercase tracking-widest font-mono shrink-0">{item.label}</span>
                      )}
                      {!sidebarCollapsed && showBadge && (
                         <span className="absolute right-8 top-1/2 -translate-y-1/2 w-2 h-2 bg-error rounded-full ring-4 ring-surface shadow-[0_0_8px_rgba(255,180,171,0.6)]"></span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {isAdmin() && (
          <div className="mb-4">
            {!sidebarCollapsed && (
              <p className="px-8 mb-2 font-mono text-[10px] font-medium tracking-widest text-[#b9cacb]/60">
                ADMIN
              </p>
            )}
            <ul className="space-y-1">
              {ADMIN_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href.split('?')[0])
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`group flex items-center gap-4 py-4 transition-all duration-200 relative ${
                        sidebarCollapsed ? 'justify-center px-4' : 'px-8'
                      } ${
                        active 
                          ? 'text-primary bg-surface-container-high' 
                          : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                      {!sidebarCollapsed && (
                        <span className="text-[10px] uppercase tracking-widest font-mono shrink-0">{item.label}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* Bottom Profile / Tools */}
      <div className={`mt-auto bg-surface-container-low ${sidebarCollapsed ? 'hidden' : 'block'}`}>
        <div className="flex justify-center py-4 opacity-40 hover:opacity-100 transition-opacity">
          <GlobalTools />
        </div>

        {user && (
          <div className="flex items-center justify-between p-6 bg-surface-container">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-surface-container-highest flex items-center justify-center ghost-border">
                <span className="font-mono text-[10px] text-primary uppercase">
                  {user.username.substring(0,2)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[12px] text-on-surface select-none">{user.username}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-primary/60">{user.role}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-on-surface-variant hover:text-error transition-colors p-2"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
