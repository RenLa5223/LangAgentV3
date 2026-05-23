import { useRef, useEffect, useState, createContext, useContext } from 'react'
import { useChatStore } from '@/stores/useChatStore'
import { useConfigStore } from '@/stores/useConfigStore'

const CacheBusterCtx = createContext(0)

function AgentAvatar() {
  const [error, setError] = useState(false)
  const v = useContext(CacheBusterCtx)

  if (error) {
    return (
      <div className="w-[42px] h-[42px] rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-white/50 shadow-soft shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-sub">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={`/api/avatar/agent?v=${v}`}
      alt=""
      className="w-[42px] h-[42px] rounded-2xl object-cover shadow-soft shrink-0 border-2 border-white"
      onError={() => setError(true)}
    />
  )
}

function UserAvatar() {
  const [error, setError] = useState(false)
  const v = useContext(CacheBusterCtx)

  if (error) {
    return (
      <div className="w-[42px] h-[42px] rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-white/50 shadow-soft shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-sub">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={`/api/avatar/user?v=${v}`}
      alt=""
      className="w-[42px] h-[42px] rounded-2xl object-cover shadow-soft shrink-0 border-2 border-white"
      onError={() => setError(true)}
    />
  )
}

export default function MessageList() {
  const chatHistory = useChatStore((s) => s.chatHistory)
  const isTyping = useChatStore((s) => s.isTyping)
  const streamBuffer = useChatStore((s) => s.streamBuffer)
  const avatarVersion = useConfigStore((s) => s.avatarVersion)

  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, streamBuffer])

  return (
    <CacheBusterCtx.Provider value={avatarVersion}>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        {chatHistory.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={i}
              className={`flex items-start gap-3 max-w-[85%] animate-[fadeIn_0.3s_ease] ${
                isUser ? 'self-end flex-row-reverse' : 'self-start'
              }`}
            >
              {isUser ? <UserAvatar /> : <AgentAvatar />}

              <div
                className={
                  isUser
                    ? 'bg-gradient-to-br from-border to-primary text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-soft relative'
                    : 'bg-white text-text-main rounded-2xl rounded-tl-sm px-4 py-3 shadow-soft relative'
                }
              >
                {/* Image preview in user bubble */}
                {msg.image && (
                  <img
                    src={`data:image/png;base64,${msg.image}`}
                    alt=""
                    className="max-w-[280px] max-h-[320px] rounded-xl mb-2 object-contain shadow-soft"
                  />
                )}
                {msg.content && (
                  <p className="text-[1.05rem] leading-relaxed whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                )}
                <span
                  className={`absolute -bottom-[18px] text-[0.7rem] text-black/30 whitespace-nowrap ${
                    isUser ? 'right-1.5' : 'left-1.5'
                  }`}
                >
                  {msg.time}
                </span>
              </div>
            </div>
          )
        })}

        {(isTyping || streamBuffer) && (
          <div className="flex items-start gap-3 max-w-[85%] self-start animate-[fadeIn_0.3s_ease]">
            <AgentAvatar />
            <div className="bg-white text-text-main rounded-2xl rounded-tl-sm px-4 py-3 shadow-soft relative">
              <p className="text-[1.05rem] leading-relaxed whitespace-pre-wrap break-words">
                {streamBuffer || '...'}
              </p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </CacheBusterCtx.Provider>
  )
}
