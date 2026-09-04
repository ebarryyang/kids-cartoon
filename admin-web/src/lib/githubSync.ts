// 后台 → GitHub 的同步通道。
// 管理端点「同步到 GitHub」时，把 courses.json 直接 commit 到仓库，
// Vercel 监听到 GitHub push 后自动重新部署，前台无需手工覆盖文件即可生效。

const TOKEN_KEY = 'admin:github-sync-token';

export const COURSES_PATH = 'client-web/public/data/courses.json';
export const ACTIVATION_CODES_PATH = 'client-web/public/data/activation-codes.json';

export function getSyncToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setSyncToken(v: string): void {
  try {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略隐私模式等写入失败 */
  }
}

export type SyncState = 'idle' | 'running' | 'ok' | 'fail';

export interface GithubFileInfo {
  sha: string;
  size: number;
  htmlUrl: string;
}

export interface SyncResult {
  state: SyncState;
  message?: string;
  commitUrl?: string;
  repo?: string;
  branch?: string;
  file?: GithubFileInfo | null;
}

async function callApi(method: 'GET' | 'POST', path?: string, body?: unknown): Promise<any> {
  const token = getSyncToken();
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  const resp = await fetch(`/api/github-sync${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!data) {
    return { ok: false, error: text ? `服务端返回非 JSON（HTTP ${resp.status}）：${text.slice(0, 200)}` : `HTTP ${resp.status}` };
  }
  if (!resp.ok && !data.error) data.error = `HTTP ${resp.status}`;
  return data;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '请求失败';
}

/** 检查服务端配置与仓库连通性（顺带返回目标文件当前 sha） */
export async function checkGithubSync(path: string = COURSES_PATH): Promise<SyncResult> {
  try {
    const r = await callApi('GET', path);
    if (!r.ok) return { state: 'fail', message: r.error || '连接失败' };
    return {
      state: 'ok',
      message: r.file
        ? `已连通 ${r.repo}（${r.branch}），目标文件已存在`
        : `已连通 ${r.repo}（${r.branch}），目标文件尚未创建，首次同步会自动新建`,
      repo: r.repo,
      branch: r.branch,
      file: r.file || null,
    };
  } catch (e) {
    return { state: 'fail', message: errMessage(e) };
  }
}

/** 把文件内容提交到仓库（服务端会带上当前 sha 做更新） */
export async function commitToGithub(opts: {
  content: string;
  message?: string;
  path?: string;
}): Promise<SyncResult> {
  try {
    const r = await callApi('POST', undefined, {
      content: opts.content,
      message: opts.message,
      path: opts.path || COURSES_PATH,
    });
    if (!r.ok) {
      const detail = r.detail ? `：${r.detail}` : '';
      return { state: 'fail', message: `${r.error || '提交失败'}${detail}` };
    }
    return {
      state: 'ok',
      message: '已提交到 GitHub，Vercel 正在自动部署，约 1 分钟后前台生效',
      commitUrl: r.commitUrl,
      repo: r.repo,
      branch: r.branch,
    };
  } catch (e) {
    return { state: 'fail', message: errMessage(e) };
  }
}
