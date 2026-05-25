import { create } from 'zustand'

let toastSeq = 0

export const useAppStore = create((set, get) => ({
  activeModal: null,   // null | 'model-config' | 'reset' | 'health-check'
  toasts: [],          // { id, message, type }
  serverBaseUrl: '',   // 动态后端地址：Tauri 模式 = http://127.0.0.1:{port}，Web 模式 = ''
  portReady: false,    // 端口初始化完成标志

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
  },

  initServerPort: async () => {
    if (get().portReady) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const port = await invoke('get_server_port')
      const url = `http://127.0.0.1:${port}`
      set({ serverBaseUrl: url, portReady: true })
      console.log('[AppStore] Tauri 模式，后端地址:', url)
    } catch (e) {
      // Tauri API 不可用，纯 Web 开发模式
      set({ serverBaseUrl: '', portReady: true })
      console.log('[AppStore] Web 开发模式，使用 Vite 代理')
    }
  }
}))
