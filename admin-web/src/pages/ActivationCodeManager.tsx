import { useState } from 'react';
import { Plus, Search, Copy, Trash2, Check, X } from 'lucide-react';

interface ActivationCode {
  id: string;
  code: string;
  seriesId: string;
  seriesName: string;
  status: 'active' | 'used' | 'expired';
  usedBy?: string;
  createdAt: string;
  expiresAt: string;
}

export default function ActivationCodeManager() {
  const [codes, setCodes] = useState<ActivationCode[]>([
    { id: '1', code: 'PEPPA-2024-PEACH', seriesId: 'peppa_01', seriesName: '粉红猪小妹 第一季', status: 'active', createdAt: '2026-06-01', expiresAt: '2026-12-31' },
    { id: '2', code: 'PAW-2024-RESCUE', seriesId: 'paw_01', seriesName: '汪汪队立大功 第一季', status: 'active', createdAt: '2026-06-02', expiresAt: '2026-12-31' },
    { id: '3', code: 'MICKEY-2024-HOUSE', seriesId: 'disney_01', seriesName: '米奇妙妙屋', status: 'used', usedBy: '小汤圆', createdAt: '2026-06-03', expiresAt: '2026-12-31' },
  ]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newCode, setNewCode] = useState({ seriesId: '', seriesName: '', expiresAt: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = codes.filter(c => 
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.seriesName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!newCode.seriesId || !newCode.seriesName || !newCode.expiresAt) {
      alert('请填写完整信息');
      return;
    }
    const codeStr = `${newCode.seriesId.toUpperCase()}-2024-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const code: ActivationCode = {
      id: Date.now().toString(),
      code: codeStr,
      seriesId: newCode.seriesId,
      seriesName: newCode.seriesName,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      expiresAt: newCode.expiresAt,
    };
    setCodes([code, ...codes]);
    setShowModal(false);
    setNewCode({ seriesId: '', seriesName: '', expiresAt: '' });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这个激活码吗？')) {
      setCodes(codes.filter(c => c.id !== id));
    }
  };

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">授权码管理</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          生成授权码
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总授权码</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{codes.length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">未使用</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">{codes.filter(c => c.status === 'active').length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">已使用</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{codes.filter(c => c.status === 'used').length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="搜索授权码或课程名称..." 
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
                <th className="px-6 py-4 font-medium">授权码</th>
                <th className="px-6 py-4 font-medium">关联课程</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium">使用人</th>
                <th className="px-6 py-4 font-medium">过期时间</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono font-bold text-slate-700">
                        {item.code}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(item.code, item.id)}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="复制"
                      >
                        {copiedId === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900">{item.seriesName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      item.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                      item.status === 'used' ? 'bg-blue-100 text-blue-700' : 
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {item.status === 'active' ? '未使用' : item.status === 'used' ? '已使用' : '已过期'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{item.usedBy || '-'}</td>
                  <td className="px-6 py-4 text-slate-600">{item.expiresAt}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="text-rose-600 hover:text-rose-800 transition-colors p-1" 
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    没有找到匹配的授权码
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">生成授权码</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">课程ID</label>
                <input
                  type="text"
                  value={newCode.seriesId}
                  onChange={(e) => setNewCode({ ...newCode, seriesId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: peppa_01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">课程名称</label>
                <input
                  type="text"
                  value={newCode.seriesName}
                  onChange={(e) => setNewCode({ ...newCode, seriesName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: 粉红猪小妹 第一季"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">过期时间</label>
                <input
                  type="date"
                  value={newCode.expiresAt}
                  onChange={(e) => setNewCode({ ...newCode, expiresAt: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end space-x-3 bg-slate-50">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
