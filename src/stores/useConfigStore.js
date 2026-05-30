import { create } from 'zustand'
import { fetchConfig, saveConfig } from '@/api/request.js'

export const useConfigStore = create((set, get) => ({
  agentName: 'Agent',
  userName: '我',

  modelConfig: {
    url: '',
    key: '',
    model: '',
    format: 'openai',
    timeout: 5
  },

  proactiveSettings: {
    enabled: false,
    startHour: 9,
    startMinute: 0,
    endHour: 22,
    endMinute: 0,
    minInterval: 30,
    maxInterval: 120
  },

  avatarVersion: 0,

  bumpAvatarVersion: () => set((s) => ({ avatarVersion: s.avatarVersion + 1 })),

  async loadConfigFromServer() {
    try {
      const cfg = await fetchConfig()
      const updates = {}
      if (cfg.ai_name) updates.agentName = cfg.ai_name
      if (cfg.user_name) updates.userName = cfg.user_name
      if (cfg.api_url || cfg.api_key || cfg.model_name || cfg.api_format || cfg.model_timeout) {
        updates.modelConfig = {
          url: cfg.api_url || '',
          key: cfg.api_key || '',
          model: cfg.model_name || '',
          format: cfg.api_format || 'openai',
          timeout: cfg.model_timeout ? Math.round(cfg.model_timeout / 60) : 5  // backend stores seconds, we use minutes
        }
      }
      // Backend uses proactive_enabled / proactive_start "HH:MM" / proactive_end "HH:MM"
      if (cfg.proactive_enabled !== undefined || cfg.proactive_start_h !== undefined) {
        const startParts = (cfg.proactive_start || '09:00').split(':')
        const endParts = (cfg.proactive_end || '22:00').split(':')
        updates.proactiveSettings = {
          enabled: cfg.proactive_enabled || false,
          startHour: parseInt(cfg.proactive_start_h ?? startParts[0]) || 9,
          startMinute: parseInt(cfg.proactive_start_m ?? startParts[1]) || 0,
          endHour: parseInt(cfg.proactive_end_h ?? endParts[0]) || 22,
          endMinute: parseInt(cfg.proactive_end_m ?? endParts[1]) || 0,
          minInterval: cfg.proactive_min ?? 30,
          maxInterval: cfg.proactive_max ?? 120
        }
      }
      set(updates)
      return cfg
    } catch (e) {
      console.warn('[ConfigStore] 无法加载远端配置:', e.message)
      return null
    }
  },

  async syncConfigToServer() {
    const state = get()
    const cfg = {
      ai_name: state.agentName,
      user_name: state.userName,
      // LLM engine reads cfg['url'] / cfg['key'] / cfg['model'] directly
      url: state.modelConfig.url,
      key: state.modelConfig.key,
      model: state.modelConfig.model,
      // Also save new-format fields for consistency
      api_url: state.modelConfig.url,
      api_key: state.modelConfig.key,
      model_name: state.modelConfig.model,
      api_format: state.modelConfig.format,
      model_timeout: state.modelConfig.timeout * 60,  // backend expects seconds
      proactive_enabled: state.proactiveSettings.enabled,
      proactive_start: `${String(state.proactiveSettings.startHour).padStart(2,'0')}:${String(state.proactiveSettings.startMinute).padStart(2,'0')}`,
      proactive_end: `${String(state.proactiveSettings.endHour).padStart(2,'0')}:${String(state.proactiveSettings.endMinute).padStart(2,'0')}`,
      proactive_min: state.proactiveSettings.minInterval,
      proactive_max: state.proactiveSettings.maxInterval,
    }
    return await saveConfig(cfg)
  }
}))
