import { create } from 'zustand'

type CursorType = 'default' | 'hover' | 'critical'

interface CursorStore {
  type: CursorType
  setType: (type: CursorType) => void
}

export const useCursorStore = create<CursorStore>((set) => ({
  type: 'default',
  setType: (type) => set({ type }),
}))
