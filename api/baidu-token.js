
import https from 'node:https';
import { URL } from 'node:url';

const BAIDU_APP_KEY = process.env.BAIDU_APP_KEY || 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || 'Ig5e7CeRvJDKhfsuZoueUyqkxUYPWnH8';

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      timeout: 15000,
      headers: { Accept: 'application/json' }
    };
    const req = https.request(opts, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const buf = Buffer.concat(chunks);
        let parsed = {};
        try { parsed = JSON.parse(buf.toString('utf8') || '{}'); }
        catch (e) { parsed = { _raw: buf.toString('utf8'), _parseError: e.message }; }
        resolve({ statusCode: resp.statusCode || 200, headers: resp.headers, data: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('upstream_timeout')));
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  let code = null;
  try {
    if (req && req.query && req.query.code) code = String(req.query.code);
    else if (req && req.url) {
      const u = new URL(req.url, 'http://placeholder');
      code = u.searchParams.get('code');
    }
  } catch (e) {}

  res.setHeader('Cache-Control', 'no-store');

  if (!code) {
    return res.status(400).json({ error: 'missing code parameter', hint: 'call /api/baidu-token?code=<百度授权码>' });
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    client_id: BAIDU_APP_KEY,
    client_secret: BAIDU_SECRET_KEY,
    redirect_uri: 'oob'
  });

  try {
    const upstream = await httpsGet(`https://openapi.baidu.com/oauth/2.0/token?${params.toString()}`);
    return res.status(upstream.statusCode || 200).json(upstream.data || {});
  } catch (err) {
    console.error('[baidu-token] upstream error:', err && err.message ? err.message : String(err));
    return res.status(502).json({ error: 'upstream_error', detail: err && err.message ? err.message : String(err) });
  }
}
