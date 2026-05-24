import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useAudioStore } from '@/stores/useAudioStore'
import { fetchMusicList, uploadMusic, deleteMusic } from '@/api/request.js'

export default function MusicSettingsModal() {
  /** 【音乐播放器】音乐管理弹窗 */
  const activeModal = useAppStore((s) => s.activeModal)
  const closeModal = useAppStore((s) => s.closeModal)
  const addToast = useAppStore((s) => s.addToast)

  const playlist = useAudioStore((s) => s.playlist)
  const currentIndex = useAudioStore((s) => s.currentIndex)
  const playMode = useAudioStore((s) => s.playMode)
  const blockedTracks = useAudioStore((s) => s.blockedTracks)
  const setPlaylist = useAudioStore((s) => s.setPlaylist)
  const playTrack = useAudioStore((s) => s.playTrack)
  const setPlayMode = useAudioStore((s) => s.setPlayMode)
  const toggleBlockTracks = useAudioStore((s) => s.toggleBlockTracks)
  const removeFromPlaylist = useAudioStore((s) => s.removeFromPlaylist)

  const isVisible = activeModal === 'music-settings'

  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [manageMode, setManageMode] = useState('normal')
  const [selectedFiles, setSelectedFiles] = useState(new Set())
  const [activeSelectedTrack, setActiveSelectedTrack] = useState(null)

  const fileInputRef = useRef(null)

  const syncBackendList = async () => {
    try {
      const data = await fetchMusicList()
      const files = data.files || []
      setPlaylist(files)
      const names = new Set(files.map(f => f.name))
      const orphanBlocked = useAudioStore.getState().blockedTracks.filter(n => !names.has(n))
      if (orphanBlocked.length > 0) {
        toggleBlockTracks(orphanBlocked, false)
      }
    } catch (e) {
      addToast('同步列表失败: ' + e.message, 'error')
    }
  }

  useEffect(() => {
    if (isVisible) syncBackendList()
  }, [isVisible])

  useEffect(() => {
    if (manageMode === 'normal') {
      setSelectedFiles(new Set())
    } else {
      setActiveSelectedTrack(null)
    }
  }, [manageMode])

  const processFiles = async (files) => {
    if (!files || files.length === 0) return
    const validExts = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma']

    setLoading(true)
    let successCount = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = '.' + file.name.split('.').pop().toLowerCase()
      if (!validExts.includes(ext)) {
        addToast(`跳过不支持的格式: ${file.name}`, 'warning')
        continue
      }
      try {
        const reader = new FileReader()
        const b64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('读取失败'))
          reader.readAsDataURL(file)
        })
        await uploadMusic(file.name, b64)
        successCount++
      } catch (err) {
        addToast(`上传 ${file.name} 失败`, 'error')
      }
    }
    if (successCount > 0) {
      addToast(`成功添加 ${successCount} 首音乐`, 'success')
      await syncBackendList()
    }
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false) }
  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    processFiles(e.dataTransfer.files)
  }

  const toggleSelect = (name) => {
    const newSet = new Set(selectedFiles)
    newSet.has(name) ? newSet.delete(name) : newSet.add(name)
    setSelectedFiles(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedFiles.size === playlist.length) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(playlist.map(f => f.name)))
    }
  }

  const executeBatchAction = async () => {
    if (selectedFiles.size === 0) {
      setManageMode('normal')
      return
    }

    if (manageMode === 'delete') {
      try {
        for (const name of selectedFiles) {
          await deleteMusic(name)
          removeFromPlaylist(name)
        }
        addToast(`成功删除 ${selectedFiles.size} 首歌曲`, 'success')
        await syncBackendList()
      } catch (err) {
        addToast('部分删除失败', 'error')
      }
    } else if (manageMode === 'block') {
      toggleBlockTracks(Array.from(selectedFiles), true)
      addToast(`已屏蔽 ${selectedFiles.size} 首歌曲`, 'info')
    }

    setManageMode('normal')
  }

  if (!isVisible) return null

  const playModeLabels = { sequential: '顺序', loop: '列表循环', random: '随机' }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(90,74,66,0.4)] backdrop-blur-sm">
      <div
        className={`bg-[var(--bg-color)] w-full max-w-[520px] h-[600px] max-h-[85vh] rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col transition-all border-2 ${isDragging ? 'border-primary' : 'border-transparent'}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="m-0 text-primary-dark text-lg font-bold">音乐列表</h3>
          <div className="flex gap-1 bg-border/30 rounded-lg p-0.5">
            {Object.entries(playModeLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPlayMode(key)}
                className={`px-2 py-1 rounded-md text-xs font-bold border-none cursor-pointer transition-all ${
                  playMode === key ? 'bg-white text-primary-dark shadow-sm' : 'bg-transparent text-text-sub hover:text-text-main'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-3 shrink-0">
          {manageMode === 'normal' ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border-none bg-primary text-white text-sm font-bold cursor-pointer hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {loading ? '处理中...' : '添加音频'}
              </button>
              <button
                onClick={() => {
                  if (!activeSelectedTrack) {
                    addToast('请先在下方选中要播放的歌曲', 'warning')
                    return
                  }
                  const idx = playlist.findIndex(f => f.name === activeSelectedTrack)
                  if (idx >= 0) playTrack(idx)
                }}
                className="px-4 py-2 rounded-xl border border-border bg-white text-text-sub text-sm font-bold cursor-pointer hover:text-[#52b788] hover:border-[#52b788] transition-all"
              >
                播放
              </button>
              <button onClick={() => setManageMode('delete')} className="px-4 py-2 rounded-xl border border-border bg-white text-text-sub text-sm font-bold cursor-pointer hover:text-[#e07a5f] hover:border-[#e07a5f] transition-all">
                删除
              </button>
              <button onClick={() => setManageMode('block')} className="px-4 py-2 rounded-xl border border-border bg-white text-text-sub text-sm font-bold cursor-pointer hover:text-[#f4a261] hover:border-[#f4a261] transition-all">
                屏蔽
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleSelectAll} className="px-4 py-2 rounded-xl border border-border bg-white text-text-sub text-sm font-bold cursor-pointer hover:bg-gray-50">
                全选
              </button>
              <button onClick={executeBatchAction} className={`flex-1 py-2 rounded-xl border-none text-white text-sm font-bold cursor-pointer transition-colors ${manageMode === 'delete' ? 'bg-[#e07a5f] hover:bg-[#c96a52]' : 'bg-[#f4a261] hover:bg-[#e08b45]'}`}>
                确认{manageMode === 'delete' ? '删除' : '屏蔽'} ({selectedFiles.size})
              </button>
              <button onClick={() => setManageMode('normal')} className="px-4 py-2 rounded-xl border-none bg-border text-text-sub text-sm font-bold cursor-pointer hover:opacity-80">
                取消
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => processFiles(e.target.files)}
          />
        </div>

        <div
          className="flex-1 overflow-y-auto min-h-0 bg-white/30 rounded-xl p-1.5 pr-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {playlist.length === 0 ? (
            <p className="text-text-sub text-sm text-center py-10 pointer-events-none">
              列表为空，点击上方按钮或拖拽文件到此处
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {playlist.map((file, i) => {
                const isBlocked = blockedTracks.includes(file.name)
                const isBatchSelected = selectedFiles.has(file.name)
                const isNormalSelected = manageMode === 'normal' && activeSelectedTrack === file.name
                const isPlayingTrack = i === currentIndex

                return (
                  <div
                    key={file.name}
                    onClick={() => manageMode !== 'normal' ? toggleSelect(file.name) : setActiveSelectedTrack(file.name)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer border
                      ${isBlocked ? 'opacity-50 grayscale hover:opacity-80 hover:grayscale-0' : ''}
                      ${isNormalSelected ? 'bg-primary-light/40 border-primary shadow-sm' : isPlayingTrack && manageMode === 'normal' ? 'bg-white border-primary/30' : 'bg-white/60 border-border/50 hover:bg-white'}
                      ${isBatchSelected && manageMode !== 'normal' ? 'border-primary ring-1 ring-primary/30' : ''}
                    `}
                  >
                    {manageMode !== 'normal' && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isBatchSelected ? 'border-primary bg-primary' : 'border-border'}`}>
                        {isBatchSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                    )}

                    <span className="text-lg shrink-0">
                      {isPlayingTrack ? '🔊' : '🎵'}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${(isPlayingTrack || isNormalSelected) ? 'text-primary-dark' : 'text-text-main'}`}>
                        {file.name}
                      </p>
                      <p className="text-xs text-text-sub">
                        {(file.size / 1024 / 1024).toFixed(1)} MB {isBlocked ? '· 已屏蔽跳过' : ''}
                      </p>
                    </div>

                    {manageMode === 'normal' && isBlocked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleBlockTracks([file.name], false) }}
                        className="px-2 py-1 bg-[#f4a261] text-white text-[10px] rounded-lg hover:bg-[#e08b45] border-none shrink-0"
                      >
                        解禁
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={closeModal}
          className="mt-4 w-full py-2.5 rounded-xl border-none bg-border/80 text-text-sub font-bold text-sm cursor-pointer hover:bg-border transition-colors shrink-0"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
