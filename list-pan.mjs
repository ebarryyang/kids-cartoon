
import https from 'node:https';

const APP_KEY = process.env.BAIDU_APP_KEY || 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP';

function httpsGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 20000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'pan.baidu.com',
      }
    };
    const req = https.request(opts, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const buf = Buffer.concat(chunks);
        let data = {};
        try { data = JSON.parse(buf.toString('utf8') || '{}'); }
        catch (e) { data = { _raw: buf.toString('utf8', 0, 1000), _parseError: e.message }; }
        resolve({ status: resp.statusCode || 0, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const ACCESS_TOKEN = process.env.BAIDU_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('请先在 PowerShell 里设置：$env:BAIDU_ACCESS_TOKEN = "<从 DevTools Application → Local Storage 里复制 access_token 的值>"');
  console.error('然后执行：node list-pan.mjs');
  process.exit(1);
}

const DIRS = [
  '/',
  '/我的应用数据',
  '/我的应用数据/英语宝贝动画宝',
];

const maskToken = (t) => {
  if (!t || t.length <= 8) return (t || '').slice(0, 3) + '***';
  return t.slice(0, 4) + '...' + t.slice(-4) + ' (len=' + t.length + ')';
};

console.log('ACCESS_TOKEN =', maskToken(ACCESS_TOKEN));
console.log('APP_KEY     =', APP_KEY.slice(0, 4) + '...' + APP_KEY.slice(-4));
console.log('');

for (const dir of DIRS) {
  console.log('\n===== 列出目录：' + dir + ' =====');
  try {
    const encDir = encodeURIComponent(dir);
    const url = `https://pan.baidu.com/rest/2.0/xpan/file?method=list&dir=${encDir}&access_token=${ACCESS_TOKEN}&order=name&start=0&limit=200&showempty=1&web=web`;
    const r = await httpsGetJson(url);
    const d = r.data;
    console.log('HTTP status=', r.status, 'errno=', d.errno, 'errmsg=', d.errmsg || '(none)', 'list_count=', (d.list || []).length, 'guid=', d.guid ? 'yes' : 'no');
    if (d.errno !== undefined && d.errno !== 0) {
      console.log('  → 非 0 errno，原始 JSON 片段：', JSON.stringify(d).slice(0, 500));
      continue;
    }
    const list = d.list || [];
    if (list.length === 0) {
      console.log('  (该目录为空，list=[])');
      continue;
    }
    // 打印前 100 条，避免超长
    const shown = list.slice(0, 120);
    for (let i = 0; i < shown.length; i++) {
      const f = shown[i];
      const typ = f.isdir ? '📁 dir ' : '📄 file';
      const size = f.isdir
        ? '          '
        : `${(f.size / 1024 / 1024).toFixed(1)} MB`.padStart(10);
      const path = f.path || '';
      const fsid = String(f.fs_id || '');
      console.log(`  ${String(i + 1).padStart(3)}  ${typ}  ${size}  fsid=${fsid.padEnd(12)}  ${f.server_filename}` + (path ? `   path=${path}` : ''));
    }
    if (list.length > shown.length) {
      console.log(`  ... 还有 ${list.length - shown.length} 条未展示（共 ${list.length} 条）`);
    }
  } catch (e) {
    console.log('  EXCEPTION:', e.message);
  }
}
