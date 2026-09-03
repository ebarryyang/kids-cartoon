import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, PlayCircle, X, Wand2, Film, ChevronDown, ChevronRight } from 'lucide-react';
import { loadAllCourses, type CourseMaterial } from '@/lib/coursesDataLayer';

interface VideoContent {
  id: string;
  title: string;
  seriesId?: string;   // 动画片系列 ID（与 C 端 /series/:seriesId 路由对齐）
  seriesName?: string; // 系列名（用于分组展示，避免每次反查）
  episodeNo?: number;  // 单集在系列内的序号（可选，用于排序/显示）
  status: 'published' | 'draft';
  views: number;
  updatedAt: string;
  videoUrl?: string;
  subtitleUrl?: string;
  subtitleZhUrl?: string;
  vocabularyUrl?: string;
}

const initialData: VideoContent[] = [
];

const CM_STORAGE_KEY = 'admin-content-manager:v1';
function loadCMFromStorage(): VideoContent[] {
  try {
    const raw = localStorage.getItem(CM_STORAGE_KEY);
    // ✅ 只有第一次打开（localStorage 从未写过）才 fallback 到 initialData 空数组
    //    如果用户明确写过 []（清空过），就保留空数组真实状态，不要 fallback
    if (!raw) return initialData;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // ✅ length===0 也直接返回 parsed，不返 initialData（用户真清空了）
      return parsed.filter(x => x && typeof x === 'object' && x.id && x.title);
    }
    return initialData;
  } catch {
    return initialData;
  }
}

export default function ContentManager() {
  const navigate = useNavigate();
  const [data, setData] = useState<VideoContent[]>(() => loadCMFromStorage());
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<CourseMaterial[]>([]);
  const [syncingCourses, setSyncingCourses] = useState(false);

  // 加载课程资料（静态 JSON + 本地 override）
  useEffect(() => {
    (async () => {
      try { setCourses(await loadAllCourses()); } catch (e) { console.warn('[ContentManager] 加载课程资料失败：', e); }
    })();
  }, []);

  const episodeOptions = useMemo(() => {
    const list: Array<{
      seriesId: string; seriesName: string;
      episodeId: string; episodeName: string;
      videoUrl?: string; subtitleUrl?: string; subtitleZhUrl?: string; vocabularyUrl?: string;
    }> = [];
    for (const s of courses) for (const ep of s.episodes || []) list.push({
      seriesId: s.seriesId, seriesName: s.seriesName,
      episodeId: ep.episodeId, episodeName: ep.episodeName,
      videoUrl: ep.videoUrl, subtitleUrl: ep.subtitleUrl,
      subtitleZhUrl: ep.subtitleZhUrl, vocabularyUrl: ep.vocabularyUrl,
    });
    return list;
  }, [courses]);

  // 每次 data 变化（新增/编辑/删除）都写回 localStorage，刷新页面不丢失
  useEffect(() => {
    try {
      localStorage.setItem(CM_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[ContentManager] 写入 localStorage 失败：', e);
    }
  }, [data]);

  // 顶部按钮：从课程资料管理同步所有 episodes 到内容管理（按 episodeId 去重，不覆盖已存在的 VideoContent）
  const handleSyncFromCourseMaterials = async () => {
    try {
      setSyncingCourses(true);
      let list = courses;
      if (list.length === 0) list = await loadAllCourses();
      if (list.length === 0) {
        alert('⚠️ 课程资料管理当前还没有任何单集，请先去「课程资料管理」新增或刷新后再同步。');
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      const existingIds = new Set(data.map(x => x.id));
      const append: VideoContent[] = [];
      let updatedCount = 0;
      for (const s of list) {
        const eps = s.episodes || [];
        eps.forEach((ep, idx) => {
          const vc: VideoContent = {
            id: ep.episodeId, // 用 episodeId 直接当 VideoContent.id → 和 TimelineEditor 的 coursesDataLayer 兜底天然对齐
            title: ep.episodeName || `${s.seriesName} / ${ep.episodeId}`,
            seriesId: s.seriesId,
            seriesName: s.seriesName,
            episodeNo: idx + 1,
            status: ep.videoUrl ? 'published' : 'draft',
            views: 0,
            updatedAt: today,
            videoUrl: ep.videoUrl || undefined,
            subtitleUrl: ep.subtitleUrl || undefined,
            subtitleZhUrl: ep.subtitleZhUrl || undefined,
            vocabularyUrl: ep.vocabularyUrl || undefined,
          };
          if (existingIds.has(vc.id)) {
            // 已经存在的：补全空字段 + 系列元信息（旧数据可能没有 seriesId）
            setData(prev => prev.map(x => x.id !== vc.id ? x : {
              ...x,
              seriesId: x.seriesId || vc.seriesId,
              seriesName: x.seriesName || vc.seriesName,
              episodeNo: x.episodeNo ?? vc.episodeNo,
              videoUrl: x.videoUrl || vc.videoUrl,
              subtitleUrl: x.subtitleUrl || vc.subtitleUrl,
              subtitleZhUrl: x.subtitleZhUrl || vc.subtitleZhUrl,
              vocabularyUrl: x.vocabularyUrl || vc.vocabularyUrl,
              updatedAt: today,
            }));
            updatedCount++;
          } else {
            append.push(vc);
          }
        });
      }
      if (append.length > 0) setData(prev => [...append, ...prev]);
      const msg = `✅ 同步完成！\n\n• 新增：${append.length} 条\n• 补全空字段：${updatedCount} 条\n• 当前列表共 ${data.length + append.length} 条\n\n现在点每行右侧的「时间轴」即可进入交互编辑器，4 个 URL 会自动预填。`;
      setTimeout(() => alert(msg), 50);
    } finally {
      setSyncingCourses(false);
    }
  };

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VideoContent | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    status: 'draft' as 'published' | 'draft',
    videoUrl: '',
    subtitleUrl: '',
    subtitleZhUrl: '',
    vocabularyUrl: '',
    pickedEpisodeId: '',
  });

  const handlePickEpisode = (epid: string) => {
    const found = episodeOptions.find(x => x.episodeId === epid);
    if (!found) return;
    setFormData(prev => ({
      ...prev,
      pickedEpisodeId: epid,
      title: prev.title?.trim() ? prev.title : found.episodeName || `${found.seriesName} · ${found.episodeId}`,
      videoUrl: prev.videoUrl?.trim() || found.videoUrl ? (prev.videoUrl || found.videoUrl || '') : '',
      subtitleUrl: prev.subtitleUrl?.trim() || found.subtitleUrl ? (prev.subtitleUrl || found.subtitleUrl || '') : '',
      subtitleZhUrl: prev.subtitleZhUrl?.trim() || found.subtitleZhUrl ? (prev.subtitleZhUrl || found.subtitleZhUrl || '') : '',
      vocabularyUrl: prev.vocabularyUrl?.trim() || found.vocabularyUrl ? (prev.vocabularyUrl || found.vocabularyUrl || '') : '',
    }));
  };

  const filteredData = data.filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  // 按 seriesId 分组（无 seriesId 的旧数据归入"未归类"）。结构：系列 → 单集
  const groupedData = useMemo(() => {
    const map = new Map<string, { seriesId: string; seriesName: string; episodes: VideoContent[] }>();
    for (const item of filteredData) {
      const key = item.seriesId || 'uncategorized';
      if (!map.has(key)) {
        map.set(key, {
          seriesId: key,
          seriesName: item.seriesName || (key === 'uncategorized' ? '未归类' : key),
          episodes: [],
        });
      }
      map.get(key)!.episodes.push(item);
    }
    // 每组内按 episodeNo 升序（无 episodeNo 的保持原顺序）
    for (const g of map.values()) {
      g.episodes.sort((a, b) => (a.episodeNo ?? 9999) - (b.episodeNo ?? 9999));
    }
    return Array.from(map.values());
  }, [filteredData]);

  // 折叠的系列 ID 集合
  const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (sid: string) => {
    setCollapsedSeries(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      status: 'draft',
      videoUrl: '',
      subtitleUrl: '',
      subtitleZhUrl: '',
      vocabularyUrl: '',
      pickedEpisodeId: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: VideoContent) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      status: item.status,
      videoUrl: item.videoUrl || '',
      subtitleUrl: item.subtitleUrl || '',
      subtitleZhUrl: item.subtitleZhUrl || '',
      vocabularyUrl: item.vocabularyUrl || '',
      pickedEpisodeId: episodeOptions.find(x => x.episodeId === item.id)?.episodeId || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这个视频课件吗？此操作无法撤销。')) {
      setData(data.filter(item => item.id !== id));
    }
  };

  const predictStemFromTitle = (title: string) => {
    return (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const openTimeline = (item: VideoContent) => {
    // 打开 TimelineEditor 前，先把它的 TL_KEY（admin-timeline:${id}）初始化，把 4 URL 写进去
    try {
      const TL_KEY = `admin-timeline:${item.id}`;
      const existing: any = (() => {
        try {
          const raw = localStorage.getItem(TL_KEY);
          return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
      })();
      // 默认 URL：用户填了就用用户的，否则按标题 stem 预测
      const stem = predictStemFromTitle(item.title);
      const nextVideo = existing.videoUrl || item.videoUrl || (stem ? `/media/${stem}.mp4` : '');
      const nextEn = existing.subtitlesEnUrl || item.subtitleUrl || (stem ? `/media/${stem}_en.vtt` : '');
      const nextZh = existing.subtitlesZhUrl || item.subtitleZhUrl || (stem ? `/media/${stem}_zh.vtt` : '');
      const nextVocab = existing.vocabularyUrl || item.vocabularyUrl || (stem ? `/media/${stem}_vocabulary.json` : '');
      localStorage.setItem(
        TL_KEY,
        JSON.stringify({
          events: Array.isArray(existing.events) ? existing.events : [],
          videoUrl: nextVideo,
          subtitlesEnUrl: nextEn,
          subtitlesZhUrl: nextZh,
          vocabularyUrl: nextVocab,
          source: 'content-manager',
          stem,
          updatedAt: new Date().toISOString(),
          title: item.title,
        })
      );
    } catch (e: any) {
      console.warn('[ContentManager] 写 timeline 初始化失败：', e);
    }
    navigate(`/content/edit/${item.id}`);
  };

  const handleSave = () => {
    if (!formData.title.trim()) {
      alert('请输入视频课件标题');
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    if (editingItem) {
      // Edit existing
      setData(data.map(item => item.id === editingItem.id ? {
        ...item,
        title: formData.title,
        status: formData.status,
        videoUrl: formData.videoUrl || undefined,
        subtitleUrl: formData.subtitleUrl || undefined,
        subtitleZhUrl: formData.subtitleZhUrl || undefined,
        vocabularyUrl: formData.vocabularyUrl || undefined,
        updatedAt: today
      } : item));
    } else {
      // Add new：如果用户选择了"从课程资料中选择的 episodeId，直接复用它做 id → 和 TL 对齐；否则用 Date.now()
      const chosenId = (formData as any).pickedEpisodeId ? (formData as any).pickedEpisodeId : Date.now().toString();
      const picked = (formData as any).pickedEpisodeId
        ? episodeOptions.find(x => x.episodeId === (formData as any).pickedEpisodeId)
        : null;
      const newItem: VideoContent = {
        id: chosenId,
        title: formData.title,
        seriesId: picked?.seriesId,
        seriesName: picked?.seriesName,
        status: formData.status,
        views: 0,
        updatedAt: today,
        videoUrl: formData.videoUrl || picked?.videoUrl || undefined,
        subtitleUrl: formData.subtitleUrl || picked?.subtitleUrl || undefined,
        subtitleZhUrl: formData.subtitleZhUrl || picked?.subtitleZhUrl || undefined,
        vocabularyUrl: formData.vocabularyUrl || picked?.vocabularyUrl || undefined,
      };
      // 若 pickedEpisodeId 已存在列表里（去重），就走 edit 逻辑而不是重复新增
      if ((formData as any).pickedEpisodeId && data.some(x => x.id === chosenId)) {
        const msg = `⚠️ 列表中已存在 ID = ${chosenId} 的课件（来自课程资料的单集），已更新其空字段而非重复新增。`;
        setData(prev => prev.map(x => x.id !== chosenId ? x : {
          ...x,
          title: x.title || newItem.title,
          status: newItem.status,
          videoUrl: x.videoUrl || newItem.videoUrl,
          subtitleUrl: x.subtitleUrl || newItem.subtitleUrl,
          subtitleZhUrl: x.subtitleZhUrl || newItem.subtitleZhUrl,
          vocabularyUrl: x.vocabularyUrl || newItem.vocabularyUrl,
          updatedAt: today,
        }));
        setIsModalOpen(false);
        setTimeout(() => alert(msg), 50);
        return;
      }
      setData([newItem, ...data]);
    }
    setIsModalOpen(false);
    // 写入由 useEffect([data]) 自动完成；给用户一个明确反馈
    setTimeout(() => {
      alert('✅ 已保存（浏览器本地持久化，刷新不丢失）\n\n下次要进入交互编辑器，点表格该行最右侧的「时间轴」按钮即可。');
    }, 50);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">内容管理</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSyncFromCourseMaterials}
            disabled={syncingCourses}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {syncingCourses ? '同步中…' : '🧙 同步课程资料'}
          </button>
          <button 
            onClick={openAddModal}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增课件
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="搜索视频标题..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 顶部小贴士 */}
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-indigo-500" />
            <span>结构：<b className="text-slate-700">动画片系列 → 单集</b>。点系列标题可折叠/展开，与 C 端「卡片 → 选集」一致。</span>
          </div>

          {groupedData.length === 0 && data.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center mb-5 text-indigo-500">
                <PlayCircle className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">内容管理列表是空的</h3>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                把课程资料管理中做好的课件同步到这里，再进入时间轴编辑器做逐词交互。
                <br />推荐优先用 <span className="text-violet-600 font-medium">紫色一键同步</span>，3 秒完成 3 模块打通。
              </p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <button
                  onClick={handleSyncFromCourseMaterials}
                  disabled={syncingCourses}
                  className="flex items-center px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  {syncingCourses ? '同步中…' : '🧙 从课程资料同步'}
                </button>
                <button
                  onClick={openAddModal}
                  className="flex items-center px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  手动新增课件
                </button>
              </div>
            </div>
          )}

          {groupedData.length === 0 && data.length > 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">
              搜索关键词没有匹配的视频课件（当前共 {data.length} 条，请换个关键词）
            </div>
          )}

          {/* 系列 → 单集 层级渲染 */}
          {groupedData.map((group) => {
            const collapsed = collapsedSeries.has(group.seriesId);
            const publishedCount = group.episodes.filter(e => e.status === 'published').length;
            return (
              <div key={group.seriesId} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                {/* 系列头部 */}
                <div
                  onClick={() => toggleSeries(group.seriesId)}
                  className="bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:from-indigo-100 hover:to-violet-100 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {collapsed ? (
                      <ChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    )}
                    <Film className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span className="font-bold text-slate-900 truncate">{group.seriesName}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {group.seriesId !== 'uncategorized' && `· ${group.seriesId}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                      {group.episodes.length} 集
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {publishedCount} 已发布
                    </span>
                    {group.episodes.length - publishedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                        {group.episodes.length - publishedCount} 草稿
                      </span>
                    )}
                  </div>
                </div>

                {/* 单集表格 */}
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                          <th className="px-6 py-2 font-medium">集</th>
                          <th className="px-6 py-2 font-medium">单集标题</th>
                          <th className="px-6 py-2 font-medium">状态</th>
                          <th className="px-6 py-2 font-medium">播放量</th>
                          <th className="px-6 py-2 font-medium">更新时间</th>
                          <th className="px-6 py-2 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.episodes.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                {item.episodeNo ?? '–'}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center min-w-0">
                                <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center mr-2 text-indigo-600 flex-shrink-0">
                                  <PlayCircle className="w-4 h-4" />
                                </div>
                                <span className="font-medium text-slate-900 truncate">{item.title}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                                item.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.status === 'published' ? '已发布' : '草稿'}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-slate-600 text-sm">{item.views.toLocaleString()}</td>
                            <td className="px-6 py-3 text-slate-600 text-sm">{item.updatedAt}</td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end space-x-3">
                                <button
                                  onClick={() => openTimeline(item)}
                                  className="text-indigo-600 hover:text-indigo-800 transition-colors p-1 flex items-center"
                                  title="编辑时间轴（预填视频 / 英字幕 / 中字幕 URL）"
                                >
                                  <PlayCircle className="w-4 h-4 mr-1" />
                                  <span className="text-xs">时间轴</span>
                                </button>
                                <button
                                  onClick={() => openEditModal(item)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                                  title="编辑课件基本信息"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="text-rose-600 hover:text-rose-800 transition-colors p-1"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? '编辑课件' : '新增课件'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {episodeOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    从课程资料中选择 <span className="text-slate-400 font-normal">(可选，选中后自动填 title + 4 URL)</span>
                  </label>
                  <select
                    value={(formData as any).pickedEpisodeId || ''}
                    onChange={(e) => handlePickEpisode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm bg-indigo-50"
                  >
                    <option value="">— 手动填写，不关联课程资料 —</option>
                    {episodeOptions.map(x => (
                      <option key={x.episodeId} value={x.episodeId}>
                        [{x.seriesName}] {x.episodeName || x.episodeId}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">视频标题</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入标题"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">发布状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'published' | 'draft' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="draft">草稿 (隐藏)</option>
                  <option value="published">已发布 (公开)</option>
                </select>
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  资源 URL（可选，进入时间轴时会自动带上）
                </h4>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    视频源 URL <span className="text-slate-400">（例 /media/Lets_Hold_Hands_Penelope.mp4）</span>
                  </label>
                  <input
                    type="text"
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/media/xxx.mp4 或 https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    英文字幕 URL <span className="text-slate-400">（例 xxx_en.vtt）</span>
                  </label>
                  <input
                    type="text"
                    value={formData.subtitleUrl}
                    onChange={(e) => setFormData({ ...formData, subtitleUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/media/xxx_en.vtt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    中文字幕 URL <span className="text-slate-400">（例 xxx_zh.vtt）</span>
                  </label>
                  <input
                    type="text"
                    value={formData.subtitleZhUrl}
                    onChange={(e) => setFormData({ ...formData, subtitleZhUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/media/xxx_zh.vtt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    生词表 URL <span className="text-slate-400">（例 xxx_vocabulary.json）</span>
                  </label>
                  <input
                    type="text"
                    value={formData.vocabularyUrl}
                    onChange={(e) => setFormData({ ...formData, vocabularyUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="/media/xxx_vocabulary.json"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50 flex-shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
