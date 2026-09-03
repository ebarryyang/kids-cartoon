import type { AllProviderSettings } from './settingsStore';

export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large';

export interface PipelineConfig {
  videoSource:
    | { type: 'local'; localFile: File; localAbsPathHint: string }
    | { type: 'pan'; panPath: string };
  whisperModel: WhisperModel;
  wordCount: number;
  skipTts: boolean;
  forceLocal: boolean;
  noMkvConvert: boolean;
  translateZh: boolean;
  zhModel?: string;
  targetSeriesId?: string;
  targetEpisodeId?: string;
}

export interface StartResult {
  mode: 'clipboard' | 'server';
  command?: string;
  workingDir?: string;
  expectedFiles: string[];
  taskId?: string;
  serverBase?: string;
  stem?: string;
}

export interface ServerArtifacts {
  stem: string;
  video: string | null;
  enVtt: string | null;
  zhVtt: string | null;
  vocabularyJson: string | null;
  vocabularyMd: string | null;
  audioFiles: string[];
}

export interface ProgressCb {
  (percent: number, message: string): void;
}

export interface Fetcher {
  start(
    cfg: PipelineConfig,
    settings: AllProviderSettings,
    onProgress?: ProgressCb
  ): Promise<StartResult>;
}

function isWin(): boolean {
  return navigator.platform.toLowerCase().includes('win');
}

function psQuote(v: string): string {
  // PowerShell 5 对 = 后面的值解析非常敏感（含 '-'、'='、空格 都可能被当成子表达式）
  // 最稳妥的方案：永远用单引号包住；值内含单引号则写成 '' 转义
  return "'" + String(v ?? '').replace(/'/g, "''") + "'";
}

function cmdQuote(v: string): string {
  // CMD set 语法：set "KEY=VALUE" 外层已带双引号
  // 内层转义规则：把 " 变成 """（CMD 特性），对 & | < > ^ 等特殊字符保留原样（外层双引号已保护它们）
  return String(v ?? '').replace(/"/g, '"""');
}

function shQuote(v: string): string {
  // Bash/Zsh：单引号包住；值内含单引号则 '\''
  return "'" + String(v ?? '').replace(/'/g, "'\\''") + "'";
}

export const clipboardFetcher: Fetcher = {
  async start(cfg, settings): Promise<StartResult> {
    const isWindows = isWin();
    const projectRoot = 'd:\\AI future\\儿童英文动画';
    const scriptsDir = projectRoot + '\\scripts';

    // 1. 构造视频路径（MVP：本地文件让用户手动填入真实路径；MVP 阶段剪贴板模式依赖用户确认本机实际路径）
    let videoArg: string;
    if (cfg.videoSource.type === 'local') {
      videoArg = cfg.videoSource.localAbsPathHint || cfg.videoSource.localFile.name;
    } else {
      videoArg = cfg.videoSource.panPath;
    }
    const modelArg = cfg.whisperModel;
    const wordsArg = cfg.wordCount;

    const flags: string[] = [];
    if (cfg.skipTts) flags.push('--skip-tts');
    if (cfg.forceLocal) flags.push('--force-local');
    if (cfg.noMkvConvert) flags.push('--no-mkv-convert');
    if (cfg.translateZh) flags.push('--translate-zh');
    if (cfg.translateZh && cfg.zhModel?.trim()) flags.push(`--zh-model ${cmdQuote(cfg.zhModel.trim())}`);

    // 2. 环境变量前缀（已启用的 provider 才加）
    type EnvKV = { k: string; v: string };
    const envLines: EnvKV[] = [];
    if (settings.siliconflow.enabled && settings.siliconflow.apiKey) {
      envLines.push({ k: 'SILICONFLOW_API_KEY', v: settings.siliconflow.apiKey });
    }
    if (settings.deepseek.enabled && settings.deepseek.apiKey) {
      envLines.push({ k: 'DEEPSEEK_API_KEY', v: settings.deepseek.apiKey });
    }
    if (settings.openaiCompat.enabled) {
      if (settings.openaiCompat.apiKey) envLines.push({ k: 'LLM_API_KEY', v: settings.openaiCompat.apiKey });
      if (settings.openaiCompat.baseUrl) envLines.push({ k: 'LLM_BASE_URL', v: settings.openaiCompat.baseUrl });
      if (settings.openaiCompat.defaultModel) envLines.push({ k: 'LLM_MODEL', v: settings.openaiCompat.defaultModel });
    }
    if (settings.edgeTts.voice) {
      envLines.push({ k: 'EDGE_TTS_VOICE', v: settings.edgeTts.voice });
    }

    // 已经 cd 到 scriptsDir，所以这里直接写脚本名，不能再加 scripts/ 前缀
    const py = 'python auto_process_video.py';
    const baseName = videoArg.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output';
    const expected = [
      `${baseName}_en.vtt`,
      `${baseName}_vocabulary.md`,
      `${baseName}_vocabulary.json`,
    ];
    if (cfg.translateZh) expected.push(`${baseName}_zh.vtt`);
    if (!cfg.skipTts) expected.push(`${baseName}_audio/ (文件夹，内含 N 个 mp3)`);

    // 3. PowerShell 5 命令
    const psLines = [];
    psLines.push(`# ===== 儿童英文动画 课件流水线（PowerShell / MVP 剪贴板模式）=====`);
    psLines.push(`cd ${psQuote(scriptsDir)}`);
    for (const e of envLines) psLines.push(`$env:${e.k}=${psQuote(e.v)}`);
    psLines.push(
      `${py} ${psQuote(videoArg)} --model ${modelArg} --words ${wordsArg} ${flags.join(' ')}`.trim()
    );
    psLines.push(`# ===== 产物期望 =====`);
    for (const e of expected) psLines.push(`#   - ${e}`);
    psLines.push(`# ===== 完成后请返回向导「Step4 导入产物」=====`);
    const psCmd = psLines.join('\n');

    // 4. CMD 命令（给不喜欢 PowerShell 的用户）
    const cmdLines = [];
    cmdLines.push(`@echo off`);
    cmdLines.push(`REM ===== 儿童英文动画 课件流水线（CMD / MVP 剪贴板模式）=====`);
    cmdLines.push(`cd /d ${cmdQuote(scriptsDir)}`);
    for (const e of envLines) cmdLines.push(`set "${e.k}=${e.v}"`);
    cmdLines.push(
      `${py} ${cmdQuote(videoArg)} --model ${modelArg} --words ${wordsArg} ${flags.join(' ')}`.trim()
    );
    const cmdCmd = cmdLines.join('\n');

    // Windows 默认 PowerShell；非 Windows 退回 Bash 风格（暂用 PowerShell 当"Unix shell"提示）
    const command = isWindows ? psCmd : `${psCmd}\n\n--- (CMD 风格) ---\n\n${cmdCmd}`;

    return {
      mode: 'clipboard',
      command,
      workingDir: scriptsDir,
      expectedFiles: expected,
    };
  },
};

function normalizeBase(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

function encodeEnvHeader(settings: AllProviderSettings): string {
  const env: Record<string, string> = {};
  if (settings.siliconflow.enabled && settings.siliconflow.apiKey) {
    env.SILICONFLOW_API_KEY = settings.siliconflow.apiKey;
  }
  if (settings.deepseek.enabled && settings.deepseek.apiKey) {
    env.DEEPSEEK_API_KEY = settings.deepseek.apiKey;
  }
  if (settings.openaiCompat.enabled) {
    if (settings.openaiCompat.apiKey) env.LLM_API_KEY = settings.openaiCompat.apiKey;
    if (settings.openaiCompat.baseUrl) env.LLM_BASE_URL = settings.openaiCompat.baseUrl;
    if (settings.openaiCompat.defaultModel) env.LLM_MODEL = settings.openaiCompat.defaultModel;
  }
  if (settings.edgeTts.voice) env.EDGE_TTS_VOICE = settings.edgeTts.voice;
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(env))));
  } catch {
    return '';
  }
}

interface ServerStatus {
  ok: boolean;
  taskId: string;
  state: 'running' | 'done' | 'error';
  percent: number;
  message: string;
  exitCode: number | null;
  logsTail: string[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const localServerFetcher: Fetcher = {
  async start(cfg, settings, onProgress): Promise<StartResult> {
    const base = normalizeBase(settings.pipelineServer?.url || '');
    if (!base) throw new Error('请先在「系统设置 → 本地流水线服务」填写服务 URL。');

    if (cfg.videoSource.type === 'pan') {
      throw new Error(
        '服务模式暂只支持本地上传的视频（浏览器直接把文件传给本机服务）。' +
        '网盘视频请先同步到本机再用本地文件方式上传，或关闭服务模式改用剪贴板模式。'
      );
    }

    const file = cfg.videoSource.localFile;
    const report = (p: number, m: string) => onProgress?.(p, m);

    // 1) 健康检查（顺便拿到环境自检结果）
    report(1, '连接本地流水线服务…');
    let health: any = null;
    try {
      const r = await fetch(`${base}/health`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      health = await r.json();
    } catch (e: any) {
      throw new Error(
        `无法连接本地流水线服务（${base}）。请先在本机终端运行：python scripts/pipeline-server.py\n详情：${e?.message || e}`
      );
    }
    if (health && health.whisper === false) {
      throw new Error('本机未安装 whisper，请先运行：pip install -U openai-whisper');
    }

    // 2) 上传视频（raw body），参数走 query，避免 multipart 解析
    report(2, `上传视频 ${file.name}（${(file.size / 1024 / 1024).toFixed(1)} MB）…`);
    const qs = new URLSearchParams();
    qs.set('filename', file.name);
    qs.set('model', cfg.whisperModel);
    qs.set('words', String(cfg.wordCount));
    if (cfg.skipTts) qs.set('skipTts', '1');
    if (cfg.forceLocal) qs.set('forceLocal', '1');
    if (cfg.noMkvConvert) qs.set('noMkvConvert', '1');
    if (cfg.translateZh) qs.set('translateZh', '1');
    if (cfg.zhModel?.trim()) qs.set('zhModel', cfg.zhModel.trim());

    const startResp = await fetch(`${base}/start?${qs.toString()}`, {
      method: 'POST',
      headers: { 'X-Pipeline-Env': encodeEnvHeader(settings) },
      body: file,
    });
    const startJson = await startResp.json().catch(() => null);
    if (!startResp.ok || !startJson?.ok) {
      throw new Error(`启动流水线失败：${startJson?.error || `HTTP ${startResp.status}`}`);
    }
    const taskId: string = startJson.taskId;
    const stem: string = startJson.stem || file.name.replace(/\.[^.]+$/, '');
    report(4, '视频上传完成，流水线已启动…');

    // 3) 轮询进度（最长 90 分钟）
    const deadline = Date.now() + 90 * 60 * 1000;
    let lastState: ServerStatus['state'] = 'running';
    while (Date.now() < deadline) {
      await sleep(1200);
      let st: ServerStatus | null = null;
      try {
        const r = await fetch(`${base}/status?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' });
        st = r.ok ? await r.json() : null;
      } catch {
        // 网络抖动，继续轮询
      }
      if (!st || !st.ok) continue;
      lastState = st.state;
      report(Math.max(4, Math.min(99, st.percent || 0)), st.message || '处理中…');
      if (st.state === 'done' || st.state === 'error') break;
    }

    if (lastState === 'running') {
      throw new Error('流水线超时（>90 分钟），请到本机查看服务窗口日志。');
    }
    if (lastState === 'error') {
      let logs: string[] = [];
      try {
        const r = await fetch(`${base}/status?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        logs = j?.logsTail || [];
      } catch {}
      const tail = logs.slice(-8).join('\n');
      throw new Error(`流水线执行失败。\n${tail ? '最近日志：\n' + tail : '请查看本机服务窗口日志。'}`);
    }

    const baseName = stem || 'output';
    const expected = [
      `${baseName}.mp4`,
      `${baseName}_en.vtt`,
      `${baseName}_vocabulary.json`,
    ];
    if (cfg.translateZh) expected.push(`${baseName}_zh.vtt`);
    if (!cfg.skipTts) expected.push(`${baseName}_audio/ (N 个 mp3)`);

    return {
      mode: 'server',
      taskId,
      serverBase: base,
      stem: baseName,
      workingDir: health?.scriptsDir,
      expectedFiles: expected,
    };
  },
};

/** 服务模式：任务完成后拉取产物清单 */
export async function fetchServerArtifacts(base: string, taskId: string): Promise<ServerArtifacts> {
  const b = normalizeBase(base);
  const r = await fetch(`${b}/artifacts?taskId=${encodeURIComponent(taskId)}`, { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `拉取产物清单失败（HTTP ${r.status}）`);
  return j.artifacts as ServerArtifacts;
}

/** 服务模式：下载单个产物（文本类） */
export async function downloadServerText(
  base: string,
  taskId: string,
  name: string
): Promise<string> {
  const b = normalizeBase(base);
  const r = await fetch(
    `${b}/download?taskId=${encodeURIComponent(taskId)}&name=${encodeURIComponent(name)}`,
    { cache: 'no-store' }
  );
  if (!r.ok) throw new Error(`下载 ${name} 失败（HTTP ${r.status}）`);
  return r.text();
}

/** 服务模式：取消任务 */
export async function cancelServerTask(base: string, taskId: string): Promise<void> {
  try {
    await fetch(`${normalizeBase(base)}/cancel?taskId=${encodeURIComponent(taskId)}`, {
      method: 'POST',
    });
  } catch {
    // 忽略取消失败
  }
}

export function pickFetcher(settings: AllProviderSettings): Fetcher {
  return settings.pipelineServer?.enabled ? localServerFetcher : clipboardFetcher;
}
