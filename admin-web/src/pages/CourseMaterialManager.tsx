import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Mic, FileText, Plus, Search, ChevronRight,
  Upload, Eye, Trash2, Edit3, Save, X, PlayCircle,
  FolderOpen, AlertTriangle, Lightbulb, RefreshCw, Download, KeyRound, Wand2, Sparkles
} from 'lucide-react';
import { loadAllCourses, saveLocalOverrides, downloadCoursesJSON, addSeries as addSeriesDataLayer, patchEpisode } from '@/lib/coursesDataLayer';

interface EpisodeMaterial {
  episodeId: string;
  episodeName: string;
  videoUrl?: string;
  subtitleUrl?: string;
  subtitleZhUrl?: string;
  vocabularyUrl?: string;
  hasExercise: boolean;
  exerciseCount?: number;
}

interface CourseMaterial {
  seriesId: string;
  seriesName: string;
  coverUrl?: string;
  episodes: EpisodeMaterial[];
}

type AssetKind = 'video' | 'subtitle' | 'subtitleZh' | 'vocabulary';

interface PickerState {
  open: boolean;
  anchor: { seriesId: string; episodeId: string; field: AssetKind } | null;
  filter: string;
}

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv)$/i;
const SUBTITLE_EXT_RE = /\.(vtt|srt)$/i;
const ZH_SUBTITLE_HINT_RE = /_zh\.(vtt|srt)$|中文|zh|chinese/i;
const VOCABULARY_EXT_RE = /_vocabulary\.json$|vocab.*\.json$/i;
const LOCAL_PATH_RE = /^[a-zA-Z]:[\\/]|^file:\/\/|^\.{1,2}[\\/]/;
const EN_SUBTITLE_SUFFIX_RE = /_en\.(vtt|srt)$/i;
const ZH_SUBTITLE_SUFFIX_RE = /_zh\.(vtt|srt)$/i;
const BASE_NAME_RE = /^(.+?)(?:_(en|zh))?\.(vtt|srt|json|mp4|mov|m4v|webm|mkv)$/i;

function matchAsset(kind: AssetKind, name: string): boolean {
  switch (kind) {
    case 'video':      return VIDEO_EXT_RE.test(name);
    case 'subtitle':   return SUBTITLE_EXT_RE.test(name) && !ZH_SUBTITLE_HINT_RE.test(name);
    case 'subtitleZh': return SUBTITLE_EXT_RE.test(name) && ZH_SUBTITLE_HINT_RE.test(name);
    case 'vocabulary': return /\.json$/i.test(name) && VOCABULARY_EXT_RE.test(name);
  }
}

// 从文件名（不含目录）中抽取"基础 stem"（去掉后缀、去掉 _en / _zh / _vocabulary 标签）
// 例：Lets_Hold_Hands_Penelope_en.vtt -> Lets_Hold_Hands_Penelope
//     Lets_Hold_Hands_Penelope_zh.vtt -> Lets_Hold_Hands_Penelope
//     Lets_Hold_Hands_Penelope_vocabulary.json -> Lets_Hold_Hands_Penelope
//     Lets_Hold_Hands_Penelope.mp4 -> Lets_Hold_Hands_Penelope
function extractStem(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return base
    .replace(/_en$/i, '')
    .replace(/_zh$/i, '')
    .replace(/_vocabulary$/i, '')
    .trim();
}

// 把文本做"归一化 token：统一小写 + 下划线/空格/破折号 折叠成空串，用于 episodeId/seriesId 与文件名 stem 的模糊相似匹配
function norm(t: string): string {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

// 把已部署的 /media /data 文件数组，与一个课程单集的 4 个 URL 字段做匹配，返回命中的 {videoUrl,subtitleUrl,subtitleZhUrl,vocabularyUrl}
type AutoMatch = Pick<EpisodeMaterial, 'videoUrl' | 'subtitleUrl' | 'subtitleZhUrl' | 'vocabularyUrl'> & {
  matched: number; // 命中数量
  by: Record<string, string>; // debug 用
};
function autoMatchAssetsForEpisode(
  assets: { path: string; name: string }[],
  series: CourseMaterial,
  episode: EpisodeMaterial,
): AutoMatch {
  const result: AutoMatch = { matched: 0, by: {} };
  if (!assets || !assets.length) return result;
  const candidates = assets.map(a => ({ a, stem: extractStem(a.name), stemN: norm(extractStem(a.name)) }));

  // 1) 单集 episodeId（penelope_lets_hold_hands) → 直接精确匹配（文件名 stem
  // 2) seriesId（penelope_01）→ 兜底匹配 stem 包含
  // 3) episodeId 与 stem 计算公共字符重合度 > 0.55
  const epN = norm(episode.episodeId);
  const epNameN = norm(episode.episodeName);
  const sIdN = norm(series.seriesId.replace(/_\d+$/, ''));
  const sNameN = norm(series.seriesName);

  function scoreFor(cand: { stem: string; stemN: string }): number {
    const s = cand.stemN;
    if (!s) return 0;
    if (s === epN) return 1000;
    if (epN && s.includes(epN) || epN.includes(s)) return 900;
    if (sIdN && (s.includes(sIdN) || sIdN.includes(s))) return 800;
    if (epNameN && (s.includes(epNameN) || epNameN.includes(s))) return 750;
    if (sNameN && (s.includes(sNameN) || sNameN.includes(s))) return 700;
    // 公共字符重合度（长文本用 Jaccard 近似）
    const setA = new Set(epN.split('')); const setB = new Set(s.split(''));
    let inter = 0;
    for (const ch of setA) if (setB.has(ch)) inter++;
    const union = setA.size + setB.size - inter;
    if (union <= 0) return 0;
    const jac = inter / union;
    return jac >= 0.5 ? Math.round(600 * jac) : 0;
  }

  const buckets: Record<AssetKind, { score: number; path: string } | null> = {
    video: null, subtitle: null, subtitleZh: null, vocabulary: null,
  };
  for (const c of candidates) {
    let kind: AssetKind | null = null;
    if (matchAsset('video', c.a.name)) kind = 'video';
    else if (matchAsset('subtitle', c.a.name)) kind = 'subtitle';
    else if (matchAsset('subtitleZh', c.a.name)) kind = 'subtitleZh';
    else if (matchAsset('vocabulary', c.a.name)) kind = 'vocabulary';
    if (!kind) continue;
    const score = scoreFor(c);
    if (score <= 0) continue;
    const cur = buckets[kind];
    if (!cur || score > cur.score) buckets[kind] = { score, path: c.a.path };
  }

  const keyMap: Record<AssetKind, 'videoUrl' | 'subtitleUrl' | 'subtitleZhUrl' | 'vocabularyUrl'> = {
    video: 'videoUrl', subtitle: 'subtitleUrl', subtitleZh: 'subtitleZhUrl', vocabulary: 'vocabularyUrl',
  };
  for (const k of Object.keys(buckets) as AssetKind[]) {
    const b = buckets[k];
    if (b) {
      result[keyMap[k]] = b.path;
      result.matched++;
      result.by[k] = b.path;
    }
  }

  // 特别兜底：如果 4 个中有任意一个被打分命中，就按同 stem 反查另外 3 个（防止打分算法漏掉）
  //  1) video -> en / zh / vocabulary
  //  2) en -> zh / vocabulary
  //  3) zh -> en / vocabulary
  //  4) vocabulary -> video / en / zh
  function tryResolveByStem(resolvedUrl: string | undefined, wantKind: AssetKind): string | undefined {
    if (!resolvedUrl) return undefined;
    const name = resolvedUrl.split('/').pop() || '';
    const stem = extractStem(name);
    if (!stem) return undefined;
    const cand = assets.find(a => matchAsset(wantKind, a.name) && extractStem(a.name) === stem);
    return cand ? cand.path : undefined;
  }
  const anyHit = result.videoUrl || result.subtitleUrl || result.subtitleZhUrl || result.vocabularyUrl;
  if (anyHit) {
    if (!result.videoUrl) {
      const p = tryResolveByStem(result.subtitleUrl || result.subtitleZhUrl || result.vocabularyUrl, 'video');
      if (p) { result.videoUrl = p; result.matched++; result.by['video'] = p; }
    }
    if (!result.subtitleUrl) {
      const p = tryResolveByStem(result.videoUrl || result.subtitleZhUrl || result.vocabularyUrl, 'subtitle');
      if (p) { result.subtitleUrl = p; result.matched++; result.by['subtitle'] = p; }
    }
    if (!result.subtitleZhUrl) {
      const p = tryResolveByStem(result.videoUrl || result.subtitleUrl || result.vocabularyUrl, 'subtitleZh');
      if (p) { result.subtitleZhUrl = p; result.matched++; result.by['subtitleZh'] = p; }
    }
    if (!result.vocabularyUrl) {
      const p = tryResolveByStem(result.videoUrl || result.subtitleUrl || result.subtitleZhUrl, 'vocabulary');
      if (p) { result.vocabularyUrl = p; result.matched++; result.by['vocabulary'] = p; }
    }
  }
  return result;
}

export default function CourseMaterialManager() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [editingEpisode, setEditingEpisode] = useState<{ seriesId: string; episodeId: string } | null>(null);
  const [editForm, setEditForm] = useState<Partial<EpisodeMaterial>>({});
  const [search, setSearch] = useState('');

  // 静态资源清单：/data 和 /media 下有哪些可匹配的文件
  const [assetIndex, setAssetIndex] = useState<{ path: string; name: string; sizeB?: number }[]>([]);
  const [refreshingAssets, setRefreshingAssets] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ open: false, anchor: null, filter: '' });

  // 1) 初始化：从 coursesDataLayer 读（静态 JSON + localStorage 覆盖）
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await loadAllCourses();
        if (Array.isArray(list) && list.length) setCourses(list);
      } finally {
        setLoading(false);
      }
    })();
    // 首次顺便刷新资源清单
    refreshAssetIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 保存：同步写 localStorage 覆盖 + 提示用户可下载 courses.json 重新部署
  const persist = (next: CourseMaterial[]) => {
    setCourses(next);
    try { saveLocalOverrides(next); } catch {}
  };

  // 3) 资源清单：GET /media/ 目录 listing（Vercel 静态目录 autoindex 不保证）
  //    所以用策略：直接拿"已知存在"的 Penelope 示例 + 额外 HEAD 探测候选
  //    为了零后端，这里直接走"启发式 + 用户主动刷新"双轨
  const CANDIDATE_FILES = [
    '/data/courses.json',
  ];

  async function refreshAssetIndex() {
    setRefreshingAssets(true);
    const out: { path: string; name: string; sizeB?: number }[] = [];
    // ✅ 首优先：从 /data/asset-index.json 读取（merge-dist 每次都会枚举 /media + /data 真实文件写入在这里，100% 找到）
    try {
      const r = await fetch('/data/asset-index.json?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        if (json && Array.isArray(json.entries)) {
          for (const e of json.entries) {
            if (!e || !e.path || !e.name) continue;
            out.push({ path: String(e.path), name: String(e.name), sizeB: Number(e.sizeB) || undefined });
          }
          if (out.length > 0) {
            setAssetIndex(out);
            setRefreshingAssets(false);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[CourseMaterialManager] 读取 asset-index.json 失败，回退 HEAD 探测：', e);
    }
    // Fallback：HEAD 探测 CANDIDATE_FILES（Vercel 没有目录 autoindex，兜底只有候选文件）
    const probe = async (p: string) => {
      try {
        const r = await fetch(p, { method: 'HEAD' });
        if (r.ok) {
          const sizeHeader = r.headers.get('content-length');
          out.push({
            path: p,
            name: p.split('/').pop() || p,
            sizeB: sizeHeader ? Number(sizeHeader) : undefined,
          });
        }
      } catch {}
    };
    const jobs = CANDIDATE_FILES.map(probe);
    await Promise.all(jobs);
    setAssetIndex(out);
    setRefreshingAssets(false);
  }

  const filtered = courses.filter(c => 
    c.seriesName.toLowerCase().includes(search.toLowerCase()) ||
    c.seriesId.toLowerCase().includes(search.toLowerCase())
  );

  const toggleExpand = (seriesId: string) => {
    setExpandedSeries(expandedSeries === seriesId ? null : seriesId);
  };

  const startEdit = (seriesId: string, episode: EpisodeMaterial) => {
    setEditingEpisode({ seriesId, episodeId: episode.episodeId });
    setEditForm({
      videoUrl: episode.videoUrl,
      subtitleUrl: episode.subtitleUrl,
      subtitleZhUrl: episode.subtitleZhUrl,
      vocabularyUrl: episode.vocabularyUrl,
      hasExercise: episode.hasExercise,
      exerciseCount: episode.exerciseCount,
      episodeName: episode.episodeName,
    });
  };

  const saveEdit = () => {
    if (!editingEpisode) return;
    const cleaned = cleanUrlsInForm(editForm);
    const next = patchEpisode(
      courses,
      editingEpisode.seriesId,
      editingEpisode.episodeId,
      cleaned as any,
    );
    persist(next);
    setEditingEpisode(null);
    setEditForm({});
  };

  const addEpisode = (seriesId: string) => {
    const course = courses.find(c => c.seriesId === seriesId);
    if (!course) return;
    const newEpId = `ep_${Date.now()}`;
    const newEp: EpisodeMaterial = {
      episodeId: newEpId,
      episodeName: `新单集 ${course.episodes.length + 1}`,
      hasExercise: false,
    };
    // 新建单集就立刻尝试自动匹配一次（如果 /media 里有同名 stem 的资源直接挂上）
    const patchedEp = (() => {
      const m = autoMatchAssetsForEpisode(assetIndex, course, newEp);
      if (m.matched <= 0) return newEp;
      // 保留 hasExercise/episodeName 其余写自动匹配
      return {
        ...newEp,
        videoUrl: m.videoUrl || newEp.videoUrl,
        subtitleUrl: m.subtitleUrl || newEp.subtitleUrl,
        subtitleZhUrl: m.subtitleZhUrl || newEp.subtitleZhUrl,
        vocabularyUrl: m.vocabularyUrl || newEp.vocabularyUrl,
      };
    })();
    const next = courses.map(c =>
      c.seriesId === seriesId
        ? { ...c, episodes: [...c.episodes, patchedEp] }
        : c
    );
    persist(next);
    if (patchedEp !== newEp) {
      // 进入编辑模式方便用户立刻校验
      setEditingEpisode({ seriesId, episodeId: newEpId });
      const base = patchedEp as EpisodeMaterial;
      setEditForm({
        videoUrl: base.videoUrl,
        subtitleUrl: base.subtitleUrl,
        subtitleZhUrl: base.subtitleZhUrl,
        vocabularyUrl: base.vocabularyUrl,
        hasExercise: base.hasExercise,
        exerciseCount: base.exerciseCount,
        episodeName: base.episodeName,
      });
      setExpandedSeries(seriesId);
    }
  };

  // 批量自动匹配（全部课程×全部单集）
  const runAutoMatchAll = () => {
    if (!assetIndex || assetIndex.length === 0) {
      alert('请先点击「刷新已部署文件」扫描 /media 和 /data 下的资源，再进行自动匹配。');
      return;
    }
    let totalChanged = 0;
    const next = courses.map(course => ({
      ...course,
      episodes: course.episodes.map(ep => {
        const existing = [ep.videoUrl, ep.subtitleUrl, ep.subtitleZhUrl, ep.vocabularyUrl].filter(Boolean).length;
        // 策略：已全部配好(>=4) 不覆盖；0 个或 1 个配了 → 自动填（但保留非空字段）
        if (existing >= 4) return ep;
        const m = autoMatchAssetsForEpisode(assetIndex, course, ep);
        if (m.matched <= 0) return ep;
        const patch: Partial<EpisodeMaterial> = {};
        if (!ep.videoUrl && m.videoUrl) patch.videoUrl = m.videoUrl;
        if (!ep.subtitleUrl && m.subtitleUrl) patch.subtitleUrl = m.subtitleUrl;
        if (!ep.subtitleZhUrl && m.subtitleZhUrl) patch.subtitleZhUrl = m.subtitleZhUrl;
        if (!ep.vocabularyUrl && m.vocabularyUrl) patch.vocabularyUrl = m.vocabularyUrl;
        if (Object.keys(patch).length === 0) return ep;
        totalChanged++;
        return { ...ep, ...patch };
      }),
    }));
    persist(next);
    alert(`✅ 自动匹配完成\n扫描资源：${assetIndex.length} 个文件\n自动挂到了 ${totalChanged} 个单集。\n\n如果有匹配不正确的，可以点每行「🔧 自动填」对单个单集重新挑，或者手动点 📁 选择。`);
  };

  // 单集自动匹配（可覆盖已填字段，用于精修）
  const autoMatchEpisode = (seriesId: string, episodeId: string, overwrite = false) => {
    if (!assetIndex || assetIndex.length === 0) {
      alert('请先点击「刷新已部署文件」扫描 /media 和 /data 下的资源，再进行自动匹配。');
      return;
    }
    const course = courses.find(c => c.seriesId === seriesId);
    if (!course) return;
    const ep = course.episodes.find(e => e.episodeId === episodeId);
    if (!ep) return;
    const m = autoMatchAssetsForEpisode(assetIndex, course, ep);
    if (m.matched <= 0) {
      alert(`没在 /media 和 /data 里找到和 【${course.seriesName} / ${ep.episodeName}】 匹配的资源。\n\n1. 请先 merge-dist + deploy 把资源推到线上；\n2. 回到此页面点「刷新已部署文件」；\n3. 或者直接点每行 📁 手动挑。`);
      return;
    }
    let patch: Partial<EpisodeMaterial> = {};
    if (overwrite) {
      patch = {
        videoUrl: m.videoUrl,
        subtitleUrl: m.subtitleUrl,
        subtitleZhUrl: m.subtitleZhUrl,
        vocabularyUrl: m.vocabularyUrl,
      };
    } else {
      if (!ep.videoUrl && m.videoUrl) patch.videoUrl = m.videoUrl;
      if (!ep.subtitleUrl && m.subtitleUrl) patch.subtitleUrl = m.subtitleUrl;
      if (!ep.subtitleZhUrl && m.subtitleZhUrl) patch.subtitleZhUrl = m.subtitleZhUrl;
      if (!ep.vocabularyUrl && m.vocabularyUrl) patch.vocabularyUrl = m.vocabularyUrl;
    }
    // 如果是正在编辑的这一行，也同步更新 editForm，避免保存时被覆盖
    if (editingEpisode && editingEpisode.seriesId === seriesId && editingEpisode.episodeId === episodeId) {
      setEditForm(f => ({ ...f, ...patch }));
    }
    const next = patchEpisode(courses, seriesId, episodeId, patch);
    persist(next);
    const filled = Object.values(patch).filter(Boolean).length;
    alert(`✅ 【${course.seriesName} / ${ep.episodeName}】自动匹配完成\n命中 ${m.matched} 个资源：\n  • 视频：${patch.videoUrl ? patch.videoUrl.split('/').pop() : '（没填/跳过）'}\n  • 英文字幕：${patch.subtitleUrl ? patch.subtitleUrl.split('/').pop() : '（没填/跳过）'}\n  • 中文字幕：${patch.subtitleZhUrl ? patch.subtitleZhUrl.split('/').pop() : '（没填/跳过）'}\n  • 生词表：${patch.vocabularyUrl ? patch.vocabularyUrl.split('/').pop() : '（没填/跳过）'}\n写入了 ${filled} 个字段。`);
  };

  const removeEpisode = (seriesId: string, episodeId: string) => {
    if (!window.confirm('确定要删除这个单集吗？')) return;
    const next = courses.map(c => {
      if (c.seriesId !== seriesId) return c;
      return { ...c, episodes: c.episodes.filter(ep => ep.episodeId !== episodeId) };
    });
    persist(next);
  };

  const addCourse = () => {
    const name = prompt('请输入课程名称：');
    if (!name) return;
    const { courses: next, seriesId } = addSeriesDataLayer(courses, name);
    persist(next);
    setExpandedSeries(seriesId);
  };

  const downloadJson = () => downloadCoursesJSON(courses);

  // === URL 辅助：本地路径判定 + 一键规范 ===
  function cleanUrlsInForm(form: Partial<EpisodeMaterial>): Partial<EpisodeMaterial> {
    const out = { ...form };
    (['videoUrl','subtitleUrl','subtitleZhUrl','vocabularyUrl'] as const).forEach((k) => {
      const v = (out[k] || '').trim();
      if (LOCAL_PATH_RE.test(v)) {
        const m = v.match(/([^\\/]+?\.(mp4|mov|m4v|webm|mkv|vtt|srt|json))\s*$/i);
        if (m) {
          out[k] = `/media/${m[1]}` as any;
        }
      } else if (v) {
        out[k] = v as any;
      }
    });
    return out;
  }

  function openPicker(seriesId: string, episodeId: string, field: AssetKind) {
    setPicker({ open: true, anchor: { seriesId, episodeId, field }, filter: '' });
  }
  function closePicker() { setPicker({ open: false, anchor: null, filter: '' }); }

  function applyPickerChoice(path: string) {
    if (!picker.anchor) return closePicker();
    const { seriesId, episodeId, field } = picker.anchor;
    const key =
      field === 'video' ? 'videoUrl'
      : field === 'subtitle' ? 'subtitleUrl'
      : field === 'subtitleZh' ? 'subtitleZhUrl'
      : 'vocabularyUrl';
    if (editingEpisode && editingEpisode.seriesId === seriesId && editingEpisode.episodeId === episodeId) {
      setEditForm((f) => ({ ...f, [key]: path }));
    } else {
      const next = patchEpisode(courses, seriesId, episodeId, { [key]: path } as any);
      persist(next);
    }
    closePicker();
  }

  const currentFieldLabel = useMemo(() => {
    switch (picker.anchor?.field) {
      case 'video':      return '选择视频源文件 URL';
      case 'subtitle':   return '选择英文字幕文件 URL (.vtt / .srt，建议命名 xxx_en.vtt)';
      case 'subtitleZh': return '选择中文字幕文件 URL (.vtt / .srt，建议命名 xxx_zh.vtt)';
      case 'vocabulary': return '选择生词表文件 URL (_vocabulary.json)';
      default: return '';
    }
  }, [picker.anchor]);

  const filteredAssets = useMemo(() => {
    const f = picker.filter.trim().toLowerCase();
    const want = picker.anchor?.field;
    return assetIndex
      .filter(a => !want || matchAsset(want, a.name))
      .filter(a => !f || a.name.toLowerCase().includes(f) || a.path.toLowerCase().includes(f));
  }, [assetIndex, picker.filter, picker.anchor]);

  function LocalPathAlert({ value, onFix, kind }: { value: string; onFix: (p: string) => void; kind: AssetKind }) {
    if (!LOCAL_PATH_RE.test(value.trim())) return null;
    const m = value.match(/([^\\/]+?\.(mp4|mov|m4v|webm|mkv|vtt|srt|json))\s*$/i);
    const suggested = m ? `/media/${m[1]}` : '';
    const label = kind === 'video' ? '视频' : kind === 'subtitle' ? '英文字幕' : kind === 'subtitleZh' ? '中文字幕' : '生词表';
    return (
      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
        <div className="font-semibold flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> 检测到本地磁盘路径，浏览器/线上环境无法访问
        </div>
        <div className="mt-0.5 break-all">你填的是：<code className="bg-amber-100 px-1 rounded">{value}</code></div>
        {suggested && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span>推荐改成：</span>
            <code className="bg-white border border-amber-200 px-1.5 py-0.5 rounded">{suggested}</code>
            <button
              type="button"
              onClick={() => onFix(suggested)}
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium"
            >
              一键替换成{label}线上地址
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">课程资料管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            点「📁 选择文件」从已部署的 /media、/data 中自动挑；不要再填 <code className="px-1 rounded bg-slate-100">D:\</code> 这类本地路径。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/admin/codes')}
            className="flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            title="跳转授权码管理：生成/下载与课程绑定的激活码（覆盖 client-web/public/data/activation-codes.json 后重新部署即可在 C 端兑换）"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            授权码管理
          </button>
          <button
            onClick={downloadJson}
            className="flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            title="把当前所有改动（含本地覆盖）导出成 courses.json，然后重新部署就能同步到前台 H5 和小程序"
          >
            <Download className="w-4 h-4 mr-2" />
            下载 courses.json
          </button>
          <button
            onClick={refreshAssetIndex}
            disabled={refreshingAssets}
            className="flex items-center px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm disabled:opacity-50"
            title="重新扫描当前线上 /media /data 目录下已经部署好的 mp4/vtt/json"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshingAssets ? 'animate-spin' : ''}`} />
            {refreshingAssets ? '扫描中…' : '刷新已部署文件'}
          </button>
          <button
            onClick={runAutoMatchAll}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all text-sm font-semibold shadow-sm"
            title="自动把 /media 和 /data 下已部署的 mp4 / en.vtt / zh.vtt / vocabulary.json 按文件名 stem 匹配挂到每个单集（只填空，不覆盖已填）"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            自动匹配全部
          </button>
          <button
            onClick={addCourse}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增课程
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总课程数</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{courses.length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总单集数</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {courses.reduce((sum, c) => sum + c.episodes.length, 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">已配置字幕</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">
            {courses.reduce((sum, c) => sum + c.episodes.filter(e => e.subtitleUrl).length, 0)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">已配置生词表</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">
            {courses.reduce((sum, c) => sum + c.episodes.filter(e => e.vocabularyUrl).length, 0)}
          </div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="搜索课程名称或ID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 课程列表 */}
      <div className="space-y-4">
        {filtered.map((course) => {
          const isExpanded = expandedSeries === course.seriesId;
          
          return (
            <div key={course.seriesId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* 课程头 */}
              <div 
                className="p-6 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(course.seriesId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                      {course.coverUrl ? (
                        <img src={course.coverUrl} alt={course.seriesName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🎬</div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{course.seriesName}</h3>
                      <p className="text-sm text-slate-500">ID: {course.seriesId}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-xs font-medium text-slate-600">
                          共 {course.episodes.length} 集
                        </span>
                        <span className="text-xs font-medium text-emerald-600">
                          {course.episodes.filter(e => e.subtitleUrl).length} 集有字幕
                        </span>
                        <span className="text-xs font-medium text-amber-600">
                          {course.episodes.filter(e => e.vocabularyUrl).length} 集有生词表
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/codes?seriesId=${encodeURIComponent(course.seriesId)}`);
                      }}
                      className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                      title="生成/管理该系列对应的激活码（C 端输入后解锁该课程）"
                    >
                      <KeyRound className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addEpisode(course.seriesId);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="添加单集"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>

              {/* 单集列表 */}
              {isExpanded && (
                <div className="border-t border-slate-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                        <th className="px-4 py-3 font-medium">单集</th>
                        <th className="px-4 py-3 font-medium">视频源</th>
                        <th className="px-4 py-3 font-medium">英文字幕</th>
                        <th className="px-4 py-3 font-medium">中文字幕</th>
                        <th className="px-4 py-3 font-medium">生词表</th>
                        <th className="px-4 py-3 font-medium">互动练习</th>
                        <th className="px-4 py-3 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {course.episodes.map((ep) => {
                        const isEditing = editingEpisode?.seriesId === course.seriesId && editingEpisode?.episodeId === ep.episodeId;
                        
                        return (
                          <tr key={ep.episodeId} className="hover:bg-slate-50 align-top">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <PlayCircle className="w-4 h-4 text-slate-400" />
                                <div>
                                  <div className="font-medium text-slate-900 leading-tight">{ep.episodeName}</div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">epId: {ep.episodeId}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 w-[24%]">
                              {isEditing ? (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editForm.videoUrl || ''}
                                      onChange={(e) => setEditForm({ ...editForm, videoUrl: e.target.value })}
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="/media/xxx.mp4 或 https://..."
                                    />
                                    <button
                                      type="button"
                                      onClick={() => openPicker(course.seriesId, ep.episodeId, 'video')}
                                      className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs"
                                      title="从已部署文件里挑一个视频"
                                    >
                                      <FolderOpen className="w-3.5 h-3.5 mr-1" />选择
                                    </button>
                                  </div>
                                  <LocalPathAlert
                                    value={editForm.videoUrl || ''}
                                    kind="video"
                                    onFix={(p) => setEditForm({ ...editForm, videoUrl: p })}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-h-[2rem]">
                                  {ep.videoUrl ? (
                                    <span className="flex items-center gap-1 text-sky-700 text-xs">
                                      <PlayCircle className="w-3.5 h-3.5" />
                                      {ep.videoUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 w-[19%]">
                              {isEditing ? (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editForm.subtitleUrl || ''}
                                      onChange={(e) => setEditForm({ ...editForm, subtitleUrl: e.target.value })}
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="/media/xxx_en.vtt"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => openPicker(course.seriesId, ep.episodeId, 'subtitle')}
                                      className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs"
                                      title="从已部署文件里挑一个英文字幕（_en.vtt 优先）"
                                    >
                                      <FolderOpen className="w-3.5 h-3.5 mr-1" />选择
                                    </button>
                                  </div>
                                  <LocalPathAlert
                                    value={editForm.subtitleUrl || ''}
                                    kind="subtitle"
                                    onFix={(p) => setEditForm({ ...editForm, subtitleUrl: p })}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-h-[2rem]">
                                  {ep.subtitleUrl ? (
                                    <span className="flex items-center gap-1 text-emerald-600 text-xs">
                                      <FileText className="w-3.5 h-3.5" />
                                      {ep.subtitleUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 w-[19%]">
                              {isEditing ? (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editForm.subtitleZhUrl || ''}
                                      onChange={(e) => setEditForm({ ...editForm, subtitleZhUrl: e.target.value })}
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="/media/xxx_zh.vtt"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => openPicker(course.seriesId, ep.episodeId, 'subtitleZh')}
                                      className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs"
                                      title="从已部署文件里挑一个中文字幕（文件名建议 _zh.vtt）"
                                    >
                                      <FolderOpen className="w-3.5 h-3.5 mr-1" />选择
                                    </button>
                                  </div>
                                  <LocalPathAlert
                                    value={editForm.subtitleZhUrl || ''}
                                    kind="subtitleZh"
                                    onFix={(p) => setEditForm({ ...editForm, subtitleZhUrl: p })}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-h-[2rem]">
                                  {ep.subtitleZhUrl ? (
                                    <span className="flex items-center gap-1 text-pink-600 text-xs">
                                      <FileText className="w-3.5 h-3.5" />
                                      {ep.subtitleZhUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 w-[19%]">
                              {isEditing ? (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editForm.vocabularyUrl || ''}
                                      onChange={(e) => setEditForm({ ...editForm, vocabularyUrl: e.target.value })}
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="/media/xxx_vocabulary.json"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => openPicker(course.seriesId, ep.episodeId, 'vocabulary')}
                                      className="flex-shrink-0 inline-flex items-center px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs"
                                      title="从已部署文件里挑一个生词表"
                                    >
                                      <FolderOpen className="w-3.5 h-3.5 mr-1" />选择
                                    </button>
                                  </div>
                                  <LocalPathAlert
                                    value={editForm.vocabularyUrl || ''}
                                    kind="vocabulary"
                                    onFix={(p) => setEditForm({ ...editForm, vocabularyUrl: p })}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-h-[2rem]">
                                  {ep.vocabularyUrl ? (
                                    <span className="flex items-center gap-1 text-amber-600 text-xs">
                                      <BookOpen className="w-3.5 h-3.5" />
                                      {ep.vocabularyUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {isEditing ? (
                                <div className="flex items-center gap-2 pt-1">
                                  <input
                                    type="checkbox"
                                    checked={editForm.hasExercise || false}
                                    onChange={(e) => setEditForm({ ...editForm, hasExercise: e.target.checked })}
                                    className="rounded"
                                  />
                                  <input
                                    type="number"
                                    value={editForm.exerciseCount || 0}
                                    onChange={(e) => setEditForm({ ...editForm, exerciseCount: Number(e.target.value) })}
                                    className="w-16 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="题数"
                                  />
                                </div>
                              ) : (
                                ep.hasExercise ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-[11px] font-medium rounded-full">
                                    <Mic className="w-3 h-3" />
                                    {ep.exerciseCount || 0} 题
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">无</span>
                                )
                              )}
                            </td>
                            <td className="px-4 py-4 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => autoMatchEpisode(course.seriesId, ep.episodeId, false)}
                                    className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                    title="🔧 自动匹配：按文件名 stem 自动挂 mp4/en/zh/vocabulary（只填未配置的字段）"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => autoMatchEpisode(course.seriesId, ep.episodeId, true)}
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-[10px] font-bold"
                                    title="⚡ 强制覆盖自动匹配（即使已有字段也重新写入）"
                                  >
                                    ⚡覆盖
                                  </button>
                                  <button
                                    onClick={saveEdit}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="保存（自动写 localStorage + 可下载 courses.json 重新部署）"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingEpisode(null)}
                                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="取消"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => autoMatchEpisode(course.seriesId, ep.episodeId, false)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors border border-violet-200"
                                    title="🔧 自动匹配（只填空字段）：按文件名 stem 从 /media /data 挑 mp4/en/zh/vocab"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    自动填
                                  </button>
                                  <button
                                    onClick={() => startEdit(course.seriesId, ep)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="编辑（改 4 个 URL + 练习）"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeEpisode(course.seriesId, ep.episodeId)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="删除单集"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {course.episodes.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                            <div className="flex flex-col items-center">
                              <PlayCircle className="w-8 h-8 mb-2 opacity-30" />
                              <p>还没有单集，点击上方 + 添加</p>
                              <p className="text-xs mt-2 text-slate-400">也可以在顶部「🧙 自动匹配全部」一键挂上已部署的资源。</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">{loading ? '加载中…' : '没有找到匹配的课程'}</p>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-base font-bold text-blue-900 mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" /> 填写 3 个 URL 的正确姿势
          </h3>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1.5">
            <li>先把 mp4、vtt、_vocabulary.json 放到 <code className="bg-white px-1 rounded border border-blue-200">scripts/</code> 目录（和课件脚本一起放）</li>
            <li>在项目根目录运行 <code className="bg-white px-1 rounded border border-blue-200">node scripts/merge-dist.js</code>（它们会被自动拷到 <code className="bg-white px-1 rounded border border-blue-200">public/media/</code>）</li>
            <li>用 <span className="font-semibold">Vercel 重新部署</span>（这些文件才真正上线可访问）</li>
            <li>点本页右上角 <span className="font-semibold">「刷新已部署文件」</span> 扫描 → 再点每一行的「📁 选择」一键填入，不要手敲本地路径</li>
          </ol>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <h3 className="text-base font-bold text-emerald-900 mb-2 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> 改动如何同步到前台（H5 + 小程序）
          </h3>
          <ol className="list-decimal list-inside text-sm text-emerald-800 space-y-1.5">
            <li>这里「保存」会先写到 <span className="font-semibold">浏览器 localStorage</span>（刷新不丢，但只有你自己能看到）</li>
            <li>准备上线时，点本页右上角 <span className="font-semibold">「下载 courses.json」</span> 拿到完整 JSON</li>
            <li>覆盖 <code className="bg-white px-1 rounded border border-emerald-200">client-web/public/data/courses.json</code> 的内容</li>
            <li>再跑一次 <code className="bg-white px-1 rounded border border-emerald-200">node scripts/merge-dist.js</code> + Vercel 重新部署 → 前台立即生效</li>
          </ol>
        </div>
      </div>

      {/* 选择文件 Modal */}
      {picker.open && picker.anchor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={closePicker}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="text-base font-semibold text-slate-900">{currentFieldLabel}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">
                  当前系列：{courses.find(c => c.seriesId === picker.anchor?.seriesId)?.seriesName || picker.anchor.seriesId} ·
                  单集：{courses.find(c => c.seriesId === picker.anchor?.seriesId)?.episodes.find(e => e.episodeId === picker.anchor?.episodeId)?.episodeName || picker.anchor.episodeId}
                </div>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="按文件名搜（例如 Penelope / vtt / vocab …）"
                  value={picker.filter}
                  onChange={(e) => setPicker({ ...picker, filter: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={refreshAssetIndex}
                disabled={refreshingAssets}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs disabled:opacity-50"
                title="如果列表里没看到新文件，先重新部署再点这里"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingAssets ? 'animate-spin' : ''}`} />
                重新扫描
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {filteredAssets.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-sm">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">当前扫描不到匹配的文件</p>
                  <p className="mt-1 text-[12px]">
                    常见原因：① 忘了 <span className="font-medium">merge-dist + 重新部署</span> ② 扩展名不在允许列表（视频 mp4/mov/webm、字幕 vtt/srt、生词表 xxx_vocabulary.json）
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredAssets.map((a) => (
                    <li key={a.path}>
                      <button
                        type="button"
                        onClick={() => applyPickerChoice(a.path)}
                        className="w-full text-left px-5 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          picker.anchor?.field === 'video' ? 'bg-sky-100 text-sky-700' :
                          picker.anchor?.field === 'subtitle' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {picker.anchor?.field === 'video' ? <PlayCircle className="w-4.5 h-4.5" /> :
                           picker.anchor?.field === 'subtitle' ? <FileText className="w-4.5 h-4.5" /> :
                           <BookOpen className="w-4.5 h-4.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{a.name}</div>
                          <div className="text-[11px] text-slate-500 truncate font-mono">{a.path}{a.sizeB != null ? ` · ${(a.sizeB/1024).toFixed(1)} KB` : ''}</div>
                        </div>
                        <div className="flex-shrink-0 text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 font-medium">
                          点击填入
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
