'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Server, AlertTriangle, TrendingUp,
  BookOpen, Settings, Users, Brain, LogOut, ChevronLeft, ChevronRight,
  FileText, Rocket, Target, Microscope, ShieldCheck
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useWsStore } from '@/store/wsStore'
import { apiClient } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { GlobalTools } from './GlobalTools'

const NAV_ITEMS = [
  { group: 'MONITOR', items: [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Sentinel', href: '/services', icon: ShieldCheck },
    { label: 'Anomaly Lab', href: '/anomaly-lab', icon: TrendingUp },
    { label: 'Alerts', href: '/incidents', icon: AlertTriangle, hasBadge: true },
  ]},
  { group: 'MANAGE', items: [
    { label: 'Settings', href: '/settings', icon: Settings },
  ]},
]

const ADMIN_ITEMS = [
  { label: 'Users', href: '/settings?tab=users', icon: Users },
  { label: 'ML Models', href: '/ml', icon: Brain },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, setUser, clearAuth, isAdmin } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const { connected } = useWsStore()

  useWebSocket()

  const isWarRoom = pathname.startsWith('/incidents/') && pathname !== '/incidents'

  useEffect(() => {
    if (!user && document.cookie.includes('access_token')) {
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
      className="hidden lg:flex flex-col h-screen flex-shrink-0 bg-[#121317] py-8 z-50 overflow-hidden"
    >
      <div className="px-8 mb-12 flex justify-between items-center">
        {!sidebarCollapsed && (
          <div>
            <div className="text-lg font-mono text-[#dbfcff] flex items-center gap-3">
              <ShieldCheck size={20} fill="currentColor" />
              <span>SENTINEL</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest font-mono text-[#b9cacb]/60 mt-1">v2.4.0-STABLE</div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded transition-colors text-[#b9cacb] hover:text-[#e3e2e7]"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {NAV_ITEMS.map((group) => (
          <div key={group.group} className="mb-4">
            {!sidebarCollapsed && (
              <p className="px-8 mb-2 font-mono text-[10px] font-medium tracking-widest text-[#b9cacb]/60">
                {group.group}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-4 py-4 transition-all duration-200 relative ${
                        sidebarCollapsed ? 'justify-center px-4' : 'px-8'
                      } ${
                        active 
                          ? 'text-[#dbfcff] bg-[#292a2e] border-l-2 border-[#dbfcff]' 
                          : 'text-[#e3e2e7]/50 hover:bg-[#1a1b20] hover:text-[#e3e2e7] border-l-2 border-transparent'
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                      {!sidebarCollapsed && (
                        <span className="text-[10px] uppercase tracking-widest font-mono shrink-0">{item.label}</span>
                      )}
                      {!sidebarCollapsed && item.hasBadge && (
                         <span className="absolute right-8 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#00f0ff] rounded-full ring-4 ring-[#121317]"></span>
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
                      className={`flex items-center gap-4 py-4 transition-all duration-200 ${
                        sidebarCollapsed ? 'justify-center px-4' : 'px-8'
                      } ${
                        active 
                          ? 'text-[#dbfcff] bg-[#292a2e] border-l-2 border-[#dbfcff]' 
                          : 'text-[#e3e2e7]/50 hover:bg-[#1a1b20] hover:text-[#e3e2e7] border-l-2 border-transparent'
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
      <div className={`px-8 mt-auto space-y-6 ${sidebarCollapsed ? 'hidden' : 'block'}`}>
        
        <div className="border-t border-[#3b494b]/20 pt-6 flex justify-center">
          <GlobalTools />
        </div>

        {user && (
          <div className="flex items-center justify-between border-t border-[#3b494b]/20 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1a1b20] flex items-center justify-center border border-[#3b494b]/30">
                <span className="font-mono text-[10px] text-[#dbfcff] uppercase">
                  {user.username.substring(0,2)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[12px] text-[#e3e2e7]">{user.username}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#00f0ff]">{user.role}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[#b9cacb]/60 hover:text-[#ffb4ab] transition-colors"
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
