'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { ProfileSettings, SecuritySettings } from '@/components/settings/ProfileSettings'
import { UsersSettings } from '@/components/settings/UsersSettings'
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings'

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabFromUrl = searchParams.get('tab')
  const { isAdmin } = useAuthStore()

  const [activeTab, setActiveTab] = useState(tabFromUrl || 'profile')

  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab)
    router.push(`/settings?tab=${newTab}`)
  }

  const tabs = [
    { id: 'profile', label: 'PROFILE_INFO' },
    { id: 'security', label: 'SECURITY_ACCESS' },
    { id: 'integrations', label: 'SLACK_INTEGRATION' },
    ...(isAdmin() ? [{ id: 'users', label: 'ADMIN_PANEL' }] : [])
  ]

  return (
    <div className="flex-1 p-8 overflow-y-auto w-full bg-surface">
      <div className="max-w-4xl mx-auto mb-12">
        <h1 className="text-4xl font-sans font-bold text-on-surface mb-8 tracking-tighter">System Settings</h1>
        <div className="flex flex-wrap border-b border-outline-variant/20 sticky top-0 bg-surface z-50">
          {tabs.map((tab) => {
            const active = activeTab === tab.id || (tab.id === 'profile' && activeTab === 'security')
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-8 py-4 mono-label text-[10px] tracking-widest relative transition-colors ${
                  active ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'integrations' && <IntegrationsSettings />}
            {activeTab === 'users' && isAdmin() && <UsersSettings />}
            {activeTab === 'users' && !isAdmin() && <div className="text-error font-mono text-xl mt-20 uppercase tracking-tighter">UNAUTHORIZED_ACCESS</div>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-on-surface-variant font-mono uppercase tracking-widest">LOADING MODULE...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
