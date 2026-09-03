const KEY = 'admin-settings:v1';

export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface AllProviderSettings {
  siliconflow: ProviderConfig;
  deepseek: ProviderConfig;
  openaiCompat: ProviderConfig;
  pipelineServer: {
    enabled: boolean;
    url: string;
  };
  edgeTts: {
    voice: string;
  };
}

export const DEFAULT_SETTINGS: AllProviderSettings = {
  siliconflow: {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V2.5',
  },
  deepseek: {
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  openaiCompat: {
    enabled: false,
    apiKey: '',
    baseUrl: '',
    defaultModel: '',
  },
  pipelineServer: {
    enabled: false,
    url: 'http://127.0.0.1:8765',
  },
  edgeTts: {
    voice: 'en-US-JennyNeural',
  },
};

export function loadSettings(): AllProviderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const obj = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...obj };
  } catch (e) {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: AllProviderSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function resetSettings(): AllProviderSettings {
  const def = structuredClone(DEFAULT_SETTINGS);
  saveSettings(def);
  return def;
}
