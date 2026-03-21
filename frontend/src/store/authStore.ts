import { create } from 'zustand'
import type { User } from '@/types'

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  clearAuth: () => void
  isAdmin: () => boolean
  isOperator: () => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: true }),
  clearAuth: () => set({ user: null, isAuthenticated: false }),
  isAdmin: () => get().user?.role === 'admin',
  isOperator: () => ['admin', 'operator'].includes(get().user?.role ?? ''),
}))
