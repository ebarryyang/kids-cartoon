import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getCourseList } from '../lib/courseApi';
import { redeemActivationCode } from '../lib/activationCodes';
import { Loader2, Check, Lock } from 'lucide-react';

interface SeriesCard {
  seriesId: string;
  seriesName: string;
  coverUrl?: string;
  episodeCount: number;
}

// 当 API/静态数据缺封面时，根据 seriesId 哈希出一个稳定渐变色，避免空白卡片
const FALLBACK_COVER_GRADIENTS = [
  'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
];

function getCoverGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_COVER_GRADIENTS[h % FALLBACK_COVER_GRADIENTS.length];
}

export default function VideoList() {
  const {
    isSeriesUnlocked,
    unlockSeries,
    showKeyModal,
    setShowKeyModal,
  } = useStore();
  const navigate = useNavigate();

  const [series, setSeries] = useState<SeriesCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [keyValue, setKeyValue] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  // 动态加载动画片卡片：getCourseList() 失败时会自动 fallback 到 /data/courses.json
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getCourseList();
        if (!alive) return;
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setSeries(res.data);
        } else {
          setError('暂无可用动画片');
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || '加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 演示用：扫码后自动解锁第一个未解锁的卡片
  const handleScanCard = () => {
    const locked = series.find((s) => !isSeriesUnlocked(s.seriesId));
    if (!locked) {
      alert('所有动画片都已解锁啦！');
      return;
    }
    setUnlockingId(locked.seriesId);
    setTimeout(() => {
      unlockSeries(locked.seriesId);
      setUnlockingId(null);
    }, 1500);
  };

  const handleKeySubmit = async () => {
    const res = await redeemActivationCode(keyValue);
    if (!res.ok) {
      alert(res.reason || '兑换失败');
      return;
    }
    const sid = res.seriesId!;
    setUnlockingId(sid);
    setTimeout(() => {
      unlockSeries(sid);
      setShowKeyModal(false);
      setKeyValue('');
      setUnlockingId(null);
      alert(`兑换成功！已解锁「${res.seriesName || sid}」，卡片已在首页出现。`);
    }, 1000);
  };

  // 关键改造：点击卡片不再直接跳播放器，而是进入选集页
  const handleCardClick = (card: SeriesCard) => {
    if (!isSeriesUnlocked(card.seriesId)) {
      setShowKeyModal(true);
      return;
    }
    navigate(`/series/${card.seriesId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDF5' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          <span className="text-sm font-bold text-gray-600">正在加载动画片…</span>
        </div>
      </div>
    );
  }

  if (error || series.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDF5' }}>
        <div className="text-center px-6">
          <div className="text-5xl mb-4">😢</div>
          <div className="font-black text-gray-700 mb-2">{error || '暂无可用动画片'}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-full bg-orange-500 text-white text-sm font-black shadow-sm hover:bg-orange-600"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{
        backgroundColor: '#FFFDF5',
        backgroundImage: 'radial-gradient(#FFE270 2px, transparent 2px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* Header - 用户问候 */}
      <header className="px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div
            className="inline-flex items-center bg-white rounded-full px-4 py-2 shadow-lg"
            style={{
              boxShadow: '0 8px 24px rgba(255, 209, 59, 0.3)',
              border: '4px solid #FFD13B',
            }}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-2xl mr-3 border-2 border-white shadow-md">
              👶
            </div>
            <div>
              <div className="text-xl font-black" style={{ color: '#FF7D00', letterSpacing: '2px' }}>
                Hello, 宝宝!
              </div>
              <div className="text-sm font-bold" style={{ color: '#8C5A00' }}>
                今天想看什么呢？
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 扫码/激活码区域 */}
      <div className="px-4 mb-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <button
            onClick={handleScanCard}
            className="w-full h-[100px] rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              background: 'linear-gradient(180deg, #FFD13B 0%, #FFB100 100%)',
              boxShadow: '0 16px 32px rgba(255, 125, 0, 0.3), inset 0 6px 12px rgba(255, 255, 255, 0.6)',
              border: '6px solid #FFF',
            }}
          >
            <span className="text-4xl mr-3">📇</span>
            <span
              className="text-2xl font-black text-white"
              style={{ textShadow: '0 4px 8px rgba(200, 80, 0, 0.5)' }}
            >
              扫卡片/输激活码 解锁新动画
            </span>
          </button>
          <div
            className="mt-2 text-sm font-bold px-4 py-1 rounded-full"
            style={{
              color: '#8C5A00',
              background: 'rgba(255, 209, 59, 0.3)',
            }}
          >
            点击动画片 → 选择单集 → 开始播放
          </div>
          {/* 三步流程提示条 */}
          <div className="mt-3 flex items-center gap-1 bg-white/80 rounded-full px-3 py-1.5 shadow-sm border border-orange-100">
            <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center">1</span>
            <span className="text-xs font-bold text-orange-600">选动画片</span>
            <span className="w-4 h-0.5 bg-orange-500"></span>
            <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-[10px] font-black flex items-center justify-center">2</span>
            <span className="text-xs font-bold text-gray-500">选单集</span>
            <span className="w-4 h-0.5 bg-gray-300"></span>
            <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-[10px] font-black flex items-center justify-center">3</span>
            <span className="text-xs font-bold text-gray-500">播放</span>
          </div>
        </div>
      </div>

      {/* 卡片网格 */}
      <main className="px-4 pb-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-black" style={{ color: '#FF7D00' }}>
              🎮 我的动画乐园
            </h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-white text-gray-600 border border-gray-200">
              共 {series.length} 部
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {series.map((s) => {
              const unlocked = isSeriesUnlocked(s.seriesId);
              const unlocking = unlockingId === s.seriesId;
              return (
                <div
                  key={s.seriesId}
                  className={`rounded-3xl p-3 cursor-pointer transition-all active:scale-95 ${
                    unlocked ? 'bg-white' : 'bg-gray-100'
                  }`}
                  style={{
                    boxShadow: unlocked
                      ? '0 12px 32px rgba(255, 209, 59, 0.15)'
                      : '0 8px 24px rgba(0, 0, 0, 0.05)',
                    border: '4px solid #FFF',
                  }}
                  onClick={() => handleCardClick(s)}
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden mb-3">
                    {s.coverUrl ? (
                      <img
                        src={s.coverUrl}
                        alt={s.seriesName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white text-5xl font-black"
                        style={{ background: getCoverGradient(s.seriesId) }}
                      >
                        {s.seriesName.slice(0, 1)}
                      </div>
                    )}
                    {!unlocked && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                        <Lock className="w-12 h-12 text-gray-500" />
                      </div>
                    )}
                    {unlocking && (
                      <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
                      </div>
                    )}
                    {unlocked && s.episodeCount > 0 && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-black px-2 py-1 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {s.episodeCount}集
                      </div>
                    )}
                  </div>

                  <div
                    className={`text-base font-black text-center mb-1 leading-tight ${
                      unlocked ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {s.seriesName}
                  </div>

                  {/* 集数预览条：显示前5个集数方块+剩余数量 */}
                  {unlocked && s.episodeCount > 0 && (
                    <div className="flex items-center justify-center gap-0.5 mb-2 h-4">
                      {Array.from({ length: Math.min(s.episodeCount, 5) }).map((_, i) => (
                        <span key={i} className="inline-block w-2.5 h-2.5 rounded-sm bg-gradient-to-br from-orange-300 to-yellow-300" />
                      ))}
                      {s.episodeCount > 5 && (
                        <span className="text-[10px] font-bold text-orange-500 ml-0.5">+{s.episodeCount - 5}</span>
                      )}
                    </div>
                  )}

                  <div
                    className={`text-center py-2 rounded-full text-sm font-black flex items-center justify-center gap-1 ${
                      unlocked ? 'text-orange-800' : 'bg-gray-200 text-gray-400'
                    }`}
                    style={
                      unlocked
                        ? {
                            background: '#FFD13B',
                            boxShadow: '0 4px 12px rgba(255, 209, 59, 0.4)',
                          }
                        : {}
                    }
                  >
                    {unlocked ? (
                      <>共{s.episodeCount || '?'}集 → 选集</>
                    ) : '未解锁'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 激活码弹窗 */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center"
            style={{
              background: '#FFFDF5',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
            }}
          >
            <div className="text-2xl font-black mb-2" style={{ color: '#1A2980' }}>
              输入教案激活码
            </div>
            <div className="text-sm text-gray-500 text-center mb-6">
              请刮开实体卡片背面的涂层，输入12位激活码
            </div>

            <input
              type="text"
              placeholder="请输入激活码 (例如: PEPPA-2024)"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              autoFocus
              className="w-full h-12 bg-white border-4 border-gray-200 rounded-2xl px-4 text-center text-base text-gray-800 mb-6 focus:outline-none focus:border-orange-500"
            />

            <div className="flex w-full gap-3">
              <button
                onClick={() => {
                  setShowKeyModal(false);
                  setKeyValue('');
                }}
                className="flex-1 h-12 rounded-full bg-gray-100 text-gray-500 font-black text-base"
              >
                取消
              </button>
              <button
                onClick={handleKeySubmit}
                disabled={unlockingId !== null}
                className="flex-1 h-12 rounded-full font-black text-white text-base disabled:opacity-70"
                style={{
                  background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                  boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)',
                }}
              >
                {unlockingId ? '解锁中...' : '立即解锁'}
              </button>
            </div>
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
