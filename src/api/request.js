// ================================================================
// request.js — 统一 API 请求层
// 基于原生 fetch，自动注入 X-API-Token，动态 Base URL 适配
// ================================================================

import { useAppStore } from '@/stores/useAppStore'

function getBaseUrl() {
  return useAppStore.getState().serverBaseUrl  // Tauri: http://127.0.0.1:{port}  Web: ''
}

function url(path) {
  return getBaseUrl() + path
}

function getSessionToken() {
  const meta = document.querySelector('meta[name="api-token"]')
  return meta ? meta.content : ''
}

async function apiGet(path) {
  const headers = {}
  const token = getSessionToken()
  if (token) headers['X-API-Token'] = token
  const res = await fetch(url(path), { headers })
  if (res.status === 403) throw new Error('TOKEN_INVALID')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getSessionToken()
  if (token) headers['X-API-Token'] = token
  const res = await fetch(url(path), { method: 'POST', headers, body: JSON.stringify(body) })
  if (res.status === 403) throw new Error('TOKEN_INVALID')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

function handleTokenError(err) {
  if (err.message === 'TOKEN_INVALID') {
    console.error('[API] 安全令牌验证失败，即将刷新页面')
    setTimeout(() => window.location.reload(), 2000)
    return true
  }
  return false
}

// ---- 配置读写 ----
export async function fetchConfig() {
  const res = await fetch(url('/api/read/config/config.json'))
  return res.ok ? await res.json() : {}
}

export async function saveConfig(cfg) {
  try {
    return await apiPost('/api/save', {
      folder: 'config',
      filename: 'config.json',
      content: JSON.stringify(cfg, null, 2)
    })
  } catch (e) {
    handleTokenError(e)
    throw e
  }
}

export async function readFile(folder, filename) {
  const res = await fetch(url(`/api/read/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

export async function saveFile(folder, filename, content) {
  try {
    return await apiPost('/api/save', { folder, filename, content })
  } catch (e) {
    handleTokenError(e)
    throw e
  }
}

// ---- 聊天 ----
export async function fetchChatHistory() {
  const res = await fetch(url('/api/read/memory_core/chat_history.json'))
  if (res.ok) return await res.json()
  throw new Error('History not found')
}

export async function sendMessage(data) {
  const res = await fetch(url('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return { ok: res.ok, data: await res.json() }
}

export async function pollActiveMessages(count = 0) {
  const res = await fetch(url(`/api/poll?count=${count}`))
  if (res.ok) return await res.json()
  throw new Error('Poll failed')
}

// ---- 模型探测 ----
export async function probeModel({ url: probeUrl, key, model, format }) {
  const res = await fetch(url('/api/get_models'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: probeUrl, key, model, format })
  })
  return { ok: res.ok, data: await res.json() }
}

// ---- 签名 ----
export async function fetchSignature() {
  const res = await fetch(url('/api/signature'))
  if (res.ok) return await res.json()
  return { signature: '' }
}

// ---- 连接状态 ----
export async function fetchStatus() {
  const res = await fetch(url('/api/status'))
  if (res.ok) return await res.json()
  return { status: 'offline' }
}

// ---- 健康检查 ----
export async function fetchHealth(signal = null) {
  const res = await fetch(url('/api/health'), signal ? { signal } : {})
  if (res.ok) return await res.json()
  throw new Error('Health check failed')
}

// ---- 版本 ----
export async function fetchVersion() {
  const res = await fetch(url('/api/version'))
  if (res.ok) return await res.json()
  return { version: '-' }
}

// ---- 日志流 ----
export async function fetchLogStream() {
  const res = await fetch(url('/api/logs/stream'))
  if (res.ok) return await res.text()
  return ''
}

export async function openLogsFolder() {
  const res = await fetch(url('/api/logs/open_folder'))
  if (res.ok) return await res.json()
  throw new Error('Failed to open logs folder')
}

// ---- 头像 ----
export async function uploadAvatar(role, imageB64) {
  try {
    return await apiPost('/api/upload_avatar', { role, image: imageB64 })
  } catch (e) {
    handleTokenError(e)
    throw e
  }
}

// ---- 重置 ----
export async function resetSystem() {
  try {
    return await apiPost('/api/reset', { token: getSessionToken() })
  } catch (e) {
    handleTokenError(e)
    throw e
  }
}
