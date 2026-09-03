// /api/media-proxy.js — 代理 public/media 下的二进制资源，
// 绕过 Vercel Password Protection 对 Range 请求/流式传输的拦截。
// 使用方式：/api/media-proxy?path=/media/Lets_Hold_Hands_Penelope.mp4
// 前端如果本地检测到 Password Protection 拦截（返回登录页 HTML 而非二进制），
// 自动把 /media/xxx.mp4 改写为 /api/media-proxy?path=/media/xxx.mp4

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// 安全白名单：只允许 public/media 和 public/data 下的资源
const ALLOWED_PREFIXES = ['/media/', '/data/'];
const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
  '.json': 'application/json; charset=utf-8',
};

export default function handler(req, res) {
  // 1) 解析 path 参数
  let relPath = null;
  try {
    if (req.query && req.query.path) relPath = String(req.query.path);
    else if (req.url) {
      const qIndex = req.url.indexOf('?');
      const qs = qIndex >= 0 ? req.url.slice(qIndex + 1) : '';
      const params = new URLSearchParams(qs);
      relPath = params.get('path');
    }
  } catch (e) {}

  if (!relPath) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'missing path parameter', hint: '/api/media-proxy?path=/media/xxx.mp4' });
  }

  // 2) 安全校验：必须以 /media/ 或 /data/ 开头
  const prefixOk = ALLOWED_PREFIXES.some(p => relPath.startsWith(p));
  if (!prefixOk) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'path_not_allowed', hint: 'only /media/* and /data/* are allowed' });
  }

  // 3) 防止路径穿越
  if (relPath.includes('..')) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'path_traversal_not_allowed' });
  }

  // 4) 构造文件路径
  const filePath = path.join(PUBLIC_DIR, relPath);
  // 再次确保解析后仍在 public 内
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: 'path_escape_public' });
  }

  if (!fs.existsSync(filePath)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'file_not_found', path: relPath });
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'not_a_file' });
  }

  // 5) 设置响应头
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const fileSize = stat.size;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(fileSize));
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 6) Range 请求支持（视频/音频必须）
  const rangeHeader = req.headers && req.headers.range;
  if (rangeHeader && /^bytes=(\d*)-(\d*)$/.test(rangeHeader)) {
    const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
    if (start > end || start >= fileSize) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }
    if (end >= fileSize) end = fileSize - 1;
    const length = end - start + 1;
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', String(length));
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    return;
  }

  // 7) 全量返回
  res.statusCode = 200;
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}
