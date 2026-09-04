export interface EpisodeMaterial {
  episodeId: string;
  episodeName: string;
  videoUrl?: string;
  subtitleUrl?: string;
  subtitleZhUrl?: string;
  vocabularyUrl?: string;
  hasExercise: boolean;
  exerciseCount?: number;
}

export interface CourseMaterial {
  seriesId: string;
  seriesName: string;
  coverUrl?: string;
  episodes: EpisodeMaterial[];
}

export interface EpisodePatch {
  vocabularyUrl?: string;
  subtitleUrl?: string;
  subtitleZhUrl?: string;
  hasExercise?: boolean;
  exerciseCount?: number;
  episodeName?: string;
  videoUrl?: string;
}

const LOCAL_OVERRIDE_KEY = 'admin-courses:override-v1';

function structuredCloneShallow<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

export async function loadAllCourses(): Promise<CourseMaterial[]> {
  // 1) 先尝试公共静态接口
  let base: CourseMaterial[] = [];
  try {
    const r = await fetch('/api/course-materials', { cache: 'no-store' });
    if (r.ok) {
      const json = await r.json();
      if (json?.success && Array.isArray(json.data)) {
        // listSummary 返回的是 summary（只有 seriesId/seriesName/coverUrl/episodeCount，没有 episodes）
        // 为拿到 episodes 我们直接读静态 JSON
        base = [];
      }
    }
  } catch (_) {}

  // 2) 直接读静态 JSON courses 详情，这是 MVP 阶段的数据源
  try {
    const r2 = await fetch('/data/courses.json', { cache: 'no-store' });
    if (r2.ok) {
      const obj = await r2.json();
      if (obj && Array.isArray(obj.series)) base = obj.series;
    }
  } catch (_) {}

  // 3) 合并用户在浏览器端手动覆盖的内容
  try {
    const raw = localStorage.getItem(LOCAL_OVERRIDE_KEY);
    if (raw) {
      const overrides: CourseMaterial[] = JSON.parse(raw);
      const map = new Map(base.map(s => [s.seriesId, structuredCloneShallow(s)]));
      for (const o of overrides) map.set(o.seriesId, structuredCloneShallow(o));
      base = Array.from(map.values());
    }
  } catch (_) {}

  // 正常化：episodes 永远是数组
  return base.map(s => ({
    ...s,
    episodes: Array.isArray(s.episodes) ? s.episodes : [],
  }));
}

export function patchEpisode(
  courses: CourseMaterial[],
  seriesId: string,
  episodeId: string,
  patch: EpisodePatch
): CourseMaterial[] {
  return courses.map(s => {
    if (s.seriesId !== seriesId) return s;
    const eps = [...(s.episodes || [])];
    const idx = eps.findIndex(e => e.episodeId === episodeId);
    if (idx === -1) {
      eps.push({
        episodeId,
        episodeName: patch.episodeName || `新单集 ${episodeId}`,
        hasExercise: !!patch.hasExercise,
        ...patch,
      });
    } else {
      eps[idx] = { ...eps[idx], ...patch };
    }
    return { ...s, episodes: eps };
  });
}

export function addSeries(courses: CourseMaterial[], seriesName: string): { courses: CourseMaterial[]; seriesId: string } {
  const id = `series_${Date.now()}`;
  return {
    courses: [...courses, { seriesId: id, seriesName, episodes: [] }],
    seriesId: id,
  };
}

export function saveLocalOverrides(courses: CourseMaterial[]): void {
  localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(courses));
}

export function clearLocalOverrides(): void {
  localStorage.removeItem(LOCAL_OVERRIDE_KEY);
}

/** 生成最终写入 courses.json 的文本（下载与 GitHub 同步共用，保证两边内容完全一致） */
export function buildCoursesJSON(courses: CourseMaterial[]): string {
  return JSON.stringify({ version: 1, series: courses }, null, 2) + '\n';
}

export function downloadCoursesJSON(courses: CourseMaterial[]): void {
  const json = buildCoursesJSON(courses);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'courses.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
