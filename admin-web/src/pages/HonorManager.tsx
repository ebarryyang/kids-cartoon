import { useState } from 'react';
import { Trophy, Plus, Edit2, Trash2, Save, X, Medal } from 'lucide-react';

interface MedalTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  requiredScore: number;
  color: string;
}

export default function HonorManager() {
  const [medals, setMedals] = useState<MedalTemplate[]>([
    { id: '1', name: '小小观察家', icon: '👀', description: '看完5集动画', requiredScore: 50, color: '#FFE4B5' },
    { id: '2', name: '专注小能手', icon: '🎯', description: '看完10集动画', requiredScore: 100, color: '#E1F5FE' },
    { id: '3', name: '英语小达人', icon: '🌟', description: '看完20集动画', requiredScore: 200, color: '#FCE4EC' },
    { id: '4', name: '坚持不懈', icon: '💪', description: '看完50集动画', requiredScore: 500, color: '#E8F5E9' },
    { id: '5', name: '智慧小星星', icon: '✨', description: '看完100集动画', requiredScore: 1000, color: '#F3E5F5' },
    { id: '6', name: '全能小霸王', icon: '👑', description: '看完200集动画', requiredScore: 2000, color: '#FFF3E0' },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MedalTemplate>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMedal, setNewMedal] = useState<Partial<MedalTemplate>>({});

  const handleEdit = (medal: MedalTemplate) => {
    setEditingId(medal.id);
    setEditForm(medal);
  };

  const handleSave = () => {
    if (!editingId || !editForm.name) return;
    setMedals(medals.map(m => m.id === editingId ? { ...m, ...editForm } as MedalTemplate : m));
    setEditingId(null);
    setEditForm({});
  };

  const handleAdd = () => {
    if (!newMedal.name || !newMedal.requiredScore) {
      alert('请填写完整信息');
      return;
    }
    const medal: MedalTemplate = {
      id: Date.now().toString(),
      name: newMedal.name,
      icon: newMedal.icon || '🏅',
      description: newMedal.description || '',
      requiredScore: Number(newMedal.requiredScore),
      color: newMedal.color || '#FFE4B5',
    };
    setMedals([...medals, medal]);
    setShowAddModal(false);
    setNewMedal({});
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这个勋章吗？')) {
      setMedals(medals.filter(m => m.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">荣誉勋章管理</h1>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加勋章
        </button>
      </div>

      {/* 积分规则说明 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">📊 积分规则</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <span className="text-slate-700">观看1集动画</span>
            <span className="font-bold text-slate-900">+10 积分</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <span className="text-slate-700">完成1次生词学习</span>
            <span className="font-bold text-slate-900">+5 积分</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <span className="text-slate-700">完成1次互动练习</span>
            <span className="font-bold text-slate-900">+15 积分</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <span className="text-slate-700">连续打卡7天</span>
            <span className="font-bold text-slate-900">+30 积分</span>
          </div>
        </div>
      </div>

      {/* 勋章列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900">勋章模板库</h3>
          <p className="text-sm text-slate-500">管理C端展示的勋章，设置解锁所需积分</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {medals.map((medal) => (
              <div 
                key={medal.id} 
                className="relative bg-white rounded-2xl p-5 border-2 border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all group"
                style={{ background: `linear-gradient(135deg, ${medal.color}22, white)` }}
              >
                {editingId === medal.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="勋章名称"
                    />
                    <input
                      type="text"
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="描述"
                    />
                    <input
                      type="number"
                      value={editForm.requiredScore || ''}
                      onChange={(e) => setEditForm({ ...editForm, requiredScore: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="所需积分"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                        <Save className="w-4 h-4 mx-auto" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300">
                        <X className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-4xl">{medal.icon}</div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(medal)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(medal.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{medal.name}</h4>
                    <p className="text-sm text-slate-600 mb-3">{medal.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">所需积分</span>
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                        {medal.requiredScore} 分
                      </span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {medals.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>还没有勋章模板，点击上方按钮添加</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
