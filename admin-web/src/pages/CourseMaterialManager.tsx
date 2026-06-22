import { useState } from 'react';
import { 
  BookOpen, Mic, FileText, Plus, Search, ChevronRight, 
  Upload, Eye, Trash2, Edit3, Save, X, PlayCircle
} from 'lucide-react';

interface EpisodeMaterial {
  episodeId: string;
  episodeName: string;
  subtitleUrl?: string;
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

export default function CourseMaterialManager() {
  const [courses, setCourses] = useState<CourseMaterial[]>([
    {
      seriesId: 'peppa_01',
      seriesName: '粉红猪小妹 第一季',
      coverUrl: 'https://picsum.photos/id/237/100/100',
      episodes: [
        { episodeId: 'ep_01', episodeName: '第1集：Muddy Puddles', subtitleUrl: '/materials/peppa/ep01/subtitle.vtt', vocabularyUrl: '/materials/peppa/ep01/vocab.json', hasExercise: true, exerciseCount: 5 },
        { episodeId: 'ep_02', episodeName: '第2集：Mr. Dinosaur Is Lost', subtitleUrl: '/materials/peppa/ep02/subtitle.vtt', vocabularyUrl: '/materials/peppa/ep02/vocab.json', hasExercise: true, exerciseCount: 4 },
        { episodeId: 'ep_03', episodeName: '第3集：Best Friend', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
      ]
    },
    {
      seriesId: 'paw_01',
      seriesName: '汪汪队立大功 第一季',
      coverUrl: 'https://picsum.photos/id/1025/100/100',
      episodes: [
        { episodeId: 'ep_01', episodeName: '第1集：Pups Save a Train', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
        { episodeId: 'ep_02', episodeName: '第2集：Pups and the Snow Monster', subtitleUrl: '', vocabularyUrl: '', hasExercise: false },
      ]
    }
  ]);

  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [editingEpisode, setEditingEpisode] = useState<{ seriesId: string; episodeId: string } | null>(null);
  const [editForm, setEditForm] = useState<Partial<EpisodeMaterial>>({});
  const [search, setSearch] = useState('');

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
      subtitleUrl: episode.subtitleUrl,
      vocabularyUrl: episode.vocabularyUrl,
      hasExercise: episode.hasExercise,
      exerciseCount: episode.exerciseCount,
    });
  };

  const saveEdit = () => {
    if (!editingEpisode) return;
    setCourses(courses.map(course => {
      if (course.seriesId !== editingEpisode.seriesId) return course;
      return {
        ...course,
        episodes: course.episodes.map(ep => 
          ep.episodeId === editingEpisode.episodeId ? { ...ep, ...editForm } : ep
        )
      };
    }));
    setEditingEpisode(null);
    setEditForm({});
  };

  const addEpisode = (seriesId: string) => {
    const course = courses.find(c => c.seriesId === seriesId);
    if (!course) return;
    const newEp: EpisodeMaterial = {
      episodeId: `ep_${Date.now()}`,
      episodeName: `新单集 ${course.episodes.length + 1}`,
      hasExercise: false,
    };
    setCourses(courses.map(c => 
      c.seriesId === seriesId 
        ? { ...c, episodes: [...c.episodes, newEp] }
        : c
    ));
  };

  const removeEpisode = (seriesId: string, episodeId: string) => {
    if (!window.confirm('确定要删除这个单集吗？')) return;
    setCourses(courses.map(c => {
      if (c.seriesId !== seriesId) return c;
      return { ...c, episodes: c.episodes.filter(ep => ep.episodeId !== episodeId) };
    }));
  };

  const addCourse = () => {
    const name = prompt('请输入课程名称：');
    if (!name) return;
    const newCourse: CourseMaterial = {
      seriesId: `series_${Date.now()}`,
      seriesName: name,
      episodes: []
    };
    setCourses([...courses, newCourse]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">课程资料管理</h1>
        <button 
          onClick={addCourse}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          新增课程
        </button>
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
                        <th className="px-6 py-3 font-medium">单集</th>
                        <th className="px-6 py-3 font-medium">字幕</th>
                        <th className="px-6 py-3 font-medium">生词表</th>
                        <th className="px-6 py-3 font-medium">互动练习</th>
                        <th className="px-6 py-3 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {course.episodes.map((ep) => {
                        const isEditing = editingEpisode?.seriesId === course.seriesId && editingEpisode?.episodeId === ep.episodeId;
                        
                        return (
                          <tr key={ep.episodeId} className="hover:bg-slate-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <PlayCircle className="w-4 h-4 text-slate-400" />
                                <span className="font-medium text-slate-900">{ep.episodeName}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.subtitleUrl || ''}
                                  onChange={(e) => setEditForm({ ...editForm, subtitleUrl: e.target.value })}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="/path/to/subtitle.vtt"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  {ep.subtitleUrl ? (
                                    <span className="flex items-center gap-1 text-emerald-600 text-sm">
                                      <FileText className="w-4 h-4" />
                                      {ep.subtitleUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-sm">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.vocabularyUrl || ''}
                                  onChange={(e) => setEditForm({ ...editForm, vocabularyUrl: e.target.value })}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="/path/to/vocab.json"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  {ep.vocabularyUrl ? (
                                    <span className="flex items-center gap-1 text-amber-600 text-sm">
                                      <BookOpen className="w-4 h-4" />
                                      {ep.vocabularyUrl.split('/').pop()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-sm">未配置</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
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
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    <Mic className="w-3 h-3" />
                                    {ep.exerciseCount || 0} 题
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-sm">无</span>
                                )
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={saveEdit}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="保存"
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
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => startEdit(course.seriesId, ep)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="编辑"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeEpisode(course.seriesId, ep.episodeId)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="删除"
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
                          <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                            <div className="flex flex-col items-center">
                              <PlayCircle className="w-8 h-8 mb-2 opacity-30" />
                              <p>还没有单集，点击上方 + 添加</p>
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
            <p className="text-slate-500">没有找到匹配的课程</p>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-2">📚 使用说明</h3>
        <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
          <li>为每个动画课程配置字幕文件（.vtt/.srt）和生词表（.json）</li>
          <li>文件需先上传到平台服务器或 CDN，然后填写 URL 路径</li>
          <li>互动练习配置后，C端播放页将自动显示练习题入口</li>
          <li>单集顺序将直接影响 C 端的播放顺序</li>
        </ul>
      </div>
    </div>
  );
}
