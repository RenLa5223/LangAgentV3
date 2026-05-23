import { useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { resetSystem } from '@/api/request.js'

export default function ResetModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const addToast = useAppStore((s) => s.addToast)

  const isVisible = activeModal === 'reset'
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)

  const confirmed = confirmText === '确认重置'

  const handleReset = async () => {
    if (!confirmed || resetting) return
    setResetting(true)
    try {
      await resetSystem()
      addToast('系统已重置，即将刷新页面', 'success')
      closeModal()
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      addToast('重置失败: ' + e.message, 'error')
      setResetting(false)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(90,74,66,0.4)] backdrop-blur-sm">
      <div className="bg-[var(--bg-color)] w-full max-w-[450px] rounded-2xl p-7 shadow-[0_20px_50px_rgba(0,0,0,0.2)] text-center">
        <h3 className="mt-0 mb-2.5 text-[#e07a5f] text-lg font-bold">危险操作：系统重置</h3>
        <p className="text-text-main text-sm leading-relaxed mb-5 text-left">
          此步骤将清空所有<b>人物/用户信息</b>、<b>记忆</b>以及<b>模型数据</b>。<br />
          系统将完全重置到第一次启动时的状态，此操作<b className="text-[#e07a5f]">不可恢复</b>！
        </p>
        <div className="mb-5">
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="请输入：确认重置"
            className="w-full px-4 py-2.5 rounded-xl border-none bg-white shadow-inner text-sm text-text-main outline-none font-[inherit] text-center font-bold"
          />
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={closeModal}
            className="flex-1 py-3 rounded-xl border-none bg-border text-text-sub font-bold text-base cursor-pointer hover:opacity-80 transition-opacity"
          >
            取消
          </button>
          <button
            onClick={handleReset}
            disabled={!confirmed || resetting}
            className="flex-1 py-3 rounded-xl border-none text-white font-bold text-base cursor-pointer transition-colors
                       bg-[#e07a5f] hover:bg-[#c96a52]
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? '重置中...' : '重置开启'}
          </button>
        </div>
      </div>
    </div>
  )
}
