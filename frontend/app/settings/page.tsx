'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { apiClient } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
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

  return (
    <div className="flex-1 p-8 overflow-y-auto w-full bg-[#121317]">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.3 }}
          className="w-full flex justify-center"
        >
          {(activeTab === 'profile' || activeTab === 'security') && <ProfileSettings currentTab={activeTab} onChangeTab={handleTabChange} />}
          {activeTab === 'integrations' && <IntegrationsSettings />}
          {activeTab === 'users' && isAdmin() && <UsersSettings />}
          {activeTab === 'users' && !isAdmin() && <div className="text-[#ffb4ab] font-mono text-xl mt-20">UNAUTHORIZED_ACCESS</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[#b9cacb] font-mono animate-pulse uppercase tracking-widest">LOADING MODULE...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
