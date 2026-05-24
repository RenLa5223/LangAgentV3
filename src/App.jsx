import { useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import ChatView from './views/ChatView'
import ManageView from './views/ManageView'
import HealthModal from '@/components/modals/HealthModal'
import ModelConfigModal from '@/components/modals/ModelConfigModal'
import ResetModal from '@/components/modals/ResetModal'
import WizardModal from '@/components/modals/WizardModal'
import MusicSettingsModal from '@/components/modals/MusicSettingsModal'
import ToastContainer from '@/components/ToastContainer'
import { useConfigStore } from '@/stores/useConfigStore'
import { useChatStore } from '@/stores/useChatStore'
import { useAppStore } from '@/stores/useAppStore'
import { fetchHealth } from '@/api/request.js'

export default function App() {
  const initialized = useRef(false)
  const [portReady, setPortReady] = useState(false)

  // ====== Phase 0: 动态端口初始化屏障 ======
  useEffect(() => {
    useAppStore.getState().initServerPort().then(() => {
      setPortReady(true)
    })
  }, [])

  // ====== Phase 1: 业务初始化（端口就绪后执行） ======
  useEffect(() => {
    if (!portReady) return
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      // 1. Silent health check — only show modal if something is wrong
      try {
        const health = await fetchHealth()
        if (health.core_server !== 'online') {
          useAppStore.getState().openModal('health-check')
        }
      } catch (e) {
        useAppStore.getState().openModal('health-check')
      }

      // 2. Load config
      await useConfigStore.getState().loadConfigFromServer()

      // 3. Load chat history
      await useChatStore.getState().loadHistory()

      // 4. Fetch agent status
      await useChatStore.getState().refreshStatus()

      // 5. Start connection status polling (every 5s)
      setInterval(() => {
        useChatStore.getState().refreshStatus()
      }, 5000)

      // 6. Start message polling (every 3s)
      useChatStore.getState().startPolling()
    }

    init()
  }, [portReady])

  // ====== 加载屏障 ======
  if (!portReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[rgba(250,246,240,0.95)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-text-sub text-sm font-bold">正在建立安全连接...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <HashRouter>
        <div className="w-[95vw] max-w-[1600px] h-[92vh] bg-card backdrop-blur-[20px] rounded-[30px] shadow-soft border border-white/60 relative overflow-hidden flex">
          <Routes>
            <Route path="/" element={<ChatView />} />
            <Route path="/manage" element={<ManageView />} />
          </Routes>
        </div>
      </HashRouter>

      {/* Global modals — outside router so they overlay everything */}
      <HealthModal />
      <ModelConfigModal />
      <ResetModal />
      <WizardModal />
      <MusicSettingsModal />
      <ToastContainer />
    </>
  )
}
