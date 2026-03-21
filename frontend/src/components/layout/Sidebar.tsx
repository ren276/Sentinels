'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Server, AlertTriangle, TrendingUp,
  BookOpen, Settings, Users, Brain, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useWsStore } from '@/store/wsStore'
import { apiClient } from '@/lib/api'
import { avatarColor, initials } from '@/lib/utils'
import { staggerContainer, staggerItem } from '@/lib/animations'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const NAV_ITEMS = [
  { group: 'MONITOR', items: [
    { label: 'Overview', href: '/', icon: LayoutDashboard, shortcut: 'G→O' },
    { label: 'Services', href: '/services', icon: Server, shortcut: 'G→S' },
    { label: 'Incidents', href: '/incidents', icon: AlertTriangle, shortcut: 'G→I' },
    { label: 'Forecasts', href: '/forecasts', icon: TrendingUp, shortcut: 'G→F' },
  ]},
  { group: 'MANAGE', items: [
    { label: 'Runbooks', href: '/runbooks', icon: BookOpen, shortcut: 'G→R' },
    { label: 'Settings', href: '/settings', icon: Settings, shortcut: 'G→X' },
  ]},
]

const ADMIN_ITEMS = [
  { label: 'Users', href: '/settings?tab=users', icon: Users, shortcut: 'G→U' },
  { label: 'ML Models', href: '/ml', icon: Brain, shortcut: 'G→M' },
]

function LiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => {
      setTime(new Date().toUTCString().split(' ')[4] + ' UTC')
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{time}</span>
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, clearAuth, isAdmin } = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const { connected } = useWsStore()
  const reduced = useReducedMotion()

  const handleLogout = async () => {
    try { await apiClient.logout() } catch {}
    clearAuth()
    router.push('/login')
  }

  const w = sidebarCollapsed ? 64 : 220

  return (
    <motion.aside
      layout
      animate={{ width: w }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col h-screen flex-shrink-0 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-base)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5">
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <span className="font-mono font-medium tracking-[0.4em] text-sm" style={{ color: 'var(--text-primary)' }}>
                SENTINEL
              </span>
              <span className="dot-healthy" />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          data-cursor="hover"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            {!sidebarCollapsed && (
              <p className="px-2 mb-1 font-mono text-[10px] font-medium tracking-widest"
                style={{ color: 'var(--text-muted)' }}>
                {group.group}
              </p>
            )}
            <motion.ul
              variants={reduced ? {} : staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-0.5"
            >
              {group.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <motion.li key={item.href} variants={reduced ? {} : staggerItem}>
                    <Link
                      href={item.href}
                      data-cursor="hover"
                      className="flex items-center gap-3 px-2 py-2 rounded text-sm transition-colors group relative"
                      style={{
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        backgroundColor: active ? 'var(--bg-raised)' : 'transparent',
                        borderLeft: active ? '2px solid var(--blue)' : '2px solid transparent',
                      }}
                    >
                      <Icon size={16} strokeWidth={1.5} />
                      {!sidebarCollapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <span
                            className="font-mono text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {item.shortcut}
                          </span>
                        </>
                      )}
                    </Link>
                  </motion.li>
                )
              })}
            </motion.ul>
          </div>
        ))}

        {/* Admin section */}
        {isAdmin() && (
          <div>
            {!sidebarCollapsed && (
              <p className="px-2 mb-1 font-mono text-[10px] font-medium tracking-widest"
                style={{ color: 'var(--text-muted)' }}>ADMIN</p>
            )}
            <ul className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => {
                const Icon = item.icon
                const active = pathname.startsWith(item.href.split('?')[0])
                return (
                  <li key={item.href}>
                    <Link href={item.href} data-cursor="hover"
                      className="flex items-center gap-3 px-2 py-2 rounded text-sm transition-colors"
                      style={{
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        backgroundColor: active ? 'var(--bg-raised)' : 'transparent',
                        borderLeft: active ? '2px solid var(--blue)' : '2px solid transparent',
                      }}>
                      <Icon size={16} strokeWidth={1.5} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {!sidebarCollapsed && <LiveClock />}
        
        {/* WS Status */}
        <div className="flex items-center gap-2">
          <span className={connected ? 'dot-healthy' : 'dot-unknown'} style={{ width: 6, height: 6 }} />
          {!sidebarCollapsed && (
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {connected ? 'Connected' : 'Offline'}
            </span>
          )}
        </div>

        {/* User section */}
        {user && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: avatarColor(user.username) }}
              >
                <span className="font-mono text-[10px] font-medium text-white">
                  {initials(user.username)}
                </span>
              </div>
              {!sidebarCollapsed && (
                <div>
                  <p className="font-mono text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {user.username}
                  </p>
                  <span className="font-mono text-[9px] uppercase tracking-wider px-1 py-0.5 rounded"
                    style={{
                      color: user.role === 'admin' ? 'var(--red)' : user.role === 'operator' ? 'var(--amber)' : 'var(--blue)',
                      backgroundColor: user.role === 'admin' ? 'var(--red-muted)' : user.role === 'operator' ? 'var(--amber-muted)' : 'var(--blue-muted)',
                    }}>
                    {user.role}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Sign out"
              data-cursor="hover"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  )
}
