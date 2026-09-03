// 独立脚本：强制写 courses.json + vocabulary.json 为标准 UTF-8 (no BOM)
// 然后以字节级验证：第一个汉字必须是 E7 B2 89 ("粉") 对应 "粉红猪小妹" 开头
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'client-web', 'public', 'data');
const publicRoot = path.resolve(__dirname, '..', 'public', 'data');

const courses = {
  version: 1,
  series: [
    {
      seriesId: 'peppa_01',
      seriesName: '粉红猪小妹 第一季',
      coverUrl: '',
      episodes: [
        {
          episodeId: 'peppa_s01e01',
          episodeName: 'S01E01 Muddy Puddles（示例）',
          videoUrl: '',
          subtitleUrl: '',
          vocabularyUrl: '/data/peppa_s01e01_vocabulary.json',
          hasExercise: false,
        },
      ],
    },
    {
      seriesId: 'paw_01',
      seriesName: '汪汪队立大功 第一季',
      coverUrl: '',
      episodes: [],
    },
  ],
};

const vocab = {
  version: 1,
  schema: 'kids-cartoon.vocabulary.v1',
  meta: { generatedAt: '2026-08-23T21:00:00.000Z', videoId: 'peppa_s01e01', engine: 'sample' },
  events: [
    { id: 'evt_1', time: 5.2, wordEn: 'muddy', wordZh: '泥泞的', imageUrl: '', audioUrl: '', coordX: 30, coordY: 55 },
    { id: 'evt_2', time: 12.8, wordEn: 'puddle', wordZh: '水坑；水洼', imageUrl: '', audioUrl: '', coordX: 65, coordY: 45 },
    { id: 'evt_3', time: 20.5, wordEn: 'jump', wordZh: '跳；跳跃', imageUrl: '', audioUrl: '', coordX: 50, coordY: 60 },
  ],
};

function writeUtf8NoBom(dir, filename, obj) {
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(obj, null, 2) + '\n';
  const buf = Buffer.from(json, 'utf8');
  // 确保没有 BOM
  const out = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? buf.subarray(3) : buf;
  const p = path.join(dir, filename);
  fs.writeFileSync(p, out);
  return p;
}

function verifyHex(p, expectations /* [[offset, [hexBytes...]], ...] */) {
  const raw = fs.readFileSync(p);
  const lines = [];
  lines.push('FILE=' + p);
  lines.push('SIZE=' + raw.length);
  lines.push('HEAD_HEX=' + raw.subarray(0, 32).toString('hex'));
  for (const [off, bytes] of expectations) {
    const got = raw.subarray(off, off + bytes.length).toString('hex');
    const want = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    const ok = got === want ? 'OK ' : 'BAD';
    lines.push(`  [${ok}] offset=${off} want=${want} got=${got}`);
  }
  // 严格 UTF-8 decode + JSON.parse
  try {
    const txt = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    // 不用终端显示中文（PS5 会乱码），用 code point 数值验证
    const o = JSON.parse(txt);
    if (o.series) {
      const name = o.series[0].seriesName;
      // "粉" U+7C89 → 0x7C89 = 31881
      // "红" U+7EA2 → 0x7EA2 = 32418
      const cp0 = name.codePointAt(0);
      const cp1 = name.codePointAt(1);
      lines.push(`  seriesName cp0=0x${cp0.toString(16)} (want 0x7c89) cp1=0x${cp1.toString(16)} (want 0x7ea2)`);
      lines.push(`  series CP-OK=${cp0 === 0x7C89 && cp1 === 0x7EA2}`);
    }
    if (o.events) {
      const w0 = o.events[0].wordZh;
      const cp = w0.codePointAt(0);
      lines.push(`  wordZh[0] cp=0x${cp.toString(16)} (want 0x6ce5 "泥")`);
      lines.push(`  vocab CP-OK=${cp === 0x6CE5}`);
    }
  } catch (e) {
    lines.push('  DECODE/JSON FAIL: ' + e.message);
  }
  return lines.join('\n');
}

// 1) 写 client-web/public/data (source of truth for development)
const p1 = writeUtf8NoBom(root, 'courses.json', courses);
const p2 = writeUtf8NoBom(root, 'peppa_s01e01_vocabulary.json', vocab);

// 2) 也同步写 public/data (production merge dest)，如果目录存在
try { fs.mkdirSync(publicRoot, { recursive: true }); } catch (_) {}
writeUtf8NoBom(publicRoot, 'courses.json', courses);
writeUtf8NoBom(publicRoot, 'peppa_s01e01_vocabulary.json', vocab);

// 3) 字节级验证 client-web/public/data
console.log('=== client-web/public/data verification (BYTE LEVEL) ===');
// courses.json: "version" 起始是 7b 0a 20 20 22 76...；"粉红猪小妹 第一季" 中
// 第一次出现 "seriesName": "粉红..." 处 "粉" UTF-8 E7 B2 89 应该在第 ~102 字节附近
// 为稳妥起见只检查: name 第一个 code point = 0x7C89 (粉)
console.log(verifyHex(p1, []));
// vocabulary.json: events[0].wordZh = "泥泞的" → "泥" UTF-8 E6 B3 A5 (0x6CE5)
console.log(verifyHex(p2, []));
