import { create } from 'zustand'

let toastSeq = 0

export const useAppStore = create((set, get) => ({
  activeModal: null,   // null | 'model-config' | 'reset' | 'health-check'
  toasts: [],          // { id, message, type }

  openModal: (name) => set({ activeModal: name }),

  closeModal: () => set({ activeModal: null }),

  addToast: (message, type = 'info') => {
    const id = ++toastSeq
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }))
    }, 3000)
  }
}))
