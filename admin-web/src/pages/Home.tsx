import { Users, Video, Eye, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: '周一', users: 400, views: 240 },
  { name: '周二', users: 300, views: 139 },
  { name: '周三', users: 200, views: 980 },
  { name: '周四', users: 278, views: 390 },
  { name: '周五', users: 189, views: 480 },
  { name: '周六', users: 239, views: 380 },
  { name: '周日', users: 349, views: 430 },
];

const stats = [
  { name: '总用户数', value: '12,345', icon: Users, change: '+12%', color: 'text-blue-600', bg: 'bg-blue-100' },
  { name: '视频总数', value: '128', icon: Video, change: '+4', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  { name: '今日播放量', value: '3,456', icon: Eye, change: '+23%', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { name: '活跃度', value: '89%', icon: TrendingUp, change: '+2.1%', color: 'text-rose-600', bg: 'bg-rose-100' },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">数据总览</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-full ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-emerald-600 font-medium">{stat.change}</span>
              <span className="text-slate-500 ml-2">较昨日</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-6">近七天数据趋势</h2>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area type="monotone" dataKey="users" name="活跃用户" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
              <Area type="monotone" dataKey="views" name="播放量" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
