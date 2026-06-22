import { Shield, Key } from 'lucide-react';

export default function Settings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">系统设置</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-blue-600" />
            管理员账号设置
          </h2>
          <p className="text-sm text-slate-500 mt-1">管理系统后台登录账号与权限</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div>
              <p className="font-medium text-slate-900">admin (超级管理员)</p>
              <p className="text-sm text-slate-500 mt-1">最后登录：2026-06-14 12:00</p>
            </div>
            <button className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors">
              <Key className="w-4 h-4 mr-2" />
              修改密码
            </button>
          </div>
          
          <button className="text-sm text-blue-600 font-medium hover:text-blue-800 transition-colors">
            + 添加新管理员
          </button>
        </div>
      </div>
    </div>
  );
}
