import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfigStore } from '@/stores/useConfigStore'
import { useChatStore } from '@/stores/useChatStore'
import { useAppStore } from '@/stores/useAppStore'
import { fetchSignature } from '@/api/request.js'

const statusMap = {
  online:     { dot: 'bg-[#52b788] shadow-[0_0_5px_rgba(82,183,136,0.6)]', label: '在线', labelColor: 'text-[#52b788]' },
  connecting: { dot: 'bg-primary animate-pulse', label: '连接中', labelColor: 'text-primary' },
  offline:    { dot: 'bg-[#e07a5f]', label: '离线', labelColor: 'text-[#e07a5f]' }
}

export default function ChatHeader() {
  const navigate = useNavigate()
  const agentName = useConfigStore((s) => s.agentName)
  const modelConfig = useConfigStore((s) => s.modelConfig)
  const agentStatus = useChatStore((s) => s.agentStatus)
  const isTyping = useChatStore((s) => s.isTyping)
  const openModal = useAppStore((s) => s.openModal)

  const [signature, setSignature] = useState('')
  const prevStatusRef = useRef(agentStatus)

  // Fetch signature on mount and when status transitions to online
  const loadSignature = async () => {
    try {
      const data = await fetchSignature()
      setSignature(data.signature ? `"${data.signature}"` : '正在构思签名内容…')
    } catch (e) {
      setSignature('正在构思签名内容…')
    }
  }

  useEffect(() => { loadSignature() }, [])

  useEffect(() => {
    if (prevStatusRef.current !== 'online' && agentStatus === 'online') {
      loadSignature()
    }
    prevStatusRef.current = agentStatus
  }, [agentStatus])

  // 模型未配置时覆盖后端连接状态
  const modelConfigured = !!(modelConfig.url && modelConfig.key)
  const effectiveStatus = modelConfigured ? agentStatus : 'unconfigured'

  const statusMapFull = {
    ...statusMap,
    unconfigured: { dot: 'bg-[#f4a261]', label: '未配置', labelColor: 'text-[#f4a261]' }
  }
  const status = statusMapFull[effectiveStatus] || statusMapFull.offline

  return (
    <header className="h-[80px] flex justify-between items-center px-5 border-b border-border bg-white/60 shrink-0">
      {/* Left: 模型配置 */}
      <div className="flex-1 flex items-center gap-2">
        <button
          onClick={() => openModal('model-config')}
          className="px-4 py-2 rounded-2xl text-text-sub text-sm font-bold
                     bg-white/70 border border-border flex items-center gap-2
                     shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                     hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                     active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                     transition-all duration-300"
        >
          <span>⚙️</span>
          <span>模型配置</span>
        </button>
        {isTyping && (
          <span className="text-xs text-text-sub ml-2 animate-pulse">
            正在输入中...
          </span>
        )}
      </div>

      {/* Center: Agent Name + Signature */}
      <div className="flex-[2] flex flex-col items-center">
        <span className="text-xl font-bold text-primary-dark tracking-[2px]">{agentName}</span>
        <span className="text-xs text-text-sub mt-1 bg-[rgba(232,213,196,0.3)] px-3 py-0.5 rounded-xl">
          {signature || '正在构思签名内容…'}
        </span>
      </div>

      {/* Right: Status + 档案室 */}
      <div className="flex-1 flex items-center justify-end gap-2">
        <div className="flex items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-xl border border-border shadow-inner">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
          <span className={`text-xs font-bold ${status.labelColor}`}>{status.label}</span>
        </div>
        <button
          onClick={() => navigate('/manage')}
          className="px-4 py-2 rounded-2xl text-text-sub text-sm font-bold
                     bg-white/70 border border-border flex items-center gap-2
                     shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                     hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                     active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                     transition-all duration-300"
        >
          <span>📝</span>
          <span>档案室</span>
        </button>
      </div>
    </header>
  )
}
