import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Users, 
  Settings, 
  LogOut, 
  Menu,
  X,
  KeyRound,
  Cloud,
  Trophy,
  BookOpen,
  HelpCircle
} from 'lucide-react';

const navigation = [
  { name: '控制台', href: '/', icon: LayoutDashboard },
  { name: '内容管理', href: '/content', icon: Video },
  { name: '授权码管理', href: '/activation-codes', icon: KeyRound },
  { name: '网盘资源', href: '/drive', icon: Cloud },
  { name: '课程资料管理', href: '/materials', icon: BookOpen },
  { name: '互动练习管理', href: '/exercises', icon: HelpCircle },
  { name: '荣誉管理', href: '/honor', icon: Trophy },
  { name: '用户管理', href: '/users', icon: Users },
  { name: '系统设置', href: '/settings', icon: Settings },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 bg-slate-950 border-b border-slate-800">
          <span className="text-xl font-bold">儿童英文动画</span>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`
                  flex items-center px-4 py-3 rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                `}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            退出登录
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 z-10">
          <button 
            className="lg:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-4 ml-auto">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-2">
                A
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">Admin</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
