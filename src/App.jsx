import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import ChatView from './views/ChatView'
import ManageView from './views/ManageView'
import HealthModal from '@/components/modals/HealthModal'
import ModelConfigModal from '@/components/modals/ModelConfigModal'
import ResetModal from '@/components/modals/ResetModal'
import WizardModal from '@/components/modals/WizardModal'
import ToastContainer from '@/components/ToastContainer'
import { useConfigStore } from '@/stores/useConfigStore'
import { useChatStore } from '@/stores/useChatStore'
import { useAppStore } from '@/stores/useAppStore'
import { fetchHealth } from '@/api/request.js'

export default function App() {
  const initialized = useRef(false)

  useEffect(() => {
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
  }, [])

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
      <ToastContainer />
    </>
  )
}
