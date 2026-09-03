import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { EpisodeFile } from '../store/types';
import { resolveRedirect, getProxiedVideoUrl } from '../lib/baiduApi';
import {
  getEpisodeMaterial,
  getCourseDetail,
  type EpisodeMaterial,
  loadVocabularyEvents,
  type VocabularyEvent,
} from '../lib/courseApi';
import {
  ArrowLeft, Play, Pause, Volume2, Maximize,
  CheckCircle2, BookOpen, Mic, Loader2, AlertCircle, ChevronRight,
  SkipBack, SkipForward, X, VolumeX, Sparkles, Repeat, ChevronUp, ChevronDown, List
} from 'lucide-react';

const WORD_CARD_TTL_MS = 7000;

type VttCue = { start: number; end: number; text: string; };

function parseTimestamp(s: string): number {
  // hh:mm:ss.mmm 或 mm:ss.mmm
  const parts = s.trim().split(':');
  let h = 0, m = 0, sec = 0;
  try {
    if (parts.length === 3) {
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      sec = parseFloat(parts[2].replace(',', '.'));
    } else if (parts.length === 2) {
      m = parseInt(parts[0], 10);
      sec = parseFloat(parts[1].replace(',', '.'));
    } else {
      sec = parseFloat(parts[0] || '0');
    }
  } catch (_) { return 0; }
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;
  if (isNaN(sec)) sec = 0;
  return h * 3600 + m * 60 + sec;
}

function parseVtt(text: string): VttCue[] {
  const cues: VttCue[] = [];
  if (!text) return cues;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const arrowRe = /-->+\s*/;
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trimEnd());
    // 跳过 WEBVTT 头 / NOTE / STYLE
    if (!lines.length) continue;
    if (/^WEBVTT/i.test(lines[0])) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;
    // 找到时间戳行
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (arrowRe.test(lines[i])) { idx = i; break; }
    }
    if (idx < 0) continue;
    const timeLine = lines[idx];
    const [left, rightRaw] = timeLine.split(arrowRe);
    const right = (rightRaw || '').split(/\s+/)[0];
    const start = parseTimestamp(left);
    const end = parseTimestamp(right);
    if (!isFinite(start) || !isFinite(end) || end <= start) continue;
    const textLines = lines.slice(idx + 1).filter(l => l.length > 0);
    cues.push({ start, end, text: textLines.join('\n') });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function findEnclosingCue(cues: VttCue[], t: number): VttCue | null {
  if (!cues.length) return null;
  // 二分：start <= t 的最大
  let lo = 0, hi = cues.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (ans < 0) return null;
  // 可能 ans / ans-1 中哪个真正包含 t（有些重叠/间隔）
  for (let i = ans; i >= Math.max(0, ans - 1); i--) {
    if (cues[i].start <= t && t <= cues[i].end) return cues[i];
  }
  // 兜底：没包含但最近的一个（可能 Whisper 标记 time 在句末以后一点点），用紧挨着的上一句
  if (t - cues[ans].end <= 1.2) return cues[ans];
  if (ans + 1 < cues.length && cues[ans + 1].start - t <= 1.2) return cues[ans + 1];
  return cues[ans];
}

// 模块级：预加载 speechSynthesis voices（Chrome 异步加载，首次 getVoices() 可能返回 []）
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    // 立即尝试一次（Safari 同步返回）
    window.speechSynthesis.getVoices();
    // 监听异步加载完成（Chrome/Edge）
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  } catch (_) {}
}

function getPreferredVoice(lang: 'en' | 'zh'): SpeechSynthesisVoice | null {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    if (!voices || voices.length === 0) return null;
    if (lang === 'en') {
      return (
        voices.find(v => /en(-|_)US/i.test(v.lang) && /female|jenny|samantha/i.test(`${v.name} ${v.voiceURI}`))
        || voices.find(v => /en(-|_)US/i.test(v.lang))
        || voices.find(v => /^en/i.test(v.lang))
        || null
      );
    }
    return (
      voices.find(v => /zh(-|_)CN/i.test(v.lang) && /xiaoxiao|yaoyao|female|xiaoyi|yunxi/i.test(`${v.name} ${v.voiceURI}`))
      || voices.find(v => /zh(-|_)CN|cmn(-|_)Hans/i.test(v.lang))
      || voices.find(v => /^zh|^cmn/i.test(v.lang))
      || null
    );
  } catch (_) {
    return null;
  }
}

// 当前正在播放的 utterance 引用（防止 GC 回收导致静默）
let _currentUtterance: SpeechSynthesisUtterance | null = null;

function speak(text: string, opts?: { slow?: boolean; lang?: 'en' | 'zh'; onEnd?: () => void; onError?: () => void }) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      opts?.onEnd?.();
      return;
    }
    if (!text) { opts?.onEnd?.(); return; }
    const synth = window.speechSynthesis;
    // 先停掉之前的
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const langTag: 'en-US' | 'zh-CN' = opts?.lang === 'zh' ? 'zh-CN' : 'en-US';
    u.lang = langTag;
    u.rate = opts?.slow ? 0.75 : (opts?.lang === 'zh' ? 0.95 : 0.92);
    u.pitch = 1.1;
    u.volume = 1;
    const v = getPreferredVoice(opts?.lang || 'en');
    if (v) u.voice = v;
    else u.lang = langTag; // 确保语言标签设置正确，让浏览器选默认 voice
    let ended = false;
    const finish = (ok: boolean) => {
      if (ended) return;
      ended = true;
      if (_currentUtterance === u) _currentUtterance = null;
      if (ok) opts?.onEnd?.(); else opts?.onError?.();
    };
    u.onend = () => finish(true);
    u.onerror = (e) => {
      console.warn('[Player] speechSynthesis utterance error:', e?.error);
      finish(false);
    };
    u.onboundary = () => { /* noop to keep utterance alive */ };
    _currentUtterance = u;
    synth.speak(u);
    // 某些浏览器需要短暂延迟才能真正开始播放
    if (!synth.speaking) {
      setTimeout(() => {
        if (!ended && !synth.speaking) {
          try { synth.speak(u); } catch (_) {}
        }
      }, 50);
    }
  } catch (_) {
    opts?.onEnd?.();
  }
}

function playSynthesisWord(evt: VocabularyEvent, opts: { slow?: boolean; onEnd?: () => void }) {
  // 合成音：英文 + 中文连读
  speak(evt.wordEn, {
    slow: opts.slow,
    lang: 'en',
    onEnd: () => {
      if (!evt.wordZh) { opts.onEnd?.(); return; }
      speak(evt.wordZh, { slow: opts.slow, lang: 'zh', onEnd: opts.onEnd, onError: opts.onEnd });
    },
    onError: () => {
      // 英文失败兜底直接中文，再失败直接结束
      if (!evt.wordZh) { opts.onEnd?.(); return; }
      speak(evt.wordZh, { slow: opts.slow, lang: 'zh', onEnd: opts.onEnd, onError: opts.onEnd });
    },
  });
}

function stopSpeak() {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch (_) {}
}

export default function Player() {
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCacheRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const accessToken = useStore((state) => state.accessToken);
  const updateEpisodeProgress = useStore((state) => state.updateEpisodeProgress);

  // 从 location.state 获取参数
  const { dlink, filename, subtitleDlink, seriesId, episodeFsId, episodeId: episodeIdFromState, episodes } = location.state as any || {};
  const effectiveEpisodeId = String(episodeFsId ?? episodeIdFromState ?? '');

  const [videoUrl, setVideoUrl] = useState('');
  const [subtitleUrl, setSubtitleUrl] = useState('');
  const [vocabularyUrl, setVocabularyUrl] = useState('');
  const [hasExercise, setHasExercise] = useState(false);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentEpisodeIdx, setCurrentEpisodeIdx] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showEpisodeStrip, setShowEpisodeStrip] = useState(false);
  const [coursesEpisodes, setCoursesEpisodes] = useState<EpisodeMaterial[]>([]);
  const [platformSubtitleLoaded, setPlatformSubtitleLoaded] = useState(false);
  const [muted, setMuted] = useState(false);

  const [vocabularyEvents, setVocabularyEvents] = useState<VocabularyEvent[]>([]);
  const [activeWords, setActiveWords] = useState<Record<string, VocabularyEvent>>({});
  const lastFiredRef = useRef<Record<string, number>>({});
  const pausedByWordRef = useRef<boolean>(false);
  const pausedAtRef = useRef<number>(0);

  const loadedWordsCount = vocabularyEvents.length;
  const vttCuesRef = useRef<VttCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<'off' | 'en' | 'zh'>('en');
  const [subtitleZhUrl, setSubtitleZhUrl] = useState<string>('');
  const textTracksRef = useRef<{ en?: TextTrack | null; zh?: TextTrack | null }>({});

  // 下载并解析 en subtitle VTT → 与 vocabulary 事件匹配 → 把每个词的触发时刻从 vocabulary.time 改到"句子结束+0.2s"
  useEffect(() => {
    if (!subtitleUrl) {
      vttCuesRef.current = [];
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(subtitleUrl, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const cues = parseVtt(text);
        console.log('[Player] parseVtt subtitle cues=', cues.length, 'from', subtitleUrl);
        if (!alive) return;
        vttCuesRef.current = cues;
        // 给每个词打 fireAt：cue.end + 0.2s；无匹配兜底 vocabulary.time
        setVocabularyEvents(prev => prev.map(evt => {
          const cue = findEnclosingCue(cues, evt.time);
          if (!cue) return evt;
          const fireAt = cue.end + 0.2;
          // fireAt 不能早于原 time（避免 cue 很短而 time 在 cue 前）
          return { ...evt, _fireAt: Math.max(fireAt, evt.time + 0.1) } as VocabularyEvent & { _fireAt: number };
        }));
      } catch (e) {
        console.warn('[Player] parseVtt failed, fallback to vocabulary.time triggers:', e);
        vttCuesRef.current = [];
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleUrl]);

  // 控制字幕轨道显示（浏览器原生 textTrack.mode）：en/zh/off
  useEffect(() => {
    const tr = textTracksRef.current;
    const modes: Record<'en' | 'zh' | 'off', { en: TextTrackMode; zh: TextTrackMode }> = {
      en: { en: 'showing', zh: 'disabled' },
      zh: { en: 'disabled', zh: 'showing' },
      off: { en: 'hidden', zh: 'hidden' },
    };
    const m = modes[subtitleLang];
    if (tr.en) tr.en.mode = m.en;
    if (tr.zh) tr.zh.mode = m.zh;
  }, [subtitleLang]);
  useEffect(() => {
    if (!vocabularyUrl) {
      setVocabularyEvents([]);
      return;
    }
    let alive = true;
    (async () => {
      const arr = await loadVocabularyEvents(vocabularyUrl);
      console.log('[Player] loadVocabularyEvents done url=', vocabularyUrl, 'count=', arr.length, 'first=', arr[0] || null);
      if (alive) {
        setVocabularyEvents(arr);
        lastFiredRef.current = {};
        setActiveWords({});
      }
    })();
    return () => { alive = false; };
  }, [vocabularyUrl]);

  const wordSchedulesRef = useRef<Record<string, number[] | null>>({});

  // 单词音频3遍朗读排程（正常英→中 → 间隔1s → 正常英→中 → 间隔1s → 正常英→中）
  const scheduleWordRepeats = (evt: VocabularyEvent, repeat = 3, gapMs = 1000): { cancel: () => void } => {
    const timers: number[] = [];
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      stopSpeak();
      for (const t of timers) clearTimeout(t);
      const arr = wordSchedulesRef.current[evt.id];
      if (arr) {
        for (const t of arr) clearTimeout(t);
      }
      delete wordSchedulesRef.current[evt.id];
    };
    const fallbackSynthesis = (roundIdx: number) => {
      // 英文音频失败/不存在，用合成音走英→中
      playSynthesisWord(evt, {
        slow: false,
        onEnd: () => {
          if (cancelled) return;
          if (roundIdx + 1 >= repeat) return; // 最后一轮结束
          const tm = window.setTimeout(() => {
            if (cancelled) return;
            fallbackSynthesis(roundIdx + 1);
          }, gapMs);
          timers.push(tm);
          const cur = wordSchedulesRef.current[evt.id] || [];
          cur.push(tm);
          wordSchedulesRef.current[evt.id] = cur;
        },
      });
    };
    const playRound = (roundIdx: number) => {
      if (cancelled) return;
      if (!evt.audioUrl) {
        fallbackSynthesis(roundIdx);
        return;
      }
      try {
        let el = audioCacheRef.current[evt.audioUrl];
        if (!el) {
          el = new Audio(evt.audioUrl);
          el.preload = 'auto';
          audioCacheRef.current[evt.audioUrl] = el;
        } else {
          el.pause();
          el.currentTime = 0;
        }
        el.playbackRate = 1.0;
        el.onended = () => {
          if (cancelled) return;
          // 英文音频读完 -> 读中文合成
          if (!evt.wordZh) {
            // 没中文直接下一轮
            if (roundIdx + 1 >= repeat) return;
            const tm = window.setTimeout(() => { if (!cancelled) playRound(roundIdx + 1); }, gapMs);
            timers.push(tm);
            const cur = wordSchedulesRef.current[evt.id] || [];
            cur.push(tm);
            wordSchedulesRef.current[evt.id] = cur;
            return;
          }
          speak(evt.wordZh, {
            lang: 'zh',
            onEnd: () => {
              if (cancelled) return;
              if (roundIdx + 1 >= repeat) return;
              const tm = window.setTimeout(() => { if (!cancelled) playRound(roundIdx + 1); }, gapMs);
              timers.push(tm);
              const cur = wordSchedulesRef.current[evt.id] || [];
              cur.push(tm);
              wordSchedulesRef.current[evt.id] = cur;
            },
            onError: () => {
              if (cancelled) return;
              if (roundIdx + 1 >= repeat) return;
              const tm = window.setTimeout(() => { if (!cancelled) playRound(roundIdx + 1); }, gapMs);
              timers.push(tm);
              const cur = wordSchedulesRef.current[evt.id] || [];
              cur.push(tm);
              wordSchedulesRef.current[evt.id] = cur;
            },
          });
        };
        el.onerror = () => {
          if (cancelled) return;
          // Audio失败兜底走合成音3轮
          fallbackSynthesis(roundIdx);
        };
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (cancelled) return;
            fallbackSynthesis(roundIdx);
          });
        }
      } catch (_) {
        if (cancelled) return;
        fallbackSynthesis(roundIdx);
      }
    };
    cancel(); // 清旧的
    const cur = wordSchedulesRef.current[evt.id] || [];
    wordSchedulesRef.current[evt.id] = cur;
    playRound(0);
    return { cancel };
  };

  // 播放单词：优先 audioUrl（Edge-TTS/gTTS 生成的），否则 Web Speech Synthesis
  // 当 slow=true 时（用户手动点"慢速"），只做 1 遍慢速英文（符合用户学习慢速的直觉）；
  // 正常播放（气泡自动触发或侧栏点 🔊）一律走 3 遍英→中共读。
  const playWordAudio = (evt: VocabularyEvent, slow = false) => {
    if (muted) return;
    if (slow) {
      // 手动慢速模式：1 遍慢速英文，英文读完接中文慢速一遍
      playSynthesisWord(evt, { slow: true });
      return;
    }
    scheduleWordRepeats(evt, 3, 1000);
  };

  // 初始化：两条路径（A=百度网盘 dlink/系列映射；B=courses 静态 JSON 系列）
  useEffect(() => {
    // 没有任何播放参数，直接回首页
    if (!dlink && !seriesId) {
      navigate('/');
      return;
    }

    // 防卡死：8s 后还没出结果，强制解除 loading（防止用户点了被死 spinner 挡住感觉"播放键不能点"）
    const stuckTimer = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('[Player] init loading stuck, force clear loading after 8s');
          setError(err => err || '初始化超时，请返回首页重新点「立即播放」或刷新页面重试。');
        }
        return false;
      });
    }, 8000);

    // A. 网盘模式：提供了 dlink 就走原百度网盘解析链路
    if (dlink) {
      if (!accessToken) {
        clearTimeout(stuckTimer);
        navigate('/');
        return;
      }
      const fetchRealUrl = async () => {
        try {
          setLoading(true);
          setError('');
          const realCdnUrl = await resolveRedirect(dlink, accessToken);
          console.log('Real CDN URL parsed:', realCdnUrl);
          const proxiedUrl = getProxiedVideoUrl(realCdnUrl);
          console.log('Proxied URL generated:', proxiedUrl);
          setVideoUrl(proxiedUrl);

          if (seriesId && episodeFsId) {
            try {
              const materialRes = await getEpisodeMaterial(seriesId, String(episodeFsId));
              if (materialRes.success && materialRes.data) {
                const material: EpisodeMaterial = materialRes.data;
                if (material.subtitleUrl && !platformSubtitleLoaded) {
                  setSubtitleUrl(material.subtitleUrl);
                  setPlatformSubtitleLoaded(true);
                }
                if (material.vocabularyUrl) setVocabularyUrl(material.vocabularyUrl);
                setHasExercise(material.hasExercise);
                setExerciseCount(material.exerciseCount || 0);
              }
            } catch (err) {
              console.warn('平台课程资料加载失败，使用备用方案:', err);
            }
          }

          if (!platformSubtitleLoaded && subtitleDlink) {
            try {
              const realSubCdnUrl = await resolveRedirect(subtitleDlink, accessToken);
              const proxiedSubUrl = getProxiedVideoUrl(realSubCdnUrl);
              setSubtitleUrl(proxiedSubUrl);
            } catch (err) {
              console.warn('备用字幕解析失败:', err);
            }
          }
        } catch (err: any) {
          setError(err.message || '获取视频播放地址失败');
        } finally {
          clearTimeout(stuckTimer);
          setLoading(false);
        }
      };
      void fetchRealUrl();
      return () => clearTimeout(stuckTimer);
    }

    // B. courses 静态系列模式（seriesId-only）：从 courses.json 拿 视频/字幕/生词表，全部 /media/*.mp4 /data/*.json
    if (seriesId) {
      const fetchFromCourses = async () => {
        try {
          setLoading(true);
          setError('');
          const detail = await getCourseDetail(seriesId);
          if (!detail.success || !detail.data) {
            setError(`没有找到该系列的课程资料（seriesId=${seriesId}）。请在后台「课程资料管理」配置视频/字幕/生词表并重新部署 courses.json。`);
            return;
          }
          const seriesEpisodes = Array.isArray(detail.data.episodes) ? detail.data.episodes : [];
          setCoursesEpisodes(seriesEpisodes);
          if (seriesEpisodes.length === 0) {
            setError(`该系列下还没有添加单集（seriesId=${seriesId}）。请在后台「课程资料管理」添加单集并重新部署 courses.json。`);
            return;
          }
          let ep: EpisodeMaterial | undefined = seriesEpisodes[0];
          const epId = effectiveEpisodeId;
          if (epId) {
            const found = seriesEpisodes.find(x => String(x.episodeId) === epId);
            if (found) ep = found;
          }
          const matRes = await getEpisodeMaterial(seriesId, ep.episodeId);
          if (matRes.success && matRes.data) ep = matRes.data;
          console.log('[Player] courses mode ep:', { epId, ep, matResSuccess: matRes.success });
          if (!ep.videoUrl) {
            setError(`单集「${ep.episodeName || ep.episodeId}」没有配置视频源 URL，请在后台「课程资料管理」填好视频源并重新部署 courses.json。`);
            return;
          }
          setVideoUrl(ep.videoUrl);
          if (ep.subtitleUrl) { setSubtitleUrl(ep.subtitleUrl); setPlatformSubtitleLoaded(true); }
          if ((ep as any).subtitleZhUrl) { setSubtitleZhUrl(String((ep as any).subtitleZhUrl)); }
          if (ep.vocabularyUrl) setVocabularyUrl(ep.vocabularyUrl);
          setHasExercise(!!ep.hasExercise);
          setExerciseCount(ep.exerciseCount || 0);
          if (ep.episodeName && !filename) {
            (location.state as any).filename = ep.episodeName;
          }
        } catch (err: any) {
          console.error('[Player] fetchFromCourses error:', err);
          setError(err?.message || '加载课程资料失败');
        } finally {
          clearTimeout(stuckTimer);
          setLoading(false);
        }
      };
      void fetchFromCourses();
      return () => clearTimeout(stuckTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlink, accessToken, navigate, subtitleDlink, seriesId, episodeFsId, platformSubtitleLoaded]);

  // 自动播放
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('自动播放被阻止:', err);
        setIsPlaying(false);
      });
    }
  }, [videoUrl]);

  // 词汇事件触发扫描
  useEffect(() => {
    if (!vocabularyEvents.length) return;
    // 初始化：所有 id → firedAt:-Infinity
    const dict: Record<string, number> = {};
    vocabularyEvents.forEach(v => { dict[v.id] = -Infinity; });
    lastFiredRef.current = dict;
    pausedByWordRef.current = false;
    setActiveWords({});
  }, [vocabularyEvents]);

  // 视频时间更新
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const now = video.currentTime;
      setCurrentTime(now);
      // 每10秒保存一次进度（courses-only 模式也用 effectiveEpisodeId 写入）
      if (seriesId && effectiveEpisodeId && Math.floor(now) % 10 === 0) {
        const progress = (now / (video.duration || 1)) * 100;
        updateEpisodeProgress(seriesId, effectiveEpisodeId, progress);
      }

      // 触发词汇气泡：优先用 _fireAt（VTT句子结束+0.2s），兜底 vocabulary.time
      if (vocabularyEvents.length && !muted) {
        const fired = lastFiredRef.current;
        for (const evt of vocabularyEvents) {
          const fireAt = (evt as VocabularyEvent & { _fireAt?: number })._fireAt ?? evt.time;
          const t = fireAt;
          const delta = now - t;
          if (delta >= -0.25 && delta <= 0.5) {
            if (now - (fired[evt.id] ?? -Infinity) >= 6) {
              fired[evt.id] = now;
              console.log('[Player] fire word bubble:', evt.wordEn, 'at t=', now, 'fireAt=', fireAt, 'orig.time=', evt.time);
              setActiveWords(prev => ({ ...prev, [evt.id]: evt }));
              // 暂停视频 + 自动读三遍（正常英→中 连读 3 轮）
              if (!pausedByWordRef.current) {
                pausedByWordRef.current = true;
                pausedAtRef.current = now;
                try { video.pause(); } catch (_) {}
                setIsPlaying(false);
                // 3 遍朗读（正常英→中 间隔 1s）
                playWordAudio(evt, false);
                // 预估时长 ~ 6 秒（3 轮 × 1.3s + 两个 gap 1s）
                setTimeout(() => {
                  pausedByWordRef.current = false;
                  try {
                    if (video.paused) { video.play().then(() => setIsPlaying(true)).catch(() => {}); }
                  } catch (_) {}
                }, 6500);
              }
              // TTL 过期清理
              setTimeout(() => {
                setActiveWords(prev => {
                  if (!prev[evt.id]) return prev;
                  const next = { ...prev };
                  delete next[evt.id];
                  return next;
                });
              }, WORD_CARD_TTL_MS);
            }
          }
        }
      }
    };

    const handleDurationChange = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      stopSpeak();
      if (seriesId && effectiveEpisodeId) {
        updateEpisodeProgress(seriesId, effectiveEpisodeId, 100);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
    // 注意：videoUrl 必须加入依赖，确保 courses B 分支 setVideoUrl 后 video 元素有 src 再重新 attach 监听器
  }, [seriesId, effectiveEpisodeId, episodeFsId, updateEpisodeProgress, vocabularyEvents, muted, videoUrl]);

  // 用户主动 seek / 切换时，清空 fired 标记避免重复
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onSeeked = () => {
      const now = video.currentTime;
      const fired = lastFiredRef.current;
      for (const k of Object.keys(fired)) {
        if (Math.abs(now - (fired[k] ?? -Infinity)) > 30) {
          fired[k] = -Infinity;
        }
      }
    };
    video.addEventListener('seeked', onSeeked);
    return () => video.removeEventListener('seeked', onSeeked);
  }, []);

  // 查找当前集数索引（同时兼容网盘 episodes 和 coursesEpisodes）
  useEffect(() => {
    if (episodes && episodeFsId) {
      const idx = episodes.findIndex((ep: EpisodeFile) => ep.fsId === episodeFsId);
      if (idx !== -1) {
        setCurrentEpisodeIdx(idx);
      }
    } else if (coursesEpisodes.length > 0) {
      const epId = String(episodeIdFromState ?? '');
      const idx = coursesEpisodes.findIndex((ep) => String(ep.episodeId) === epId);
      if (idx !== -1) {
        setCurrentEpisodeIdx(idx);
      }
    }
  }, [episodes, episodeFsId, coursesEpisodes, episodeIdFromState]);

  // 统一切换到第 idx 集
  const navigateToEpisode = (idx: number) => {
    if (episodes && episodes[idx]?.dlink) {
      const ep = episodes[idx];
      navigate('/player', {
        state: {
          dlink: ep.dlink,
          filename: ep.filename,
          subtitleDlink,
          seriesId,
          episodeFsId: ep.fsId,
          episodes,
        }
      });
    } else if (coursesEpisodes[idx] && seriesId) {
      const ep = coursesEpisodes[idx];
      navigate('/player', {
        state: {
          seriesId,
          episodeId: ep.episodeId,
        }
      });
    }
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setIsPlaying(true);
      try {
        const p = video.play();
        if (typeof (p as any)?.then === 'function') {
          await (p as Promise<void>);
        }
      } catch (err: any) {
        console.warn('[Player] video.play reject:', err);
        // 自动播放被拒/没加载到 src：回退 UI 状态并提示
        setIsPlaying(!video.paused);
        const msg: string = typeof err?.message === 'string' ? err.message : '';
        if (msg.toLowerCase().includes('play()') || /notallowed|user gesture/i.test(msg)) {
          setError(prev => prev || `浏览器阻止了自动播放。请手动点一下视频画面或播放键，就能开始播放。`);
        } else if (!video.src) {
          setError(prev => prev || '视频源还没加载好，请稍等 3 秒再点一次，或返回首页重新进入。');
        }
      }
    } else {
      video.pause();
      stopSpeak();
      setIsPlaying(false);
    }
  };

  const handleVideoError = () => {
    const video = videoRef.current;
    stopSpeak();
    setIsPlaying(false);
    console.error('[Player] video onerror:', video?.error?.code, video?.error?.message, 'src=', videoUrl);
    const code = video?.error?.code ?? 0;
    const reason =
      code === 4 ? '视频文件格式不被当前浏览器支持，或服务器返回 4xx/5xx 错误。请在后台核对视频源 URL。' :
      code === 3 ? '视频解码失败（文件已损坏），请重新生成 mp4。' :
      code === 2 ? '网络中断，无法下载视频。请检查网络后刷新。' :
      code === 1 ? '加载视频时被浏览器中止，请刷新重试。' :
      `视频加载错误（code=${code}），请刷新或检查视频源 URL。`;
    setError(prev => prev || reason);
    setLoading(false);
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const playPrev = () => {
    if (currentEpisodeIdx <= 0) return;
    navigateToEpisode(currentEpisodeIdx - 1);
  };

  const playNext = () => {
    const totalEpisodes = episodes?.length || coursesEpisodes.length;
    if (currentEpisodeIdx >= totalEpisodes - 1) return;
    navigateToEpisode(currentEpisodeIdx + 1);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) stopSpeak();
    if (videoRef.current) videoRef.current.muted = next;
  };

  const vocabSummary = useMemo(() => {
    if (!loadedWordsCount) return null;
    const mins = Math.floor((vocabularyEvents[vocabularyEvents.length - 1]?.time ?? 0) / 60);
    return `${loadedWordsCount} 词 · 覆盖约 ${mins} 分钟`;
  }, [loadedWordsCount, vocabularyEvents]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 视频区域 */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center">
              <Loader2 className="w-16 h-16 animate-spin text-orange-500 mx-auto mb-4" />
              <p className="text-white font-bold">正在加载视频...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10 p-8">
            <div className="text-center max-w-md">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <p className="text-white font-bold text-lg mb-2">播放失败</p>
              <p className="text-gray-400 text-sm mb-6">{error}</p>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-3 bg-orange-500 text-white rounded-full font-bold"
              >
                返回
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
          onClick={togglePlay}
          crossOrigin="anonymous"
          onError={handleVideoError}
          onLoadedMetadata={() => {
            // 元数据加载成功：解除死 loading，防止 loading spinner 一直挡住
            setLoading(false);
            // 缓存 textTracks，后续用 mode 切字幕显示/隐藏
            try {
              if (videoRef.current && videoRef.current.textTracks) {
                const tr = videoRef.current.textTracks;
                for (let i = 0; i < tr.length; i++) {
                  const t = tr[i];
                  if (!t) continue;
                  if (t.language === 'en') textTracksRef.current.en = t;
                  if (t.language === 'zh' || t.language === 'zh-CN') textTracksRef.current.zh = t;
                }
                const modes: Record<'en' | 'zh' | 'off', { en: TextTrackMode; zh: TextTrackMode }> = {
                  en: { en: 'showing', zh: 'disabled' },
                  zh: { en: 'disabled', zh: 'showing' },
                  off: { en: 'hidden', zh: 'hidden' },
                };
                const m = modes[subtitleLang];
                if (textTracksRef.current.en) textTracksRef.current.en.mode = m.en;
                if (textTracksRef.current.zh) textTracksRef.current.zh.mode = m.zh;
                console.log('[Player] textTracks captured onLoadedMetadata:', Object.keys(textTracksRef.current).length);
              }
            } catch (_) {}
          }}
        >
          {/* 字幕必须嵌套在 <video> 里，否则浏览器忽略，破坏 video 内部状态 */}
          {subtitleUrl && (
            <track
              key={`en-${subtitleUrl}`}
              kind="subtitles"
              src={subtitleUrl}
              srcLang="en"
              label="英文字幕"
              default={subtitleLang === 'en'}
              onLoad={() => { console.log('[Player] subtitle EN track loaded:', subtitleUrl); }}
            />
          )}
          {subtitleZhUrl && (
            <track
              key={`zh-${subtitleZhUrl}`}
              kind="subtitles"
              src={subtitleZhUrl}
              srcLang="zh-CN"
              label="中文字幕"
              default={subtitleLang === 'zh'}
              onLoad={() => { console.log('[Player] subtitle ZH track loaded:', subtitleZhUrl); }}
            />
          )}
        </video>

        {/* 字幕语言切换按钮：3 档 英文 / 中文 / 关闭（只有至少一个字幕 URL 才显示） */}
        {(subtitleUrl || subtitleZhUrl) && (
          <div className="absolute top-16 left-4 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 p-1">
            {([
              { key: 'en', label: '英文', avail: !!subtitleUrl },
              { key: 'zh', label: '中文', avail: !!subtitleZhUrl },
              { key: 'off', label: '关闭', avail: true },
            ] as const).map(opt => (
              <button
                key={opt.key}
                disabled={!opt.avail}
                onClick={() => { if (opt.avail) setSubtitleLang(opt.key); }}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-bold transition-colors',
                  subtitleLang === opt.key
                    ? 'bg-orange-500 text-white shadow-md'
                    : opt.avail
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-300 cursor-not-allowed line-through',
                ].join(' ')}
                title={opt.avail ? undefined : '当前视频没有对应字幕文件'}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* 平台字幕加载状态提示 */}
        {platformSubtitleLoaded && subtitleUrl && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-green-500/90 text-white text-xs px-3 py-1 rounded-full z-20 translate-y-10">
            ✓ 平台字幕已加载
          </div>
        )}

        {loadedWordsCount > 0 && (
          <div className="absolute top-16 right-4 bg-orange-500/90 text-white text-xs px-3 py-1 rounded-full z-20 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="font-medium">{vocabSummary}</span>
          </div>
        )}

        {/* ✨ 生词气泡浮层：覆盖整视频，定位 percent */}
        <div className="absolute inset-0 pointer-events-none z-30">
          {Object.values(activeWords).map(evt => (
            <div
              key={evt.id}
              className="absolute pointer-events-auto animate-bounce-in"
              style={{
                left: `${evt.coordX}%`,
                top: `${evt.coordY}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-pink-500 text-white rounded-3xl shadow-2xl shadow-orange-900/40 border border-white/30 px-5 py-3 min-w-[220px] max-w-[300px] backdrop-blur-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black tracking-tight drop-shadow-sm" style={{ fontFamily: "'Comic Sans MS', system-ui, sans-serif" }}>
                        {evt.wordEn}
                      </span>
                    </div>
                    {evt.wordZh && (
                      <div className="mt-1 text-sm text-white/90 font-semibold opacity-95">
                        {evt.wordZh}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => playWordAudio(evt, true)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/25 hover:bg-white/35 transition-colors px-2.5 py-1 text-xs font-bold border border-white/20"
                      >
                        <Repeat className="w-3.5 h-3.5" />慢速
                      </button>
                      <button
                        onClick={() => playWordAudio(evt, false)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/25 hover:bg-white/35 transition-colors px-2.5 py-1 text-xs font-bold border border-white/20"
                      >
                        <Volume2 className="w-3.5 h-3.5" />播放
                      </button>
                      {evt.imageUrl && (
                        <img src={evt.imageUrl} alt="" className="ml-1 w-10 h-10 rounded-lg object-cover border border-white/30" />
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveWords(prev => {
                      const next = { ...prev };
                      delete next[evt.id];
                      return next;
                    })}
                    className="-mt-1 -mr-1 rounded-full bg-black/20 hover:bg-black/35 text-white/90 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 顶部栏 - 面包屑导航 */}
        <div className="absolute top-0 left-0 right-0 p-3 pt-4 bg-gradient-to-b from-black/80 to-transparent z-20">
          <div className="flex items-center justify-between">
            {/* 左：面包屑 */}
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <button
                onClick={() => { stopSpeak(); navigate('/'); }}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 flex-shrink-0"
                title="返回首页"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => { stopSpeak(); if (seriesId) navigate(`/series/${seriesId}`); else navigate('/'); }}
                className="text-white/80 hover:text-white text-xs font-bold flex items-center gap-0.5 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors truncate"
                title="返回选集"
              >
                🏠 {filename || '选集'}
              </button>
              <span className="text-white/40 text-xs">›</span>
              <span className="text-white text-xs font-bold truncate">
                第 {currentEpisodeIdx + 1} 集
              </span>
            </div>
            {/* 右：静音 + 课程资料 */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                onClick={toggleMute}
                title={muted ? '取消静音' : '静音'}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 底部控制栏 */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20">
          {/* 进度条 */}
          <div className="mb-3">
            <div
              className="h-1.5 bg-white/30 rounded-full cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                handleSeek(percent * duration);
              }}
            >
              <div
                className="h-full bg-orange-500 rounded-full relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-xs text-white/70 font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={playPrev}
                disabled={!episodes || currentEpisodeIdx <= 0}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 disabled:opacity-30"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-600"
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>

              <button
                onClick={playNext}
                disabled={!episodes || currentEpisodeIdx >= episodes.length - 1}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 disabled:opacity-30"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs hidden sm:inline">
                {loadedWordsCount ? `📚 ${loadedWordsCount} 词` : ''}
              </span>
              <button className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 折叠式选集条 */}
          {(() => {
            const cloudList: EpisodeFile[] = episodes || [];
            const coursesList: EpisodeMaterial[] = coursesEpisodes || [];
            const total = cloudList.length || coursesList.length;
            if (total <= 1) return null;
            return (
              <div className="mt-3">
                {/* 折叠态：一行信息+展开按钮 */}
                {!showEpisodeStrip && (
                  <button
                    onClick={() => setShowEpisodeStrip(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-white/15 hover:bg-white/25 rounded-full text-white text-sm font-bold transition-colors"
                  >
                    <List className="w-4 h-4" />
                    <span>第 {currentEpisodeIdx + 1} 集 / 共 {total} 集</span>
                    <ChevronUp className="w-4 h-4" />
                  </button>
                )}
                {/* 展开态：横向滚动集数方块 */}
                {showEpisodeStrip && (
                  <div className="bg-black/50 backdrop-blur-sm rounded-2xl p-3 -mx-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/80 text-xs font-bold flex items-center gap-1">
                        <List className="w-3.5 h-3.5" />
                        选集 · 共 {total} 集
                      </span>
                      <button
                        onClick={() => setShowEpisodeStrip(false)}
                        className="text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                      {cloudList.length > 0
                        ? cloudList.map((ep, idx) => (
                            <button
                              key={ep.fsId}
                              onClick={() => navigateToEpisode(idx)}
                              className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-sm font-black transition-all ${
                                idx === currentEpisodeIdx
                                  ? 'bg-orange-500 text-white shadow-lg ring-2 ring-white'
                                  : 'bg-white/15 text-white/80 hover:bg-white/30 hover:text-white'
                              }`}
                              title={ep.filename}
                            >
                              {idx + 1}
                            </button>
                          ))
                        : coursesList.map((ep, idx) => (
                            <button
                              key={ep.episodeId}
                              onClick={() => navigateToEpisode(idx)}
                              className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-sm font-black transition-all ${
                                idx === currentEpisodeIdx
                                  ? 'bg-orange-500 text-white shadow-lg ring-2 ring-white'
                                  : ep.videoUrl
                                    ? 'bg-white/15 text-white/80 hover:bg-white/30 hover:text-white'
                                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                              }`}
                              title={ep.episodeName || ep.episodeId}
                              disabled={!ep.videoUrl}
                            >
                              {idx + 1}
                            </button>
                          ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 侧边栏：课程资料 */}
      {showSidebar && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-gray-900 z-40 shadow-2xl overflow-y-auto">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900">
            <h3 className="text-white font-bold">课程资料</h3>
            <button
              onClick={() => setShowSidebar(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* 字幕 */}
            {subtitleUrl ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">字幕</span>
                  {platformSubtitleLoaded && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">平台</span>
                  )}
                </div>
                <p className="text-gray-400 text-sm">
                  {platformSubtitleLoaded ? '已自动加载平台字幕' : '字幕加载中...'}
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">字幕</span>
                </div>
                <p className="text-gray-500 text-sm">暂无字幕</p>
              </div>
            )}

            {/* 生词表 */}
            {vocabularyUrl ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">生词表</span>
                  {loadedWordsCount ? (
                    <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">
                      {loadedWordsCount} 词
                    </span>
                  ) : null}
                </div>
                <p className="text-gray-400 text-sm">
                  {loadedWordsCount
                    ? `本课 ${loadedWordsCount} 个重点单词，视频播放到对应时间自动弹出气泡学习`
                    : '生词表解析中...'}
                </p>
                {loadedWordsCount ? (
                  <div className="mt-3 max-h-72 overflow-y-auto space-y-2 pr-1">
                    {vocabularyEvents.map((e, idx) => (
                      <div key={e.id} className="flex items-center justify-between bg-gray-900/60 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-white font-bold text-sm flex items-center gap-2">
                            <span className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-orange-500/30 text-orange-300 text-[10px]">{idx + 1}</span>
                            {e.wordEn}
                          </div>
                          <div className="text-gray-400 text-xs mt-0.5">
                            {formatTime(e.time)} {e.wordZh ? `· ${e.wordZh}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => playWordAudio(e)}
                          className="rounded-full bg-white/10 hover:bg-white/20 text-white w-8 h-8 flex items-center justify-center"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  onClick={() => {
                    if (!vocabularyEvents.length) return;
                    const first = vocabularyEvents[0];
                    handleSeek(Math.max(0, first.time - 0.5));
                    setShowSidebar(false);
                    if (videoRef.current?.paused) togglePlay();
                  }}
                  disabled={!loadedWordsCount}
                  className="mt-3 w-full py-2 rounded-lg bg-orange-500/20 disabled:opacity-40 text-orange-500 text-sm font-bold flex items-center justify-center gap-2"
                >
                  跳到第一个生词
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">生词表</span>
                </div>
                <p className="text-gray-500 text-sm">暂无生词表</p>
              </div>
            )}

            {/* 互动题 */}
            {hasExercise ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">互动练习</span>
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                    {exerciseCount} 题
                  </span>
                </div>
                <p className="text-gray-400 text-sm">观看完成后进行答题</p>
                <button className="mt-3 w-full py-2 rounded-lg bg-blue-500/20 text-blue-500 text-sm font-bold flex items-center justify-center gap-2">
                  开始练习
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">互动练习</span>
                </div>
                <p className="text-gray-500 text-sm">暂无练习题</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% { opacity: 0; transform: translate(-50%, -60%) scale(0.7); }
          55% { opacity: 1; transform: translate(-50%, -48%) scale(1.06); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .animate-bounce-in { animation: bounce-in 360ms cubic-bezier(.2,.9,.3,1.3) both; }
      `}</style>
    </div>
  );
}
