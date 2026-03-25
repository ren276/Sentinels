'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Loader2 } from 'lucide-react'
import Cookies from 'js-cookie'

export default function AuthCallback() {
  const router = useRouter()
  const { setUser } = useAuthStore()

  useEffect(() => {
    const handleAuth = async () => {
      // 1. Get the session from Supabase (this catches the token from the URL fragment)
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        console.error('Auth callback error:', error)
        try {
            router.replace('/login?error=callback_failed')
        } catch {
            window.location.href = '/login?error=callback_failed'
        }
        return
      }

      // 2. Set the 'sentinel_session' cookie so the backend can authorize API calls
      Cookies.set('sentinel_session', session.access_token, { 
        expires: 1/24, // 1 hour
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
      })

      // 3. Sync with your AuthStore
      setUser({
        user_id: session.user.id,
        username: session.user.email?.split('@')[0] || 'user',
        email: session.user.email || '',
        role: 'viewer', 
        is_active: true
      })

      // 4. Save refresh token for the axios interceptor
      if (session.refresh_token) {
        localStorage.setItem('refresh_token', session.refresh_token)
      }

      // 5. Success! Redirect to dashboard
      try {
        router.replace('/')
      } catch {
        window.location.href = '/'
      }
    }

    handleAuth()
  }, [router, setUser])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-surface text-on-surface font-sans antialiased">
      <div className="p-12 ghost-border bg-surface-container-low flex flex-col items-center gap-8 max-w-sm w-full mx-4">
        <div className="relative">
          <Loader2 className="animate-spin text-primary" size={64} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-primary animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
            <span className="mono-label text-primary tracking-[0.4em] font-bold uppercase">Sentinel_Auth</span>
            <span className="text-[10px] font-mono text-on-surface-variant/40 uppercase tracking-widest text-center">
              Establishing Secure Neural Uplink...
              <br />
              Syncing Permissions
            </span>
        </div>
      </div>
    </div>
  )
}
