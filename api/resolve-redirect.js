
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

function followOnce(rawUrl) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(rawUrl); }
    catch (e) { return reject(new Error('invalid_url')); }
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 15000,
      followRedirects: false,
      headers: {
        'User-Agent': 'pan.baidu.com',
        'Accept': '*/*'
      }
    };
    const req = lib.request(opts, (resp) => {
      const loc = resp.headers && resp.headers.location;
      resolve({
        statusCode: resp.statusCode || 200,
        location: loc || null,
        isRedirect: (resp.statusCode === 301 || resp.statusCode === 302 || resp.statusCode === 303 || resp.statusCode === 307 || resp.statusCode === 308)
      });
      resp.destroy();
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  let url = null;
  try {
    if (req && req.query && req.query.url) url = String(req.query.url);
    else if (req && req.url) {
      const u = new URL(req.url, 'http://placeholder');
      url = u.searchParams.get('url');
    }
  } catch (e) {}

  res.setHeader('Cache-Control', 'no-store');

  if (!url) {
    return res.status(400).json({ error: 'missing url parameter', hint: 'call /api/resolve-redirect?url=<百度网盘dlink>' });
  }

  try {
    const r = await followOnce(url);
    let loc = r.location;
    if (loc && loc.startsWith('http://')) loc = loc.replace('http://', 'https://');
    return res.status(200).json({
      statusCode: r.statusCode,
      isRedirect: r.isRedirect,
      location: loc
    });
  } catch (err) {
    console.error('[resolve-redirect] error:', err && err.message ? err.message : String(err));
    return res.status(502).json({ error: 'upstream_error', detail: err && err.message ? err.message : String(err) });
  }
}
