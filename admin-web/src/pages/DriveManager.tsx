import { useState } from 'react';
import { Search, Cloud, Link2, Unlink, Film, FileText, BookOpen, ExternalLink } from 'lucide-react';

interface DriveFolder {
  id: string;
  path: string;
  seriesId?: string;
  seriesName?: string;
  videoCount: number;
  subtitleCount: number;
  vocabCount: number;
  boundAt?: string;
}

export default function DriveManager() {
  const [folders, setFolders] = useState<DriveFolder[]>([
    { id: '1', path: '/我的应用数据/英语宝贝动画宝/粉红猪小妹', seriesId: 'peppa_01', seriesName: '粉红猪小妹 第一季', videoCount: 52, subtitleCount: 52, vocabCount: 1, boundAt: '2026-06-01' },
    { id: '2', path: '/我的应用数据/英语宝贝动画宝/汪汪队立大功', seriesId: 'paw_01', seriesName: '汪汪队立大功 第一季', videoCount: 26, subtitleCount: 0, vocabCount: 0, boundAt: '2026-06-02' },
    { id: '3', path: '/我的应用数据/英语宝贝动画宝/米奇妙妙屋', seriesId: 'disney_01', seriesName: '米奇妙妙屋', videoCount: 30, subtitleCount: 30, vocabCount: 2, boundAt: '2026-06-03' },
  ]);
  const [search, setSearch] = useState('');

  const filtered = folders.filter(f => 
    f.path.toLowerCase().includes(search.toLowerCase()) ||
    f.seriesName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleUnbind = (id: string) => {
    if (window.confirm('确定要解除绑定吗？C端将无法播放该课程视频。')) {
      setFolders(folders.map(f => f.id === id ? { ...f, seriesId: undefined, seriesName: undefined, boundAt: undefined } : f));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">百度网盘资源管理</h1>
        <button 
          onClick={() => alert('请先在C端完成网盘OAuth授权，然后在该课程详情页绑定网盘文件夹')}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Cloud className="w-4 h-4 mr-2" />
          查看授权状态
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">已绑定文件夹</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{folders.filter(f => f.seriesId).length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">未绑定文件夹</div>
          <div className="text-3xl font-bold text-amber-600 mt-2">{folders.filter(f => !f.seriesId).length}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总视频数</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{folders.reduce((sum, f) => sum + f.videoCount, 0)}</div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="text-sm font-medium text-slate-500">总字幕数</div>
          <div className="text-3xl font-bold text-emerald-600 mt-2">{folders.reduce((sum, f) => sum + f.subtitleCount, 0)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="搜索文件夹路径或课程名称..." 
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
                <th className="px-6 py-4 font-medium">网盘路径</th>
                <th className="px-6 py-4 font-medium">关联课程</th>
                <th className="px-6 py-4 font-medium">视频</th>
                <th className="px-6 py-4 font-medium">字幕</th>
                <th className="px-6 py-4 font-medium">生词表</th>
                <th className="px-6 py-4 font-medium">绑定时间</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((folder) => (
                <tr key={folder.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <code className="text-sm font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded">
                        {folder.path}
                      </code>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {folder.seriesName ? (
                      <span className="font-medium text-slate-900">{folder.seriesName}</span>
                    ) : (
                      <span className="text-slate-400">未绑定</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Film className="w-4 h-4" />
                      {folder.videoCount}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <FileText className="w-4 h-4" />
                      {folder.subtitleCount}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <BookOpen className="w-4 h-4" />
                      {folder.vocabCount}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{folder.boundAt || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => window.open(`https://pan.baidu.com`, '_blank')}
                        className="text-slate-400 hover:text-blue-600 transition-colors p-1" 
                        title="打开网盘"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      {folder.seriesId ? (
                        <button 
                          onClick={() => handleUnbind(folder.id)}
                          className="text-rose-600 hover:text-rose-800 transition-colors p-1" 
                          title="解除绑定"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      ) : (
                        <button 
                          onClick={() => alert('请在C端课程卡片中完成绑定')}
                          className="text-blue-600 hover:text-blue-800 transition-colors p-1" 
                          title="绑定课程"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    没有找到匹配的文件夹
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-2">💡 使用说明</h3>
        <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
          <li>C端用户需要先完成百度网盘OAuth授权</li>
          <li>在C端「我的动画乐园」中，点击已解锁的课程卡片</li>
          <li>选择包含视频文件的网盘文件夹进行绑定</li>
          <li>绑定后系统会自动识别同文件夹内的字幕(.vtt/.srt)和生词表文件</li>
          <li>绑定关系会显示在此页面，支持解除绑定</li>
        </ul>
      </div>
    </div>
  );
}
