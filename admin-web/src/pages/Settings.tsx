import { useEffect, useState } from 'react';
import { Shield, Key, Bot, Network, Volume2, Save, RefreshCw, Eye, EyeOff, CheckCircle2, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import {
  AllProviderSettings,
  DEFAULT_SETTINGS,
  ProviderConfig,
  loadSettings,
  resetSettings,
  saveSettings,
} from '@/lib/settingsStore';

type ProviderKey = 'siliconflow' | 'deepseek' | 'openaiCompat';

const PROVIDER_META: Record<
  ProviderKey,
  { title: string; hint: string; docUrl: string; defaultBase: string; defaultModel: string; canTest: boolean }
> = {
  siliconflow: {
    title: 'SiliconFlow（硅基流动）',
    hint: '注册送大量免费 token，默认用 DeepSeek-V2.5 抽词，推荐首选',
    docUrl: 'https://cloud.siliconflow.cn/',
    defaultBase: DEFAULT_SETTINGS.siliconflow.baseUrl!,
    defaultModel: DEFAULT_SETTINGS.siliconflow.defaultModel!,
    canTest: true,
  },
  deepseek: {
    title: 'DeepSeek 开放平台',
    hint: '注册送免费额度，抽词质量稳定',
    docUrl: 'https://platform.deepseek.com/',
    defaultBase: DEFAULT_SETTINGS.deepseek.baseUrl!,
    defaultModel: DEFAULT_SETTINGS.deepseek.defaultModel!,
    canTest: true,
  },
  openaiCompat: {
    title: 'OpenAI 兼容接口（自定义）',
    hint: '填任意 OpenAI 兼容端点：Groq / 一起 / OpenRouter / 本地 vLLM 等',
    docUrl: '',
    defaultBase: '',
    defaultModel: '',
    canTest: true,
  },
};

const EDGE_TTS_VOICES = [
  { value: 'en-US-JennyNeural', label: 'Jenny (US 女声，温柔)' },
  { value: 'en-US-GuyNeural', label: 'Guy (US 男声，稳重)' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia (UK 女声，优雅)' },
  { value: 'en-GB-RyanNeural', label: 'Ryan (UK 男声，浑厚)' },
  { value: 'en-AU-NatashaNeural', label: 'Natasha (AU 女声)' },
  { value: 'en-CA-ClaraNeural', label: 'Clara (CA 女声)' },
];

export default function Settings() {
  const [settings, setSettings] = useState<AllProviderSettings>(() => loadSettings());
  const [visibleKeys, setVisibleKeys] = useState<Record<ProviderKey, boolean>>({
    siliconflow: false,
    deepseek: false,
    openaiCompat: false,
  });
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<
    Record<ProviderKey, { state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>
  >({
    siliconflow: { state: 'idle' },
    deepseek: { state: 'idle' },
    openaiCompat: { state: 'idle' },
  });
  const [serverTest, setServerTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({
    state: 'idle',
  });

  useEffect(() => {
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  const update = <K extends keyof AllProviderSettings>(key: K, value: AllProviderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateProvider = (k: ProviderKey, patch: Partial<ProviderConfig>) => {
    setSettings(prev => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
  };

  const handleReset = () => {
    if (!window.confirm('确认重置所有模型 / Key 配置为默认值？（会清空已填 API Key）')) return;
    const def = resetSettings();
    setSettings(def);
    setSaved(true);
  };

  const testProvider = async (k: ProviderKey) => {
    const cfg = settings[k];
    if (!cfg?.baseUrl) {
      setTestStatus(s => ({ ...s, [k]: { state: 'fail', message: '需要先填写 Base URL' } }));
      return;
    }
    if (!cfg?.apiKey) {
      setTestStatus(s => ({ ...s, [k]: { state: 'fail', message: '需要先填写 API Key' } }));
      return;
    }
    if (!cfg.defaultModel) {
      setTestStatus(s => ({ ...s, [k]: { state: 'fail', message: '需要先填写默认模型' } }));
      return;
    }
    setTestStatus(s => ({ ...s, [k]: { state: 'running' } }));
    const base = cfg.baseUrl.replace(/\/+$/, '');
    try {
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        setTestStatus(s => ({
          ...s,
          [k]: { state: 'fail', message: `HTTP ${resp.status}：${text.slice(0, 180)}` },
        }));
        return;
      }
      setTestStatus(s => ({ ...s, [k]: { state: 'ok', message: '连通成功（典型浏览器会报 CORS 也正常，脚本本机跑不会受影响）' } }));
    } catch (e: any) {
      setTestStatus(s => ({
        ...s,
        [k]: {
          state: 'fail',
          message: e?.message || '请求失败（常见为 CORS / 无网络；脚本本机执行不受 CORS 影响）',
        },
      }));
    }
  };

  const testPipelineServer = async () => {
    const url = (settings.pipelineServer?.url || '').replace(/\/+$/, '');
    if (!url) {
      setServerTest({ state: 'fail', message: '请填写本地流水线服务 URL' });
      return;
    }
    setServerTest({ state: 'running' });
    try {
      const resp = await fetch(`${url}/health`, { method: 'GET', cache: 'no-store' });
      if (!resp.ok) {
        setServerTest({ state: 'fail', message: `HTTP ${resp.status}` });
        return;
      }
      setServerTest({ state: 'ok', message: '✅ 服务健康' });
    } catch (e: any) {
      setServerTest({ state: 'fail', message: e?.message || '无法连接（请先启动 scripts/pipeline-server.py）' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900">系统设置</h1>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center text-sm text-emerald-600 font-medium">
              <CheckCircle2 className="w-4 h-4 mr-1" /> 已保存
            </span>
          )}
          <button
            onClick={handleReset}
            className="flex items-center px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> 重置默认
          </button>
          <button
            onClick={handleSave}
            className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <Save className="w-4 h-4 mr-1.5" /> 保存设置
          </button>
        </div>
      </div>

      {/* 区块：抽词 LLM Provider */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <Bot className="w-5 h-5 mr-2 text-blue-600" />
            抽词模型 API 配置
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            抽词流水线按「已启用 & 有 Key」从上到下尝试；全未启用则自动降级到本地零 API 词频抽词。Key 仅保存在浏览器 localStorage，不会上传服务器。
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {(Object.keys(PROVIDER_META) as ProviderKey[]).map(k => {
            const meta = PROVIDER_META[k];
            const cfg = settings[k]!;
            const test = testStatus[k];
            const showKey = visibleKeys[k];
            return (
              <div key={k} className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="w-4 h-4 mr-2 accent-blue-600"
                          checked={cfg.enabled}
                          onChange={e => updateProvider(k, { enabled: e.target.checked })}
                        />
                        <span className="text-base font-semibold text-slate-900">{meta.title}</span>
                      </label>
                      {meta.docUrl && (
                        <a
                          href={meta.docUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline inline-flex items-center"
                        >
                          免费注册 <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{meta.hint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => testProvider(k)}
                    disabled={!cfg.enabled || test.state === 'running'}
                    className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {test.state === 'running' ? '测试中...' : '🔄 测试连接'}
                  </button>
                </div>

                {cfg.enabled && (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Base URL <span className="text-slate-400 ml-1">（默认：{meta.defaultBase || '必填自定义'}）</span>
                      </label>
                      <input
                        type="text"
                        value={cfg.baseUrl || ''}
                        placeholder={meta.defaultBase || 'https://your-compatible-endpoint/v1'}
                        onChange={e => updateProvider(k, { baseUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        默认模型 <span className="text-slate-400 ml-1">（默认：{meta.defaultModel || '必填自定义'}）</span>
                      </label>
                      <input
                        type="text"
                        value={cfg.defaultModel || ''}
                        placeholder={meta.defaultModel || 'gpt-4o-mini / deepseek-chat 等'}
                        onChange={e => updateProvider(k, { defaultModel: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={cfg.apiKey || ''}
                          placeholder="sk-..."
                          onChange={e => updateProvider(k, { apiKey: e.target.value })}
                          className="w-full px-3 py-2 pr-11 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setVisibleKeys(v => ({ ...v, [k]: !v[k] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                          aria-label="toggle key visibility"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {test.state !== 'idle' && (
                  <div className="mt-3 text-sm">
                    {test.state === 'ok' ? (
                      <div className="inline-flex items-center text-emerald-600">
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> {test.message}
                      </div>
                    ) : test.state === 'fail' ? (
                      <div className="inline-flex items-start text-amber-600">
                        <AlertTriangle className="w-4 h-4 mr-1.5 mt-0.5 flex-shrink-0" />
                        <span>
                          {test.message}（CORS 报错属于浏览器正常现象，只要 Key 正确，本机 Python 脚本不受影响）
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-500">{test.message}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 区块：TTS + 本地流水线 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <Volume2 className="w-5 h-5 mr-2 text-blue-600" />
              发音音色（Edge-TTS，无需 Key）
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Edge-TTS 是微软神经语音，免费免 Key，只要本机 <code>pip install edge-tts</code> 即可用。
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">英文默认音色</label>
              <select
                value={settings.edgeTts.voice}
                onChange={e => update('edgeTts', { voice: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {EDGE_TTS_VOICES.map(v => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p>安装验证命令（复制到本机终端）：</p>
              <pre className="p-2 rounded bg-slate-900 text-slate-50 overflow-x-auto">
                pip install -U edge-tts ; edge-tts --list-voices | findstr Jenny
              </pre>
              <p className="text-slate-500">安装失败也没关系，H5/小程序会用系统原生发音兜底。</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <Network className="w-5 h-5 mr-2 text-blue-600" />
              本地流水线服务（Beta）
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              启用后向导走「服务模式」：<Sparkles className="inline w-3 h-3" /> 上传视频 → 实时进度 → 产物自动导入 Step4，全程无需复制命令。网盘视频请继续使用剪贴板模式。
            </p>
          </div>
          <div className="p-6 space-y-4">
            <label className="inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 mr-2 accent-blue-600"
                checked={settings.pipelineServer.enabled}
                onChange={e => update('pipelineServer', { ...settings.pipelineServer, enabled: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-800">启用本地流水线服务</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">服务 URL</label>
              <input
                type="text"
                value={settings.pipelineServer.url}
                placeholder="http://127.0.0.1:8765"
                onChange={e => update('pipelineServer', { ...settings.pipelineServer, url: e.target.value })}
                disabled={!settings.pipelineServer.enabled}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={testPipelineServer}
                disabled={!settings.pipelineServer.enabled || serverTest.state === 'running'}
                className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {serverTest.state === 'running' ? '测试中...' : '🔄 测试 /health'}
              </button>
              {serverTest.state === 'ok' && (
                <span className="inline-flex items-center text-sm text-emerald-600">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> {serverTest.message}
                </span>
              )}
              {serverTest.state === 'fail' && (
                <span className="inline-flex items-start text-sm text-amber-600">
                  <AlertTriangle className="w-4 h-4 mr-1 mt-0.5" /> {serverTest.message}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
              使用方法：本机终端执行 <code>python scripts/pipeline-server.py</code>（保持窗口开启），
              然后勾选上方开关并点「测试 /health」验证连通，即可在「AI 课件制作向导」中使用服务模式。
            </p>
          </div>
        </div>
      </div>

      {/* 区块：管理员账号（原内容，保留不删） */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-blue-600" />
            管理员账号设置
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理系统后台登录账号与权限</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div>
              <p className="font-medium text-slate-900">admin (超级管理员)</p>
              <p className="text-sm text-slate-500 mt-1">最后登录：2026-06-14 12:00</p>
            </div>
            <button className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors">
              <Key className="w-4 h-4 mr-2" />
              修改密码
            </button>
          </div>

          <button className="text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors">
            + 添加新管理员
          </button>
        </div>
      </div>
    </div>
  );
}
