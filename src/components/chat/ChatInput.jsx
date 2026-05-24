import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '@/stores/useChatStore'
import { useAppStore } from '@/stores/useAppStore'

const EMOJIS = [
  '😀','😂','🤣','😊','🥰','😍','😒','🥺','😭','😤','😡','🤯','😳','🥵','🥶','😱','🤔','🙄','🤫','🤥','😴','🤤','😎',
  '👍','👎','✌️','🤞','🫰','🫶','🤝','🙏','💪','👏','🙌','❤️','💔','🔥','✨','🌟','💯','💦','💤','💢',
  '🐶','🐱','🐰','🦊','🐼','🐷','🌹','🌻','☀️','🌙','☁️','🍎','🍉','🍓','🍔','🍟','🍰','☕','🍺','🎁','🎈','🎉','🎵'
]

export default function ChatInput() {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [imageBase64, setImageBase64] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [showMicAlert, setShowMicAlert] = useState(false)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const recognitionRef = useRef(null)

  const sendMessage = useChatStore((s) => s.sendMessage)
  const isTyping = useChatStore((s) => s.isTyping)
  const addToast = useAppStore((s) => s.addToast)
  const openModal = useAppStore((s) => s.openModal)

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if ((!trimmed && !imageBase64) || isTyping) return
    setText('')
    setImageBase64(null)
    setImagePreview(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px'
    }
    await sendMessage(trimmed, imageBase64)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [text, imageBase64, isTyping, sendMessage])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    },
    [send]
  )

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '24px'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    // Only show scrollbar when content exceeds max height
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [])

  const insertEmoji = useCallback((emoji) => {
    setText((prev) => prev + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }, [])

  // ---- Image upload ----
  const handleImageClick = () => {
    fileInputRef.current?.click()
    setShowDrawer(false)
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result
      // Strip data:... prefix for API
      const raw = typeof b64 === 'string' ? b64.split(',')[1] : b64
      setImageBase64(raw)
      setImagePreview(b64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeImage = () => {
    setImageBase64(null)
    setImagePreview(null)
  }

  // ---- Voice input (Web Speech API) ----
  const finalTranscriptRef = useRef('')
  const textBeforeRef = useRef('')
  const lastWordTimeRef = useRef(0)
  const silenceTimerRef = useRef(null)

  const startRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      addToast('当前环境不支持语音识别接口', 'error')
      return
    }

    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }

    try {
      finalTranscriptRef.current = ''
      textBeforeRef.current = text
      const recognition = new SpeechRecognition()
      recognition.lang = 'zh-CN'
      recognition.interimResults = true
      recognition.continuous = true
      // Some browsers need these
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsRecording(true)
        lastWordTimeRef.current = Date.now()
        // 3s silence auto-stop timer
        silenceTimerRef.current = setInterval(() => {
          if (Date.now() - lastWordTimeRef.current > 3000) {
            recognition.stop()
          }
        }, 500)
      }

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          const transcript = r[0].transcript
          if (r.isFinal) {
            finalTranscriptRef.current += transcript
            lastWordTimeRef.current = Date.now()
          } else {
            interim += transcript
          }
        }
        setText(textBeforeRef.current + finalTranscriptRef.current + interim)
        const el = textareaRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      }

      const cleanup = () => {
        if (silenceTimerRef.current) {
          clearInterval(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }

      recognition.onerror = (event) => {
        console.warn('[Voice] SpeechRecognition error:', event.error, event.message)
        const messages = {
          'not-allowed': '麦克风权限未授予，请在系统设置中允许浏览器访问麦克风',
          'audio-capture': '未检测到可用麦克风设备，请确认硬件已正确连接',
          'network': '语音识别网络服务不可达（依赖 Google Speech 服务，请确保网络可访问）',
          'aborted': '语音识别已中断',
          'no-speech': '',
          'language-not-supported': '当前环境不支持语音识别'
        }
        const msg = messages[event.error]
        if (msg) addToast(msg, 'error')
        else if (event.error) addToast('语音识别异常: ' + event.error, 'error')
        setText(textBeforeRef.current)
        setIsRecording(false)
        cleanup()
      }

      recognition.onend = () => {
        cleanup()
        if (finalTranscriptRef.current) {
          setText((prev) => {
            // Only append if not already showing (handles edge case where onresult already set it)
            const base = textBeforeRef.current
            return prev.startsWith(base) ? base + finalTranscriptRef.current : prev + finalTranscriptRef.current
          })
        }
        setIsRecording(false)
        textareaRef.current?.focus()
      }

      recognition.start()
      recognitionRef.current = recognition
    } catch (e) {
      console.error('[Voice] Failed to start:', e)
      if (e.name === 'NotAllowedError' || e.message?.includes('permission')) {
        addToast('麦克风权限未授予，请在系统设置中允许浏览器访问麦克风', 'error')
      } else if (e.message?.includes('language')) {
        addToast('当前环境不支持语音识别', 'error')
      } else {
        addToast('语音引擎启动失败：' + (e.message || '未知错误'), 'error')
      }
      setIsRecording(false)
    }
  }, [isRecording, addToast, text])

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      recognitionRef.current?.stop()
      return
    }

    // Check if user previously granted mic consent
    if (localStorage.getItem('mic_consent_granted')) {
      startRecording()
    } else {
      setShowMicAlert(true)
    }
  }, [isRecording, startRecording])

  return (
    <footer className="flex gap-2 items-end p-4 border-t border-border bg-white/50 shrink-0 relative">
      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageChange}
      />

      {/* Voice button */}
      <button
        onClick={toggleVoice}
        className={`action-btn w-11 h-11 rounded-full border
                   shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                   hover:-translate-y-0.5 hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                   active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                   transition-all duration-300 flex items-center justify-center text-lg shrink-0
                   ${isRecording
                     ? 'bg-[#e07a5f] text-white border-[#e07a5f] animate-pulse'
                     : 'bg-white/70 border-border text-primary'
                   }`}
        title={isRecording ? '停止录音' : '语音输入'}
      >
        🎙️
      </button>

      {/* Input wrapper */}
      <div className="flex-1 bg-white rounded-2xl shadow-inner px-4 py-2.5 flex flex-col gap-2">
        {/* Image preview */}
        {imagePreview && (
          <div className="relative w-fit">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-[60px] rounded-xl shadow-soft object-cover"
            />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 bg-[#e07a5f] text-white border-none rounded-full w-[22px] h-[22px] text-xs cursor-pointer flex items-center justify-center hover:opacity-80 transition-opacity"
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? '正在聆听...' : '输入消息...'}
          rows={1}
          disabled={isTyping}
          className="w-full border-none outline-none resize-none bg-transparent font-[inherit] text-base text-text-main leading-relaxed max-h-[120px] h-6 placeholder:text-text-sub/60 disabled:opacity-50"
          style={{ overflowY: 'auto', scrollbarWidth: 'thin' }}
        />
      </div>

      {/* Emoji button */}
      <button
        onClick={() => { setShowEmoji((v) => !v); setShowDrawer(false) }}
        className="action-btn w-11 h-11 rounded-full bg-white/70 border border-border
                   shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                   hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                   active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                   transition-all duration-300 flex items-center justify-center text-lg text-primary shrink-0"
        title="表情"
      >
        😊
      </button>

      {/* Drawer button */}
      <button
        onClick={() => { setShowDrawer((v) => !v); setShowEmoji(false) }}
        className="action-btn w-11 h-11 rounded-full bg-white/70 border border-border
                   shadow-[4px_4px_10px_rgba(188,138,95,0.08),-4px_-4px_10px_rgba(255,255,255,0.6)]
                   hover:-translate-y-0.5 hover:text-primary-dark hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                   active:translate-y-px active:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.08),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]
                   transition-all duration-300 flex items-center justify-center text-lg text-primary shrink-0"
        title="更多功能"
      >
        ➕
      </button>

      {/* Send button */}
      <button
        onClick={send}
        disabled={isTyping}
        className="w-11 h-11 rounded-full bg-primary text-white shadow-soft
                   hover:-translate-y-0.5 hover:bg-primary-dark
                   active:translate-y-px
                   transition-all duration-300 flex items-center justify-center text-lg shrink-0
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        title="发送"
      >
        ➤
      </button>

      {/* Emoji picker popup */}
      {showEmoji && (
        <div className="absolute bottom-[85px] right-20 bg-card backdrop-blur-[10px] border border-border rounded-2xl p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.1)] grid grid-cols-8 gap-2 z-[100] max-h-[200px] overflow-y-auto animate-[fadeIn_0.2s_ease]">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => insertEmoji(e)}
              className="text-xl cursor-pointer transition-transform duration-200 hover:scale-125 bg-transparent border-none p-0 text-center select-none"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Drawer popup */}
      {showDrawer && (
        <div className="absolute bottom-[85px] right-12 bg-card backdrop-blur-[10px] border border-border rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.1)] z-[100] animate-[fadeIn_0.2s_ease] flex gap-5">
          <div
            className="flex flex-col items-center gap-2 cursor-pointer group"
            onClick={handleImageClick}
          >
            <div className="w-[60px] h-[60px] bg-white rounded-2xl flex items-center justify-center text-3xl shadow-soft group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_rgba(212,163,115,0.2)] transition-all duration-200">
              🖼️
            </div>
            <span className="text-xs text-text-sub">发送图片</span>
          </div>
          <div
            className="flex flex-col items-center gap-2 cursor-pointer group"
            onClick={() => { openModal('music-settings'); setShowDrawer(false) }}
          >
            <div className="w-[60px] h-[60px] bg-white rounded-2xl flex items-center justify-center text-3xl shadow-soft group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_rgba(212,163,115,0.2)] transition-all duration-200">
              🎵
            </div>
            <span className="text-xs text-text-sub">音乐设置</span>
          </div>
          <div
            className="flex flex-col items-center gap-2 cursor-pointer group"
            onClick={() => { openModal('reset'); setShowDrawer(false) }}
          >
            <div className="w-[60px] h-[60px] bg-white rounded-2xl flex items-center justify-center text-3xl shadow-soft group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_rgba(212,163,115,0.2)] transition-all duration-200" style={{ color: '#e07a5f' }}>
              🔄
            </div>
            <span className="text-xs text-text-sub">重置系统</span>
          </div>
        </div>
      )}

      {/* Mic permission confirmation dialog */}
      {showMicAlert && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-border p-5 z-[110] text-center min-w-[280px] animate-[fadeIn_0.2s_ease]">
          <p className="text-text-main text-sm font-bold m-0 mb-4">请求使用麦克风进行语音输入？</p>
          <div className="flex gap-2.5 justify-center">
            <button
              onClick={() => setShowMicAlert(false)}
              className="px-5 py-2 rounded-xl border-none bg-border text-text-sub text-sm font-bold cursor-pointer hover:opacity-80 transition-opacity"
            >
              取消
            </button>
            <button
              onClick={() => {
                setShowMicAlert(false)
                localStorage.setItem('mic_consent_granted', '1')
                startRecording()
              }}
              className="px-5 py-2 rounded-xl border-none bg-primary text-white text-sm font-bold cursor-pointer hover:bg-primary-dark transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </footer>
  )
}
