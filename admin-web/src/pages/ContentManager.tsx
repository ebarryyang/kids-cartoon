import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Search, PlayCircle, X } from 'lucide-react';

interface VideoContent {
  id: string;
  title: string;
  status: 'published' | 'draft';
  views: number;
  updatedAt: string;
}

const initialData: VideoContent[] = [
  { id: '1', title: 'The Alphabet Song', status: 'published', views: 1250, updatedAt: '2026-06-14' },
  { id: '2', title: 'Colors Everywhere', status: 'published', views: 890, updatedAt: '2026-06-13' },
  { id: '3', title: 'Counting 1 to 10', status: 'draft', views: 0, updatedAt: '2026-06-12' },
];

export default function ContentManager() {
  const navigate = useNavigate();
  const [data, setData] = useState<VideoContent[]>(initialData);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VideoContent | null>(null);
  const [formData, setFormData] = useState({ title: '', status: 'draft' as 'published' | 'draft' });

  const filteredData = data.filter(item => 
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ title: '', status: 'draft' });
    setIsModalOpen(true);
  };

  const openEditModal = (item: VideoContent) => {
    setEditingItem(item);
    setFormData({ title: item.title, status: item.status });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这个视频课件吗？此操作无法撤销。')) {
      setData(data.filter(item => item.id !== id));
    }
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
        updatedAt: today
      } : item));
    } else {
      // Add new
      const newItem: VideoContent = {
        id: Date.now().toString(),
        title: formData.title,
        status: formData.status,
        views: 0,
        updatedAt: today
      };
      setData([newItem, ...data]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">内容管理</h1>
        <button 
          onClick={openAddModal}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          新增课件
        </button>
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">视频课件</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium">播放量</th>
                <th className="px-6 py-4 font-medium">更新时间</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center mr-3 text-indigo-600">
                        <PlayCircle className="w-6 h-6" />
                      </div>
                      <span className="font-medium text-slate-900">{item.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      item.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.status === 'published' ? '已发布' : '草稿'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{item.views.toLocaleString()}</td>
                  <td className="px-6 py-4 text-slate-600">{item.updatedAt}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button 
                        onClick={() => navigate(`/content/edit/${item.id}`)}
                        className="text-indigo-600 hover:text-indigo-800 transition-colors p-1 flex items-center" 
                        title="编辑时间轴"
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
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    没有找到匹配的视频课件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
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
            
            <div className="p-6 space-y-4">
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
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50">
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
