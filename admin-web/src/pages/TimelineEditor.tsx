import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Play, Save, Trash2, Crosshair, Volume2, Upload, Download, FileJson } from 'lucide-react';
import { loadAllCourses, type CourseMaterial } from '@/lib/coursesDataLayer';
import { filterNounVerbOnly } from '@/lib/vocabFilter';

export interface TimelineEvent {
  id: string;
  time: number;
  wordEn: string;
  wordZh: string;
  imageUrl: string;
  audioUrl: string;
  coordX: number;
  coordY: number;
}

const DEFAULT_VIDEO_URL = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4";
const PENDING_VOCAB_KEY = 'admin-builder:pending-vocab-v1';

function stemFromAny(v: string): string {
  if (!v) return '';
  const name = v.split(/[\\/]/).filter(Boolean).pop() || '';
  const noExt = name.replace(/\.[^.]+$/, '');
  return noExt
    .replace(/_en$/i, '')
    .replace(/_zh$/i, '')
    .replace(/_vocabulary$/i, '')
    .replace(/_audio$/i, '');
}

const PENDING_IMPORTED_ALREADY = 'admin-timeline:pending-imported';

export default function TimelineEditor() {
  const { id = 'untitled' } = useParams();
  const navigate = useNavigate();
  const TL_STORAGE_KEY = `admin-timeline:${id}`;
  const [allCourses, setAllCourses] = useState<CourseMaterial[]>([]);
  useEffect(() => {
    (async () => {
      try { setAllCourses(await loadAllCourses()); } catch (e) { /* ignore */ }
    })();
  }, []);

  const loadTimelineInit = () => {
    let initEvents: TimelineEvent[] = [];
    let initVideo = DEFAULT_VIDEO_URL;
    let initEn = '';
    let initZh = '';
    let pendingToImportEvents: TimelineEvent[] | null = null;
    let pendingSource: string | null = null;
    let pendingCount = 0;

    // 优先级 1：读自己的 TL_KEY（CourseBuilder 现在跳转前已写好）
    try {
      const raw = localStorage.getItem(TL_STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        initEvents = Array.isArray(obj.events) ? obj.events : [];
        initVideo = typeof obj.videoUrl === 'string' && obj.videoUrl ? obj.videoUrl : DEFAULT_VIDEO_URL;
        initEn = typeof obj.subtitlesEnUrl === 'string' ? obj.subtitlesEnUrl : '';
        initZh = typeof obj.subtitlesZhUrl === 'string' ? obj.subtitlesZhUrl : '';
      }
    } catch { /* ignore */ }

    // 优先级 2：如果 TL_KEY 里没有 URL，就按 PENDING_VOCAB_KEY.stem 推 /media/{stem}.*，并把 pending events 合并进 initEvents
    const needDefault = initVideo === DEFAULT_VIDEO_URL || initVideo.trim() === '';
    if (needDefault) {
      try {
        const pendingRaw = localStorage.getItem(PENDING_VOCAB_KEY);
        if (pendingRaw) {
          const parsed = JSON.parse(pendingRaw);
          // 如果已经处理过 pending（页面刷新），避免反复重复导入
          const imported = JSON.parse(localStorage.getItem(PENDING_IMPORTED_ALREADY) || '[]');
          const pendingCid = `${parsed.createdAt || ''}__${parsed.source || ''}`;
          if (!imported.includes(pendingCid)) {
            const evts = parsed?.events;
            if (Array.isArray(evts) && evts.length > 0) {
              pendingToImportEvents = evts
                .map((e: any) => ({
                  id: e.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  time: Number(Number(e.time).toFixed(1)) || 0,
                  wordEn: e.wordEn || '',
                  wordZh: e.wordZh || '',
                  imageUrl: e.imageUrl || '',
                  audioUrl: e.audioUrl || '',
                  coordX: typeof e.coordX === 'number' ? e.coordX : 50,
                  coordY: typeof e.coordY === 'number' ? e.coordY : 25,
                }))
                .filter((e: TimelineEvent) => !!e.wordEn);
              pendingCount = pendingToImportEvents.length;
              pendingSource = parsed.source || '课件制作向导';
            }
          }
          // 根据 pending.predict 或 stem，推出默认 4 个 URL（和流水线文件名约定对齐）
          if (parsed?.predict && typeof parsed.predict === 'object') {
            const p = parsed.predict;
            if (needDefault && (initVideo === DEFAULT_VIDEO_URL || initVideo === '')) initVideo = p.videoUrl || DEFAULT_VIDEO_URL;
            if (!initEn) initEn = p.subtitlesEnUrl || '';
            if (!initZh) initZh = p.subtitlesZhUrl || '';
          } else if (parsed?.stem && typeof parsed.stem === 'string') {
            const stem = parsed.stem;
            if (needDefault) initVideo = `/media/${stem}.mp4`;
            if (!initEn) initEn = `/media/${stem}_en.vtt`;
            if (!initZh) initZh = `/media/${stem}_zh.vtt`;
          }
        }
      } catch { /* ignore */ }
    }

    // 优先级 3：TL_KEY + PENDING 都没有 URL → 在 coursesDataLayer 里按 id 找 episode（如果它是 episodeId）
    // 或者按 seriesId/episodeId metadata 猜 stem → /media/{stem}.*
    const stillNeedDefault = initVideo === DEFAULT_VIDEO_URL || initVideo.trim() === '';
    if (stillNeedDefault && allCourses.length > 0) {
      let matched: any = null;
      outer: for (const s of allCourses) {
        for (const ep of s.episodes || []) {
          if (ep.episodeId === id) { matched = ep; break outer; }
        }
      }
      if (matched) {
        if (typeof matched.videoUrl === 'string' && matched.videoUrl) initVideo = matched.videoUrl;
        if (!initEn && typeof matched.subtitleUrl === 'string') initEn = matched.subtitleUrl;
        if (!initZh && typeof matched.subtitleZhUrl === 'string') initZh = matched.subtitleZhUrl;
        // 如果 courseData 里 4 URL 都空，就按 seriesName / episodeName 归一化成 stem
        const stillNeed = initVideo === DEFAULT_VIDEO_URL || !initVideo;
        if (stillNeed) {
          const nameCandidates = [matched.episodeName, matched.episodeId].filter(Boolean);
          if (nameCandidates.length === 0) nameCandidates.push('output');
          const best = nameCandidates[0] || 'output';
          const stem = best
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
            .replace(/^_+|_+$/g, '');
          initVideo = `/media/${stem}.mp4`;
          if (!initEn) initEn = `/media/${stem}_en.vtt`;
          if (!initZh) initZh = `/media/${stem}_zh.vtt`;
        }
      } else {
        // 仍兜底：按 ContentManager 里的内容 id 如果 title 有数字线索，仍默认 /media/output.*
        const stem = stemFromAny(initVideo || '') || (id.startsWith('builder_') ? 'output' : String(id).replace(/[^a-z0-9]/gi, '_'));
        if (stem && stem !== 'output') {
          if (!initEn) initEn = `/media/${stem}_en.vtt`;
          if (!initZh) initZh = `/media/${stem}_zh.vtt`;
        }
      }
    }

    // 合并 pending 事件（防止重复导入）
    if (pendingToImportEvents && pendingToImportEvents.length > 0) {
      const seen = new Set<string>(initEvents.map(e => e.id));
      for (const e of pendingToImportEvents) if (!seen.has(e.id)) initEvents.push(e);
      initEvents.sort((a, b) => a.time - b.time);
      // 持久化 pending 导入状态
      try {
        const pendingRaw2 = localStorage.getItem(PENDING_VOCAB_KEY);
        const p2 = JSON.parse(pendingRaw2 || '{}');
        const cid = `${p2.createdAt || ''}__${p2.source || ''}`;
        const importedArr = JSON.parse(localStorage.getItem(PENDING_IMPORTED_ALREADY) || '[]');
        importedArr.push(cid);
        localStorage.setItem(PENDING_IMPORTED_ALREADY, JSON.stringify(importedArr.slice(-30)));
      } catch { /* ignore */ }
    }

    // 💥 统一 POS 过滤：只保留名词 + 动词（和 Python 流水线算法对齐）
    initEvents = filterNounVerbOnly(initEvents as any[]);

    return { initEvents, initVideo, initEn, initZh, pendingSource, pendingCount };
  };

  const {
    initEvents,
    initVideo,
    initEn,
    initZh,
    pendingSource,
    pendingCount,
  } = loadTimelineInit();

  // States
  const [events, setEvents] = useState<TimelineEvent[]>(initEvents);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [activePreview, setActivePreview] = useState<TimelineEvent | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggeredIds = useRef<Set<string>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playCountRef = useRef(0);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 视频配置状态
  const [videoUrl, setVideoUrl] = useState(initVideo);
  const [subtitlesEnUrl, setSubtitlesEnUrl] = useState(initEn);
  const [subtitlesZhUrl, setSubtitlesZhUrl] = useState(initZh);

  useEffect(() => {
    if (allCourses.length === 0) return;
    const stillNeedVideo = !videoUrl || videoUrl === DEFAULT_VIDEO_URL;
    const stillNeedEn = !subtitlesEnUrl;
    const stillNeedZh = !subtitlesZhUrl;
    if (!stillNeedVideo && !stillNeedEn && !stillNeedZh) return;

    let matched: any = null;
    outer: for (const s of allCourses) {
      for (const ep of s.episodes || []) {
        if (ep.episodeId === id) { matched = ep; break outer; }
      }
    }
    if (!matched) return;

    let nextVideo = videoUrl;
    let nextEn = subtitlesEnUrl;
    let nextZh = subtitlesZhUrl;

    if (stillNeedVideo && typeof matched.videoUrl === 'string' && matched.videoUrl) nextVideo = matched.videoUrl;
    if (stillNeedEn && typeof matched.subtitleUrl === 'string') nextEn = matched.subtitleUrl;
    if (stillNeedZh && typeof matched.subtitleZhUrl === 'string') nextZh = matched.subtitleZhUrl;

    const stillNeed = nextVideo === DEFAULT_VIDEO_URL || !nextVideo;
    if (stillNeed) {
      const nameCandidates = [matched.episodeName, matched.episodeId].filter(Boolean);
      if (nameCandidates.length === 0) nameCandidates.push('output');
      const stem = (nameCandidates[0] || 'output')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (stem) {
        nextVideo = `/media/${stem}.mp4`;
        if (!nextEn) nextEn = `/media/${stem}_en.vtt`;
        if (!nextZh) nextZh = `/media/${stem}_zh.vtt`;
      }
    }

    if (nextVideo !== videoUrl) setVideoUrl(nextVideo);
    if (nextEn !== subtitlesEnUrl) setSubtitlesEnUrl(nextEn);
    if (nextZh !== subtitlesZhUrl) setSubtitlesZhUrl(nextZh);
  }, [allCourses, id, videoUrl, subtitlesEnUrl, subtitlesZhUrl]);

  // 拦截视频 URL，如果是百度网盘的 CDN 地址，则进行代理转换
  const getProxiedVideoUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('baidupcs.com')) {
      try {
        const urlObj = new URL(url);
        // 将真正的 CDN 域名（例如 xafj-ct11.baidupcs.com）替换为本地代理前缀
        return `/api/baidu-cdn${urlObj.pathname}${urlObj.search}`;
      } catch (e) {
        return url;
      }
    }
    return url;
  };

  // 播放音频（优先使用自定义音频，否则使用机器合成），支持指定播放次数
  const playAudio = (event: TimelineEvent, playCount: number = 3) => {
    playCountRef.current = playCount;

    // 停止可能正在播放的声音
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
    }

    const playNext = () => {
      if (playCountRef.current <= 0) return;
      playCountRef.current--;

      if (event.audioUrl) {
        const audio = new Audio(event.audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => {
          if (playCountRef.current > 0) {
            audioTimeoutRef.current = setTimeout(playNext, 800); // 间隔800ms后播放下一遍
          }
        };
        audio.play().catch(e => console.error("Audio play failed:", e));
      } else if (event.wordEn && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(event.wordEn);
        utterance.lang = 'en-US';
        utterance.rate = 0.85; // 稍微放慢语速适合儿童
        utterance.onend = () => {
          if (playCountRef.current > 0) {
            audioTimeoutRef.current = setTimeout(playNext, 800); // 间隔800ms后播放下一遍
          }
        };
        window.speechSynthesis.speak(utterance);
      }
    };

    playNext();
  };

  // Handle video time update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Simulation logic (只有在没有激活的气泡时才触发)
    if (isPreviewing && !activePreview) {
      events.forEach(event => {
        if (Math.abs(time - event.time) <= 0.2 && !triggeredIds.current.has(event.id)) {
          triggerPreviewBubble(event);
        }
      });
    }
  };

  const triggerPreviewBubble = (event: TimelineEvent) => {
    triggeredIds.current.add(event.id);
    setActivePreview(event);
    
    // 暂停视频
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // 自动发音
    playAudio(event);
  };

  const resumeVideo = () => {
    setActivePreview(null);
    playCountRef.current = 0; // 取消后续播放计划
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);

    if (videoRef.current) {
      videoRef.current.play();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const startSimulation = () => {
    if (!videoRef.current) return;
    setIsPreviewing(true);
    triggeredIds.current.clear();
    setActivePreview(null);
    
    playCountRef.current = 0;
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentAudioRef.current) currentAudioRef.current.pause();
    
    videoRef.current.currentTime = 0;
    videoRef.current.play();
  };

  const addEvent = () => {
    const newEvent: TimelineEvent = {
      id: `evt_${Date.now()}`,
      time: Number(currentTime.toFixed(1)),
      wordEn: '',
      wordZh: '',
      imageUrl: '',
      audioUrl: '',
      coordX: 50,
      coordY: 20
    };
    
    const newEvents = [...events, newEvent].sort((a, b) => a.time - b.time);
    setEvents(newEvents);
  };

  const updateEvent = (id: string, field: keyof TimelineEvent, value: string | number) => {
    setEvents(events.map(evt => 
      evt.id === id ? { ...evt, [field]: value } : evt
    ).sort((a, b) => a.time - b.time));
  };

  const removeEvent = (id: string) => {
    setEvents(events.filter(evt => evt.id !== id));
  };

  const seekAndPlay = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const handleSave = () => {
    const payload = {
      videoUrl,
      subtitlesEnUrl,
      subtitlesZhUrl,
      events,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(TL_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('保存 timeline 到 localStorage 失败：', e);
    }
    console.log('Saved Timeline Data:', JSON.stringify(payload, null, 2));
    alert(
      `✅ 已保存（浏览器本地持久化，刷新页面不丢失）\n\n` +
      `交互点数量：${events.length}\n` +
      `当前视频 ID：${id}\n\n` +
      `📢 若要发布到 C 端和小程序，请点击顶栏「导出词汇表 JSON」，然后把生成的 URL 填到 courses.json 对应单集的 vocabularyUrl 字段并重新部署。`
    );
  };

  const buildVocabularyPayload = () => ({
    version: 1,
    meta: {
      format: 'kids-cartoon.vocabulary.v1',
      description: '生词气泡时间轴事件（H5 TimelineEvent & 小程序 CourseEvent 通用）',
      generatedAt: new Date().toISOString(),
      videoId: id,
    },
    events: events.map(e => ({
      id: e.id,
      time: Number(Number(e.time).toFixed(1)),
      wordEn: e.wordEn,
      wordZh: e.wordZh,
      imageUrl: e.imageUrl || '',
      audioUrl: e.audioUrl || '',
      coordX: Number(e.coordX) || 50,
      coordY: Number(e.coordY) || 25,
    })).sort((a, b) => a.time - b.time),
  });

  const safeName = (name: string) => String(name || '').replace(/[\\/:*?"<>|\s]+/g, '_');

  const handleExportJson = () => {
    const payload = buildVocabularyPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const base = safeName(id || `vocabulary_${Date.now()}`);
    a.download = `${base}_vocabulary.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const handleCopyJsonToClipboard = async () => {
    try {
      const payload = buildVocabularyPayload();
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('词汇表 JSON 已复制到剪贴板！\n可直接粘贴到课程资料管理的 vocabulary JSON URL 上传文本框，或保存为 .json 文件托管到 public/media/。');
    } catch (err) {
      alert('复制失败，请改用「导出 JSON」按钮下载文件。');
    }
  };

  // 处理 Markdown 导入
  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      // 简单的 Markdown 表格解析
      // 假设格式为: | 触发时间(s) | 英文单词 | 中文释义 | X坐标 | Y坐标 |
      const lines = content.split('\n');
      const newEvents: TimelineEvent[] = [];
      let isTable = false;

      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
          if (trimmedLine.includes('---')) {
            isTable = true; // 遇到表头分隔线，开始解析数据
            return;
          }
          if (isTable) {
            const columns = trimmedLine.split('|').map(col => col.trim()).filter(col => col !== '');
            if (columns.length >= 3) {
              const time = parseFloat(columns[0]) || 0;
              const wordEn = columns[1] || '';
              const wordZh = columns[2] || '';
              const coordX = columns.length >= 4 ? parseFloat(columns[3]) : 50;
              const coordY = columns.length >= 5 ? parseFloat(columns[4]) : 20;

              if (wordEn) {
                newEvents.push({
                  id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  time,
                  wordEn,
                  wordZh,
                  imageUrl: '',
                  audioUrl: '',
                  coordX: isNaN(coordX) ? 50 : coordX,
                  coordY: isNaN(coordY) ? 20 : coordY,
                });
              }
            }
          }
        }
      });

      if (newEvents.length > 0) {
        // 💥 导入前先过 POS 名动过滤
        const filtered = filterNounVerbOnly(newEvents as any[]);
        setEvents(prev => [...prev, ...filtered].sort((a, b) => a.time - b.time));
        if (filtered.length !== newEvents.length) {
          alert(`✅ 导入成功：解析出 ${newEvents.length} 个生词 → 保留 ${filtered.length} 个名词/动词（已自动过滤形容词/副词/介词/助动词等）。`);
        } else {
          alert(`成功导入 ${newEvents.length} 个生词节点！`);
        }
      } else {
        alert('未能从文件中解析出有效的生词数据，请检查 Markdown 格式是否正确。');
      }
    };
    reader.readAsText(file);
    // 清空 input value，以便重复导入同一个文件
    if (e.target) e.target.value = '';
  };

  const PENDING_VOCAB_KEY = 'admin-builder:pending-vocab-v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_VOCAB_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const events = parsed?.events;
      if (pendingCount <= 0 && (typeof pendingSource === 'string' && pendingSource.length > 0)) {
        // 重复导入（刷新页面后 pending 已经合并到 initEvents），但仍然给用户提示一次
        setTimeout(() => {
          alert(`ℹ️  已检测到「${pendingSource}」的生词事件，但已在初始化时加载完成（如之前已导入请忽略此提示）。`);
        }, 220);
      } else if (pendingCount > 0) {
        setTimeout(() => {
          alert(
            `✅ 已从「${pendingSource || '课件制作向导'}」自动导入 ${pendingCount} 个生词事件，并预填了视频 / 英字幕 / 中字幕 3 个默认 URL。\n\n请在下方精修后「导出 vocabulary JSON」并填回 courses.json 对应单集。`
          );
        }, 120);
      }
    } catch (e: any) {
      console.warn('[TimelineEditor] 导入 pending-vocab 失败：', e);
    } finally {
      // 无论成功失败都清理，防止反复导入
      try { localStorage.removeItem(PENDING_VOCAB_KEY); } catch {}
    }
  }, [pendingSource, pendingCount]);

  useEffect(() => {
    return () => {
      playCountRef.current = 0;
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
      
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-shrink-0">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/content')}
            className="mr-4 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI 动画交互编辑器</h1>
            <p className="text-sm text-slate-500">正在编辑视频 ID: {id}</p>
          </div>
        </div>
        <div className="flex space-x-3 flex-wrap gap-2">
          <label className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium cursor-pointer border border-emerald-200">
            <Upload className="w-4 h-4 mr-2" />
            导入词汇表 (MD)
            <input 
              type="file" 
              accept=".md,.txt" 
              className="hidden" 
              onChange={handleImportMarkdown} 
            />
          </label>
          <button
            onClick={handleCopyJsonToClipboard}
            className="flex items-center px-4 py-2 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium border border-slate-200"
          >
            <FileJson className="w-4 h-4 mr-2" />
            复制词汇表 JSON
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center px-4 py-2 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors font-medium border border-violet-200"
          >
            <Download className="w-4 h-4 mr-2" />
            导出词汇表 JSON
          </button>
          <button 
            onClick={startSimulation}
            className="flex items-center px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium"
          >
            <Play className="w-4 h-4 mr-2" />
            AI 模拟预览
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            保存并发布
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 w-full">
        {/* Left: Video Player */}
        <div className="flex-[3] min-h-0 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="relative bg-black aspect-video w-full flex-shrink-0">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              crossOrigin="anonymous"
              src={getProxiedVideoUrl(videoUrl)}
              onTimeUpdate={handleTimeUpdate}
            >
              {subtitlesEnUrl && (
                <track 
                  kind="subtitles" 
                  src={subtitlesEnUrl} 
                  srcLang="en" 
                  label="English" 
                  default 
                />
              )}
              {subtitlesZhUrl && (
                <track 
                  kind="subtitles" 
                  src={subtitlesZhUrl} 
                  srcLang="zh" 
                  label="中文" 
                />
              )}
            </video>
            
            {/* Preview Bubble */}
            {activePreview && (
              <div 
                className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-white/5 backdrop-blur-md px-8 py-6 rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.15)] border-2 border-white/60 pointer-events-auto animate-in zoom-in flex flex-col items-center gap-4 z-10"
                style={{ 
                  left: `${activePreview.coordX}%`, 
                  top: `${activePreview.coordY}%`,
                  marginLeft: '3cm',
                  marginTop: '2cm'
                }}
              >
                {activePreview.imageUrl && (
                  <img src={activePreview.imageUrl} alt="preview" className="w-24 h-24 object-contain drop-shadow-md" />
                )}
                <div className="text-center flex flex-col items-center">
                  <div className="flex items-center gap-3">
                    <div className="font-black text-4xl text-rose-500 tracking-wide" style={{ WebkitTextStroke: '1px white' }}>
                      {activePreview.wordEn || 'English'}
                    </div>
                    <button 
                      onClick={() => playAudio(activePreview)}
                      className="bg-blue-100 text-blue-600 p-2 rounded-full hover:bg-blue-200 hover:scale-110 transition-all cursor-pointer shadow-sm flex-shrink-0"
                      title="播放发音"
                    >
                      <Volume2 className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="font-bold text-2xl text-blue-500 mt-2">
                    {activePreview.wordZh || '中文'}
                  </div>
                </div>
                
                <button 
                  onClick={resumeVideo}
                  className="mt-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-8 rounded-full shadow-lg active:scale-95 transition-transform text-lg w-full"
                >
                  继续播放
                </button>
              </div>
            )}
          </div>
          
          <div className="p-6 flex-1 flex flex-col bg-slate-50 border-t border-slate-200 overflow-y-auto">
            <div className="flex justify-center mb-6">
              <button 
                onClick={addEvent}
                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-transform active:scale-95 shadow-md font-medium text-lg"
              >
                <Plus className="w-6 h-6 mr-2" />
                添加交互点 (当前时间: {currentTime.toFixed(1)}s)
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm border-b pb-2">视频与字幕配置</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">视频源文件 URL</label>
                <input 
                  type="text" 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="例如：/media/Lets_Hold_Hands_Penelope.mp4  或  https://cdn.example.com/xxx.mp4"
                />
                <div className="mt-2 space-y-2">
                  {(
                    /^[a-zA-Z]:[\\/]/.test(videoUrl.trim()) ||
                    videoUrl.trim().startsWith('file://') ||
                    videoUrl.split(/[\\/]/).some((seg) => /^[a-zA-Z]$/.test(seg))
                  ) && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      <div className="font-semibold mb-1">⚠️ 检测到本地磁盘路径，浏览器无法直接播放</div>
                      <div className="mb-2 leading-relaxed">
                        你填的是 <code className="bg-amber-100 px-1 rounded">{videoUrl}</code>。
                        线上服务器没有你的 D 盘，<span className="font-medium">请把视频放到项目里再部署</span>。
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {(() => {
                          const m = videoUrl.match(/([^\\/]+?\.(mp4|mov|m4v|webm|mkv))\s*$/i);
                          const suggested = m ? `/media/${m[1]}` : '';
                          return suggested ? (
                            <>
                              <span className="text-amber-700">推荐线上地址：</span>
                              <code className="bg-white border border-amber-200 px-2 py-1 rounded text-amber-900">{suggested}</code>
                              <button
                                type="button"
                                onClick={() => setVideoUrl(suggested)}
                                className="ml-auto inline-flex items-center px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                              >
                                一键替换成这个地址
                              </button>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  )}
                  <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 leading-relaxed">
                    <div className="font-semibold mb-1">💡 正确的填写姿势</div>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-800/90">
                      <li>把 mp4 丢到 <code className="bg-white px-1 rounded border border-blue-200">scripts/</code> 目录（和课件脚本一起）</li>
                      <li>在项目根目录运行 <code className="bg-white px-1 rounded border border-blue-200">node scripts/merge-dist.js</code>（它会自动把 mp4 拷到 public/media）</li>
                      <li>重新部署后，这里填 <code className="bg-white px-1 rounded border border-blue-200">/media/你的文件名.mp4</code> 就能在线播放了</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">英文字幕文件 URL (.vtt)</label>
                  <input 
                    type="text" 
                    value={subtitlesEnUrl}
                    onChange={(e) => setSubtitlesEnUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="https://.../en.vtt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">中文字幕文件 URL (.vtt)</label>
                  <input 
                    type="text" 
                    value={subtitlesZhUrl}
                    onChange={(e) => setSubtitlesZhUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="https://.../zh.vtt"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">注：推荐使用 WebVTT (.vtt) 格式。如果跨域，请确保字幕服务器配置了 CORS 跨域规则。</p>
            </div>
          </div>
        </div>

        {/* Right: Timeline Events */}
        <div className="flex-[2] min-h-0 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-900">交互节点列表 ({events.length})</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Crosshair className="w-12 h-12 mb-3 text-slate-300" />
                <p>暂无交互点，请在左侧添加</p>
              </div>
            ) : (
              events.map((event, index) => (
                <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative group">
                  <div className="absolute -left-2 top-4 w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-sm" />
                  
                  <div className="ml-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                        触发时间: {event.time.toFixed(1)}s
                      </span>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => seekAndPlay(event.time)}
                          className="text-xs px-2 py-1 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                        >
                          定位播放
                        </button>
                        <button 
                          onClick={() => removeEvent(event.id)}
                          className="text-xs px-2 py-1 text-rose-600 bg-rose-50 rounded hover:bg-rose-100 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">英文单词 (English)</label>
                          <input 
                            type="text" 
                            value={event.wordEn}
                            onChange={(e) => updateEvent(event.id, 'wordEn', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="例如: Apple"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">中文释义 (Chinese)</label>
                          <input 
                            type="text" 
                            value={event.wordZh}
                            onChange={(e) => updateEvent(event.id, 'wordZh', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="例如: 苹果"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">卡通图片 URL (可选)</label>
                        <input 
                          type="text" 
                          value={event.imageUrl}
                          onChange={(e) => updateEvent(event.id, 'imageUrl', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="输入图片链接，例如: https://.../apple.png"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">留空则不显示图片。可填入卡通风格插图URL。</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">自定义发音音频 URL (可选)</label>
                        <input 
                          type="text" 
                          value={event.audioUrl}
                          onChange={(e) => updateEvent(event.id, 'audioUrl', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="输入音频链接，例如: https://.../apple.mp3"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">留空则使用系统自带的机器合成发音。</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">X坐标(%)</label>
                          <input 
                            type="number" 
                            min="0" max="100"
                            value={event.coordX}
                            onChange={(e) => updateEvent(event.id, 'coordX', Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Y坐标(%)</label>
                          <input 
                            type="number" 
                            min="0" max="100"
                            value={event.coordY}
                            onChange={(e) => updateEvent(event.id, 'coordY', Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
