import { create } from 'zustand'
import { getMusicStreamUrl } from '@/api/request.js'

const audioInstance = new Audio()

/** 【音乐播放器】全局音频单例 Store */
export const useAudioStore = create((set, get) => ({
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  playMode: 'sequential',
  currentTime: 0,
  duration: 0,
  isExpanded: false,
  blockedTracks: [],
  stopAfterPlay: false,

  initAudioEvents: () => {
    audioInstance.onloadedmetadata = () => set({ duration: audioInstance.duration || 0 })
    audioInstance.ontimeupdate = () => set({ currentTime: audioInstance.currentTime || 0 })
    audioInstance.onended = () => get().playNext()
    audioInstance.onerror = () => {
      console.warn('[AudioStore] 音频播放出错，跳过')
      get().playNext()
    }
  },

  setPlaylist: (files) => set({ playlist: files }),

  setPlayMode: (mode) => set({ playMode: mode }),

  toggleBlockTracks: (names, isBlock) => {
    const state = get()
    const currentSet = new Set(state.blockedTracks)
    names.forEach(name => isBlock ? currentSet.add(name) : currentSet.delete(name))
    set({ blockedTracks: Array.from(currentSet) })

    // 如果屏蔽的是正在播放的歌曲，立即中断并跳到下一首
    if (isBlock && state.currentIndex >= 0) {
      const playingName = state.playlist[state.currentIndex]?.name
      if (playingName && names.includes(playingName)) {
        audioInstance.pause()
        audioInstance.removeAttribute('src')
        audioInstance.load()
        set({ isPlaying: false, currentTime: 0 })
        get().playNext()
      }
    }
  },

  removeFromPlaylist: (name) => {
    const { playlist, currentIndex } = get()
    const idx = playlist.findIndex((f) => f.name === name)
    const newList = playlist.filter((f) => f.name !== name)

    if (idx === currentIndex) {
      audioInstance.pause()
      audioInstance.removeAttribute('src')
      audioInstance.load()
      set({
        isPlaying: false,
        playlist: newList,
        currentIndex: -1,
        currentTime: 0,
        isExpanded: false
      })
    } else if (idx < currentIndex) {
      set({ playlist: newList, currentIndex: currentIndex - 1 })
    } else {
      set({ playlist: newList })
    }
  },

  playTrack: (index) => {
    const { playlist } = get()
    if (index < 0 || index >= playlist.length) return
    const track = playlist[index]

    const url = getMusicStreamUrl(track.name)
    audioInstance.src = url
    audioInstance.play().then(() => {
      set({ currentIndex: index, isPlaying: true, isExpanded: true })
    }).catch(err => {
      console.error('[AudioStore] 播放失败:', err)
      set({ isPlaying: false })
    })
  },

  togglePlay: () => {
    const { isPlaying, playlist, currentIndex } = get()
    if (playlist.length === 0) return

    if (isPlaying) {
      audioInstance.pause()
      set({ isPlaying: false })
    } else {
      if (currentIndex < 0) {
        get().playNext()
      } else {
        audioInstance.play().then(() => {
          set({ isPlaying: true })
        }).catch(err => {
          console.error('[AudioStore] 恢复播放失败:', err)
          set({ isPlaying: false })
        })
      }
    }
  },

  _findValidTrackIndex: (startIndex, direction = 1) => {
    const { playlist, blockedTracks, playMode } = get()
    if (playlist.length === 0) return -1
    if (blockedTracks.length >= playlist.length) return -1

    let attempts = 0
    let nextIdx = startIndex

    while (attempts < playlist.length) {
      if (playMode === 'random') {
        nextIdx = Math.floor(Math.random() * playlist.length)
      } else {
        nextIdx += direction
        if (nextIdx >= playlist.length) nextIdx = 0
        if (nextIdx < 0) nextIdx = playlist.length - 1
      }

      if (!blockedTracks.includes(playlist[nextIdx].name)) {
        return nextIdx
      }
      attempts++
    }
    return -1
  },

  playNext: () => {
    const { currentIndex, stopAfterPlay, playMode } = get()
    if (stopAfterPlay) {
      audioInstance.pause()
      set({ isPlaying: false, currentIndex: -1, currentTime: 0 })
      return
    }
    // 循环：重复当前曲目
    if (playMode === 'loop' && currentIndex >= 0) {
      get().playTrack(currentIndex)
      return
    }
    const nextIdx = get()._findValidTrackIndex(currentIndex, 1)
    if (nextIdx !== -1) {
      get().playTrack(nextIdx)
    } else {
      audioInstance.pause()
      set({ isPlaying: false, currentIndex: -1, currentTime: 0 })
    }
  },

  playPrev: () => {
    const { currentIndex } = get()
    const prevIdx = get()._findValidTrackIndex(currentIndex === -1 ? 0 : currentIndex, -1)
    if (prevIdx !== -1) {
      get().playTrack(prevIdx)
    }
  },

  seek: (time) => {
    if (audioInstance.src) {
      audioInstance.currentTime = time
      set({ currentTime: time })
    }
  },

  setExpanded: (val) => set({ isExpanded: val }),
  setStopAfterPlay: (val) => set({ stopAfterPlay: val })
}))
