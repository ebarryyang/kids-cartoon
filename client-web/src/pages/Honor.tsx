import { useState } from 'react';
import { Lock } from 'lucide-react';

interface MedalItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  requiredScore: number;
}

export default function Honor() {
  const [profile] = useState({
    name: '小汤圆',
    age: 3,
    avatar: 'https://picsum.photos/id/177/200/200',
    score: 120,
    medals: [
      { id: 'm1', name: '小小观察家', icon: '👀', description: '看完5集动画', unlocked: true, requiredScore: 50 },
      { id: 'm2', name: '专注小能手', icon: '🎯', description: '看完10集动画', unlocked: true, requiredScore: 100 },
      { id: 'm3', name: '英语小达人', icon: '🌟', description: '看完20集动画', unlocked: false, requiredScore: 200 },
      { id: 'm4', name: '坚持不懈', icon: '💪', description: '看完50集动画', unlocked: false, requiredScore: 500 },
      { id: 'm5', name: '智慧小星星', icon: '✨', description: '看完100集动画', unlocked: false, requiredScore: 1000 },
      { id: 'm6', name: '全能小霸王', icon: '👑', description: '看完200集动画', unlocked: false, requiredScore: 2000 }
    ] as MedalItem[]
  });

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
            🏅 荣誉殿堂
          </h1>
          <p className="text-sm font-bold mt-1" style={{ color: '#8C5A00' }}>
            观看动画，收集勋章
          </p>
        </div>
      </header>

      <main className="px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 积分板 */}
          <div className="bg-white rounded-3xl p-6 text-center"
               style={{ 
                 boxShadow: '0 16px 40px rgba(255, 125, 0, 0.15)',
                 border: '4px solid #FFD13B'
               }}>
            <div className="text-6xl font-black mb-2" style={{ color: '#FF7D00' }}>
              {profile.score}
            </div>
            <div className="text-lg font-bold" style={{ color: '#8C5A00' }}>
              我的积分 🌟
            </div>
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-1 rounded-full text-sm font-bold"
                 style={{ background: '#FFF3D6', color: '#8C5A00' }}>
              LV.{Math.floor(profile.score / 50) + 1}
            </div>
          </div>

          {/* 勋章墙 */}
          <section>
            <h2 className="text-2xl font-black mb-4" style={{ color: '#FF7D00' }}>
              荣誉勋章墙
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {profile.medals.map((medal) => (
                <div key={medal.id} 
                     className={`rounded-3xl p-4 flex flex-col items-center text-center transition-all ${
                       medal.unlocked ? 'bg-white' : 'bg-gray-100'
                     }`}
                     style={{ 
                       boxShadow: medal.unlocked 
                         ? '0 12px 32px rgba(255, 209, 59, 0.2)' 
                         : 'none',
                       border: medal.unlocked ? '4px solid #FFD13B' : '4px solid #E5E7EB'
                     }}>
                  {/* 图标 */}
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-3 ${
                    medal.unlocked ? '' : 'grayscale opacity-50'
                  }`}
                       style={{ 
                         background: medal.unlocked 
                           ? 'linear-gradient(135deg, #FFE4B5, #FFD13B)' 
                           : '#E5E7EB'
                       }}>
                    {medal.icon}
                  </div>
                  
                  {/* 名称 */}
                  <div className={`text-base font-black mb-1 ${
                    medal.unlocked ? 'text-gray-900' : 'text-gray-400'
                  }`}>
                    {medal.name}
                  </div>
                  
                  {/* 描述 */}
                  <div className="text-xs font-bold mb-3" style={{ color: '#8C5A00' }}>
                    {medal.description}
                  </div>
                  
                  {/* 状态徽章 */}
                  {medal.unlocked ? (
                    <div className="px-3 py-1 rounded-full text-xs font-black"
                         style={{ background: '#FFD13B', color: '#8C5A00' }}>
                      已获得
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-gray-200 text-gray-400">
                      <Lock className="w-3 h-3" />
                      需 {medal.requiredScore} 分
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 成就进度 */}
          <section className="bg-white rounded-3xl p-6"
                   style={{ boxShadow: '0 12px 32px rgba(255, 209, 59, 0.15)' }}>
            <h3 className="text-xl font-black mb-4" style={{ color: '#FF7D00' }}>
              📊 观看进度
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-bold mb-1">
                  <span style={{ color: '#8C5A00' }}>本周观看</span>
                  <span style={{ color: '#FF7D00' }}>3 / 7 集</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" 
                       style={{ width: '43%', background: 'linear-gradient(90deg, #FFD13B, #FF7D00)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-bold mb-1">
                  <span style={{ color: '#8C5A00' }}>总观看时长</span>
                  <span style={{ color: '#FF7D00' }}>2.5 小时</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" 
                       style={{ width: '62%', background: 'linear-gradient(90deg, #FFD13B, #FF7D00)' }} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
