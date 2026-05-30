import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { probeModel } from '@/api/request.js'

export default function ModelConfigModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const addToast = useAppStore((s) => s.addToast)
  const modelConfig = useConfigStore((s) => s.modelConfig)
  const syncConfigToServer = useConfigStore((s) => s.syncConfigToServer)

  const isVisible = activeModal === 'model-config'

  const [local, setLocal] = useState({ ...modelConfig })
  const [testing, setTesting] = useState(false)
  const [connStatus, setConnStatus] = useState({ text: '未测试连接', ok: null })
  const [modelOptions, setModelOptions] = useState([])

  // Per-format cache: remembers the last SAVED (url, key) for each format
  const lastSavedRef = useRef({ fmt: modelConfig.format, url: modelConfig.url, key: modelConfig.key })

  useEffect(() => {
    if (isVisible) {
      const cfg = useConfigStore.getState().modelConfig
      setLocal({ ...cfg })
      setConnStatus({ text: '未测试连接', ok: null })
      lastSavedRef.current = { fmt: cfg.format, url: cfg.url, key: cfg.key }
    }
  }, [isVisible])

  const update = (key, val) => setLocal((prev) => ({ ...prev, [key]: val }))

  // Format switch: restore saved values for target format, or clear if never saved
  const handleFormatChange = (newFmt) => {
    if (newFmt === local.format) return
    const saved = lastSavedRef.current
    if (newFmt === saved.fmt) {
      // Switching back to the last-saved format → restore its url/key
      setLocal((prev) => ({ ...prev, format: newFmt, url: saved.url, key: saved.key }))
    } else {
      // Switching to a format that was never saved → clear url/key
      setLocal((prev) => ({ ...prev, format: newFmt, url: '', key: '' }))
    }
  }

  const handleProbe = async () => {
    if (!local.url || !local.key) {
      addToast('请先填写 API Base URL 和 API Key', 'error')
      return
    }
    setTesting(true)
    setConnStatus({ text: '正在探测...', ok: null })
    try {
      const { ok, data } = await probeModel({
        url: local.url,
        key: local.key,
        model: local.model,
        format: local.format
      })
      if (ok && !data.error) {
        setConnStatus({ text: '连接成功', ok: true })
        addToast('模型连通性测试通过', 'success')
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          setModelOptions(data.models)
          // Auto-fill first model if it looks like a real model name
          const first = data.models[0]
          const name = typeof first === 'string' ? first : (first.id || first.model || '')
          if (name && !name.includes('未能探测') && !name.includes('手动输入')) {
            update('model', name)
          }
        }
      } else {
        setConnStatus({ text: data?.message || '连接失败', ok: false })
        addToast(data?.message || '模型连通性测试失败', 'error')
      }
    } catch (e) {
      setConnStatus({ text: '网络不可达', ok: false })
      addToast('网络不可达，后端无响应', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    try {
      useConfigStore.setState({ modelConfig: local })
      await syncConfigToServer()
      // Remember last saved format for switching logic
      lastSavedRef.current = { fmt: local.format, url: local.url, key: local.key }
      addToast('模型配置已保存', 'success')
      closeModal()
    } catch (e) {
      addToast('保存失败: ' + e.message, 'error')
    }
  }

  const dotColor = connStatus.ok === true ? 'bg-[#52b788]' : connStatus.ok === false ? 'bg-[#e07a5f]' : 'bg-[#e0e0e0]'
  const textColor = connStatus.ok === true ? 'text-[#52b788]' : connStatus.ok === false ? 'text-[#e07a5f]' : 'text-text-sub'

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(90,74,66,0.4)] backdrop-blur-sm">
      <div className="bg-[var(--bg-color)] w-full max-w-[450px] max-h-[90vh] overflow-y-auto rounded-2xl p-7 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
        <h3 className="mt-0 mb-5 text-primary-dark text-center text-lg font-bold">模型配置</h3>

        {/* API Format — native <select> */}
        <div className="mb-4 text-left">
          <label className="block text-sm text-text-sub font-bold mb-1.5">API 协议格式</label>
          <select
            value={local.format}
            onChange={(e) => handleFormatChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-white shadow-inner text-sm text-text-main cursor-pointer outline-none font-[inherit]"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        {/* API Base URL */}
        <div className="mb-4 text-left">
          <label className="block text-sm text-text-sub font-bold mb-1.5">API Base URL</label>
          <input
            type="text"
            value={local.url}
            onChange={(e) => update('url', e.target.value)}
            placeholder="请输入API地址"
            className="w-full px-3 py-2.5 rounded-xl border-none bg-white shadow-inner text-sm text-text-main outline-none font-[inherit]"
          />
          <span className="text-[0.72rem] text-text-sub mt-1 block">
            {local.format === 'anthropic'
              ? '示例: https://api.anthropic.com/v1/messages'
              : '示例: https://api.openai.com/v1/chat/completions'
            }
          </span>
        </div>

        {/* API Key */}
        <div className="mb-4 text-left">
          <label className="block text-sm text-text-sub font-bold mb-1.5">API Key</label>
          <input
            type="password"
            value={local.key}
            onChange={(e) => update('key', e.target.value)}
            placeholder="输入密钥"
            className="w-full px-3 py-2.5 rounded-xl border-none bg-white shadow-inner text-sm text-text-main outline-none font-[inherit]"
          />
        </div>

        {/* Model Name + Probe */}
        <div className="mb-4 text-left">
          <label className="block text-sm text-text-sub font-bold mb-1.5">模型名称</label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={local.model}
              onChange={(e) => update('model', e.target.value)}
              list="model-options-list"
              placeholder="探测或手动输入"
              className="flex-1 px-3 py-2.5 rounded-xl border-none bg-white shadow-inner text-sm text-text-main outline-none font-[inherit]"
            />
            <datalist id="model-options-list">
              {modelOptions.map((m, i) => (
                <option key={i} value={typeof m === 'string' ? m : m.id || m.model} />
              ))}
            </datalist>
            <button
              onClick={handleProbe}
              disabled={testing}
              className="px-4 py-2.5 rounded-xl border-none bg-border text-text-main text-sm font-bold cursor-pointer whitespace-nowrap hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {testing ? '探测中...' : '探测'}
            </button>
          </div>
          {/* Connection status */}
          <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${textColor}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${testing ? 'bg-primary animate-pulse' : dotColor}`} />
            <span>{testing ? '正在探测...' : connStatus.text}</span>
          </div>
          <span className="text-[0.7rem] text-text-sub mt-1 block">
            此探测仅验证当前配置。聊天页顶部的在线状态由实际对话时模型的响应情况自动更新。
          </span>
        </div>

        {/* Timeout Range Slider */}
        <div className="mb-4 text-left">
          <label className="block text-sm text-text-sub font-bold mb-1.5">
            模型超时时间（分钟）
          </label>
          <div className="flex items-center gap-2.5 mt-1">
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={local.timeout}
              onChange={(e) => update('timeout', Number(e.target.value))}
              className="range-slider flex-1 h-2 rounded appearance-none outline-none cursor-pointer bg-gradient-to-r from-border to-primary shadow-[inset_2px_2px_4px_rgba(188,138,95,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)]"
            />
            <span className="font-bold min-w-[45px] text-center text-primary-dark">{local.timeout}分钟</span>
          </div>
        </div>

        {/* Image note — blue tint */}
        <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800 leading-relaxed mb-4 border border-blue-100">
          <strong>图片识别说明</strong><br />
          模型不支持图片时：OpenAI 协议静默忽略图片内容，Anthropic 协议直接报错拦截。<br />如需识图功能，请选择原生支持多模态的模型。
        </div>

        {/* Action buttons */}
        <div className="flex gap-2.5 mt-6">
          <button
            onClick={closeModal}
            className="flex-1 py-3 rounded-xl border-none bg-[rgba(232,213,196,0.8)] text-text-sub font-bold text-base cursor-pointer hover:opacity-80 transition-opacity shadow-soft"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl border-none bg-primary text-white font-bold text-base cursor-pointer hover:bg-primary-dark transition-colors shadow-[0_10px_20px_rgba(212,163,115,0.3)]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
