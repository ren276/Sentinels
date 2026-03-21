import { create } from 'zustand'

interface UiStore {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  toggleSidebar: () => void
  setCommandPaletteOpen: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
}))
