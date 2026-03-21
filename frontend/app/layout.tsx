import type { Metadata } from 'next'
import { DM_Mono, Geist } from 'next/font/google'
import { Toaster } from 'sonner'
import { CustomCursor } from '@/components/cursor/CustomCursor'
import { Sidebar } from '@/components/layout/Sidebar'
import { Providers } from './providers'
import '@/styles/globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
})

export const metadata: Metadata = {
  title: 'Sentinel — AI System Monitoring',
  description: 'Production-ready AI system monitoring platform with anomaly detection, failure forecasting, and root cause analysis.',
  keywords: ['monitoring', 'observability', 'anomaly detection', 'AI', 'SRE'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${geist.variable} ${dmMono.variable}`}>
      <body style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <Providers>
          <CustomCursor />
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-geist)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
