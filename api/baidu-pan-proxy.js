
import https from 'node:https';
import { URL } from 'node:url';

function forwardRequest(method, subPath, forwardQuery, reqBody) {
  return new Promise((resolve, reject) => {
    const usp = new URLSearchParams();
    for (const k of Object.keys(forwardQuery || {})) {
      const v = forwardQuery[k];
      if (Array.isArray(v)) { for (const x of v) usp.append(k, x); }
      else if (v !== undefined && v !== null) usp.append(k, String(v));
    }
    const qs = usp.toString();
    const upstreamUrlStr = `https://pan.baidu.com/rest/2.0/${subPath}${qs ? ('?' + qs) : ''}`;
    const u = new URL(upstreamUrlStr);
    const bodyData = (reqBody !== undefined && reqBody !== null)
      ? (Buffer.isBuffer(reqBody) ? reqBody : Buffer.from(typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)))
      : null;

    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: (method || 'GET').toUpperCase(),
      timeout: 20000,
      headers: {
        'User-Agent': 'pan.baidu.com',
        'Accept': 'application/json, text/plain, */*'
      }
    };
    if (bodyData) {
      opts.headers['Content-Length'] = bodyData.length;
      if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    }
    const req = https.request(opts, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = (resp.headers && resp.headers['content-type']) || '';
        let parsed;
        if (ct.includes('application/json') || ct.includes('text') || ct.includes('javascript')) {
          try { parsed = JSON.parse(buf.toString('utf8') || 'null'); }
          catch (e) { parsed = { _raw: buf.toString('utf8'), _parseError: e.message }; }
        } else {
          parsed = { _base64: buf.toString('base64') };
        }
        resolve({ statusCode: resp.statusCode || 200, headers: resp.headers, data: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error('upstream_timeout')));
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

export default async function handler(req, res) {
  let subPath = '';
  let forwardQuery = {};
  try {
    if (req && req.query) {
      if (req.query.path) subPath = String(req.query.path);
      forwardQuery = Object.assign({}, req.query);
      delete forwardQuery.path;
    }
    if ((!subPath) && req && req.url) {
      const u = new URL(req.url, 'http://placeholder');
      subPath = u.searchParams.get('path') || '';
      const extras = {};
      for (const [k, v] of u.searchParams.entries()) if (k !== 'path') extras[k] = v;
      forwardQuery = Object.assign(extras, forwardQuery || {});
    }
  } catch (e) {
    console.error('[baidu-pan-proxy] parse error:', e.message);
  }

  res.setHeader('Cache-Control', 'no-store');

  if (!subPath) {
    return res.status(400).json({ error: 'missing path', hint: 'call /api/baidu-pan-proxy?path=xpan/file&method=list&dir=...&access_token=...' });
  }

  let reqBody = undefined;
  const method = (req.method || 'GET').toUpperCase();
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && req.body !== undefined) {
    reqBody = req.body;
  }

  try {
    const upstream = await forwardRequest(method, subPath, forwardQuery, reqBody);
    let ct = 'application/json; charset=utf-8';
    if (upstream.headers && upstream.headers['content-type']) ct = upstream.headers['content-type'];
    return res.status(upstream.statusCode || 200)
      .setHeader('Content-Type', ct)
      .json(upstream.data ?? {});
  } catch (err) {
    console.error('[baidu-pan-proxy] upstream error:', err && err.message ? err.message : String(err), 'path=', subPath);
    return res.status(502).json({ error: err && err.message ? err.message : 'upstream_error', subPath });
  }
}
