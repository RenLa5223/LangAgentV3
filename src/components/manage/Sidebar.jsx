import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchVersion } from '@/api/request.js'

const TOP_ITEMS = [
  { id: 'agent-profile', label: '人物档案', icon: '👤' },
  { id: 'user-profile', label: '用户档案', icon: '🙋' },
  { id: 'user-portrait', label: '用户画像', icon: '🖼️' }
]

const BOTTOM_ITEMS = [
  { id: 'short-memory', label: '临时记忆', icon: '🔄' },
  { id: 'memory-manage', label: '记忆管理', icon: '🧠' },
  { id: 'memory-archive', label: '记忆归档', icon: '🗄️' },
  { id: 'settings', label: '功能设置', icon: '⚙️' }
]

const bubbleBtn =
  'flex items-center gap-2 px-4 py-2.5 rounded-[20px] text-[0.95rem] font-bold cursor-pointer transition-all duration-300 text-left w-full border-none ' +
  'shadow-[8px_8px_20px_rgba(188,138,95,0.1),-8px_-8px_20px_rgba(255,255,255,0.8)] ' +
  'hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)] ' +
  'active:translate-y-px active:shadow-[inset_4px_4px_10px_rgba(188,138,95,0.08),inset_-4px_-4px_10px_rgba(255,255,255,0.6)]'

export default function Sidebar({ activeTab, onTabChange }) {
  const navigate = useNavigate()
  const [version, setVersion] = useState('-')

  useEffect(() => {
    fetchVersion().then(d => setVersion(d.version || '-')).catch(() => {})
  }, [])

  const renderTopItem = (item) => {
    const isActive = activeTab === item.id
    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all duration-300 text-left w-full
          ${isActive
            ? 'bg-primary-light text-primary font-bold shadow-soft'
            : 'text-text-sub hover:bg-primary-light/60'
          }
        `}
      >
        <span className="text-base">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    )
  }

  const renderBubbleItem = (item, idx) => {
    const isActive = activeTab === item.id
    const bg = idx % 2 === 0 ? 'bg-[#fffcf9]' : 'bg-[var(--bg-color)]'
    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={`${bubbleBtn} ${bg} ${
          isActive ? 'text-primary-dark font-bold shadow-[inset_4px_4px_10px_rgba(188,138,95,0.12),inset_-4px_-4px_10px_rgba(255,255,255,0.6)] brightness-95' : 'text-text-sub'
        }`}
      >
        <span className="text-base">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <aside className="w-[260px] bg-[rgba(255,241,230,0.4)] border-r border-border flex flex-col shrink-0 px-4 py-5 box-border">
      {/* Brand */}
      <h2 className="text-text-sub text-lg border-b-2 border-border pb-2.5 mb-2 flex items-baseline">
        <span className="flex-1" />
        <span>LangAgentV3</span>
        <span className="flex-1 text-right text-[0.65rem] opacity-45">v{version}</span>
      </h2>

      {/* Top nav group — pill style */}
      <nav className="flex flex-col gap-1">
        {TOP_ITEMS.map(renderTopItem)}
      </nav>

      <div className="h-px bg-[rgba(232,213,196,0.5)] my-2 rounded-sm" />

      {/* Bottom nav group — bubble button style, at bottom-left */}
      <div className="flex flex-col gap-2 mt-auto">
        {BOTTOM_ITEMS.map(renderBubbleItem)}
        <div className="h-px bg-[rgba(232,213,196,0.5)] my-1 rounded-sm" />
        <button
          onClick={() => navigate('/')}
          className={`${bubbleBtn} bg-[#fffcf9] text-text-sub`}
        >
          <span className="text-base">💬</span>
          <span>返回聊天</span>
        </button>
      </div>
    </aside>
  )
}
