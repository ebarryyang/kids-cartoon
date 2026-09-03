import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLIENT_PUBLIC_DATA = path.join(PROJECT_ROOT, 'client-web', 'public', 'data');
const ROOT_PUBLIC_DATA = path.join(PROJECT_ROOT, 'public', 'data');

const CACHE_MAX_AGE = 60; // seconds

function _tryRead(p) {
  try {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  } catch (_) {}
  return null;
}

function loadCourses() {
  const candidates = [
    path.join(ROOT_PUBLIC_DATA, 'courses.json'),
    path.join(CLIENT_PUBLIC_DATA, 'courses.json'),
  ];
  for (const p of candidates) {
    const raw = _tryRead(p);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        if (obj && Array.isArray(obj.series)) {
          return obj.series;
        }
      } catch (_) {}
    }
  }
  return null;
}

function listSummary(seriesArr) {
  return (seriesArr || []).map(s => ({
    seriesId: s.seriesId,
    seriesName: s.seriesName,
    coverUrl: s.coverUrl || '',
    episodeCount: Array.isArray(s.episodes) ? s.episodes.length : 0,
  }));
}

function findSeries(seriesArr, id) {
  if (!seriesArr || !id) return null;
  return (seriesArr || []).find(s => String(s.seriesId) === String(id)) || null;
}

function findEpisode(seriesObj, epId) {
  if (!seriesObj || !Array.isArray(seriesObj.episodes) || !epId) return null;
  return seriesObj.episodes.find(e => String(e.episodeId) === String(epId)) || null;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.status(status)
     .setHeader('Content-Type', 'application/json; charset=utf-8')
     .setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`)
     .send(payload);
}

export default function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (method !== 'GET') {
    json(res, 405, { success: false, error: 'Method Not Allowed (MVP only supports GET)' });
    return;
  }

  const reqUrl = new URL(req.url || '/', 'http://x');
  // 用 req.url 解析 path，vercel.json 里 /api/course-materials(.*) 全重写到这里，因此 pathname 带完整子路径
  const rawPath = reqUrl.pathname || '';
  let p = rawPath.replace(/^\/api\/course-materials\/?/, '').replace(/^\/+/, '');
  if (p === undefined || p === null) p = '';

  const first = p.split('/').filter(Boolean);

  // 调试：GET ...?debug=1 时输出真实变量值
  if (reqUrl.searchParams.get('debug') === '1') {
    json(res, 200, {
      debug: true,
      rawPath,
      p,
      pLen: p.length,
      first,
      firstLen: first.length,
      qKeys: req.query ? Object.keys(req.query) : null,
    });
    return;
  }

  const series = loadCourses();
  if (series == null) {
    json(res, 500, {
      success: false,
      error: 'No courses data. Please upload client-web/public/data/courses.json first.',
    });
    return;
  }

  if (p === '' || p === '/') {
    json(res, 200, { success: true, data: listSummary(series) });
    return;
  }

  if (first.length === 1) {
    const s = findSeries(series, first[0]);
    if (!s) {
      json(res, 404, { success: false, error: 'Series not found: ' + first[0] });
      return;
    }
    json(res, 200, { success: true, data: s });
    return;
  }

  if (first.length === 3 && first[1] === 'episodes') {
    const s = findSeries(series, first[0]);
    if (!s) {
      json(res, 404, { success: false, error: 'Series not found: ' + first[0] });
      return;
    }
    const ep = findEpisode(s, first[2]);
    if (!ep) {
      json(res, 404, { success: false, error: 'Episode not found: ' + first[2] });
      return;
    }
    json(res, 200, { success: true, data: ep });
    return;
  }

  json(res, 404, { success: false, error: 'Route not found: slug=' + p + ' first=' + JSON.stringify(first) });
}
