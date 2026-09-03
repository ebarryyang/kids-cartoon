
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const TIMEOUT_MS = 30000;

export default function handler(req, res) {
  let url = null;
  try {
    if (req && req.query && req.query.url) url = String(req.query.url);
    else if (req && req.url) {
      const u = new URL(req.url, 'http://placeholder');
      url = u.searchParams.get('url');
    }
  } catch (e) {}

  if (!url) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'missing url parameter', hint: 'call /api/proxy-video?url=<baidupcs CDN URL>' });
  }

  let u;
  try { u = new URL(url); }
  catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'invalid url' });
  }

  const lib = u.protocol === 'https:' ? https : http;

  const allowedHost = /\.baidupcs\.com$/i;
  if (!allowedHost.test(u.hostname)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'host_not_allowed', host: u.hostname });
  }

  const forwardHeaders = {};
  if (req.headers && req.headers['range']) forwardHeaders['Range'] = req.headers['range'];
  forwardHeaders['User-Agent'] = 'pan.baidu.com';
  forwardHeaders['Accept'] = '*/*';

  const opts = {
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method: (req.method || 'GET').toUpperCase(),
    timeout: TIMEOUT_MS,
    headers: forwardHeaders
  };

  let upstreamReqDestroyed = false;
  const upstreamReq = lib.request(opts, (upstreamResp) => {
    if (upstreamResp.statusCode) res.statusCode = upstreamResp.statusCode;
    const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'];
    if (upstreamResp.headers) {
      for (const [k, v] of Object.entries(upstreamResp.headers)) {
        if (hopHeaders.indexOf(k.toLowerCase()) !== -1) continue;
        try { res.setHeader(k, v); } catch (e) {}
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    upstreamResp.pipe(res);
    upstreamResp.on('error', (err) => {
      console.error('[proxy-video] upstream resp error:', err.message);
      if (!res.headersSent) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); }
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'upstream_stream_error', detail: err.message }));
    });
  });

  upstreamReq.on('timeout', () => {
    upstreamReqDestroyed = true;
    upstreamReq.destroy(new Error('upstream_timeout'));
  });
  upstreamReq.on('error', (err) => {
    console.error('[proxy-video] upstream req error:', err.message);
    if (res.headersSent) {
      try { res.destroy(); } catch (e) {}
    } else {
      res.statusCode = 502;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'upstream_error', detail: err.message }));
    }
  });

  req.on('aborted', () => {
    if (!upstreamReqDestroyed) { upstreamReqDestroyed = true; try { upstreamReq.destroy(); } catch (e) {} }
  });
  req.on('close', () => {
    if (!upstreamReqDestroyed) { upstreamReqDestroyed = true; try { upstreamReq.destroy(); } catch (e) {} }
  });

  if (opts.method === 'POST' || opts.method === 'PUT' || opts.method === 'PATCH') {
    req.pipe(upstreamReq);
  } else {
    upstreamReq.end();
  }
}
