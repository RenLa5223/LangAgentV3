import { useState, useEffect } from 'react'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { saveFile } from '@/api/request.js'

export default function WizardModal() {
  const agentName = useConfigStore((s) => s.agentName)
  const loadConfigFromServer = useConfigStore((s) => s.loadConfigFromServer)
  const addToast = useAppStore((s) => s.addToast)

  const [show, setShow] = useState(false)
  const [checked, setChecked] = useState(false)
  const [aiName, setAiName] = useState('')
  const [userName, setUserName] = useState('')

  // Check if config exists — if no ai_name configured, show wizard
  useEffect(() => {
    const check = async () => {
      const cfg = await loadConfigFromServer()
      if (!cfg || !cfg.ai_name) {
        setShow(true)
      }
      setChecked(true)
    }
    check()
  }, [loadConfigFromServer])

  const handleFinish = async () => {
    const name1 = aiName.trim() || 'Agent'
    const name2 = userName.trim() || '用户'

    try {
      // Save config
      useConfigStore.setState({ agentName: name1, userName: name2 })
      await useConfigStore.getState().syncConfigToServer()

      // Initialize empty profile files if they don't exist
      const initFile = async (folder, filename, template) => {
        try {
          const res = await fetch(`/api/read/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`)
          if (res.ok) {
            const text = await res.text()
            if (text.trim()) return
          }
        } catch (e) { /* file doesn't exist */ }
        await saveFile(folder, filename, template)
      }

      await initFile('agent_profile', 'agent_profile.txt',
        `姓名：${name1}\n核心性格：请在这里描写${name1}的人设...`)
      await initFile('user_profile', 'user_profile.txt',
        `姓名：${name2}\n特征：请在这里描写关于你的基础信息...`)
      await initFile('inner_thoughts', 'inner_thoughts.txt', '')

      addToast(`${name1} 已唤醒`, 'success')
      setShow(false)
    } catch (e) {
      addToast('初始化失败: ' + e.message, 'error')
    }
  }

  if (!checked || !show) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[var(--bg-color)]">
      <div className="bg-card backdrop-blur-[20px] w-[420px] max-w-[90vw] rounded-[30px] p-[50px_40px] shadow-[0_20px_60px_rgba(141,119,101,0.15)] border border-white/60 flex flex-col items-center text-center animate-[slideUp_0.5s_ease] box-border">
        <h2 className="text-3xl font-bold text-primary-dark mb-2.5">唤醒专属 Agent</h2>
        <p className="text-base text-text-sub mb-8">请为你们设定数字代号</p>

        <div className="w-full text-left mb-5">
          <label className="block text-[0.95rem] text-text-sub font-bold mb-2 pl-1">Agent 名称</label>
          <input
            type="text"
            value={aiName}
            onChange={(e) => setAiName(e.target.value)}
            placeholder="请输入Agent名称"
            autoComplete="off"
            className="w-full px-5 py-[15px] rounded-2xl border-none bg-white shadow-inner text-lg text-text-main outline-none font-[inherit] transition-shadow duration-300 focus:shadow-[0_0_0_2px_var(--primary-light),var(--shadow-inset)] box-border"
          />
        </div>

        <div className="w-full text-left mb-5">
          <label className="block text-[0.95rem] text-text-sub font-bold mb-2 pl-1">您的名称</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="请输入您的名称"
            autoComplete="off"
            className="w-full px-5 py-[15px] rounded-2xl border-none bg-white shadow-inner text-lg text-text-main outline-none font-[inherit] transition-shadow duration-300 focus:shadow-[0_0_0_2px_var(--primary-light),var(--shadow-inset)] box-border"
          />
        </div>

        <button
          onClick={handleFinish}
          className="bg-primary text-white border-none py-[15px] w-full rounded-2xl text-lg font-bold cursor-pointer transition-all duration-300 shadow-[0_10px_20px_rgba(212,163,115,0.3)] mt-4 hover:bg-primary-dark hover:-translate-y-0.5"
        >
          完成唤醒，进入对话
        </button>
      </div>
    </div>
  )
}
