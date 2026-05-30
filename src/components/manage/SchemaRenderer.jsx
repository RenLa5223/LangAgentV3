import { useState, useCallback, useEffect } from 'react'

// ================================================================
// V3 新拟态设计 Token（与 tailwind.css CSS 变量严格对齐）
// ================================================================
const NEO = {
  input:
    'w-full px-4 py-2.5 rounded-xl border-none bg-white shadow-inner text-base text-text-main outline-none font-[inherit] leading-relaxed transition-shadow focus:shadow-[inset_2px_2px_6px_rgba(188,138,95,0.12),inset_-2px_-2px_6px_rgba(255,255,255,0.6)]',
  label: 'text-sm text-text-sub font-bold block mb-1.5',
  toggle:
    'w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-[#52b788] peer-focus:ring-2 peer-focus:ring-[#52b788]/30 after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4',
  btnPrimary:
    'bg-primary text-white px-6 py-2.5 rounded-2xl font-bold text-sm cursor-pointer border-none shadow-[0_8px_16px_rgba(212,163,115,0.25)] hover:bg-primary-dark hover:-translate-y-0.5 active:translate-y-px transition-all duration-300',
  btnSecondary:
    'bg-white text-primary-dark px-4 py-2 rounded-xl text-sm font-bold cursor-pointer border border-border shadow-soft hover:-translate-y-0.5 active:translate-y-px transition-all duration-300',
  card: 'bg-white rounded-xl p-4 shadow-soft',
  markdownBox:
    'bg-[#fafafa] rounded-lg p-4 text-sm text-text-sub leading-relaxed overflow-hidden',
  badge: 'text-[0.6rem] px-2 py-0.5 rounded-full font-bold inline-block',
  divider: 'h-px bg-[rgba(232,213,196,0.5)] my-4',
}

// ================================================================
// 简易 Markdown 渲染（图片、标题、段落、代码、链接）
// ================================================================
function MarkdownBlock({ content }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Image: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (imgMatch) {
      elements.push(
        <div key={i} className="flex justify-center my-3">
          <img
            src={imgMatch[2]}
            alt={imgMatch[1] || ''}
            className="max-w-[200px] max-h-[200px] rounded-xl border border-border shadow-soft object-contain"
          />
        </div>
      )
      i++
      continue
    }

    // Heading: ## / ### / #
    if (line.match(/^#{1,3}\s/)) {
      const level = line.match(/^(#{1,3})/)[1].length
      const text = line.replace(/^#{1,3}\s/, '')
      const sizeClass = level === 1 ? 'text-base' : level === 2 ? 'text-sm' : 'text-xs'
      elements.push(
        <div key={i} className={`${sizeClass} font-bold text-text-main mt-3 mb-1 first:mt-0`}>
          {renderInline(text)}
        </div>
      )
      i++
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<div key={i} className={NEO.divider} />)
      i++
      continue
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <pre key={i} className="bg-[#f0ece6] rounded-lg p-3 text-xs text-text-main overflow-x-auto my-2 font-mono">
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }

    // Empty line -> paragraph break
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph with inline link support
    elements.push(
      <p key={i} className="text-sm text-text-sub leading-relaxed my-1 m-0">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return <div className={NEO.markdownBox}>{elements}</div>
}

function renderInline(text) {
  // Inline links: [text](url)
  const parts = []
  let remaining = text
  let key = 0
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
  let lastIdx = 0

  for (const m of remaining.matchAll(linkRe)) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++}>{remaining.slice(lastIdx, m.index)}</span>)
    }
    parts.push(
      <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer"
        className="text-primary underline decoration-primary/30 hover:decoration-primary transition-all">
        {m[1]}
      </a>
    )
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIdx)}</span>)
  }
  return parts.length > 0 ? parts : text
}

// ================================================================
// PluginStatusBox —— 独立轮询插件运行状态
// ================================================================
function PluginStatusBox({ pluginId, label }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!pluginId) return
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/plugins/status/${pluginId}`)
        if (res.ok) {
          const data = await res.json()
          setStatus(data.status || {})
        }
      } catch (e) { /* 静默失败 */ }
    }
    fetchStatus()
    const timer = setInterval(fetchStatus, 3000)
    return () => clearInterval(timer)
  }, [pluginId])

  const nowSeconds = Date.now() / 1000
  const lastTime = status?.last_time || 0
  const isTimeout = (nowSeconds - lastTime) > 30 * 60
  const displayTime = (!lastTime || isTimeout)
    ? '未调用'
    : new Date(lastTime * 1000).toLocaleTimeString()

  return (
    <div className="mb-6">
      <div className="flex justify-between items-end mb-1.5">
        <label className="text-sm text-text-sub font-bold">{label || '运行结果'}</label>
        <span className={`text-xs font-bold ${displayTime === '未调用' ? 'text-text-sub/50' : 'text-primary'}`}>
          {displayTime !== '未调用' ? `上次调用: ${displayTime}` : '未调用'}
        </span>
      </div>
      <div className="w-full h-48 overflow-y-auto custom-scrollbar bg-white shadow-[inset_2px_2px_6px_rgba(188,138,95,0.12),inset_-2px_-2px_6px_rgba(255,255,255,0.8)] rounded-xl p-4 text-sm text-text-sub leading-relaxed whitespace-pre-wrap">
        {displayTime === '未调用' ? '暂无数据或数据已过期...' : (status?.last_result || '无抓取结果')}
      </div>
    </div>
  )
}

// ================================================================
// 字段渲染器
// ================================================================
function FieldRenderer({ field, value, onChange, onAction, pluginId }) {
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)

  const type = field.type || 'text'
  const key = field.key || ''
  const label = field.label || ''

  // ---- text ----
  if (type === 'text') {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className={NEO.label}>{label}</label>}
        <input
          type="text"
          value={value ?? field.default ?? ''}
          placeholder={field.placeholder || ''}
          onChange={(e) => onChange(key, e.target.value)}
          className={NEO.input}
        />
        {field.hint && <span className="text-[0.7rem] text-text-sub/70">{field.hint}</span>}
      </div>
    )
  }

  // ---- password ----
  if (type === 'password') {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className={NEO.label}>{label}</label>}
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={value ?? field.default ?? ''}
            placeholder={field.placeholder || ''}
            onChange={(e) => onChange(key, e.target.value)}
            autoComplete="new-password"
            className={NEO.input + ' pr-10'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-text-sub/60 hover:text-text-sub p-1 text-sm"
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>
    )
  }

  // ---- number ----
  if (type === 'number') {
    return (
      <div className="flex flex-col gap-1">
        {label && <label className={NEO.label}>{label}</label>}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={value ?? field.default ?? 0}
            onChange={(e) => onChange(key, Number(e.target.value))}
            className="flex-1 range-slider h-2 rounded appearance-none outline-none cursor-pointer bg-gradient-to-r from-border to-primary shadow-[inset_2px_2px_4px_rgba(188,138,95,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]"
          />
          <span className="min-w-[48px] text-right font-bold text-primary-dark text-sm bg-white/60 px-2.5 py-0.5 rounded-xl shadow-inner">
            {value ?? field.default ?? 0}{field.unit || ''}
          </span>
        </div>
      </div>
    )
  }

  // ---- switch ----
  if (type === 'switch') {
    const checked = !!(value ?? field.default ?? false)
    return (
      <div className="flex items-center justify-between py-1">
        <div className="flex flex-col">
          {label && <span className="text-sm text-text-main font-bold">{label}</span>}
          {field.hint && <span className="text-[0.7rem] text-text-sub/70">{field.hint}</span>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(key, e.target.checked)}
            className="sr-only peer"
          />
          <div className={NEO.toggle} />
        </label>
      </div>
    )
  }

  // ---- button ----
  if (type === 'button') {
    const variant = field.variant || 'primary'
    const btnClass = variant === 'secondary' ? NEO.btnSecondary : NEO.btnPrimary

    const handleClick = async () => {
      if (busy) return
      setBusy(true)
      try {
        await onAction?.(key, field.action, field.payload)
      } finally {
        setBusy(false)
      }
    }

    return (
      <button onClick={handleClick} disabled={busy} className={btnClass + (busy ? ' opacity-60 pointer-events-none' : '')}>
        {busy ? (field.busyLabel || '处理中...') : label}
      </button>
    )
  }

  // ---- markdown ----
  if (type === 'markdown') {
    return <MarkdownBlock content={field.content || ''} />
  }

  // ---- iframe (逃生舱) ----
  if (type === 'iframe') {
    const src = field.url || ''
    const height = field.height || '400px'
    return (
      <div className="flex flex-col gap-1">
        {label && <label className={NEO.label}>{label}</label>}
        <div
          className="rounded-xl border-2 border-border overflow-hidden bg-white shadow-inner"
          style={{ height, maxHeight: '70vh' }}
        >
          <iframe
            src={src}
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-same-origin"
            title={label || 'plugin-iframe'}
          />
        </div>
        {field.hint && <span className="text-[0.7rem] text-text-sub/70">{field.hint}</span>}
      </div>
    )
  }

  // ---- radio (新拟态圆点单选框) ----
  if (type === 'radio') {
    const currentVal = value ?? field.default
    return (
      <div className="mb-6">
        {label && <label className={NEO.label}>{label}</label>}
        <div className="flex flex-col gap-3 mt-3">
          {(field.options || []).map((opt) => {
            const checked = currentVal === opt.value
            return (
              <div
                key={opt.value}
                onClick={() => onChange(key, opt.value)}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                  checked
                    ? 'bg-primary shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                    : 'bg-white shadow-[inset_2px_2px_5px_rgba(188,138,95,0.12),inset_-2px_-2px_5px_rgba(255,255,255,0.8)]'
                }`}>
                  {checked && <div className="w-2 h-2 rounded-full bg-white animate-fade-in" />}
                </div>
                <span className={`text-sm transition-colors ${checked ? 'text-primary font-bold' : 'text-text-main group-hover:text-primary'}`}>
                  {opt.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- status_box (轮询插件运行状态) ----
  if (type === 'status_box') {
    return <PluginStatusBox pluginId={pluginId} label={label} />
  }

  // ---- section (逻辑分组) ----
  if (type === 'section') {
    return (
      <div className="mt-5 first:mt-0 mb-1">
        <h3 className="text-sm font-bold text-primary-dark border-b border-border pb-2 mb-3">
          {label}
        </h3>
      </div>
    )
  }

  // fallback: unknown type
  return (
    <div className="text-xs text-red-500 bg-red-50 rounded-lg p-2">
      未知组件类型: {type}
    </div>
  )
}

// ================================================================
// SchemaRenderer — 递归渲染入口
// ================================================================
export default function SchemaRenderer({ schema, values, onChange, onAction, pluginId }) {
  if (!schema || !Array.isArray(schema)) {
    return (
      <div className="text-sm text-text-sub text-center py-4">
        暂无配置项
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {schema.map((field, idx) => (
        <FieldRenderer
          key={field.key || idx}
          field={field}
          value={field.key ? values?.[field.key] : undefined}
          onChange={onChange}
          onAction={onAction}
          pluginId={pluginId}
        />
      ))}
    </div>
  )
}
