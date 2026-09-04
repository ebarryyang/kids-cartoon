// /api/github-sync — 让管理端把 courses.json 直接提交回 GitHub 仓库。
// GitHub 收到 commit 后 Vercel 会自动触发重新部署，实现「后台保存 → 前台立即生效」，
// 免掉「下载 JSON → 手动覆盖文件 → 再部署」这一串手工操作。
//
// 需要在 Vercel → 项目 Settings → Environment Variables 配置：
//   GITHUB_TOKEN        GitHub Personal Access Token（Contents: Read and write）
//   ADMIN_SYNC_TOKEN    管理端调用本接口的口令（在后台「系统设置 → GitHub 同步」里填同一个值）
//   GITHUB_OWNER        可选，默认 ebarryyang
//   GITHUB_REPO         可选，默认 kids-cartoon
//   GITHUB_BRANCH       可选，默认 main

const OWNER = process.env.GITHUB_OWNER || 'ebarryyang';
const REPO = process.env.GITHUB_REPO || 'kids-cartoon';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// 允许被改写的仓库文件白名单：即便口令泄露，破坏面也控制在数据文件内
const ALLOWED_PATHS = new Set([
  'client-web/public/data/courses.json',
  'client-web/public/data/activation-codes.json',
]);
const DEFAULT_PATH = 'client-web/public/data/courses.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function header(req, name) {
  const h = req.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return null; }
    }
    return req.body;
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function gh(pathname, { method = 'GET', token, body } = {}) {
  const resp = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kids-cartoon-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
  return { status: resp.status, ok: resp.ok, data };
}

function shortDetail(data) {
  if (!data) return undefined;
  const msg = data.message || data._raw;
  return typeof msg === 'string' ? msg.slice(0, 300) : undefined;
}

export default async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const token = process.env.GITHUB_TOKEN || '';
  const adminToken = process.env.ADMIN_SYNC_TOKEN || '';

  if (!token) {
    return json(res, 503, {
      ok: false,
      configured: false,
      error: '服务端未配置 GITHUB_TOKEN。请在 Vercel → 项目 Settings → Environment Variables 添加 GITHUB_TOKEN（GitHub PAT，Contents 读写权限），然后 Redeploy 一次。',
    });
  }
  if (!adminToken) {
    return json(res, 503, {
      ok: false,
      configured: false,
      error: '服务端未配置 ADMIN_SYNC_TOKEN。请在 Vercel 环境变量里添加该口令，并在后台「系统设置 → GitHub 同步」填写同一个值。',
    });
  }

  const provided = String(header(req, 'x-admin-token') || '');
  if (provided !== adminToken) {
    return json(res, 401, {
      ok: false,
      configured: true,
      error: '管理员口令不正确。请到「系统设置 → GitHub 同步」填写与服务端 ADMIN_SYNC_TOKEN 一致的口令。',
    });
  }

  if (method === 'GET') {
    const u = new URL(req.url || '/', 'http://x');
    const path = u.searchParams.get('path') || DEFAULT_PATH;
    if (!ALLOWED_PATHS.has(path)) {
      return json(res, 400, { ok: false, error: `path 不在白名单内：${path}` });
    }
    const r = await gh(
      `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(BRANCH)}`,
      { token }
    );
    if (!r.ok && r.status !== 404) {
      return json(res, 502, {
        ok: false,
        error: `读取仓库文件失败（HTTP ${r.status}）`,
        detail: shortDetail(r.data),
      });
    }
    const file = r.ok ? r.data : null;
    return json(res, 200, {
      ok: true,
      configured: true,
      repo: `${OWNER}/${REPO}`,
      branch: BRANCH,
      path,
      file: file ? { sha: file.sha, size: file.size, htmlUrl: file.html_url } : null,
    });
  }

  if (method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  const payload = await readJsonBody(req);
  if (!payload || typeof payload.content !== 'string') {
    return json(res, 400, {
      ok: false,
      error: '请求体需要 { content: string, message?: string, path?: string }',
    });
  }

  const path = payload.path || DEFAULT_PATH;
  if (!ALLOWED_PATHS.has(path)) {
    return json(res, 400, { ok: false, error: `path 不在白名单内：${path}` });
  }

  // 更新已存在的文件必须带上当前 sha
  const current = await gh(
    `/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(BRANCH)}`,
    { token }
  );
  if (!current.ok && current.status !== 404) {
    return json(res, 502, {
      ok: false,
      error: `读取现有文件失败（HTTP ${current.status}）`,
      detail: shortDetail(current.data),
    });
  }
  const sha = current.ok ? current.data?.sha : undefined;

  const contentBase64 = Buffer.from(payload.content, 'utf8').toString('base64');
  const message = payload.message || `chore(data): 更新 ${path.split('/').pop()}（管理端同步）`;

  const put = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    token,
    body: { message, content: contentBase64, branch: BRANCH, ...(sha ? { sha } : {}) },
  });

  if (!put.ok) {
    return json(res, 502, {
      ok: false,
      error: `提交到 GitHub 失败（HTTP ${put.status}）`,
      detail: shortDetail(put.data),
    });
  }

  return json(res, 200, {
    ok: true,
    repo: `${OWNER}/${REPO}`,
    branch: BRANCH,
    path,
    message,
    commit: put.data?.commit?.sha || '',
    commitUrl: put.data?.commit?.html_url || '',
  });
}
