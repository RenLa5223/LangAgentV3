import { create } from 'zustand'
import {
  fetchChatHistory,
  sendMessage as apiSendMessage,
  fetchStatus,
  pollActiveMessages
} from '@/api/request.js'
import { useAppStore } from './useAppStore'

export const useChatStore = create((set, get) => ({
  chatHistory: [],
  isTyping: false,
  agentStatus: 'offline',
  streamBuffer: '',

  appendMessage: (role, content, time, image = null) =>
    set((state) => ({
      chatHistory: [
        ...state.chatHistory,
        { role, content, time: time || new Date().toLocaleTimeString(), image }
      ]
    })),

  updateStreamMessage: (chunk) =>
    set((state) => ({ streamBuffer: state.streamBuffer + chunk })),

  commitStreamMessage: (time) =>
    set((state) => {
      if (!state.streamBuffer.trim()) return {}
      return {
        chatHistory: [
          ...state.chatHistory,
          { role: 'agent', content: state.streamBuffer, time: time || new Date().toLocaleTimeString() }
        ],
        streamBuffer: ''
      }
    }),

  clearHistory: () => set({ chatHistory: [], streamBuffer: '' }),

  updateMessage: (index, newContent) =>
    set((state) => ({
      chatHistory: state.chatHistory.map((msg, i) =>
        i === index ? { ...msg, content: newContent } : msg
      )
    })),

  // ---- Hydration ----
  loadHistory: async () => {
    try {
      const history = await fetchChatHistory()
      if (Array.isArray(history)) {
        set({
          chatHistory: history.map((msg) => ({
            role: msg.role,
            content: msg.content,
            time: msg.time || ''
          }))
        })
      }
    } catch (e) {
      console.warn('[ChatStore] 无法加载聊天历史:', e.message)
      set({
        chatHistory: [{
          role: 'agent',
          content: '后端服务未响应，请检查 core-engine 是否正常运行。',
          time: new Date().toLocaleTimeString()
        }]
      })
    }
  },

  refreshStatus: async () => {
    try {
      const data = await fetchStatus()
      set({ agentStatus: data.status || 'offline' })
    } catch (e) {
      set({ agentStatus: 'offline' })
    }
  },

  // ---- Send message ----
  sendMessage: async (text, image = null) => {
    if (!text && !image) return
    const addToast = useAppStore.getState().addToast

    // Show user message immediately
    get().appendMessage('user', text, undefined, image)
    set({ isTyping: true })

    try {
      const { ok, data } = await apiSendMessage({ message: text, image })

      if (ok && !data.error && data.reply_parts) {
        // Render each reply part as a separate agent message
        for (const part of data.reply_parts) {
          get().appendMessage('agent', part)
        }

        // Native notification via Tauri
        if (window.__TAURI__ && document.hidden) {
          try {
            const { useConfigStore } = await import('./useConfigStore')
            const agentName = useConfigStore.getState().agentName
            const body = data.reply_parts.join(' ').substring(0, 120)
            window.__TAURI__.notification.sendNotification({
              title: agentName || 'Agent',
              body,
              icon: '/api/avatar/agent'
            }).catch(() => {})
          } catch (e) { /* ignore */ }
        }
      } else if (data?.message) {
        // Backend returned an error message — remove last user bubble
        set((state) => ({
          chatHistory: state.chatHistory.slice(0, -1)
        }))
        addToast(data.message || '后端返回异常', 'error')
      } else {
        // Remove last user bubble on failure
        set((state) => ({
          chatHistory: state.chatHistory.slice(0, -1)
        }))
        addToast('后端返回异常', 'error')
      }
    } catch (e) {
      // Network error — remove last user bubble
      set((state) => ({
        chatHistory: state.chatHistory.slice(0, -1)
      }))
      addToast('网络不可达，后端无响应', 'error')
    } finally {
      set({ isTyping: false })
    }
  },

  // ---- Polling ----
  startPolling: () => {
    const poll = async () => {
      const state = get()
      if (state.isTyping) return
      try {
        const count = state.chatHistory.length
        const data = await pollActiveMessages(count)
        if (data.new_messages && data.new_messages.length > 0) {
          set({ isTyping: true })
          const agentMsgs = []
          for (const m of data.new_messages) {
            set((s) => ({
              chatHistory: [
                ...s.chatHistory,
                { role: m.role, content: m.content, time: m.time || new Date().toLocaleTimeString() }
              ]
            }))
            if (m.role === 'agent') agentMsgs.push(m.content)
          }
          set({ isTyping: false })
          // 主动消息原生弹窗（窗口隐藏时）
          if (window.__TAURI__ && document.hidden && agentMsgs.length > 0) {
            try {
              const { useConfigStore } = await import('./useConfigStore')
              const agentName = useConfigStore.getState().agentName
              const body = agentMsgs.join(' ').substring(0, 120)
              window.__TAURI__.notification.sendNotification({
                title: agentName || 'Agent',
                body,
                icon: '/api/avatar/agent'
              }).catch(() => {})
            } catch (e) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore poll errors */ }
    }
    poll()
    const interval = setInterval(poll, 3000)
    // Store interval ID so we can clear it later if needed
    set({ _pollInterval: interval })
    return () => clearInterval(interval)
  }
}))
