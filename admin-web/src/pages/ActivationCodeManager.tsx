import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Copy, Trash2, Check, X, Download, Filter, Link as LinkIcon, Sparkles
} from 'lucide-react';
import { loadAllCourses, type CourseMaterial } from '../lib/coursesDataLayer';
import { useNavigate } from 'react-router-dom';

export interface ActivationCode {
  id: string;
  code: string;
  seriesId: string;
  seriesName: string;
  status: 'active' | 'used' | 'expired';
  usedBy?: string;
  usedAt?: string;
  createdAt: string;
  expiresAt: string;
}

const STORAGE_KEY = 'admin-activation-codes:v1';

function genRandomSuffix(len = 6): string {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function loadLocal(): ActivationCode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function saveLocal(codes: ActivationCode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function downloadActivationCodesJSON(codes: ActivationCode[]): void {
  const payload = { version: 1, codes };
  const json = JSON.stringify(payload, null, 2) + '\n';
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'activation-codes.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ActivationCodeManager() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseMaterial[]>([]);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [search, setSearch] = useState('');
  const [filterSeriesId, setFilterSeriesId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [newCode, setNewCode] = useState<{ seriesId: string; customCode: string; expiresAt: string; count: number }>({
    seriesId: '',
    customCode: '',
    expiresAt: todayPlus(365),
    count: 1,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await loadAllCourses();
        setCourses(list);
      } finally {
        const localCodes = loadLocal();
        setCodes(localCodes);
        setLoading(false);
      }
    })();
    // 读取 URL query seriesId 作为默认筛选
    const params = new URLSearchParams(window.location.search);
    const s = params.get('seriesId');
    if (s) setFilterSeriesId(s);
  }, []);

  useEffect(() => { saveLocal(codes); }, [codes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return codes.filter(c => {
      if (filterSeriesId && c.seriesId !== filterSeriesId) return false;
      if (!q) return true;
      return (
        c.code.toLowerCase().includes(q) ||
        c.seriesName.toLowerCase().includes(q) ||
        (c.usedBy || '').toLowerCase().includes(q)
      );
    });
  }, [codes, search, filterSeriesId]);

  const coursesById = useMemo(() => new Map(courses.map(c => [c.seriesId, c])), [courses]);

  const statusTag = (status: ActivationCode['status'], expiresAt: string) => {
    const exp = new Date(`${expiresAt}T23:59:59`);
    const expired = !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now();
    const finalStatus: ActivationCode['status'] = expired ? 'expired' : status;
    if (finalStatus === 'active') return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">未使用</span>;
    if (finalStatus === 'used') return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">已使用</span>;
    return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500">已过期</span>;
  };

  const handleCreate = () => {
    if (!newCode.seriesId) {
      alert('请选择关联课程');
      return;
    }
    const course = coursesById.get(newCode.seriesId);
    if (!course) {
      alert('关联课程不存在，请先在「课程资料管理」创建课程');
      return;
    }
    const count = Math.max(1, Math.min(500, Number(newCode.count) || 1));
    const created: ActivationCode[] = [];
    const custom = newCode.customCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    for (let i = 0; i < count; i++) {
      const base = custom || `${course.seriesId.toUpperCase().replace(/[^A-Z0-9-]/g, '')}-${new Date().getFullYear()}`;
      const suf = count > 1 ? `-${genRandomSuffix(4)}` : (custom ? '' : `-${genRandomSuffix(4)}`);
      const codeStr = `${base}${suf}`;
      created.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        code: codeStr,
        seriesId: course.seriesId,
        seriesName: course.seriesName,
        status: 'active',
        createdAt: new Date().toISOString().split('T')[0],
        expiresAt: newCode.expiresAt || todayPlus(365),
      });
    }
    setCodes(prev => [...created, ...prev]);
    setShowModal(false);
    setNewCode({ seriesId: filterSeriesId || '', customCode: '', expiresAt: todayPlus(365), count: 1 });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('确定要删除这个授权码吗？')) return;
    setCodes(codes.filter(c => c.id !== id));
  };

  const handleBulkDeleteFiltered = () => {
    if (filtered.length === 0) return;
    if (!window.confirm(`确定删除当前筛选结果中的 ${filtered.length} 条授权码吗？（不可恢复）`)) return;
    const keep = new Set(filtered.map(c => c.id));
    setCodes(codes.filter(c => !keep.has(c.id)));
  };

  const copyToClipboard = (code: string, id: string) => {
    void navigator.clipboard?.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const copyAllFiltered = () => {
    if (filtered.length === 0) return;
    const txt = filtered.map(c => `${c.code}\t${c.seriesName}\t${c.expiresAt}`).join('\n');
    void navigator.clipboard?.writeText(txt);
    alert(`已复制 ${filtered.length} 条（授权码 + 课程名 + 过期时间）`);
  };

  const openMaterialsFilter = (seriesId: string) => {
    navigate(`/admin/materials?seriesId=${encodeURIComponent(seriesId)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">授权码管理</h1>
          <p className="text-sm text-slate-500 mt-1">生成激活码 → 点右上角「下载 activation-codes.json」→ 覆盖 <code className="bg-slate-100 px-1.5 py-0.5 rounded">client-web/public/data/activation-codes.json</code> → merge-dist + 重新部署 → C 端首页输入激活码即可解锁对应课程。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (courses.length === 0) return;
              const s = prompt('请输入要生成多少条（1~500），每条随机，关联课程用当前筛选', String(10));
              if (s == null) return;
              const n = Math.max(1, Math.min(500, Number(s) || 0));
              if (!n) return;
              const series = filterSeriesId ? coursesById.get(filterSeriesId) : courses[0];
              if (!series) { alert('请先创建课程或选择关联课程筛选'); return; }
              const created: ActivationCode[] = [];
              for (let i = 0; i < n; i++) {
                created.push({
                  id: `${Date.now()}_b_${i}_${Math.random().toString(36).slice(2, 6)}`,
                  code: `${series.seriesId.toUpperCase().replace(/[^A-Z0-9-]/g, '')}-${new Date().getFullYear()}-${genRandomSuffix(6)}`,
                  seriesId: series.seriesId,
                  seriesName: series.seriesName,
                  status: 'active',
                  createdAt: new Date().toISOString().split('T')[0],
                  expiresAt: todayPlus(365),
                });
              }
              setCodes(prev => [...created, ...prev]);
              alert(`已生成 ${n} 条「${series.seriesName}」授权码`);
            }}
            className="flex items-center px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors shadow-sm text-sm"
            title="批量随机生成（默认 10 条，关联课程默认当前筛选 / 第一个课程）"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            一键批量生成
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            生成授权码
          </button>
          <button
            onClick={() => downloadActivationCodesJSON(codes)}
            className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            下载 activation-codes.json
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总授权码</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{codes.length}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">未使用（未过期）</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">
            {codes.filter(c => {
              const exp = new Date(`${c.expiresAt}T23:59:59`);
              return c.status === 'active' && !(Number.isNaN(exp.getTime()) || exp.getTime() < Date.now());
            }).length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">已使用</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{codes.filter(c => c.status === 'used').length}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">当前筛选结果</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{filtered.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto flex-1">
            <div className="relative max-w-md w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="搜索授权码 / 课程名 / 使用人..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="relative max-w-md w-full lg:w-80">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <select
                value={filterSeriesId}
                onChange={(e) => setFilterSeriesId(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">所有课程</option>
                {courses.map(c => (
                  <option key={c.seriesId} value={c.seriesId}>{c.seriesName}（{c.seriesId}）</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            {filterSeriesId && (
              <button
                onClick={() => openMaterialsFilter(filterSeriesId)}
                className="flex items-center px-3 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
              >
                <LinkIcon className="w-4 h-4 mr-1.5" />
                打开对应课程资料
              </button>
            )}
            <button
              onClick={copyAllFiltered}
              className="flex items-center px-3 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
              disabled={filtered.length === 0}
            >
              <Copy className="w-4 h-4 mr-1.5" />
              复制筛选结果
            </button>
            <button
              onClick={handleBulkDeleteFiltered}
              className="flex items-center px-3 py-2 text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors text-sm"
              disabled={filtered.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              删除筛选结果
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-200">
                <th className="px-6 py-4 font-medium">授权码</th>
                <th className="px-6 py-4 font-medium">关联课程</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium">使用人 / 时间</th>
                <th className="px-6 py-4 font-medium">创建</th>
                <th className="px-6 py-4 font-medium">过期</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">加载中…</td>
                </tr>
              )}
              {!loading && filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono font-bold text-slate-700 break-all">
                        {item.code}
                      </code>
                      <button
                        onClick={() => copyToClipboard(item.code, item.id)}
                        className="text-slate-400 hover:text-blue-600 transition-colors flex-shrink-0"
                        title="复制"
                      >
                        {copiedId === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 align-top">
                    <div className="flex items-center gap-2">
                      {item.seriesName}
                      <button
                        onClick={() => openMaterialsFilter(item.seriesId)}
                        className="text-xs text-slate-400 hover:text-blue-600"
                        title="在课程资料管理中定位该课程"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-400 font-normal mt-0.5">{item.seriesId}</div>
                  </td>
                  <td className="px-6 py-4 align-top">{statusTag(item.status, item.expiresAt)}</td>
                  <td className="px-6 py-4 text-slate-600 align-top">
                    <div>{item.usedBy || '-'}</div>
                    {item.usedAt && <div className="text-xs text-slate-400 mt-1">{item.usedAt}</div>}
                  </td>
                  <td className="px-6 py-4 text-slate-600 align-top">{item.createdAt}</td>
                  <td className="px-6 py-4 text-slate-600 align-top">{item.expiresAt}</td>
                  <td className="px-6 py-4 text-right align-top whitespace-nowrap">
                    <button
                      onClick={() => {
                        if (item.status !== 'used') {
                          if (!window.confirm(`将「${item.code}」状态重置为「未使用」吗？（可重新兑换）`)) return;
                          setCodes(codes.map(c => c.id === item.id ? { ...c, status: 'active', usedBy: undefined, usedAt: undefined } : c));
                        } else {
                          if (!window.confirm(`将「${item.code}」标记为「已使用」吗？`)) return;
                          setCodes(codes.map(c => c.id === item.id ? { ...c, status: 'used', usedBy: c.usedBy || '管理员标记', usedAt: c.usedAt || new Date().toISOString().split('T')[0] } : c));
                        }
                      }}
                      className="text-slate-600 hover:text-slate-800 transition-colors p-1"
                      title="切换 未使用/已使用 状态"
                    >
                      {item.status === 'used' ? '↺ 重置' : '✓ 标记已用'}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-rose-600 hover:text-rose-800 transition-colors p-1 ml-2"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    {codes.length === 0
                      ? '还没有授权码，点击右上角「生成授权码」开始吧（关联的课程必须先在「课程资料管理」创建）。'
                      : '没有找到匹配的授权码'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-5">
          <h3 className="font-bold text-sky-900 mb-2">📋 授权码生效的完整 4 步</h3>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-sky-900">
            <li>先在「课程资料管理」里把系列创建好（填好视频/字幕/生词表 URL）。</li>
            <li>回到本页「生成授权码」→ 下拉选择对应课程 → 自定义前缀或随机 → 生成。</li>
            <li>点右上角「<b>下载 activation-codes.json</b>」→ 把文件拷到 <code className="bg-white px-1.5 py-0.5 rounded">client-web/public/data/activation-codes.json</code> 覆盖。</li>
            <li>跑 <code className="bg-white px-1.5 py-0.5 rounded">node scripts/merge-dist.js</code> + Vercel 重新部署。C 端激活码输入框就会通过 <code className="bg-white px-1.5 py-0.5 rounded">/data/activation-codes.json</code> 读到并兑换对应 seriesId。</li>
          </ol>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <h3 className="font-bold text-amber-900 mb-2">🧪 不想部署先本地测试（临时路径）</h3>
          <p className="text-sm text-amber-900 leading-7">
            C 端 <code className="bg-white px-1.5 py-0.5 rounded">activationCodes.ts</code> 会先 fetch <code className="bg-white px-1.5 py-0.5 rounded">/data/activation-codes.json</code>；如果访问失败（比如你还没把文件放 public/data/），它会 fallback 读浏览器 localStorage 里的 <code className="bg-white px-1.5 py-0.5 rounded">demo-activation-codes:v1</code>。
            本页生成的授权码已经存到 <code className="bg-white px-1.5 py-0.5 rounded">admin-activation-codes:v1</code>。在你还没走部署步骤前，可以先手动把「复制筛选结果」粘贴到 C 端 localStorage demo-activation-codes:v1 里快速验证。
          </p>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">生成授权码</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">关联课程 <span className="text-rose-500">*</span></label>
                <select
                  value={newCode.seriesId}
                  onChange={(e) => setNewCode({ ...newCode, seriesId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- 请选择课程（下拉可搜索）--</option>
                  {courses.map(c => (
                    <option key={c.seriesId} value={c.seriesId}>{c.seriesName}（{c.seriesId} · {c.episodes.length} 集）</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">下拉里没有？请先去「课程资料管理」新增课程系列。</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">自定义前缀（可选）</label>
                  <input
                    type="text"
                    value={newCode.customCode}
                    onChange={(e) => setNewCode({ ...newCode, customCode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例如 PENELOPE-2026"
                  />
                  <p className="text-xs text-slate-400 mt-1">留空默认 课程ID-年份-随机4位</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">生成数量</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={newCode.count}
                    onChange={(e) => setNewCode({ ...newCode, count: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
              >取消</button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
