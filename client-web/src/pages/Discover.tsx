import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Play, Check, Loader2 } from 'lucide-react';

const banners = [
  { id: 1, img: 'https://picsum.photos/id/1015/800/1200', title: '小猪佩奇: 欢乐露营季', seriesId: 'peppa_01' },
  { id: 2, img: 'https://picsum.photos/id/1025/800/1200', title: '汪汪队: 终极救援', seriesId: 'paw_01' },
  { id: 3, img: 'https://picsum.photos/id/1033/800/1200', title: '海底小纵队: 夏日特辑', seriesId: 'oct_01' }
];

const updates = [
  { id: 1, title: '小马宝莉: 友谊的魔力', img: 'https://picsum.photos/id/10/400/300', ep: '全26集', seriesId: 'mlp_01' },
  { id: 2, title: '托马斯和他的朋友们', img: 'https://picsum.photos/id/11/400/300', ep: '全15集', seriesId: 'thomas_01' },
  { id: 3, title: '朵拉大冒险', img: 'https://picsum.photos/id/12/400/300', ep: '全20集', seriesId: 'dora_01' },
  { id: 4, title: '蓝色小考拉 Penelope', img: 'https://picsum.photos/id/13/400/300', ep: '全10集', seriesId: 'penelope_01' },
  { id: 5, title: '米奇妙妙屋 第一季', img: 'https://picsum.photos/id/14/400/300', ep: '全30集', seriesId: 'mickey_01' },
];

export default function Discover() {
  const navigate = useNavigate();
  const { addedToPark, addToPark, isAddedToPark, isSeriesUnlocked } = useStore();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const handleAddToPark = (seriesId: string) => {
    if (addedToPark.includes(seriesId)) return;
    setJoiningId(seriesId);
    setTimeout(() => {
      addToPark(seriesId, '/我的应用数据/英语宝贝动画宝');
      setJoiningId(null);
    }, 800);
  };

  const handleWatch = (seriesId: string) => {
    if (!isAddedToPark(seriesId)) {
      handleAddToPark(seriesId);
      return;
    }
    if (!isSeriesUnlocked(seriesId)) {
      navigate('/');
      return;
    }
    // 已解锁，进入播放
    navigate('/player', { state: { seriesId } });
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
            🔭 发现新世界
          </h1>
          <p className="text-sm font-bold mt-1" style={{ color: '#8C5A00' }}>
            探索更多精彩动画
          </p>
        </div>
      </header>

      <main className="px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* 轮播海报 */}
          <section>
            <div className="relative w-full aspect-[3/4] md:aspect-[2/1] rounded-3xl overflow-hidden shadow-2xl"
                 style={{ boxShadow: '0 20px 40px rgba(255, 125, 0, 0.2)' }}>
              <div className="flex transition-transform duration-500" style={{ transform: 'translateX(0%)' }}>
                {banners.map((b) => {
                  const isAdded = isAddedToPark(b.seriesId);
                  const isUnlocked = isSeriesUnlocked(b.seriesId);
                  
                  return (
                    <div key={b.id} className="w-full flex-shrink-0 relative">
                      <img src={b.img} alt={b.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="inline-block px-3 py-1 rounded-full text-xs font-black text-white mb-2"
                             style={{ background: '#FFD13B', color: '#8C5A00' }}>
                          重磅主推
                        </div>
                        <h3 className="text-2xl font-black text-white mb-3">{b.title}</h3>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleAddToPark(b.seriesId)}
                            disabled={isAdded}
                            className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-black bg-white/90 hover:bg-white disabled:opacity-70"
                            style={{ color: '#8C5A00', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
                          >
                            {joiningId === b.seriesId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isAdded ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              '📥'
                            )}
                            {isAdded ? '已加入' : '加入乐园'}
                          </button>
                          <button
                            onClick={() => handleWatch(b.seriesId)}
                            className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-black"
                            style={{ background: '#FFD13B', color: '#8C5A00', boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)' }}
                          >
                            <Play className="w-4 h-4 fill-current" />
                            {isUnlocked ? '立刻观看' : (isAdded ? '去解锁' : '加入后观看')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 指示点 */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                {banners.map((_, idx) => (
                  <div key={idx} className="w-2 h-2 rounded-full" style={{ background: idx === 0 ? '#FFD13B' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            </div>
          </section>

          {/* 最新上线剧集 */}
          <section>
            <h2 className="text-2xl font-black mb-4" style={{ color: '#FF7D00' }}>
              ✨ 最新上线剧集
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ 
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
              `}</style>
              <div className="flex gap-4 no-scrollbar">
                {updates.map((u) => {
                  const isAdded = isAddedToPark(u.seriesId);
                  const isUnlocked = isSeriesUnlocked(u.seriesId);
                  
                  return (
                    <div key={u.id} 
                         className="flex-shrink-0 w-36 bg-white rounded-2xl p-2 cursor-pointer transition-all hover:scale-105"
                         style={{ boxShadow: '0 8px 24px rgba(255, 209, 59, 0.15)' }}>
                      <div className="aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-gray-100">
                        <img src={u.img} alt={u.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="text-sm font-black text-gray-900 leading-tight mb-1 line-clamp-2">
                        {u.title}
                      </div>
                      <div className="text-xs font-bold px-2 py-1 rounded-full inline-block mb-2"
                           style={{ background: '#FFF3D6', color: '#8C5A00' }}>
                        {u.ep}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddToPark(u.seriesId)}
                          disabled={isAdded}
                          className="flex-1 py-1.5 rounded-full text-xs font-black bg-gray-100 hover:bg-gray-200 disabled:opacity-70 flex items-center justify-center gap-1"
                        >
                          {joiningId === u.seriesId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isAdded ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            '加入'
                          )}
                        </button>
                        <button
                          onClick={() => handleWatch(u.seriesId)}
                          className="flex-1 py-1.5 rounded-full text-xs font-black text-white"
                          style={{ background: 'linear-gradient(135deg, #FFD13B, #FF7D00)' }}
                        >
                          {isUnlocked ? '观看' : (isAdded ? '解锁' : '加入后看')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 推荐分类 */}
          <section>
            <h2 className="text-2xl font-black mb-4" style={{ color: '#FF7D00' }}>
              📂 热门分类
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: '启蒙认知', icon: '🧸', color: '#FFE4E1' },
                { name: '英语入门', icon: '🔤', color: '#E1F5FE' },
                { name: '情商培养', icon: '💝', color: '#FCE4EC' },
                { name: '科普探索', icon: '🚀', color: '#E8F5E9' },
              ].map((cat) => (
                <div key={cat.name} 
                     className="bg-white rounded-2xl p-4 flex flex-col items-center cursor-pointer transition-all hover:scale-105"
                     style={{ boxShadow: '0 8px 24px rgba(255, 209, 59, 0.15)' }}>
                  <span className="text-3xl mb-2">{cat.icon}</span>
                  <span className="text-sm font-black text-gray-900">{cat.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
