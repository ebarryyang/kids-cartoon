import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const clientSrc = path.join(root, 'client-web', 'dist');
const adminSrc = path.join(root, 'admin-web', 'dist');
const clientPublicData = path.join(root, 'client-web', 'public', 'data');
const scriptsDir = path.join(root, 'scripts');
const publicDir = path.join(root, 'public');
const clientDest = path.join(publicDir, 'client');
const adminDest = path.join(publicDir, 'admin');
const publicData = path.join(publicDir, 'data');
const publicMedia = path.join(publicDir, 'media');

function log(msg) {
  process.stderr.write(msg + '\n');
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`源目录不存在: ${src}`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  function recursiveCopy(srcPath, destPath) {
    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      const srcEntry = path.join(srcPath, entry.name);
      const destEntry = path.join(destPath, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destEntry, { recursive: true });
        recursiveCopy(srcEntry, destEntry);
      } else {
        fs.copyFileSync(srcEntry, destEntry);
      }
    }
  }

  recursiveCopy(src, dest);
  log(`[merge-dist] copied ${src} -> ${dest}`);
}

function promoteClientRoot() {
  if (!fs.existsSync(clientSrc)) return;
  const entries = fs.readdirSync(clientSrc, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const src = path.join(clientSrc, entry.name);
    const dest = path.join(publicDir, entry.name);
    fs.copyFileSync(src, dest);
    log(`[merge-dist] promote client/${entry.name} size=${fs.statSync(src).size}B -> public/${entry.name}`);
  }
}

function copyStaticData() {
  if (!fs.existsSync(clientPublicData)) {
    log('[merge-dist] skip data (client-web/public/data not found)');
    return;
  }
  fs.mkdirSync(publicData, { recursive: true });
  const entries = fs.readdirSync(clientPublicData, { withFileTypes: true });
  let n = 0;
  for (const entry of entries) {
    const s = path.join(clientPublicData, entry.name);
    const d = path.join(publicData, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
      n++;
    }
  }
  log(`[merge-dist] data/ assets synced (${n} files + dirs) -> public/data/`);
}

function copyScriptsAssets() {
  if (!fs.existsSync(scriptsDir)) return;
  fs.mkdirSync(publicMedia, { recursive: true });
  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  let nFiles = 0, nDirs = 0;
  for (const entry of entries) {
    const s = path.join(scriptsDir, entry.name);
    const isVocabJson = /_vocabulary\.json$/i.test(entry.name);
    const isSubtitleVtt = /\.(vtt|srt)$/i.test(entry.name);
    const isVideoMp4 = /\.(mp4|mov|m4v|webm)$/i.test(entry.name) && entry.isFile();
    const isAudioDir = entry.isDirectory() && /_audio$/i.test(entry.name);
    if (isVocabJson || isSubtitleVtt || isVideoMp4) {
      fs.copyFileSync(s, path.join(publicMedia, entry.name));
      nFiles++;
    } else if (isAudioDir) {
      const d = path.join(publicMedia, entry.name);
      copyDir(s, d);
      nDirs++;
    }
  }
  if (nFiles || nDirs) {
    log(`[merge-dist] scripts assets -> public/media/ (${nFiles} files [含 mp4/VTT/JSON], ${nDirs} audio dirs)`);
  } else {
    log('[merge-dist] no scripts assets found (run auto_process_video.py first to generate *_vocabulary.json / *_en.vtt)');
  }
}

function writeAssetIndex() {
  const entries = [];
  function walk(dir, basePrefix) {
    if (!fs.existsSync(dir)) return;
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of list) {
      const full = path.join(dir, e.name);
      const rel = basePrefix + '/' + e.name;
      if (e.isFile()) {
        try {
          const s = fs.statSync(full);
          entries.push({ path: rel, name: e.name, sizeB: s.size });
        } catch {}
      } else if (e.isDirectory()) {
        walk(full, rel);
      }
    }
  }
  walk(publicData, '/data');
  walk(publicMedia, '/media');
  const outPath = path.join(publicData, 'asset-index.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2) + '\n');
  log(`[merge-dist] wrote asset-index.json (${entries.length} entries) -> ${outPath}`);
}

try {
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  log(`[merge-dist] cleared ${publicDir}`);
  copyDir(clientSrc, clientDest);
  copyDir(adminSrc, adminDest);
  promoteClientRoot();
  copyStaticData();
  copyScriptsAssets();
  writeAssetIndex();
  const top = fs.readdirSync(publicDir, { withFileTypes: true });
  for (const e of top) {
    if (e.isFile()) {
      const p = path.join(publicDir, e.name);
      log(`[merge-dist] public/${e.name} size=${fs.statSync(p).size}B`);
    } else if (e.isDirectory()) {
      const sub = fs.readdirSync(path.join(publicDir, e.name), { withFileTypes: true });
      const cnt = sub.length;
      log(`[merge-dist] public/${e.name}/ [dir, ${cnt} entries]`);
    }
  }
  log('[merge-dist] DONE -> public/');
} catch (error) {
  console.error('[merge-dist] FAILED:', error.message);
  process.exit(1);
}
