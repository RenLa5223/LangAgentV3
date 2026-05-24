import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfigStore } from '@/stores/useConfigStore'
import { useChatStore } from '@/stores/useChatStore'
import { useAppStore } from '@/stores/useAppStore'
import { useAudioStore } from '@/stores/useAudioStore'
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
  const addToast = useAppStore((s) => s.addToast)

  const [signature, setSignature] = useState('')
  const prevStatusRef = useRef(agentStatus)

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

  const modelConfigured = !!(modelConfig.url && modelConfig.key)
  const effectiveStatus = modelConfigured ? agentStatus : 'unconfigured'

  const statusMapFull = {
    ...statusMap,
    unconfigured: { dot: 'bg-[#f4a261]', label: '未配置', labelColor: 'text-[#f4a261]' }
  }
  const status = statusMapFull[effectiveStatus] || statusMapFull.offline

  // 【音乐播放器】
  const playlist = useAudioStore((s) => s.playlist)
  const currentIndex = useAudioStore((s) => s.currentIndex)
  const isPlaying = useAudioStore((s) => s.isPlaying)
  const isExpanded = useAudioStore((s) => s.isExpanded)
  const togglePlay = useAudioStore((s) => s.togglePlay)
  const playNext = useAudioStore((s) => s.playNext)
  const playPrev = useAudioStore((s) => s.playPrev)
  const setExpanded = useAudioStore((s) => s.setExpanded)

  const currentTrack = (currentIndex >= 0 && currentIndex < playlist.length) ? playlist[currentIndex] : null
  const isListEmpty = playlist.length === 0
  const displayTrackName = isListEmpty ? '无' : (currentTrack?.name || '无')
  const playerExpanded = isExpanded || isPlaying
  const shouldMarquee = !isListEmpty && displayTrackName.length > 14

  const handleAction = (actionFn) => (e) => {
    e.stopPropagation()
    if (isListEmpty) {
      addToast('音乐列表为空，请先在设置中添加', 'warning')
    } else {
      actionFn()
    }
  }

  useEffect(() => {
    useAudioStore.getState().initAudioEvents()
  }, [])

  return (
    <header className="h-[80px] flex items-center px-5 border-b border-border bg-white/60 shrink-0 relative">
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
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
        <span className="text-xl font-bold text-primary-dark tracking-[2px]">{agentName}</span>
        <span className="text-xs text-text-sub mt-1 bg-[rgba(232,213,196,0.3)] px-3 py-0.5 rounded-xl">
          {signature || '正在构思签名内容…'}
        </span>
      </div>

      {/* 【音乐播放器】灵动岛 */}
      <div className="flex-1 flex items-center justify-end gap-2">

        <div
          className={`group flex items-center bg-white/70 border border-border shadow-inner transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] overflow-hidden cursor-default shrink-0
                      ${playerExpanded ? 'w-[200px] px-3 py-1.5 rounded-[20px] justify-center' : 'w-[32px] h-[32px] rounded-full p-0 justify-center'}`}
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => { if (!isPlaying) setExpanded(false) }}
        >
          {playerExpanded ? (
            <div className="flex flex-col items-center justify-center w-full min-w-[150px] animate-[fadeIn_0.3s_ease]">
              <div
                className="w-full flex justify-center overflow-hidden whitespace-nowrap"
                style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 80%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 80%, transparent 100%)' }}
              >
                <span className={`text-xs font-bold text-text-main inline-block px-2 ${shouldMarquee ? 'animate-[marquee_8s_linear_infinite]' : ''}`}>
                  {displayTrackName}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 shrink-0 text-xs text-text-sub">
                <button onClick={handleAction(playPrev)} className="hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0">⏮</button>
                <button onClick={handleAction(togglePlay)} className="hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0">{isPlaying ? '⏸' : '▶'}</button>
                <button onClick={handleAction(playNext)} className="hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0">⏭</button>
              </div>
            </div>
          ) : (
            <div className={`flex items-center justify-center w-full h-full text-sm ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
              🎵
            </div>
          )}
        </div>

        {/* 在线状态 */}
        <div className="flex items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-xl border border-border shadow-inner shrink-0">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
          <span className={`text-xs font-bold whitespace-nowrap ${status.labelColor}`}>{status.label}</span>
        </div>

        {/* 档案室按钮 */}
        <button
          onClick={() => navigate('/manage')}
          className="px-4 py-2 rounded-2xl text-text-sub text-sm font-bold
                     bg-white/70 border border-border flex items-center gap-2
                     shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                     hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                     active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                     transition-all duration-300 shrink-0"
        >
          <span>📝</span>
          <span>档案室</span>
        </button>
      </div>
    </header>
  )
}
