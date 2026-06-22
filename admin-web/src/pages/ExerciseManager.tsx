import { useState } from 'react';
import { Plus, Search, Trash2, Edit3, Save, X, BookOpen, Type, Image, Volume2, HelpCircle } from 'lucide-react';

interface Exercise {
  id: string;
  seriesId: string;
  seriesName: string;
  episodeId: string;
  episodeName: string;
  type: 'vocabulary' | 'phrase' | 'listening' | 'choice';
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export default function ExerciseManager() {
  const [exercises, setExercises] = useState<Exercise[]>([
    {
      id: '1',
      seriesId: 'peppa_01',
      seriesName: '粉红猪小妹 第一季',
      episodeId: 'ep_01',
      episodeName: '第1集：Muddy Puddles',
      type: 'vocabulary',
      question: 'muddy 是什么意思？',
      options: ['脏的', '干净的', '湿的', '干的'],
      answer: '脏的',
      explanation: 'muddy 意思是泥泞的、脏的',
      difficulty: 'easy'
    },
    {
      id: '2',
      seriesId: 'peppa_01',
      seriesName: '粉红猪小妹 第一季',
      episodeId: 'ep_01',
      episodeName: '第1集：Muddy Puddles',
      type: 'phrase',
      question: '"Jump in muddy puddles" 是什么意思？',
      options: ['跳过水坑', '跳进泥坑', '在水坑里游泳', '打扫水坑'],
      answer: '跳进泥坑',
      explanation: 'jump in 是跳进...的意思，muddy puddles 是泥坑',
      difficulty: 'medium'
    },
    {
      id: '3',
      seriesId: 'paw_01',
      seriesName: '汪汪队立大功 第一季',
      episodeId: 'ep_01',
      episodeName: '第1集：Pups Save a Train',
      type: 'listening',
      question: '听录音，选择正确的答案',
      options: ['Yes', 'No', 'Maybe', 'Later'],
      answer: 'Yes',
      explanation: '根据视频内容，答案是 Yes',
      difficulty: 'hard'
    }
  ]);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Exercise>>({
    type: 'vocabulary',
    difficulty: 'easy',
  });

  const filtered = exercises.filter(e => 
    e.question.toLowerCase().includes(search.toLowerCase()) ||
    e.seriesName.toLowerCase().includes(search.toLowerCase()) ||
    e.episodeName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (!form.seriesId || !form.episodeId || !form.question || !form.answer) {
      alert('请填写完整信息');
      return;
    }

    if (editingId) {
      setExercises(exercises.map(e => e.id === editingId ? { ...e, ...form } as Exercise : e));
    } else {
      const newExercise: Exercise = {
        id: Date.now().toString(),
        seriesId: form.seriesId!,
        seriesName: form.seriesName || '未知课程',
        episodeId: form.episodeId!,
        episodeName: form.episodeName || '未知单集',
        type: form.type as Exercise['type'],
        question: form.question,
        options: form.options,
        answer: form.answer,
        explanation: form.explanation,
        difficulty: form.difficulty as Exercise['difficulty'],
      };
      setExercises([...exercises, newExercise]);
    }
    setShowModal(false);
    setForm({ type: 'vocabulary', difficulty: 'easy' });
    setEditingId(null);
  };

  const handleEdit = (ex: Exercise) => {
    setEditingId(ex.id);
    setForm(ex);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这道练习题吗？')) {
      setExercises(exercises.filter(e => e.id !== id));
    }
  };

  const getTypeIcon = (type: Exercise['type']) => {
    switch (type) {
      case 'vocabulary': return <Type className="w-4 h-4" />;
      case 'phrase': return <BookOpen className="w-4 h-4" />;
      case 'listening': return <Volume2 className="w-4 h-4" />;
      case 'choice': return <HelpCircle className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: Exercise['type']) => {
    switch (type) {
      case 'vocabulary': return '单词';
      case 'phrase': return '短语';
      case 'listening': return '听力';
      case 'choice': return '选择';
    }
  };

  const getDifficultyColor = (difficulty: Exercise['difficulty']) => {
    switch (difficulty) {
      case 'easy': return 'bg-emerald-100 text-emerald-700';
      case 'medium': return 'bg-amber-100 text-amber-700';
      case 'hard': return 'bg-rose-100 text-rose-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">互动练习管理</h1>
        <button 
          onClick={() => { setEditingId(null); setForm({ type: 'vocabulary', difficulty: 'easy' }); setShowModal(true); }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加练习题
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总题数</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{exercises.length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">单词题</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{exercises.filter(e => e.type === 'vocabulary').length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">听力题</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">{exercises.filter(e => e.type === 'listening').length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">选择/短语题</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">
            {exercises.filter(e => e.type === 'choice' || e.type === 'phrase').length}
          </div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="搜索题目内容、课程或单集..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 题目列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">题目内容</th>
                <th className="px-6 py-4 font-medium">所属课程</th>
                <th className="px-6 py-4 font-medium">类型</th>
                <th className="px-6 py-4 font-medium">难度</th>
                <th className="px-6 py-4 font-medium">正确答案</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="max-w-md">
                      <p className="font-medium text-slate-900 line-clamp-2">{ex.question}</p>
                      {ex.options && (
                        <p className="text-xs text-slate-500 mt-1">
                          选项：{ex.options.join(' / ')}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-slate-900">{ex.seriesName}</div>
                      <div className="text-xs text-slate-500">{ex.episodeName}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
                      {getTypeIcon(ex.type)}
                      {getTypeLabel(ex.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getDifficultyColor(ex.difficulty)}`}>
                      {ex.difficulty === 'easy' ? '简单' : ex.difficulty === 'medium' ? '中等' : '困难'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-900">{ex.answer}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(ex)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                        title="编辑"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(ex.id)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    没有找到匹配的练习题
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? '编辑练习题' : '添加练习题'}
              </h3>
              <button 
                onClick={() => { setShowModal(false); setEditingId(null); }} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">课程ID</label>
                  <input
                    type="text"
                    value={form.seriesId || ''}
                    onChange={(e) => setForm({ ...form, seriesId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如: peppa_01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">单集ID</label>
                  <input
                    type="text"
                    value={form.episodeId || ''}
                    onChange={(e) => setForm({ ...form, episodeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如: ep_01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">题目类型</label>
                <select
                  value={form.type || 'vocabulary'}
                  onChange={(e) => setForm({ ...form, type: e.target.value as Exercise['type'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="vocabulary">单词题</option>
                  <option value="phrase">短语题</option>
                  <option value="listening">听力题</option>
                  <option value="choice">选择题</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">题目内容</label>
                <textarea
                  value={form.question || ''}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入题目..."
                />
              </div>

              {form.type !== 'listening' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">选项（用逗号分隔）</label>
                  <input
                    type="text"
                    value={form.options?.join(', ') || ''}
                    onChange={(e) => setForm({ ...form, options: e.target.value.split(',').map(s => s.trim()) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="选项A, 选项B, 选项C, 选项D"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">正确答案</label>
                <input
                  type="text"
                  value={form.answer || ''}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入正确答案"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">答案解析（可选）</label>
                <textarea
                  value={form.explanation || ''}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="解释为什么选这个答案..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">难度等级</label>
                <select
                  value={form.difficulty || 'easy'}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value as Exercise['difficulty'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="easy">简单</option>
                  <option value="medium">中等</option>
                  <option value="hard">困难</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50">
              <button
                onClick={() => { setShowModal(false); setEditingId(null); }}
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
