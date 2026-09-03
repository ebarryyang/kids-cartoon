import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Sparkles,
  UploadCloud,
  FolderInput,
  Copy,
  CheckCircle2,
  FileText,
  FileJson,
  Wand2,
  AlertTriangle,
  Video as VideoIcon,
  Settings as SettingsIcon,
  Save as SaveIcon,
  Download,
  Clipboard,
} from 'lucide-react';
import { loadSettings, AllProviderSettings } from '@/lib/settingsStore';
import { filterNounVerbOnly } from '@/lib/vocabFilter';
import {
  PipelineConfig,
  WhisperModel,
  cancelServerTask,
  downloadServerText,
  fetchServerArtifacts,
  localServerFetcher,
  pickFetcher,
  StartResult,
} from '@/lib/pipelineFetcher';
import {
  CourseMaterial,
  addSeries,
  downloadCoursesJSON,
  loadAllCourses,
  patchEpisode,
  saveLocalOverrides,
} from '@/lib/coursesDataLayer';

const PENDING_VOCAB_KEY = 'admin-builder:pending-vocab-v1';
const WHISPER_MODELS: { value: WhisperModel; label: string; hint: string }[] = [
  { value: 'tiny', label: 'tiny（最快，准度稍低）', hint: '适合长视频、机器性能一般' },
  { value: 'base', label: 'base（推荐默认）', hint: '平衡速度和准度' },
  { value: 'small', label: 'small（较准）', hint: '英文准度更高，耗时更长' },
  { value: 'medium', label: 'medium（很准）', hint: '显存/内存占用较高' },
  { value: 'large', label: 'large / large-v3（最准）', hint: '英文几乎无错，8G+ 显存推荐' },
];

type StepKey = 1 | 2 | 3 | 4 | 5;

interface VocabPayload {
  version?: number;
  schema?: string;
  meta?: any;
  events?: VocabEvent[];
}
interface VocabEvent {
  id?: string;
  time: number;
  wordEn: string;
  wordZh?: string;
  imageUrl?: string;
  audioUrl?: string;
  coordX?: number;
  coordY?: number;
}

export default function CourseBuilder() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AllProviderSettings>(() => loadSettings());
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // 顶部 stepper
  const [step, setStep] = useState<StepKey>(1);

  // Step 1 视频来源
  const [videoTab, setVideoTab] = useState<'local' | 'pan'>('local');
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localAbsPath, setLocalAbsPath] = useState('');
  const [panPath, setPanPath] = useState('/我的应用数据/英语宝贝动画宝/');

  // Step 2 参数
  const [whisperModel, setWhisperModel] = useState<WhisperModel>('base');
  const [wordCount, setWordCount] = useState<number>(12);
  const [skipTts, setSkipTts] = useState(false);
  const [forceLocal, setForceLocal] = useState(false);
  const [noMkvConvert, setNoMkvConvert] = useState(false);
  const [translateZh, setTranslateZh] = useState(true);
  const [zhModel, setZhModel] = useState('');
  const [courses, setCourses] = useState<CourseMaterial[]>([]);
  const [targetSeriesId, setTargetSeriesId] = useState<string>('');
  const [targetEpisodeId, setTargetEpisodeId] = useState<string>('');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newEpisodeName, setNewEpisodeName] = useState('');
  useEffect(() => {
    (async () => {
      const all = await loadAllCourses();
      setCourses(all);
    })();
  }, []);

  // Step 3 执行（剪贴板模式 / 服务模式）
  const [startResult, setStartResult] = useState<StartResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const serverMode = !!(settings.pipelineServer?.enabled && settings.pipelineServer?.url);
  useEffect(() => {
    if (copiedCmd) {
      const t = setTimeout(() => setCopiedCmd(false), 2200);
      return () => clearTimeout(t);
    }
  }, [copiedCmd]);

  // Step 4 导入产物
  const [importedVocab, setImportedVocab] = useState<VocabPayload | null>(null);
  const [importedMd, setImportedMd] = useState<string>('');
  const [importVocabFileName, setImportVocabFileName] = useState<string>('');
  const fileInputJson = useRef<HTMLInputElement | null>(null);
  const fileInputMd = useRef<HTMLInputElement | null>(null);

  // Step 5 写入 dialog
  const [patchConfirm, setPatchConfirm] = useState<
    | { seriesId: string; seriesName: string; episodeId: string; episodeName: string }
    | null
  >(null);

  const currentSeries = useMemo(
    () => courses.find(s => s.seriesId === targetSeriesId) || null,
    [courses, targetSeriesId]
  );

  const computeVideoStem = (): string | null => {
    // 取 Step1 输入视频的文件名 stem（去掉目录 + 后缀），用来生成 /media/{stem}.mp4 / _en.vtt / _zh.vtt
    let filename = '';
    if (videoTab === 'local') {
      if (localAbsPath && localAbsPath.trim()) filename = localAbsPath.trim();
      else if (localFile) filename = localFile.name;
    } else {
      filename = panPath.trim();
    }
    if (!filename) return null;
    const seg = filename.split(/[\\/]/).filter(Boolean).pop();
    if (!seg) return null;
    return seg.replace(/\.[^.]+$/, '');
  };

  const predictMediaUrlsFromStem = (): { videoUrl: string; subtitlesEnUrl: string; subtitlesZhUrl: string; vocabularyUrl: string; audioPrefix: string } => {
    const stem = computeVideoStem() || 'output';
    return {
      videoUrl: `/media/${stem}.mp4`,
      subtitlesEnUrl: `/media/${stem}_en.vtt`,
      subtitlesZhUrl: `/media/${stem}_zh.vtt`,
      vocabularyUrl: `/media/${stem}_vocabulary.json`,
      audioPrefix: `/media/${stem}_audio/`,
    };
  };

  const canGoNextStep = (s: StepKey): boolean => {
    if (s === 1) {
      if (videoTab === 'local') return !!localFile;
      return panPath.trim().length > 0;
    }
    if (s === 2) return wordCount >= 3 && wordCount <= 30;
    if (s === 3) return !!startResult;
    if (s === 4) return !!importedVocab && Array.isArray(importedVocab.events) && importedVocab.events.length > 0;
    return true;
  };

  const buildConfig = (): PipelineConfig | null => {
    if (videoTab === 'local') {
      if (!localFile) return null;
      return {
        videoSource: {
          type: 'local',
          localFile,
          localAbsPathHint: localAbsPath.trim(),
        },
        whisperModel,
        wordCount,
        skipTts,
        forceLocal,
        noMkvConvert,
        translateZh,
        zhModel: zhModel.trim(),
        targetSeriesId: targetSeriesId || undefined,
        targetEpisodeId: targetEpisodeId || undefined,
      };
    } else {
      if (!panPath.trim()) return null;
      return {
        videoSource: { type: 'pan', panPath: panPath.trim() },
        whisperModel,
        wordCount,
        skipTts,
        forceLocal,
        noMkvConvert,
        translateZh,
        zhModel: zhModel.trim(),
        targetSeriesId: targetSeriesId || undefined,
        targetEpisodeId: targetEpisodeId || undefined,
      };
    }
  };

  const applyVocabPayload = (obj: VocabPayload, fileName: string) => {
    const rawEvents = obj.events || (Array.isArray(obj) ? (obj as VocabEvent[]) : []);
    // 💥 导入后统一名动过滤（和 Python 流水线对齐）
    const events = filterNounVerbOnly(rawEvents as any[]);
    setImportedVocab({ ...(Array.isArray(obj) ? {} : obj), events });
    setImportVocabFileName(fileName);
    if (events.length !== rawEvents.length) {
      setTimeout(() => {
        alert(`✅ vocabulary 导入完成：解析 ${rawEvents.length} 词 → 保留 ${events.length} 个名词/动词（已自动过滤形容词/副词/介词/助动词）。`);
      }, 50);
    }
  };

  const handleStep3Generate = async () => {
    const cfg = buildConfig();
    if (!cfg) {
      alert('请先回到 Step1 选择视频来源。');
      return;
    }
    const fetcher = pickFetcher(settings);
    setProgress({ percent: 0, message: '准备中…' });
    setServerBusy(fetcher === localServerFetcher);
    try {
      const res = await fetcher.start(cfg, settings, (pct, msg) =>
        setProgress({ percent: pct, message: msg })
      );
      setStartResult(res);

      // 服务模式：流水线跑完后自动拉取产物 → 导入 Step4 → 自动跳转
      if (res.mode === 'server' && res.taskId && res.serverBase) {
        const arts = await fetchServerArtifacts(res.serverBase, res.taskId);
        if (arts.vocabularyJson) {
          const jsonText = await downloadServerText(res.serverBase, res.taskId, arts.vocabularyJson);
          const obj = JSON.parse(jsonText) as VocabPayload;
          applyVocabPayload(obj, arts.vocabularyJson);
        }
        if (arts.vocabularyMd) {
          const md = await downloadServerText(res.serverBase, res.taskId, arts.vocabularyMd);
          setImportedMd(md);
        }
        setProgress(null);
        setServerBusy(false);
        setStep(4);
        return;
      }

      setProgress(null);
      setServerBusy(false);
    } catch (e: any) {
      setProgress(null);
      setServerBusy(false);
      alert(`流水线执行失败：${e?.message || e}`);
    }
  };

  const handleCancelTask = async () => {
    if (!startResult?.taskId || !startResult?.serverBase) return;
    if (!window.confirm('确认取消当前流水线任务？')) return;
    await cancelServerTask(startResult.serverBase, startResult.taskId);
  };

  const handleCopyCmd = async () => {
    if (!startResult?.command) return;
    try {
      await navigator.clipboard.writeText(startResult.command);
      setCopiedCmd(true);
    } catch {
      alert('复制失败，请手动选择代码块文本复制。');
    }
  };

  const handleVocabFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result as string) as VocabPayload;
        applyVocabPayload(obj, file.name);
      } catch (e: any) {
        alert(`vocabulary JSON 解析失败：${e?.message || e}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleMdFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImportedMd(reader.result as string);
    };
    reader.readAsText(file, 'utf-8');
  };

  const eventStats = useMemo(() => {
    const arr = importedVocab?.events || [];
    const missingZh = arr.filter(e => !e.wordZh).length;
    const sample = arr.slice(0, 3);
    return { total: arr.length, missingZh, sample };
  }, [importedVocab]);

  const normalizedEventsForEditor = () => {
    const raw = importedVocab?.events || [];
    // 💥 最后统一名动过滤兜底
    const arr = filterNounVerbOnly(raw as any[]);
    return arr
      .map(e => ({
        id: e.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        time: Number(Number(e.time).toFixed(1)) || 0,
        wordEn: e.wordEn || '',
        wordZh: e.wordZh || '',
        imageUrl: e.imageUrl || '',
        audioUrl: e.audioUrl || '',
        coordX: typeof e.coordX === 'number' ? e.coordX : 50,
        coordY: typeof e.coordY === 'number' ? e.coordY : 25,
      }))
      .sort((a, b) => a.time - b.time);
  };

  const handleOpenTimeline = () => {
    if (!importedVocab) return;
    try {
      const forEditor = normalizedEventsForEditor();
      // 把 vocabulary 事件里的 audioUrl 前缀改成 /media/{stem}_audio/（和流水线文件名约定对齐）
      const predict = predictMediaUrlsFromStem();
      const eventsWithAudio = forEditor.map(e => {
        if (e.audioUrl && (e.audioUrl.startsWith('/media/') || e.audioUrl.startsWith('http'))) return e;
        // 如果为空或相对路径，尝试用 predictable {stem}_audio/word_XX_WordName.mp3
        const idxMatch = importedVocab?.events?.findIndex(x => (x.id && x.id === e.id) || (Math.abs(Number(x.time) - Number(e.time)) < 0.25 && String(x.wordEn || '').toLowerCase() === String(e.wordEn || '').toLowerCase()))
        const idx = typeof idxMatch === 'number' && idxMatch >= 0 ? idxMatch : -1;
        if (idx >= 0) {
          const safeWord = String(e.wordEn || `word_${idx}`).replace(/[^A-Za-z0-9_-]/g, '_') || `word_${idx}`;
          return { ...e, audioUrl: `${predict.audioPrefix}word_${String(idx).padStart(2, '0')}_${safeWord}.mp3` };
        }
        return e;
      });
      const newId = `builder_${Date.now()}`;
      // 写进 TimelineEditor 直接读取的 TL_STORAGE_KEY：admin-timeline:${newId}
      // 预填 3 个 URL（目标托管地址）和 events，打开 TimelineEditor 就是可编辑状态
      const TL_KEY = `admin-timeline:${newId}`;
      localStorage.setItem(
        TL_KEY,
        JSON.stringify({
          events: eventsWithAudio,
          videoUrl: predict.videoUrl,
          subtitlesEnUrl: predict.subtitlesEnUrl,
          subtitlesZhUrl: predict.subtitlesZhUrl,
          vocabularyUrl: predict.vocabularyUrl,
          source: 'course-builder',
          stem: computeVideoStem(),
          createdAt: new Date().toISOString(),
        })
      );
      // 保留 PENDING_VOCAB_KEY，给 TimelineEditor 的"首次导入"兜底用
      localStorage.setItem(
        PENDING_VOCAB_KEY,
        JSON.stringify({
          source: importVocabFileName || 'course-builder',
          createdAt: new Date().toISOString(),
          payload: importedVocab,
          events: eventsWithAudio,
          md: importedMd || '',
          stem: computeVideoStem(),
          predict,
        })
      );
      navigate(`/content/edit/${newId}`, { replace: false });
    } catch (e: any) {
      alert(`写入暂存槽失败：${e?.message || e}`);
    }
  };

  const handleCopyJsonOnly = async () => {
    if (!importedVocab) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(importedVocab, null, 2));
      alert('✅ vocabulary JSON 已复制到剪贴板。');
    } catch {
      alert('复制失败，请改用「下载 JSON」按钮。');
    }
  };

  const handleDownloadVocab = () => {
    if (!importedVocab) return;
    const blob = new Blob([JSON.stringify(importedVocab, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = importVocabFileName || 'vocabulary';
    a.download = base.replace(/\.json$/i, '') + '_vocabulary.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const trySeriesAddOrPick = () => {
    // 如果用户填了新系列名且没选已有 → 加一条内存中的 courses 并选它
    if (newSeriesName.trim() && !targetSeriesId) {
      const { courses: next, seriesId } = addSeries(courses, newSeriesName.trim());
      setCourses(next);
      setTargetSeriesId(seriesId);
      return seriesId;
    }
    return targetSeriesId;
  };

  const currentEpisode = () => currentSeries?.episodes.find(e => e.episodeId === targetEpisodeId);

  const openPatchConfirm = () => {
    const sid = trySeriesAddOrPick();
    if (!sid) {
      alert('请选择一个系列，或填写「新建系列名称」。');
      return;
    }
    let epId = targetEpisodeId;
    let epName = '';
    if (!epId) {
      if (!newEpisodeName.trim()) {
        alert('请选择一个单集，或填写「新建单集名称」。');
        return;
      }
      epId = `ep_${Date.now()}`;
      epName = newEpisodeName.trim();
    } else {
      epName =
        courses.find(s => s.seriesId === sid)?.episodes.find(e => e.episodeId === epId)?.episodeName ||
        `单集 ${epId}`;
    }
    const seriesName = courses.find(s => s.seriesId === sid)?.seriesName || `系列 ${sid}`;
    setPatchConfirm({ seriesId: sid, seriesName, episodeId: epId, episodeName: epName });
  };

  const CM_STORAGE_KEY = 'admin-content-manager:v1';
  interface CM_VideoContent {
    id: string;
    title: string;
    status: 'published' | 'draft';
    views: number;
    updatedAt: string;
    videoUrl?: string;
    subtitleUrl?: string;
    subtitleZhUrl?: string;
    vocabularyUrl?: string;
  }
  const CM_INITIAL_DATA: CM_VideoContent[] = [
    { id: '1', title: 'The Alphabet Song', status: 'published', views: 1250, updatedAt: '2026-06-14' },
    { id: '2', title: 'Colors Everywhere', status: 'published', views: 890, updatedAt: '2026-06-13' },
    { id: '3', title: 'Counting 1 to 10', status: 'draft', views: 0, updatedAt: '2026-06-12' },
  ];
  function loadCMFromStorage(): CM_VideoContent[] {
    try {
      const raw = localStorage.getItem(CM_STORAGE_KEY);
      if (!raw) return CM_INITIAL_DATA;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return CM_INITIAL_DATA;
        return parsed.filter((x: any) => x && typeof x === 'object' && x.id && x.title);
      }
      return CM_INITIAL_DATA;
    } catch {
      return CM_INITIAL_DATA;
    }
  }
  function saveCMToStorage(list: CM_VideoContent[]) {
    localStorage.setItem(CM_STORAGE_KEY, JSON.stringify(list));
  }
  function syncEpisodeToContentManager(params: {
    id: string;
    title: string;
    videoUrl?: string;
    subtitleUrl?: string;
    subtitleZhUrl?: string;
    vocabularyUrl?: string;
    status?: 'published' | 'draft';
  }): { mode: 'created' | 'updated' } {
    const today = new Date().toISOString().split('T')[0];
    const list = loadCMFromStorage();
    const idx = list.findIndex(x => x.id === params.id);
    const status: 'published' | 'draft' = params.status ?? (params.videoUrl ? 'published' : 'draft');
    if (idx >= 0) {
      const prev = list[idx];
      list[idx] = {
        ...prev,
        title: params.title || prev.title,
        status,
        updatedAt: today,
        videoUrl: prev.videoUrl?.trim() || params.videoUrl || undefined,
        subtitleUrl: prev.subtitleUrl?.trim() || params.subtitleUrl || undefined,
        subtitleZhUrl: prev.subtitleZhUrl?.trim() || params.subtitleZhUrl || undefined,
        vocabularyUrl: prev.vocabularyUrl?.trim() || params.vocabularyUrl || undefined,
        views: prev.views ?? 0,
      };
      saveCMToStorage(list);
      return { mode: 'updated' };
    }
    const vc: CM_VideoContent = {
      id: params.id,
      title: params.title,
      status,
      views: 0,
      updatedAt: today,
      videoUrl: params.videoUrl,
      subtitleUrl: params.subtitleUrl,
      subtitleZhUrl: params.subtitleZhUrl,
      vocabularyUrl: params.vocabularyUrl,
    };
    saveCMToStorage([...list, vc]);
    return { mode: 'created' };
  }

  const confirmPatchEpisode = () => {
    if (!patchConfirm || !importedVocab) return;
    const vocabularyUrl = '';
    const patched = patchEpisode(courses, patchConfirm.seriesId, patchConfirm.episodeId, {
      episodeName: patchConfirm.episodeName,
      vocabularyUrl,
      hasExercise: true,
    });
    setCourses(patched);
    saveLocalOverrides(patched);

    const predict = predictMediaUrlsFromStem();
    const cmResult = syncEpisodeToContentManager({
      id: patchConfirm.episodeId,
      title: `${patchConfirm.seriesName} · ${patchConfirm.episodeName}`,
      videoUrl: predict.videoUrl,
      subtitleUrl: predict.subtitlesEnUrl,
      subtitleZhUrl: predict.subtitlesZhUrl,
      vocabularyUrl: predict.vocabularyUrl,
    });

    setPatchConfirm(null);
    alert(
      `✅ 已写入【${patchConfirm.seriesName} / ${patchConfirm.episodeName}】，并自动同步到内容管理。\n\n` +
      `• 单集（课程资料）：已 patch vocabulary 占位\n` +
      `• 内容管理：${cmResult.mode === 'created' ? '✅ 新增 1 条，去内容列表即可查看' : '✅ 已补全空字段（不覆盖已有值）'}\n\n` +
      `下一步：\n① 点顶部「下载 courses.json」；\n② 把流水线产物（mp4 / VTT / vocabulary.json / audio/）放到 public/media/；\n③ 执行 merge-dist → redeploy；\n④ 刷新 /admin/content 即可在内容管理中直接打开时间轴编辑。`
    );
  };

  const handleSyncToCMAndOpen = () => {
    if (!importedVocab) return;
    const sid = trySeriesAddOrPick();
    if (!sid) {
      alert('请先在 Step 2 底部选择目标系列或填写新建系列名称。');
      return;
    }
    let epId = targetEpisodeId;
    let epName = '';
    if (!epId) {
      if (!newEpisodeName.trim()) {
        epId = `builder_${Date.now()}`;
        const stem = computeVideoStem();
        epName = stem ? stem.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : `新单集 ${new Date().toLocaleDateString()}`;
      } else {
        epId = `builder_ep_${Date.now()}`;
        epName = newEpisodeName.trim();
      }
    } else {
      epName =
        courses.find(s => s.seriesId === sid)?.episodes.find(e => e.episodeId === epId)?.episodeName ||
        `单集 ${epId}`;
    }
    const seriesName = courses.find(s => s.seriesId === sid)?.seriesName || `系列 ${sid}`;

    // 1) 写课程资料 override（保证「课程资料管理」里能看到对应单集）
    const predict = predictMediaUrlsFromStem();
    const patched = patchEpisode(courses, sid, epId, {
      episodeName: epName,
      videoUrl: predict.videoUrl,
      subtitleUrl: predict.subtitlesEnUrl,
      subtitleZhUrl: predict.subtitlesZhUrl,
      vocabularyUrl: predict.vocabularyUrl,
      hasExercise: true,
    });
    setCourses(patched);
    saveLocalOverrides(patched);

    // 2) 同步到内容管理
    const cmResult = syncEpisodeToContentManager({
      id: epId,
      title: `${seriesName} · ${epName}`,
      videoUrl: predict.videoUrl,
      subtitleUrl: predict.subtitlesEnUrl,
      subtitleZhUrl: predict.subtitlesZhUrl,
      vocabularyUrl: predict.vocabularyUrl,
    });

    // 3) 写 TimelineEditor TL_KEY（直接打开就是填好的 4 URL + events）
    try {
      const forEditor = normalizedEventsForEditor();
      const eventsWithAudio = forEditor.map(e => {
        if (e.audioUrl && (e.audioUrl.startsWith('/media/') || e.audioUrl.startsWith('http'))) return e;
        const idxMatch = importedVocab?.events?.findIndex(x => (x.id && x.id === e.id) || (Math.abs(Number(x.time) - Number(e.time)) < 0.25 && String(x.wordEn || '').toLowerCase() === String(e.wordEn || '').toLowerCase()));
        const idx = typeof idxMatch === 'number' && idxMatch >= 0 ? idxMatch : -1;
        if (idx >= 0) {
          const safeWord = String(e.wordEn || `word_${idx}`).replace(/[^A-Za-z0-9_-]/g, '_') || `word_${idx}`;
          return { ...e, audioUrl: `${predict.audioPrefix}word_${String(idx).padStart(2, '0')}_${safeWord}.mp3` };
        }
        return e;
      });
      const TL_KEY = `admin-timeline:${epId}`;
      localStorage.setItem(
        TL_KEY,
        JSON.stringify({
          events: eventsWithAudio,
          videoUrl: predict.videoUrl,
          subtitlesEnUrl: predict.subtitlesEnUrl,
          subtitlesZhUrl: predict.subtitlesZhUrl,
          vocabularyUrl: predict.vocabularyUrl,
          source: 'course-builder-sync-cm',
          stem: computeVideoStem(),
          createdAt: new Date().toISOString(),
        })
      );
      localStorage.setItem(
        PENDING_VOCAB_KEY,
        JSON.stringify({
          source: importVocabFileName || 'course-builder-sync-cm',
          createdAt: new Date().toISOString(),
          payload: importedVocab,
          events: eventsWithAudio,
          md: importedMd || '',
          stem: computeVideoStem(),
          predict,
        })
      );
    } catch (e) {
      console.warn('[CourseBuilder] 写 TL_KEY 失败，继续跳转:', e);
    }

    alert(
      `✅ 一键同步完成（课程资料 ↔ 内容管理 ↔ TimelineEditor）。\n\n` +
      `• 课程资料管理：新增/更新单集 ${epName}\n` +
      `• 内容管理：${cmResult.mode === 'created' ? '新增 1 条，去列表即可查看' : '已补全空字段'}\n` +
      `• TimelineEditor：已预填 4 URL + ${importedVocab?.events?.length || 0} 个生词事件，下一步自动打开。`
    );
    navigate(`/content/edit/${epId}`, { replace: false });
  };

  const handleDownloadCoursesJson = () => {
    downloadCoursesJSON(courses);
  };

  // ===== Render =====
  const stepper = [
    { key: 1, title: '选择视频', icon: VideoIcon },
    { key: 2, title: '参数配置', icon: SettingsIcon },
    { key: 3, title: '生成命令', icon: Clipboard },
    { key: 4, title: '导入产物', icon: FileJson },
    { key: 5, title: '应用落地', icon: SaveIcon },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 text-slate-500 hover:text-slate-700"
            aria-label="back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center flex-wrap">
              <Sparkles className="w-6 h-6 mr-2 text-amber-500" />
              AI 课件制作向导
              <span className="ml-3 text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {serverMode ? '🚀 服务模式 · 一键全自动处理' : 'MVP 剪贴板模式 · 可在系统设置切换服务模式'}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {serverMode
                ? '选视频 → 填参数 → 点一下自动完成（上传本机服务 → 实时进度 → 产物自动导入）→ 一键打开 TimelineEditor 精修。'
                : '选视频 → 填参数 → 复制命令本机跑 → 把产物拖回浏览器 → 一键打开 TimelineEditor 精修 / 写入单集。'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <SettingsIcon className="w-4 h-4 mr-1.5" /> 去系统设置（填 Key / 切音色）
          </button>
          <button
            onClick={handleDownloadCoursesJson}
            className="flex items-center px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4 mr-1.5" /> 下载 courses.json
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <ol className="flex items-start gap-2 flex-wrap">
          {stepper.map((st, idx) => {
            const active = step === st.key;
            const done = step > st.key;
            const Icon = st.icon;
            return (
              <li key={st.key} className="flex items-center flex-1 min-w-[120px]">
                <button
                  onClick={() => setStep(st.key as StepKey)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-50'
                      : done
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                        active
                          ? 'bg-blue-600 text-white'
                          : done
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {done ? <CheckCircle2 className="w-4 h-4" /> : st.key}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-semibold flex items-center gap-1 ${
                          active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-700'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {st.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {canGoNextStep(st.key as StepKey) ? (st.key === 1 ? '已就绪' : done ? '已完成' : '可进入') : '待完成'}
                      </div>
                    </div>
                  </div>
                </button>
                {idx < stepper.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step body */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[360px]">
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <VideoIcon className="w-5 h-5 mr-2 text-blue-600" /> Step 1 · 选择视频来源
            </h2>
            <div className="flex gap-2 border-b border-slate-200">
              {(
                [
                  { k: 'local', label: '本地视频文件', icon: UploadCloud },
                  { k: 'pan', label: '百度网盘路径', icon: FolderInput },
                ] as const
              ).map(t => (
                <button
                  key={t.k}
                  onClick={() => setVideoTab(t.k)}
                  className={`-mb-px flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    videoTab === t.k
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>

            {videoTab === 'local' ? (
              <div className="space-y-4">
                <label
                  className={`block w-full border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                    localFile
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
                  }`}
                >
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setLocalFile(f);
                        // 给 Step3 命令用：第一次默认用文件名提示用户确认
                        if (!localAbsPath) setLocalAbsPath(f.name);
                      }
                    }}
                  />
                  <UploadCloud className="w-10 h-10 mx-auto text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    {localFile ? '✅ ' + localFile.name : '点击选择 / 或把视频拖到这里'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {localFile
                      ? `${(localFile.size / 1024 / 1024).toFixed(1)} MB · 点击此区域可重新选择`
                      : '支持 mp4 / mkv / mov / webm 等常见格式；MVP 阶段会读取绝对路径请在下一步确认。'}
                  </p>
                </label>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    你本机的视频绝对路径（用于生成命令）
                    <span className="text-slate-400 ml-1">
                      例如 D:\Anime\Peppa\S01E01.mp4
                    </span>
                  </label>
                  <input
                    type="text"
                    value={localAbsPath}
                    onChange={e => setLocalAbsPath(e.target.value)}
                    placeholder="填入视频在你电脑上的真实路径，脚本才能找到文件。"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    💡 浏览器出于安全原因不能直接拿到本机路径，所以在这里确认一下；粘贴文件资源管理器地址栏最稳妥。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  百度网盘路径（最终会在命令里作为 --pan-path 传递给脚本）
                </label>
                <input
                  type="text"
                  value={panPath}
                  onChange={e => setPanPath(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                />
                <p className="text-xs text-slate-500">
                  注：MVP 剪贴板模式下脚本需要结合你本机的百度 access_token；若未配置请先通过 Web 端
                  <span className="text-blue-600 mx-1">/auth</span> 绑定。
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <SettingsIcon className="w-5 h-5 mr-2 text-blue-600" /> Step 2 · 流水线参数
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Whisper 语音转写模型
                </label>
                <select
                  value={whisperModel}
                  onChange={e => setWhisperModel(e.target.value as WhisperModel)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {WHISPER_MODELS.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {WHISPER_MODELS.find(m => m.value === whisperModel)?.hint}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  抽取生词数量（3-30）
                </label>
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={wordCount}
                  onChange={e => setWordCount(Math.max(3, Math.min(30, Number(e.target.value) || 12)))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-xs text-slate-500 mt-1">
                  每集建议 8-15 词；过密会打断剧情。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-start p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="w-4 h-4 mr-2 mt-0.5 accent-blue-600"
                  checked={skipTts}
                  onChange={e => setSkipTts(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">跳过 TTS 生成</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    由 H5/小程序端系统原生发音兜底，处理更快。
                  </p>
                </div>
              </label>
              <label className="flex items-start p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="w-4 h-4 mr-2 mt-0.5 accent-blue-600"
                  checked={forceLocal}
                  onChange={e => setForceLocal(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">强制本地抽词</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    即使填了 LLM Key 也只用 TF/停用词，纯离线。
                  </p>
                </div>
              </label>
              <label className="flex items-start p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="w-4 h-4 mr-2 mt-0.5 accent-blue-600"
                  checked={noMkvConvert}
                  onChange={e => setNoMkvConvert(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">跳过 MKV→MP4</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    源视频已是 mp4 时可勾选，节省拷贝时间。
                  </p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2 flex items-start p-3 border border-violet-200 rounded-lg cursor-pointer hover:bg-violet-50 bg-violet-50/40">
                <input
                  type="checkbox"
                  className="w-4 h-4 mr-2 mt-0.5 accent-violet-600"
                  checked={translateZh}
                  onChange={e => setTranslateZh(e.target.checked)}
                />
                <div>
                  <p className="text-sm font-semibold text-violet-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    生成中文字幕（翻译）
                  </p>
                  <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">
                    LLM 优先（已在 Settings 填 Key 则用 SiliconFlow→DeepSeek 链），失败降级到 Argos 本地翻译。翻译结果 1:1 保留每条 cue 的时间戳，C 端字幕 3 档切换即可生效。后台「🧙 自动匹配」会自动按同名 stem 挂上。
                  </p>
                </div>
              </label>
              <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/60">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  字幕翻译用模型 <span className="text-slate-400">（可选）</span>
                </label>
                <input
                  type="text"
                  disabled={!translateZh}
                  value={zhModel}
                  onChange={e => setZhModel(e.target.value)}
                  placeholder="例如：Qwen/Qwen2.5-32B-Instruct"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  留空则走 Settings 里每个 Provider 的默认模型。只有勾选上面的翻译才生效。
                </p>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <Wand2 className="w-4 h-4 mr-1.5 text-violet-600" />
                （可选）预填归属系列 &amp; 单集，最后一键写入
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">系列</label>
                  <select
                    value={targetSeriesId}
                    onChange={e => setTargetSeriesId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">— 不指定，最后一步再选 —</option>
                    {courses.map(s => (
                      <option key={s.seriesId} value={s.seriesId}>
                        {s.seriesName}（{s.episodes.length} 集）
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    若下拉里没有目标系列，可在右侧填写「新建系列名称」。
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">新建系列名称</label>
                  <input
                    type="text"
                    value={newSeriesName}
                    onChange={e => setNewSeriesName(e.target.value)}
                    placeholder="例：小猪佩奇 第三季"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">单集</label>
                  <select
                    value={targetEpisodeId}
                    onChange={e => setTargetEpisodeId(e.target.value)}
                    disabled={!currentSeries}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  >
                    <option value="">— 不指定，最后一步再选 —</option>
                    {(currentSeries?.episodes || []).map(e => (
                      <option key={e.episodeId} value={e.episodeId}>
                        {e.episodeName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">新建单集名称</label>
                  <input
                    type="text"
                    value={newEpisodeName}
                    onChange={e => setNewEpisodeName(e.target.value)}
                    placeholder="例：S03E05 The New Bike"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    系列 &amp; 单集的真实 vocabularyUrl 静态资源 URL 最后写入时需要你手动再填。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <Clipboard className="w-5 h-5 mr-2 text-blue-600" />
              {serverMode ? 'Step 3 · 一键自动处理' : 'Step 3 · 生成并执行流水线命令'}
            </h2>

            {/* 服务模式：进度面板 */}
            {progress && (
              <div className="p-5 rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-blue-900 flex items-center min-w-0">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse mr-2 flex-shrink-0" />
                    <span className="truncate">{progress.message}</span>
                  </p>
                  <span className="text-lg font-mono font-bold text-blue-700">{progress.percent}%</span>
                </div>
                <div className="h-3 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(2, progress.percent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-500">
                    ⏳ 语音识别通常是耗时大头，请保持本机 <code className="bg-slate-100 px-1 rounded">pipeline-server.py</code> 窗口开启。可随时去本机窗口查看完整日志。
                  </p>
                  {serverBusy && (
                    <button
                      onClick={handleCancelTask}
                      className="text-xs px-3 py-1.5 bg-white border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      ✕ 取消任务
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleStep3Generate}
                disabled={serverBusy}
                className="flex items-center px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {serverMode
                  ? serverBusy
                    ? '自动处理中…'
                    : '🚀 一键处理（上传视频 → 自动运行）'
                  : '生成 / 刷新流水线命令'}
              </button>
              {serverMode && !serverBusy && (
                <span className="text-xs text-slate-500">
                  目标服务：<code className="px-1.5 py-0.5 bg-slate-100 rounded">{settings.pipelineServer.url}</code>
                </span>
              )}
              {startResult?.workingDir && !serverMode && (
                <span className="text-xs text-slate-500">
                  建议工作目录：<code className="px-1.5 py-0.5 bg-slate-100 rounded">{startResult.workingDir}</code>
                </span>
              )}
            </div>

            {/* 服务模式：完成面板 */}
            {serverMode && startResult?.mode === 'server' && !progress && (
              <div className="p-5 rounded-xl border border-emerald-300 bg-emerald-50 space-y-3">
                <p className="text-sm font-semibold text-emerald-800 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  🎉 流水线执行完成，产物已自动导入 Step 4（可点击下一步查看）
                </p>
                <div>
                  <p className="text-xs font-semibold text-emerald-700 mb-1.5">📦 产物清单：</p>
                  <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc">
                    {startResult.expectedFiles.map(f => (
                      <li key={f}>
                        <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-100">{f}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                  📁 别忘了把本机 <code>{startResult.workingDir}</code> 下的
                  <code className="mx-1">{startResult.stem}*.mp4 / _*.vtt / _vocabulary.json / _audio/</code>
                  复制到托管目录 <code>admin-web/public/media/</code>（或对象存储），前端才能播放。
                </p>
              </div>
            )}

            {/* 剪贴板模式：命令面板 */}
            {!serverMode && startResult?.command && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-slate-600 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-500" />
                    MVP 剪贴板模式：请复制下面的命令到你本机终端（PowerShell 推荐）执行。
                    执行完成后回到 Step4 导入产物。
                  </p>
                  <button
                    onClick={handleCopyCmd}
                    className={`flex items-center px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      copiedCmd
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {copiedCmd ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> 复制全部命令
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-slate-50 rounded-lg overflow-x-auto text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
                  {startResult.command}
                </pre>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">📋 期望产物（执行成功后请检查）：</p>
                  <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc">
                    {startResult.expectedFiles.map(f => (
                      <li key={f}>
                        <code className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{f}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <FileJson className="w-5 h-5 mr-2 text-blue-600" /> Step 4 · 导入脚本产物
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block w-full p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors border-slate-300 hover:border-blue-400 hover:bg-blue-50/40">
                <input
                  ref={fileInputJson}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleVocabFile(f);
                  }}
                />
                <FileJson className="w-9 h-9 mx-auto text-slate-400" />
                <p className="text-sm font-semibold mt-3 text-slate-800 text-center">
                  ① 导入 <code>*_vocabulary.json</code>（必需）
                </p>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  {importVocabFileName ? '已选择：' + importVocabFileName : '点此选择 / 拖放 JSON 文件'}
                </p>
              </label>

              <label className="block w-full p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors border-slate-300 hover:border-blue-400 hover:bg-blue-50/40">
                <input
                  ref={fileInputMd}
                  type="file"
                  accept=".md,.txt,text/markdown"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleMdFile(f);
                  }}
                />
                <FileText className="w-9 h-9 mx-auto text-slate-400" />
                <p className="text-sm font-semibold mt-3 text-slate-800 text-center">
                  ② 导入 <code>*_vocabulary.md</code>（可选）
                </p>
                <p className="text-xs text-slate-500 mt-1 text-center">
                  {importedMd ? `已读取 ${importedMd.length} 字符 MD，TimelineEditor 里可二次合并。` : '给 TimelineEditor 导入表格用，不选也可以。'}
                </p>
              </label>
            </div>

            {importedVocab && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <p className="text-sm font-semibold text-emerald-800 flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  vocabulary JSON 读取成功
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded bg-white/70 border border-emerald-100">
                    <div className="text-slate-500">事件总数</div>
                    <div className="text-slate-900 font-semibold">{eventStats.total}</div>
                  </div>
                  <div className="p-2 rounded bg-white/70 border border-emerald-100">
                    <div className="text-slate-500">缺中文词数</div>
                    <div className={`font-semibold ${eventStats.missingZh > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {eventStats.missingZh}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white/70 border border-emerald-100 col-span-2">
                    <div className="text-slate-500">首 3 词预览</div>
                    <div className="text-slate-900 font-semibold truncate">
                      {eventStats.sample
                        .map(e => `${e.wordEn}${e.wordZh ? `(${e.wordZh})` : ''}@${e.time.toFixed(1)}s`)
                        .join('  ·  ') || '（无）'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-slate-900 flex items-center">
              <SaveIcon className="w-5 h-5 mr-2 text-blue-600" /> Step 5 · 应用产物（4 选 1，推荐 ④）
            </h2>

            <button
              onClick={handleSyncToCMAndOpen}
              disabled={!canGoNextStep(4)}
              className="w-full group text-left p-6 rounded-2xl border-2 border-violet-400 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-blue-50 hover:border-violet-600 hover:shadow-lg hover:shadow-violet-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start">
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 p-2.5 rounded-xl mr-4 shadow-md">
                  <Wand2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-bold text-slate-900 group-hover:text-violet-800 flex items-center">
                    ④ 🎉 一键同步（课程资料 ↔ 内容管理 ↔ 时间轴编辑器）<span className="ml-2 text-xs px-2 py-0.5 bg-violet-600 text-white rounded-full">推荐</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                    一次性打通所有存储链路，不用你再做任何手工同步：
                  </p>
                  <ul className="mt-2 text-xs text-slate-600 space-y-1 pl-5 list-disc">
                    <li>写入课程资料管理（courses.json override），挂好 4 个预测 URL</li>
                    <li>同步写入 <b>内容管理列表</b>（id 直接用 episodeId，和 TimelineEditor 兜底对齐）</li>
                    <li>预填 TimelineEditor 3/4 URL + {importedVocab?.events?.length || 0} 个生词事件，点击后立即打开精修</li>
                  </ul>
                </div>
              </div>
            </button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={handleOpenTimeline}
                disabled={!canGoNextStep(4)}
                className="group text-left p-5 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700 flex items-center">
                  <Wand2 className="w-5 h-5 mr-2 text-violet-600" />
                  ① 🎬 仅打开 TimelineEditor 精修
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  只把导入的生词事件写入「暂存槽」，自动打开 AI 动画交互编辑器。
                  你可以在那里调整气泡位置/时间点/音频，并最终一键「导出 vocabulary JSON」。
                </p>
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ 不会写入课程资料管理 / 内容管理列表，需要你自己后续同步。
                </p>
              </button>

              <button
                onClick={openPatchConfirm}
                disabled={!canGoNextStep(4)}
                className="group text-left p-5 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700 flex items-center">
                  <SaveIcon className="w-5 h-5 mr-2 text-blue-600" />
                  ② 📚 直接写入单集（+ 同步到内容管理）
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  选一个系列/单集（或新建），vocabulary 写入浏览器本地 courses.json。
                </p>
                <p className="text-xs text-emerald-700 mt-2">
                  ✅ 现在会自动同步到「内容管理」列表（补全 4 URL，按 episodeId 去重）。
                </p>
              </button>

              <div className="p-5 rounded-xl border-2 border-slate-200 bg-slate-50 space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center">
                  <Download className="w-5 h-5 mr-2 text-slate-700" />
                  ③ 💾 仅导出（剪贴板/下载）
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  只把当前 vocabulary 导出来，稍后手动填 URL / 手动同步。
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleCopyJsonOnly}
                    disabled={!canGoNextStep(4)}
                    className="text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    复制 vocabulary JSON
                  </button>
                  <button
                    onClick={handleDownloadVocab}
                    disabled={!canGoNextStep(4)}
                    className="text-xs px-3 py-1.5 bg-slate-900 rounded-md text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下载 vocabulary JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部导航按钮 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(s => Math.max(1, (s - 1)) as StepKey)}
          disabled={step <= 1}
          className="flex items-center px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> 上一步
        </button>
        <div className="text-xs text-slate-400">
          Step {step} / {stepper.length}
        </div>
        <button
          onClick={() => setStep(s => Math.min(5, (s + 1)) as StepKey)}
          disabled={!canGoNextStep(step)}
          className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          下一步 <ArrowRight className="w-4 h-4 ml-1.5" />
        </button>
      </div>

      {/* patchEpisode 确认 dialog（MVP 原生 confirm 的增强版） */}
      {patchConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start">
              <div className="bg-blue-100 p-2 rounded-xl mr-3">
                <SaveIcon className="w-5 h-5 text-blue-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">确认写入单集</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  将会把 vocabulary 写入到：
                  <br />
                  系列：<span className="font-medium text-slate-800">{patchConfirm.seriesName}</span>
                  <br />
                  单集：<span className="font-medium text-slate-800">{patchConfirm.episodeName}</span>
                </p>
                <p className="text-xs text-amber-600 mt-2 leading-relaxed">
                  🔔 MVP 说明：courses.json 只写入「占位」，vocabularyUrl 的静态 URL 需要你把
                  vocabulary JSON / VTT / audio 资源放到托管（如 client-web/public/media/ 或对象存储）后，
                  再在课程资料管理中粘贴一次。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPatchConfirm(null)}
                className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmPatchEpisode}
                className="px-4 py-2 text-sm bg-blue-600 rounded-md text-white hover:bg-blue-700 font-medium"
              >
                确认写入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
