import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { fetchHealth, fetchLogStream, openLogsFolder } from '@/api/request.js'

const NODES = [
  { id: 1, label: '前端总线' },
  { id: 2, label: '系统内核' },
  { id: 3, label: '并发锁' },
  { id: 4, label: '向量检索' },
  { id: 5, label: '长期记忆' },
  { id: 6, label: '在线模型' }
]

export default function HealthModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const addToast = useAppStore((s) => s.addToast)

  const isVisible = activeModal === 'health-check'

  const [nodeStates, setNodeStates] = useState(
    NODES.map(() => 'pending') // 'pending' | 'ok' | 'error'
  )
  const [logs, setLogs] = useState(['> 正在沿通信总线发送探测包...'])
  const [isRunning, setIsRunning] = useState(false)
  const [allOk, setAllOk] = useState(false)
  const terminalRef = useRef(null)

  const appendLog = useCallback((text) => {
    setLogs((prev) => [...prev, text])
  }, [])

  const scrollTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollTerminal()
  }, [logs, scrollTerminal])

  const runDiagnosis = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setAllOk(false)
    setNodeStates(NODES.map(() => 'pending'))
    setLogs(['> 正在沿通信总线发送探测包...'])

    const delay = (ms) => new Promise((r) => setTimeout(r, ms))

    let allNodesOk = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const data = await fetchHealth(controller.signal)
      clearTimeout(timeoutId)

      allNodesOk = data.core_server === 'online'

      // Animate through each node
      for (let i = 0; i < NODES.length; i++) {
        const node = NODES[i]

        await delay(300)

        // Determine node health
        let nodeOk = true
        if (node.id === 2) nodeOk = data.core_server === 'online'
        if (node.id === 6) nodeOk = data.core_server === 'online'
        if (!nodeOk) allNodesOk = false

        appendLog(`${nodeOk ? '✔' : '✘'} ${node.label} — ${nodeOk ? '正常' : '异常'}`)
        setNodeStates((prev) => prev.map((v, idx) => idx === i ? (nodeOk ? 'ok' : 'error') : v))

        if (!nodeOk) {
          appendLog(`⚠ 警告：${node.label} 节点无响应`)
        }
      }

      setAllOk(allNodesOk)

      if (allNodesOk) {
        appendLog('✔ 全链路扫描完成：系统节点运转正常。')

        // Try Tauri hardware info
        if (window.__TAURI__) {
          try {
            const info = await window.__TAURI__.tauri.invoke('get_system_hardware_info')
            appendLog(`[硬件层 Rust IPC]: ${info}`)
          } catch (e) { /* ignore */ }
        }
      } else {
        appendLog('✘ 发现异常节点：系统内核无响应或无配置文件读写权限。')
      }

      // Fetch log stream for extra detail
      try {
        const logText = await fetchLogStream()
        if (logText) {
          appendLog('--- 内核日志流 ---')
          logText.split('\n').slice(0, 10).forEach((line) => appendLog(line))
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      appendLog(`✘ 连接失败：无法与后端建立通信。`)
      appendLog(`  详情: ${e.message}`)
      setNodeStates((prev) => prev.map(() => 'error'))
      setAllOk(false)
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, appendLog])

  // Auto-run on mount
  useEffect(() => {
    if (isVisible) {
      runDiagnosis()
    }
  }, [isVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenLogsFolder = async () => {
    try {
      await openLogsFolder()
    } catch (e) {
      addToast('核心服务器无响应，无法自动打开目录。请手动前往 Data/logs/', 'error')
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[rgba(250,246,240,0.85)] backdrop-blur-sm">
      <div className="w-[90%] max-w-[1300px] h-[85vh] bg-[#fffcf9] border border-[rgba(232,213,196,0.8)] rounded-2xl p-7 shadow-[0_15px_50px_rgba(0,0,0,0.1)] relative flex gap-7 box-border">

        {/* ---- Left: Terminal ---- */}
        <div className="flex-[6] bg-[#1e1e1e] rounded-xl p-4 flex flex-col shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between items-center mb-2.5">
            <h3 className="text-[#4af626] font-mono text-[1.1rem] m-0 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4af626] shadow-[0_0_5px_#4af626]" />
              Terminal Sync Stream
            </h3>
          </div>
          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto text-[#d4d4d4] font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words"
          >
            {logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('✔') ? 'text-[#52b788]' :
                  line.startsWith('✘') || line.startsWith('⚠') ? 'text-[#e07a5f]' :
                  line.startsWith('>') ? 'text-[#4af626]' :
                  line.startsWith('---') ? 'text-[#9b7ec4]' :
                  ''
                }
              >
                {line}
              </div>
            ))}
            {isRunning && <span className="animate-pulse text-[#4af626]">▊</span>}
          </div>
        </div>

        {/* ---- Right: Diagnostic Nodes ---- */}
        <div className="flex-[4] flex flex-col relative h-full">
          <button
            onClick={closeModal}
            className="absolute -top-2.5 -right-2.5 bg-white border border-border text-text-main text-sm px-2.5 py-1 rounded-lg cursor-pointer z-10 hover:bg-gray-50 transition-colors"
          >
            结束诊断
          </button>

          <h2 className="text-primary-dark border-b border-[rgba(232,213,196,0.5)] pb-4 mt-0 mb-0 flex items-center gap-2.5 text-xl">
            <span>🔍</span> 系统链路节点诊断
          </h2>

          {/* Nodes grid 3×2 */}
          <div className="relative mt-5 mb-4">
            <div className="grid grid-cols-3 gap-y-4">
              {NODES.map((node, i) => {
                const state = nodeStates[i]
                const color =
                  state === 'ok' ? 'bg-[#52b788]' :
                  state === 'error' ? 'bg-[#e07a5f]' :
                  'bg-[#e0e0e0]'
                return (
                  <div key={node.id} className="flex flex-col items-center gap-2.5 justify-center">
                    <div
                      className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm transition-colors duration-500`}
                    >
                      {state === 'ok' ? '✓' : state === 'error' ? '✗' : node.id}
                    </div>
                    <span className="text-sm text-primary-dark font-bold">{node.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail box */}
          <div className="bg-[rgba(250,246,240,0.6)] border border-[rgba(232,213,196,0.8)] rounded-xl p-5 flex-1 min-h-0 flex flex-col mb-5">
            <h4 className="text-primary-dark text-[0.95rem] mt-0 mb-2.5">诊断详情</h4>
            <div className="text-sm text-text-sub leading-relaxed flex-1 overflow-y-auto h-full pr-4 bg-white/50 rounded-lg p-3 border border-[rgba(232,213,196,0.3)]">
              {logs.filter(l => !l.startsWith('>') && !l.startsWith('---') && !l.startsWith('▶')).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {!isRunning && allOk && (
                <div className="text-[#52b788] font-bold mt-2">✔ 全链路扫描完成：系统节点运转正常。</div>
              )}
              {!isRunning && !allOk && nodeStates.some(s => s === 'error') && (
                <div className="text-[#e07a5f] mt-2">
                  <strong>发现异常节点：</strong>
                  <ul className="mt-2 pl-5 text-text-main">
                    {NODES.filter((_, i) => nodeStates[i] === 'error').map((n) => (
                      <li key={n.id}>{n.label} 无响应。</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Lock warning */}
            {!isRunning && !allOk && nodeStates.some(s => s === 'error') && (
              <div className="mt-4 p-3 bg-[rgba(224,122,95,0.1)] border-l-4 border-[#e07a5f] text-sm text-[#e07a5f] rounded">
                紧急锁定模式已启用：系统存在关键故障点，为防止数据异常，主交互界面已被锁定。请检查左侧内核日志排查问题，修复后点击重试。
              </div>
            )}
          </div>

          {/* Retry button */}
          {!isRunning && !allOk && (
            <div className="text-center mb-5">
              <button
                onClick={runDiagnosis}
                className="bg-primary text-white px-6 py-2.5 rounded-2xl font-bold text-base w-full
                           hover:bg-primary-dark transition-colors cursor-pointer border-none shadow-soft"
              >
                重新校验系统链路
              </button>
            </div>
          )}

          {/* Bottom: Open logs folder */}
          <div className="mt-auto pt-5">
            <div className="h-px bg-[rgba(232,213,196,0.5)] mb-5 rounded-sm" />
            <button
              onClick={handleOpenLogsFolder}
              className="w-full bg-white border border-border rounded-2xl p-4 text-base font-bold text-primary-dark
                         shadow-soft cursor-pointer transition-all duration-300 flex justify-center items-center gap-2
                         hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(212,163,115,0.2)]"
            >
              <span>📂</span> 打开物理日志归档目录
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
