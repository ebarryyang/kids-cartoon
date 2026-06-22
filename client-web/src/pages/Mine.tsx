import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ChevronRight, Cloud, Shield, LogOut, Settings } from 'lucide-react';

export default function Mine() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const accessToken = useStore((state) => state.accessToken);
  const logout = useStore((state) => state.logout);
  
  const [profile] = useState({
    name: user?.nickname || '小汤圆',
    age: 3,
    avatar: 'https://picsum.photos/id/177/200/200',
    score: 120,
  });

  const [isDriveBound] = useState(!!accessToken); // 根据accessToken判断
  const [showFilePicker, setShowFilePicker] = useState(false);

  const handleBindDrive = () => {
    navigate('/auth');
  };

  const handleImportToPark = () => {
    if (!isDriveBound) {
      alert('请先绑定网盘');
      return;
    }
    setShowFilePicker(true);
  };

  const handleConfirmImport = () => {
    setShowFilePicker(false);
    alert('已成功加入动画乐园！');
  };

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout();
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ 
      backgroundColor: '#FFFDF5',
      backgroundImage: 'radial-gradient(#FFE270 2px, transparent 2px)',
      backgroundSize: '40px 40px',
    }}>
      {/* Header */}
      <header className="px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-black" style={{ color: '#FF7D00' }}>
            👶 我的
          </h1>
        </div>
      </header>

      <main className="px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 个人信息卡片 */}
          <div className="bg-white rounded-3xl p-6 flex items-center gap-4"
               style={{ 
                 boxShadow: '0 16px 40px rgba(255, 125, 0, 0.15)',
                 border: '4px solid #FFD13B'
               }}>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl border-4 border-white shadow-lg">
              👶
            </div>
            <div className="flex-1">
              <div className="text-xl font-black" style={{ color: '#FF7D00' }}>
                {profile.name}
              </div>
              <div className="text-sm font-bold mt-1" style={{ color: '#8C5A00' }}>
                LV.{Math.floor(profile.score / 50) + 1} · {profile.age}岁
              </div>
              <div className="text-xs font-medium mt-1" style={{ color: '#8C5A00' }}>
                {user?.email}
              </div>
            </div>
            <button className="px-4 py-2 rounded-full text-sm font-black"
                    style={{ background: '#FFF3D6', color: '#8C5A00' }}>
              更新
            </button>
          </div>

          {/* 网盘资源管理 */}
          <section className="bg-white rounded-3xl p-6"
                   style={{ boxShadow: '0 12px 32px rgba(255, 209, 59, 0.15)' }}>
            <h2 className="text-xl font-black mb-4" style={{ color: '#FF7D00' }}>
              ☁️ 网盘资源管理
            </h2>
            
            {/* 网盘绑定 */}
            <div className="flex items-center justify-between p-4 rounded-2xl mb-3"
                 style={{ background: '#FFF9F0' }}>
              <div className="flex items-center gap-3">
                <Cloud className="w-8 h-8" style={{ color: '#FF7D00' }} />
                <div>
                  <div className="font-black text-gray-900">百度网盘授权</div>
                  <div className="text-sm font-bold" style={{ color: '#8C5A00' }}>
                    {isDriveBound ? '已绑定，可无感流播动画资源' : '绑定后可播放您网盘内的动画'}
                  </div>
                </div>
              </div>
              {isDriveBound ? (
                <div className="px-4 py-2 rounded-full text-sm font-black"
                     style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                  已绑定
                </div>
              ) : (
                <button onClick={handleBindDrive}
                        className="px-4 py-2 rounded-full text-sm font-black text-white"
                        style={{ background: 'linear-gradient(135deg, #FFD13B, #FF7D00)' }}>
                  去绑定
                </button>
              )}
            </div>

            {/* 导入资源 */}
            <div onClick={handleImportToPark}
                 className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                   !isDriveBound ? 'opacity-50' : 'hover:scale-[1.02]'
                 }`}
                 style={{ background: '#FFF9F0' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                     style={{ background: '#FFE4B5' }}>
                  📥
                </div>
                <div>
                  <div className="font-black text-gray-900">导入动画到乐园</div>
                  <div className="text-sm font-bold" style={{ color: '#8C5A00' }}>
                    从网盘选择文件夹，AI 自动匹配互动教案
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5" style={{ color: '#8C5A00' }} />
            </div>
          </section>

          {/* FEATURES */}
          <section className="bg-white rounded-3xl p-6"
                   style={{ boxShadow: '0 12px 32px rgba(255, 209, 59, 0.15)' }}>
            <h2 className="text-sm font-black mb-4 tracking-wider" style={{ color: '#8C5A00' }}>
              FEATURES
            </h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📚</span>
                  <span className="font-black text-gray-900">绘本点读扩展</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎤</span>
                  <span className="font-black text-gray-900">零存储口语测评</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </section>

          {/* 设置与安全 */}
          <section className="bg-white rounded-3xl p-6"
                   style={{ boxShadow: '0 12px 32px rgba(255, 209, 59, 0.15)' }}>
            <h2 className="text-sm font-black mb-4 tracking-wider" style={{ color: '#8C5A00' }}>
              SETTINGS
            </h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-400" />
                  <span className="font-black text-gray-900">账户设置</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-gray-400" />
                  <span className="font-black text-gray-900">隐私设置</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </section>

          {/* 退出登录 */}
          <div className="flex justify-center pt-4">
            <button onClick={handleLogout}
                    className="flex items-center gap-2 px-6 py-3 rounded-full bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors font-medium">
              <LogOut className="w-5 h-5" />
              退出登录
            </button>
          </div>
        </div>
      </main>

      {/* 模拟网盘文件选择器弹窗 */}
      {showFilePicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col"
               style={{ 
                 background: '#FFFDF5',
                 boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
                 animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
               }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black" style={{ color: '#1A2980' }}>
                选择网盘文件夹
              </h3>
              <button onClick={() => setShowFilePicker(false)}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                ✕
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white"
                   style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <span className="text-2xl">📁</span>
                <div className="flex-1">
                  <div className="font-black text-gray-900">粉红猪小妹 第一季</div>
                  <div className="text-xs font-bold" style={{ color: '#8C5A00' }}>包含 52 个视频文件</div>
                </div>
                <div className="w-6 h-6 rounded-full border-4 border-green-500" />
              </div>
              
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50">
                <span className="text-2xl">📁</span>
                <div className="flex-1">
                  <div className="font-black text-gray-900">汪汪队立大功 英文版</div>
                  <div className="text-xs font-bold" style={{ color: '#8C5A00' }}>包含 26 个视频文件</div>
                </div>
                <div className="w-6 h-6 rounded-full border-4 border-gray-300" />
              </div>
            </div>

            <button onClick={handleConfirmImport}
                    className="w-full h-12 rounded-full font-black text-white"
                    style={{ 
                      background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                      boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
                    }}>
              确认导入并匹配教案
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
