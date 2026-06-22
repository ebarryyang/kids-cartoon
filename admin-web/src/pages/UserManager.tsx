import { useState } from 'react';
import { Search, Ban, Unlock, Clock } from 'lucide-react';

interface User {
  id: string;
  nickname: string;
  openid: string;
  status: 'active' | 'banned';
  lastActive: string;
}

const initialUsers: User[] = [
  { id: '1', nickname: 'Alice', openid: 'wx_123456', status: 'active', lastActive: '2026-06-14 10:23' },
  { id: '2', nickname: 'Bob', openid: 'wx_789012', status: 'active', lastActive: '2026-06-13 15:45' },
  { id: '3', nickname: 'Charlie', openid: 'wx_345678', status: 'banned', lastActive: '2026-06-10 09:12' },
];

export default function UserManager() {
  const [users] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState('');

  const filtered = users.filter(u => u.nickname.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="搜索用户昵称..." 
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
                <th className="px-6 py-4 font-medium">昵称</th>
                <th className="px-6 py-4 font-medium">OpenID</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium">最后活跃</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{user.nickname}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-sm">{user.openid}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {user.status === 'active' ? '正常' : '已封禁'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-slate-400" />
                    {user.lastActive}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {user.status === 'active' ? (
                      <button className="text-rose-600 hover:text-rose-800 transition-colors flex items-center justify-end w-full" title="封禁用户">
                        <Ban className="w-4 h-4 mr-1" />
                        <span className="text-sm">封禁</span>
                      </button>
                    ) : (
                      <button className="text-emerald-600 hover:text-emerald-800 transition-colors flex items-center justify-end w-full" title="解封用户">
                        <Unlock className="w-4 h-4 mr-1" />
                        <span className="text-sm">解封</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
