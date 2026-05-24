import { useState, useEffect, useRef } from 'react'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { useChatStore } from '@/stores/useChatStore'
import {
  readFile,
  saveFile,
  fetchChatHistory,
  uploadAvatar
} from '@/api/request.js'

// ================================================================
// Helper: load text file from backend
// ================================================================
async function loadTextFile(folder, filename, fallback) {
  try {
    const res = await readFile(folder, filename)
    const text = await res.text()
    return text.trim() || fallback
  } catch (e) {
    console.warn(`[EditorPanel] 无法加载 ${folder}/${filename}:`, e.message)
    return fallback
  }
}

// ================================================================
// Token counter badge
// ================================================================
function TokenBadge({ content }) {
  const tokens = Math.ceil(content.length / 1.5)
  return (
    <span className="text-xs text-text-sub bg-white/50 px-2 py-1 rounded-full border border-border shrink-0">
      ~ {tokens} tokens
    </span>
  )
}

// ================================================================
// Avatar upload hook
// ================================================================
function AvatarUpload({ role }) {
  const fileRef = useRef(null)
  const addToast = useAppStore((s) => s.addToast)
  const [preview, setPreview] = useState(null)
  const [hasAvatar, setHasAvatar] = useState(false)
  const [checking, setChecking] = useState(true)
  const avatarVersion = useConfigStore((s) => s.avatarVersion)

  useEffect(() => {
    setChecking(true)
    const img = new Image()
    img.onload = () => {
      setHasAvatar(true)
      setPreview(`/api/avatar/${role}?v=${avatarVersion}`)
      setChecking(false)
    }
    img.onerror = () => {
      setHasAvatar(false)
      setChecking(false)
    }
    img.src = `/api/avatar/${role}?v=${avatarVersion}`
  }, [role, avatarVersion])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = typeof reader.result === 'string' ? reader.result.split(',')[1] : reader.result
      setPreview(reader.result)
      setHasAvatar(true)
      try {
        await uploadAvatar(role, b64)
        useConfigStore.getState().bumpAvatarVersion()
        addToast(`${role === 'agent' ? 'AI' : '用户'}头像已更新`, 'success')
      } catch (err) {
        addToast('头像上传失败: ' + err.message, 'error')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (checking) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-white/50 border-2 border-border animate-pulse" />
        <button className="bg-primary text-white px-3 py-1.5 rounded-xl text-sm font-bold cursor-pointer border-none opacity-50" disabled>上传头像</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {hasAvatar ? (
        <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
          <img
            src={preview}
            alt="头像"
            className="w-11 h-11 rounded-xl object-cover border-2 border-border shadow-soft"
          />
          <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs">更换</span>
          </div>
        </div>
      ) : (
        <div className="w-11 h-11 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-white/50 shadow-soft">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-sub">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="bg-primary text-white px-3 py-1.5 rounded-xl text-sm font-bold cursor-pointer border-none hover:bg-primary-dark transition-colors"
      >
        上传头像
      </button>
    </div>
  )
}

// ================================================================
// Sub-panel: 人物档案
// ================================================================
function AgentProfileEditor({ saveHandlerRef }) {
  const agentName = useConfigStore((s) => s.agentName)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTextFile('agent_profile', 'agent_profile.txt',
      `姓名：${agentName}\n核心性格：请在这里描写${agentName}的人设...`
    ).then((text) => {
      setContent(text)
      setLoading(false)
    })
  }, [agentName])

  useEffect(() => {
    saveHandlerRef.current = () => saveFile('agent_profile', 'agent_profile.txt', content)
  }, [content, saveHandlerRef])

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] border-primary pl-4 mt-0 mb-5 text-2xl flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span>人物档案</span>
          <AvatarUpload role="agent" />
        </div>
        <TokenBadge content={content} />
      </h1>
      <textarea
        className="w-full flex-1 min-h-[400px] border-none rounded-xl p-5 text-[1.05rem] bg-white/70 shadow-inner outline-none resize-y text-text-main leading-relaxed font-[inherit]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
    </div>
  )
}

// ================================================================
// Sub-panel: 用户档案
// ================================================================
function UserProfileEditor({ saveHandlerRef }) {
  const userName = useConfigStore((s) => s.userName)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTextFile('user_profile', 'user_profile.txt',
      `姓名：${userName}\n特征：请在这里描写关于你的基础信息...`
    ).then((text) => {
      setContent(text)
      setLoading(false)
    })
  }, [userName])

  useEffect(() => {
    saveHandlerRef.current = () => saveFile('user_profile', 'user_profile.txt', content)
  }, [content, saveHandlerRef])

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] border-primary pl-4 mt-0 mb-5 text-2xl flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span>用户档案</span>
          <AvatarUpload role="user" />
        </div>
        <TokenBadge content={content} />
      </h1>
      <textarea
        className="w-full flex-1 min-h-[400px] border-none rounded-xl p-5 text-[1.05rem] bg-white/70 shadow-inner outline-none resize-y text-text-main leading-relaxed font-[inherit]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
    </div>
  )
}

// ================================================================
// Sub-panel: 用户画像
// ================================================================
function UserPortraitEditor({ saveHandlerRef }) {
  const agentName = useConfigStore((s) => s.agentName)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTextFile('user_portrait', 'user_portrait.txt', '')
      .then((text) => {
        setContent(text)
        setLoading(false)
      })
  }, [agentName])

  useEffect(() => {
    saveHandlerRef.current = () => saveFile('user_portrait', 'user_portrait.txt', content)
  }, [content, saveHandlerRef])

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] border-primary pl-4 mt-0 mb-5 text-2xl">
        <span>用户画像</span>
      </h1>
      <div className="text-sm text-[#e07a5f] bg-[rgba(224,122,95,0.1)] p-3 rounded-lg mb-4 border-l-4 border-[#e07a5f] leading-relaxed">
        自动化区域：AI 会自动记录并提取用户的最新情报，结合旧情报在这里生成【用户画像】。
      </div>
      <textarea
        className="w-full flex-1 min-h-[400px] border-none rounded-xl p-5 text-[1.05rem] bg-white/70 shadow-inner outline-none resize-y text-text-main leading-relaxed font-[inherit]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
    </div>
  )
}

// ================================================================
// Sub-panel: 临时记忆 — 可编辑 textarea，双向绑定 ChatStore
// ================================================================
function ShortMemoryEditor({ saveHandlerRef }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const addToast = useAppStore((s) => s.addToast)
  const agentName = useConfigStore((s) => s.agentName)
  const userName = useConfigStore((s) => s.userName)

  const loadData = () => {
    setLoading(true)
    fetchChatHistory()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // Register save: persist entire chat history + sync to ChatStore
  useEffect(() => {
    saveHandlerRef.current = async () => {
      // Sync each item's content to ChatStore for live update
      items.forEach((item, i) => {
        try { useChatStore.getState().updateMessage(i, item.content) } catch (e) { /* ignore */ }
      })
      return saveFile('memory_core', 'chat_history.json', JSON.stringify(items, null, 2))
    }
  }, [items, saveHandlerRef])

  const updateContent = (index, content) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, content } : item
    ))
  }

  const handleDelete = async (index) => {
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
    try {
      await saveFile('memory_core', 'chat_history.json', JSON.stringify(updated, null, 2))
      addToast('记忆已删除', 'success')
    } catch (e) {
      addToast('删除失败: ' + e.message, 'error')
      setItems(items)
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] pl-4 mt-0 mb-5 text-2xl flex justify-between items-center"
        style={{ borderLeftColor: '#6b9ec2' }}>
        <span>临时记忆</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-sub bg-white/50 px-2 py-1 rounded-full border border-border">{items.length} 条</span>
          <TokenBadge content={items.map(i => i.content || '').join('')} />
        </div>
      </h1>
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-sub">暂无对话记录</div>
      ) : (
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-soft border-l-4 flex flex-col gap-2"
              style={{ borderLeftColor: '#6b9ec2' }}>
              <div className="flex justify-between text-xs text-text-sub font-bold items-center">
                <span className={item.role === 'agent' ? 'text-primary' : 'text-[#52b788]'}>
                  {item.role === 'agent' ? agentName : userName}
                </span>
                <span>{item.time || ''}</span>
              </div>

              {/* Always-editable textarea */}
              <textarea
                className="w-full border-none bg-[#fafafa] rounded-lg p-3 text-sm text-text-main outline-none resize-y min-h-[60px] font-[inherit] leading-relaxed focus:shadow-inner focus:bg-white transition-colors"
                value={item.content || ''}
                onChange={(e) => updateContent(i, e.target.value)}
              />

              <div className="flex justify-end">
                <button
                  onClick={() => handleDelete(i)}
                  className="text-red-500 bg-red-50 px-3 py-1 rounded-md hover:bg-red-100 transition-colors text-sm border-none cursor-pointer font-bold"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ================================================================
// 艾宾浩斯遗忘曲线算法 — 前端 JS 翻译自 app/core/config.py:175-185
// ================================================================
function getDecayScore(item) {
  try {
    const imp = Math.max(1, Math.min(10, parseFloat(item?.importance) || 5))
    const timeStr = item?.time || ''
    const dt = new Date(timeStr.replace(' ', 'T'))
    if (isNaN(dt.getTime())) return imp // no time → assume fresh
    const hoursElapsed = (Date.now() - dt.getTime()) / (1000 * 60 * 60)
    const halfLife = 24.0 * Math.pow(2.0, (imp - 1.0) / 2.0)
    return parseFloat((imp * Math.pow(2.0, -hoursElapsed / halfLife)).toFixed(2))
  } catch (e) {
    return 5
  }
}

function getMemoryState(score) {
  if (score >= 7) return { label: '鲜明', color: '#52b788' }
  if (score >= 4) return { label: '模糊', color: '#d4a373' }
  return { label: '淡去', color: '#e07a5f' }
}

// ================================================================
// Sub-panel: 记忆管理 (Ebbinghaus decay cards)
// ================================================================
function MemoryManageEditor({ saveHandlerRef }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [parseError, setParseError] = useState(null)
  const addToast = useAppStore((s) => s.addToast)

  const loadData = async () => {
    try {
      const res = await readFile('memory_core', 'memory_summary.json')
      const text = await res.text()
      if (!text || !text.trim()) { setItems([]); setLoading(false); return }

      let data
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        console.error('[MemoryManage] JSON 解析失败:', parseErr.message)
        setParseError('数据文件格式异常，无法解析记忆内容。请检查 memory_summary.json 是否为合法 JSON。')
        setItems([])
        setLoading(false)
        return
      }

      // Defensive: accept both { items: [...] } and plain array
      let raw = []
      if (Array.isArray(data)) {
        raw = data
      } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
        raw = data.items
      } else if (data && typeof data === 'object') {
        // Convert object to array of entries
        raw = Object.entries(data).map(([key, value]) => {
          if (typeof value === 'object' && value !== null) return value
          return { key, content: String(value) }
        })
      }
      // Filter out non-object entries
      raw = raw.filter((item) => item && typeof item === 'object' && !Array.isArray(item))

      // Self-heal: detect corrupted data where real items are nested inside a JSON string
      if (raw.length === 1 && raw[0].key === 'items' && typeof raw[0].content === 'string') {
        try {
          const nested = JSON.parse(raw[0].content)
          if (Array.isArray(nested)) {
            raw = nested
            // Auto-fix the file on disk
            saveFile('memory_core', 'memory_summary.json', JSON.stringify({ items: nested }, null, 2))
              .catch(() => {})
          }
        } catch (e) { /* not valid JSON, keep as-is */ }
      }

      setItems(raw)
      setParseError(null)
    } catch (e) {
      console.error('[MemoryManage] 读取失败:', e.message)
      setParseError(`无法读取记忆数据：${e.message}`)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    saveHandlerRef.current = () =>
      saveFile('memory_core', 'memory_summary.json', JSON.stringify({ items }, null, 2))
  }, [items, saveHandlerRef])

  const updateItem = (index, field, val) => {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: val } : item))
  }

  const deleteItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    addToast('记忆卡片已删除', 'success')
  }

  // Compute max decay score for title border color (old-style)
  const maxScore = items.reduce((max, item) => Math.max(max, getDecayScore(item)), 0)
  const titleColor = getMemoryState(maxScore).color

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] pl-4 mt-0 mb-5 text-2xl flex justify-between items-center"
        style={{ borderLeftColor: titleColor }}>
        <span>记忆管理</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-sub bg-white/50 px-2 py-1 rounded-full border border-border">{items.length} 条</span>
          <TokenBadge content={items.map(i => i.content || '').join('')} />
        </div>
      </h1>

      {/* Parse error banner */}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700 leading-relaxed">
          <strong>⚠ 数据异常</strong><br />
          {parseError}
          <button
            onClick={loadData}
            className="mt-2 bg-red-100 text-red-700 px-4 py-1.5 rounded-lg border-none cursor-pointer text-sm font-bold hover:bg-red-200 transition-colors"
          >
            重新加载
          </button>
        </div>
      )}

      {!parseError && items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-sub">
          <span className="text-3xl">🧠</span>
          <p className="text-sm m-0">暂无长期记忆</p>
          <p className="text-xs opacity-60 m-0">当对话轮次达到阈值时，系统将自动触发记忆压缩引擎</p>
        </div>
      ) : !parseError ? (
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
          {items.map((item, i) => {
            const score = getDecayScore(item)
            const state = getMemoryState(score)
            return (
              <div key={i} className="bg-white rounded-xl p-4 shadow-soft border-l-4 flex flex-col gap-2.5"
                style={{ borderLeftColor: state.color }}>
                {/* Meta line: time + dot + label + 鲜活度 */}
                <div className="flex justify-between text-xs text-text-sub font-bold items-center">
                  <span>归档: {item.time || ''}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: state.color }} />
                    <span style={{ color: state.color, fontWeight: 'bold' }}>{state.label}</span>
                    <span className="text-[0.75rem] text-text-sub">鲜活度 {score}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-[3px] rounded-sm bg-black/5 overflow-hidden">
                  <div className="h-full rounded-sm transition-[width] duration-500"
                    style={{ width: Math.min(100, Math.round(score / 10 * 100)) + '%', background: state.color }} />
                </div>

                {/* Content — plain text textarea */}
                <textarea
                  className="w-full border-none bg-[#fafafa] rounded-lg p-3 text-sm text-text-main outline-none resize-y min-h-[60px] font-[inherit] leading-relaxed focus:shadow-inner focus:bg-white transition-colors"
                  value={item.content || ''}
                  onChange={(e) => updateItem(i, 'content', e.target.value)}
                />

                <button
                  onClick={() => deleteItem(i)}
                  className="text-white border-none rounded-lg py-1.5 px-3 text-xs cursor-pointer transition-opacity duration-200 hover:opacity-80 self-end font-bold"
                  style={{ background: state.color }}
                >
                  抹除
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ================================================================
// Sub-panel: 记忆归档 (RAG) — 使用真实 archive_db.json + inverted_index.json
// ================================================================
function MemoryArchiveEditor({ saveHandlerRef }) {
  const [items, setItems] = useState([])
  const [indexStats, setIndexStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const addToast = useAppStore((s) => s.addToast)

  const updateItem = (index, content) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, content } : item
    ))
  }

  const deleteItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    addToast('归档记录已粉碎', 'success')
  }

  // Register save
  useEffect(() => {
    saveHandlerRef.current = () =>
      saveFile('memory_archive', 'archive_db.json', JSON.stringify(items, null, 2))
  }, [items, saveHandlerRef])

  const loadArchive = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load archive DB
      const res = await readFile('memory_archive', 'archive_db.json')
      const data = await res.json()
      const entries = Array.isArray(data) ? data : []
      setItems(entries)

      // Load inverted index for stats
      try {
        const idxRes = await readFile('memory_archive', 'inverted_index.json')
        const idxData = await idxRes.json()
        const docIds = new Set()
        if (idxData.inv) {
          Object.values(idxData.inv).forEach((docMap) => {
            Object.keys(docMap).forEach((id) => docIds.add(id))
          })
        }
        setIndexStats({
          totalDocs: docIds.size,
          totalBigrams: Object.keys(idxData.inv || {}).length,
          archiveSize: entries.length
        })
      } catch (e) {
        // Index may not exist yet — that's fine
        setIndexStats({ totalDocs: entries.length, totalBigrams: 0, archiveSize: entries.length })
      }
    } catch (err) {
      setError(err.message)
      setItems([])
      setIndexStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadArchive() }, [])

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-sub">加载中...</div>

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] pl-4 mt-0 mb-5 text-2xl"
        style={{ borderLeftColor: '#9b7ec4' }}>
        记忆归档
      </h1>

      {/* RAG Stats bar */}
      {indexStats && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-white rounded-xl p-3 shadow-soft text-center">
            <div className="text-2xl font-bold text-primary-dark">{indexStats.archiveSize}</div>
            <div className="text-[0.7rem] text-text-sub mt-0.5">归档文档</div>
          </div>
          <div className="flex-1 bg-white rounded-xl p-3 shadow-soft text-center">
            <div className="text-2xl font-bold text-primary-dark">{indexStats.totalDocs}</div>
            <div className="text-[0.7rem] text-text-sub mt-0.5">索引文档</div>
          </div>
          <div className="flex-1 bg-white rounded-xl p-3 shadow-soft text-center">
            <div className="text-2xl font-bold text-primary-dark">{indexStats.totalBigrams}</div>
            <div className="text-[0.7rem] text-text-sub mt-0.5">双字索引</div>
          </div>
        </div>
      )}

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="text-text-sub text-4xl">📭</div>
          <p className="text-text-sub text-sm m-0">暂无已归档的深度记忆</p>
          <p className="text-text-sub text-xs opacity-60 m-0">当对话达到一定轮次时，系统将自动触发 RAG 归档引擎。</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-sub">
          <span className="text-4xl">📦</span>
          <p className="text-sm m-0">暂无已归档的深度记忆</p>
          <p className="text-xs opacity-60 m-0">当对话达到一定轮次时，系统将自动触发 RAG 归档引擎。</p>
        </div>
      ) : (
        <>
          {/* Search box — old style */}
          <input
            type="text"
            placeholder="检索历史记忆 (输入关键词)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-border shadow-inner outline-none text-[0.95rem] text-primary-dark font-bold mb-4 font-[inherit] box-border placeholder:text-text-sub/50"
          />

          {/* Cards */}
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            {items
              .filter(m => (m.content || '').toLowerCase().includes(searchTerm.toLowerCase()))
              .map((item, i) => {
                const originalIndex = items.findIndex(orig => orig.id === item.id)
                return (
                  <div key={item.id || i} className="bg-white rounded-xl p-4 shadow-soft flex flex-col gap-2.5"
                    style={{ borderLeft: '4px solid #9b7ec4' }}>
                    {/* Meta */}
                    <div className="flex justify-between text-xs text-text-sub font-bold items-center">
                      <span>封存于: {item.time || ''}</span>
                      <span className="text-[0.75rem]" style={{ color: '#9b7ec4' }}>
                        区块: CHUNK-{item.id ? item.id.substring(0, 6) : '------'}
                      </span>
                    </div>
                    {/* Editable content */}
                    <textarea
                      className="w-full border-none bg-[#fafafa] rounded-lg p-3 text-[0.95rem] text-text-main outline-none resize-y min-h-[70px] font-[inherit] leading-relaxed focus:shadow-inner"
                      value={item.content || ''}
                      onChange={(e) => updateItem(originalIndex, 'content', e.target.value)}
                    />
                    {/* Delete */}
                    <button
                      onClick={() => deleteItem(originalIndex)}
                      className="text-white border-none rounded-lg py-1.5 px-3 text-xs cursor-pointer transition-opacity duration-200 hover:opacity-80 self-end font-bold"
                      style={{ background: '#9b7ec4' }}
                    >
                      永久粉碎
                    </button>
                  </div>
                )
              })}
            {items.filter(m => (m.content || '').toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
              <p className="text-text-sub text-center text-sm">没有检索到相关记忆块...</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ================================================================
// Sub-panel: 功能设置 (with real-time agentName binding)
// ================================================================
function SettingsEditor({ saveHandlerRef }) {
  const agentName = useConfigStore((s) => s.agentName)
  const userName = useConfigStore((s) => s.userName)
  const proactiveSettings = useConfigStore((s) => s.proactiveSettings)
  const [local, setLocal] = useState({
    aiName: agentName,
    userName,
    proactiveEnabled: proactiveSettings.enabled,
    proactiveStartH: proactiveSettings.startHour,
    proactiveStartM: proactiveSettings.startMinute,
    proactiveEndH: proactiveSettings.endHour,
    proactiveEndM: proactiveSettings.endMinute,
    proactiveMin: proactiveSettings.minInterval,
    proactiveMax: proactiveSettings.maxInterval,
  })

  useEffect(() => {
    const s = useConfigStore.getState()
    setLocal({
      aiName: s.agentName,
      userName: s.userName,
      proactiveEnabled: s.proactiveSettings.enabled,
      proactiveStartH: s.proactiveSettings.startHour,
      proactiveStartM: s.proactiveSettings.startMinute,
      proactiveEndH: s.proactiveSettings.endHour,
      proactiveEndM: s.proactiveSettings.endMinute,
      proactiveMin: s.proactiveSettings.minInterval,
      proactiveMax: s.proactiveSettings.maxInterval
    })
  }, [])

  // Register save: update Zustand state first, then sync to server
  useEffect(() => {
    saveHandlerRef.current = () => {
      const s = useConfigStore.getState()
      // Immediately update Zustand so ChatHeader reacts in real-time
      useConfigStore.setState({
        agentName: local.aiName,
        userName: local.userName,
        proactiveSettings: {
          enabled: local.proactiveEnabled,
          startHour: local.proactiveStartH,
          startMinute: local.proactiveStartM,
          endHour: local.proactiveEndH,
          endMinute: local.proactiveEndM,
          minInterval: local.proactiveMin,
          maxInterval: local.proactiveMax
        }
      })
      return s.syncConfigToServer()
    }
  }, [local, saveHandlerRef])

  // Clamp intervals when time window shrinks below current values
  useEffect(() => {
    const startMin = local.proactiveStartH * 60 + local.proactiveStartM
    const endMin = local.proactiveEndH * 60 + local.proactiveEndM
    const windowDuration = endMin > startMin
      ? endMin - startMin
      : 24 * 60 - startMin + endMin
    const maxCap = Math.max(10, Math.min(240, windowDuration))
    let changed = false
    let newMin = local.proactiveMin
    let newMax = local.proactiveMax
    if (newMax > maxCap) { newMax = maxCap; changed = true }
    if (newMin > newMax - 5) { newMin = Math.max(5, newMax - 5); changed = true }
    if (changed) {
      setLocal((prev) => ({ ...prev, proactiveMin: newMin, proactiveMax: newMax }))
    }
  }, [local.proactiveStartH, local.proactiveStartM, local.proactiveEndH, local.proactiveEndM])

  const update = (key, val) => setLocal((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="flex flex-col flex-1">
      <h1 className="text-text-sub border-l-[5px] border-primary pl-4 mt-0 mb-5 text-2xl">
        功能设置
      </h1>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-sub font-bold">Agent 名称</label>
          <input
            type="text"
            value={local.aiName}
            onChange={(e) => update('aiName', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-none bg-white shadow-inner text-base text-text-main outline-none font-[inherit]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-sub font-bold">您的名称</label>
          <input
            type="text"
            value={local.userName}
            onChange={(e) => update('userName', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-none bg-white shadow-inner text-base text-text-main outline-none font-[inherit]"
          />
        </div>

        {/* System diagnostics */}
        <div className="h-px bg-[rgba(232,213,196,0.5)] my-2" />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-sub font-bold">高级系统诊断</label>
          <button
            onClick={() => useAppStore.getState().openModal('health-check')}
            className="w-full px-4 py-3 rounded-2xl bg-white border border-border shadow-soft text-primary-dark font-bold text-sm cursor-pointer
                       hover:-translate-y-0.5 hover:shadow-[6px_6px_16px_rgba(188,138,95,0.12),-6px_-6px_16px_rgba(255,255,255,0.8)]
                       active:translate-y-px active:shadow-inner
                       transition-all duration-300 flex items-center justify-center gap-2"
          >
            <span>🔍</span>
            <span>全链路节点诊断</span>
          </button>
        </div>

        <div className="h-px bg-[rgba(232,213,196,0.5)] my-2" />

        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={local.proactiveEnabled}
            onChange={(e) => update('proactiveEnabled', e.target.checked)}
            className="w-[18px] h-[18px]"
          />
          <label className="text-lg text-primary-dark font-bold">开启主动消息</label>
        </div>

        <div className={local.proactiveEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <label className="text-sm text-text-sub font-bold block mb-2">允许主动回复的时间段</label>
          <div className="flex gap-4 items-center">
            <select value={local.proactiveStartH} onChange={(e) => update('proactiveStartH', Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-border bg-white shadow-inner font-[inherit] text-base text-text-main cursor-pointer text-center outline-none min-w-[56px]">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
              ))}
            </select>
            <span className="text-text-sub">:</span>
            <select value={local.proactiveStartM} onChange={(e) => update('proactiveStartM', Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-border bg-white shadow-inner font-[inherit] text-base text-text-main cursor-pointer text-center outline-none min-w-[56px]">
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
            <span className="text-text-sub mx-2">至</span>
            <select value={local.proactiveEndH} onChange={(e) => update('proactiveEndH', Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-border bg-white shadow-inner font-[inherit] text-base text-text-main cursor-pointer text-center outline-none min-w-[56px]">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
              ))}
            </select>
            <span className="text-text-sub">:</span>
            <select value={local.proactiveEndM} onChange={(e) => update('proactiveEndM', Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-border bg-white shadow-inner font-[inherit] text-base text-text-main cursor-pointer text-center outline-none min-w-[56px]">
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>

          {(() => {
            const startMin = local.proactiveStartH * 60 + local.proactiveStartM
            const endMin = local.proactiveEndH * 60 + local.proactiveEndM
            const windowDuration = endMin > startMin
              ? endMin - startMin
              : 24 * 60 - startMin + endMin

            const maxCap = Math.max(10, Math.min(240, windowDuration))
            const displayMin = Math.max(5, Math.min(local.proactiveMin, local.proactiveMax - 5))

            const handleMinChange = (val) => {
              const v = Math.max(5, Math.min(val, local.proactiveMax - 5))
              update('proactiveMin', v)
            }
            const handleMaxChange = (val) => {
              const v = Math.max(local.proactiveMin + 5, Math.min(val, maxCap))
              update('proactiveMax', v)
            }

            return (
          <div className="flex flex-col gap-3 mt-5">
            <div className="flex justify-between">
              <span className="text-text-main font-bold text-sm">最小间隔</span>
              <span className="slider-val inline-block min-w-[52px] text-right font-bold text-primary-dark text-[0.95rem] bg-white/60 px-2.5 py-0.5 rounded-xl shadow-inner">{displayMin} 分钟</span>
            </div>
            <input type="range" min={5} max={Math.max(5, local.proactiveMax - 5)} value={displayMin}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className="range-slider w-full h-2 rounded appearance-none outline-none cursor-pointer bg-gradient-to-r from-border to-primary shadow-[inset_2px_2px_4px_rgba(188,138,95,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]" />
            <div className="flex justify-between">
              <span className="text-text-main font-bold text-sm">最大间隔</span>
              <span className="slider-val inline-block min-w-[52px] text-right font-bold text-primary-dark text-[0.95rem] bg-white/60 px-2.5 py-0.5 rounded-xl shadow-inner">{local.proactiveMax} 分钟</span>
            </div>
            <input type="range" min={Math.min(local.proactiveMin + 5, maxCap)} max={maxCap} value={local.proactiveMax}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="range-slider w-full h-2 rounded appearance-none outline-none cursor-pointer bg-gradient-to-r from-border to-primary shadow-[inset_2px_2px_4px_rgba(188,138,95,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]" />
            <p className="text-[0.7rem] text-text-sub m-0">
              时间窗 {Math.floor(windowDuration / 60)}h{windowDuration % 60}m · 间隔 {displayMin}–{local.proactiveMax} 分钟
            </p>
          </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ================================================================
// Panel registry
// ================================================================
const PANELS = {
  'agent-profile': AgentProfileEditor,
  'user-profile': UserProfileEditor,
  'user-portrait': UserPortraitEditor,
  'short-memory': ShortMemoryEditor,
  'memory-manage': MemoryManageEditor,
  'memory-archive': MemoryArchiveEditor,
  'settings': SettingsEditor
}

export default function EditorPanel({ activeTab }) {
  const Panel = PANELS[activeTab] || AgentProfileEditor
  const saveHandlerRef = useRef(null)

  const handleSave = async () => {
    try {
      if (saveHandlerRef.current) {
        await saveHandlerRef.current()
      }

      useAppStore.getState().addToast('配置已保存', 'success')
    } catch (e) {
      useAppStore.getState().addToast('保存失败: ' + e.message, 'error')
    }
  }

  return (
    <main className="flex-1 p-5 overflow-y-auto flex justify-center items-start">
      <div className="bg-white/60 rounded-2xl shadow-soft p-7 w-full max-w-[900px] flex flex-col min-h-full box-border">
        <Panel saveHandlerRef={saveHandlerRef} />

        {/* Save button */}
        <div className="mt-auto pt-4 text-right">
          <button
            onClick={handleSave}
            className="bg-primary text-white px-8 py-3 rounded-2xl font-bold text-base
                       shadow-[0_10px_20px_rgba(212,163,115,0.3)]
                       hover:bg-primary-dark hover:-translate-y-0.5
                       active:translate-y-px
                       transition-all duration-300 cursor-pointer border-none"
          >
            保存修改
          </button>
        </div>
      </div>
    </main>
  )
}
