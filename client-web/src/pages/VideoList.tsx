import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getCourseList, getCourseDetail, type CourseMaterial, type EpisodeMaterial } from '../lib/courseApi';
import { redeemActivationCode } from '../lib/activationCodes';
import { Loader2, Check, Lock, X, Play, Clock, ChevronDown, FolderOpen, Link2, CheckCircle } from 'lucide-react';
import { getFileList, getFileMetas } from '../lib/baiduApi';
import type { EpisodeFile } from '../store/types';

interface SeriesCard {
  seriesId: string;
  seriesName: string;
  coverUrl?: string;
  episodeCount: number;
}

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

function formatTimeAgo(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(ts).toLocaleDateString();
}

function formatSize(size?: number): string {
  const n = Number(size || 0);
  if (!n) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|m4v|flv|wmv|ts|webm)$/i;
const DEFAULT_DIR = '/我的应用数据/英语宝贝动画宝';
function isDir(v: any): boolean { return Number(v?.isdir ?? 0) === 1; }

export default function VideoList() {
  const {
    isSeriesUnlocked,
    unlockSeries,
    showKeyModal,
    setShowKeyModal,
    getSeriesMapping,
    setSeriesMapping,
    accessToken,
  } = useStore();
  const navigate = useNavigate();

  const [series, setSeries] = useState<SeriesCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  // 底部弹层状态
  const [openSheetSeriesId, setOpenSheetSeriesId] = useState<string | null>(null);
  const [sheetDetail, setSheetDetail] = useState<CourseMaterial | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // 网盘关联弹窗状态
  const [linkingOpen, setLinkingOpen] = useState(false);
  const [currentDir, setCurrentDir] = useState(DEFAULT_DIR);
  const [panFiles, setPanFiles] = useState<any[]>([]);
  const [panLoading, setPanLoading] = useState(false);
  const [panError, setPanError] = useState('');
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [linking, setLinking] = useState(false);

  // 动态加载动画片卡片
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

  // 弹层打开时加载系列详情
  useEffect(() => {
    if (!openSheetSeriesId) { setSheetDetail(null); return; }
    let alive = true;
    (async () => {
      setSheetLoading(true);
      try {
        const res = await getCourseDetail(openSheetSeriesId);
        if (!alive) return;
        if (res.success && res.data) setSheetDetail(res.data);
      } catch {}
      finally {
        if (alive) setSheetLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [openSheetSeriesId]);

  // ESC 关闭弹层
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (linkingOpen) setLinkingOpen(false);
        else if (openSheetSeriesId) setOpenSheetSeriesId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSheetSeriesId, linkingOpen]);

  const handleScanCard = () => {
    const locked = series.find((s) => !isSeriesUnlocked(s.seriesId));
    if (!locked) { alert('所有动画片都已解锁啦！'); return; }
    setUnlockingId(locked.seriesId);
    setTimeout(() => { unlockSeries(locked.seriesId); setUnlockingId(null); }, 1500);
  };

  const handleKeySubmit = async () => {
    const res = await redeemActivationCode(keyValue);
    if (!res.ok) { alert(res.reason || '兑换失败'); return; }
    const sid = res.seriesId!;
    setUnlockingId(sid);
    setTimeout(() => {
      unlockSeries(sid);
      setShowKeyModal(false);
      setKeyValue('');
      setUnlockingId(null);
      alert(`兑换成功！已解锁「${res.seriesName || sid}」`);
    }, 1000);
  };

  // 卡片点击 → 打开弹层（未解锁则弹激活码）
  const handleCardClick = (card: SeriesCard) => {
    if (!isSeriesUnlocked(card.seriesId)) { setShowKeyModal(true); return; }
    setOpenSheetSeriesId(card.seriesId);
  };

  // 点击集数方块 → 跳转播放器
  const playCourseEpisode = (seriesId: string, ep: EpisodeMaterial) => {
    setOpenSheetSeriesId(null);
    navigate('/player', { state: { seriesId, episodeId: ep.episodeId } });
  };
  const playCloudEpisode = (seriesId: string, ep: EpisodeFile, episodes: EpisodeFile[], subtitleDlink?: string) => {
    setOpenSheetSeriesId(null);
    navigate('/player', {
      state: {
        dlink: ep.dlink, filename: ep.filename, subtitleDlink,
        seriesId, episodeFsId: ep.fsId, episodes,
      }
    });
  };

  // 网盘关联
  const openLinkingFromSheet = () => {
    if (!accessToken) { alert('请先完成百度网盘授权'); return; }
    setOpenSheetSeriesId(null);
    setLinkingOpen(true);
    setCurrentDir(DEFAULT_DIR);
    setSelectedFile(null);
  };

  const loadPanFiles = async (dir: string) => {
    if (!accessToken) return;
    try {
      setPanLoading(true); setPanError('');
      const data = await getFileList(accessToken, dir);
      if (!data) { setPanError('百度未返回数据'); setPanFiles([]); return; }
      const errno = Number(data.errno ?? data.error_code ?? 0);
      if (errno === 0) {
        const list = Array.isArray(data.list) ? data.list : [];
        setPanFiles(list);
        if (!selectedFile || !list.find((x) => String(x.fs_id) === String(selectedFile.fs_id))) {
          setSelectedFile(list.find((f) => isDir(f)) || list[0] || null);
        }
      } else {
        setPanError(`获取失败 [errno=${errno}]`); setPanFiles([]);
        if (errno === -6) useStore.getState().logout();
      }
    } catch (err: any) {
      setPanError(err?.message || '网络请求失败'); setPanFiles([]);
    } finally { setPanLoading(false); }
  };

  useEffect(() => {
    if (!linkingOpen || !accessToken) return;
    void loadPanFiles(currentDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingOpen, currentDir, accessToken]);

  const confirmLink = async () => {
    if (!openSheetSeriesId || !selectedFile || !accessToken) return;
    try {
      setLinking(true);
      let filesToProcess: any[] = [];
      const selectedIsDir = isDir(selectedFile);
      if (selectedIsDir) {
        const base = currentDir === '/' ? '' : currentDir;
        const dirPath = typeof selectedFile.path === 'string' && selectedFile.path ? selectedFile.path : `${base}/${selectedFile.server_filename}`;
        const data = await getFileList(accessToken, dirPath);
        if (Number(data?.errno ?? 0) === 0) {
          filesToProcess = (data.list || []).filter((f: any) => !isDir(f) && VIDEO_EXT_RE.test(f.server_filename || ''));
        } else { alert(`进入目录失败 [errno=${data?.errno}]`); return; }
      } else if (VIDEO_EXT_RE.test(selectedFile.server_filename || '')) {
        filesToProcess = [selectedFile];
      } else { alert('请选择文件夹或单个视频文件'); return; }
      if (filesToProcess.length === 0) { alert('没找到视频文件'); return; }
      const fsids = filesToProcess.map((f) => f.fs_id);
      const meta = await getFileMetas(accessToken, fsids);
      if (Number(meta?.errno ?? 0) === 0 && Array.isArray(meta.list) && meta.list.length > 0) {
        const episodes: EpisodeFile[] = meta.list.map((item: any) => ({
          fsId: item.fs_id,
          filename: item.filename || filesToProcess.find((f) => f.fs_id === item.fs_id)?.server_filename || '',
          dlink: item.dlink,
          size: filesToProcess.find((f) => f.fs_id === item.fs_id)?.size,
        }));
        const parentDir = selectedIsDir
          ? (typeof selectedFile.path === 'string' && selectedFile.path ? selectedFile.path : `${currentDir === '/' ? '' : currentDir}/${selectedFile.server_filename}`)
          : currentDir;
        setSeriesMapping(openSheetSeriesId, { folderPath: parentDir, episodes });
        alert(`关联成功！已绑定 ${episodes.length} 集视频`);
        setLinkingOpen(false);
        setSelectedFile(null);
      }
    } catch (err: any) { alert(err?.message || '关联失败'); }
    finally { setLinking(false); }
  };

  const breadcrumbParts = currentDir.split('/').filter(Boolean);

  // ===== 弹层数据 =====
  const openSheetSeries = useMemo(
    () => series.find((s) => s.seriesId === openSheetSeriesId),
    [series, openSheetSeriesId]
  );
  const openSheetMapping = openSheetSeriesId ? getSeriesMapping(openSheetSeriesId) : undefined;
  const cloudEpisodes = openSheetMapping?.episodes || [];
  const coursesEpisodes = sheetDetail?.episodes || [];
  const hasAnyEpisodes = cloudEpisodes.length > 0 || coursesEpisodes.length > 0;

  // ===== 渲染 =====
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
          <button onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-full bg-orange-500 text-white text-sm font-black shadow-sm hover:bg-orange-600">
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
      {/* Header */}
      <header className="px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div
            className="inline-flex items-center bg-white rounded-full px-4 py-2 shadow-lg"
            style={{ boxShadow: '0 8px 24px rgba(255, 209, 59, 0.3)', border: '4px solid #FFD13B' }}
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white text-2xl mr-3 border-2 border-white shadow-md">👶</div>
            <div>
              <div className="text-xl font-black" style={{ color: '#FF7D00', letterSpacing: '2px' }}>Hello, 宝宝!</div>
              <div className="text-sm font-bold" style={{ color: '#8C5A00' }}>今天想看什么呢？</div>
            </div>
          </div>
        </div>
      </header>

      {/* 扫码/激活码区域 */}
      <div className="px-4 mb-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <button onClick={handleScanCard}
            className="w-full h-[100px] rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              background: 'linear-gradient(180deg, #FFD13B 0%, #FFB100 100%)',
              boxShadow: '0 16px 32px rgba(255, 125, 0, 0.3), inset 0 6px 12px rgba(255, 255, 255, 0.6)',
              border: '6px solid #FFF',
            }}
          >
            <span className="text-4xl mr-3">📇</span>
            <span className="text-2xl font-black text-white" style={{ textShadow: '0 4px 8px rgba(200, 80, 0, 0.5)' }}>
              扫卡片/输激活码 解锁新动画
            </span>
          </button>
        </div>
      </div>

      {/* 卡片网格 */}
      <main className="px-4 pb-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-black" style={{ color: '#FF7D00' }}>🎮 我的动画乐园</h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-white text-gray-600 border border-gray-200">
              共 {series.length} 部
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {series.map((s) => {
              const unlocked = isSeriesUnlocked(s.seriesId);
              const unlocking = unlockingId === s.seriesId;
              const mapping = getSeriesMapping(s.seriesId);
              const recentEp = mapping?.episodes.find((ep) => ep.lastPlayedAt != null);
              const open = openSheetSeriesId === s.seriesId;
              return (
                <div
                  key={s.seriesId}
                  className={`rounded-3xl p-3 cursor-pointer transition-all active:scale-95 ${
                    unlocked ? 'bg-white' : 'bg-gray-100'
                  } ${open ? 'ring-4 ring-orange-300 scale-[1.02]' : ''}`}
                  style={{
                    boxShadow: unlocked ? '0 12px 32px rgba(255, 209, 59, 0.15)' : '0 8px 24px rgba(0, 0, 0, 0.05)',
                    border: '4px solid #FFF',
                  }}
                  onClick={() => handleCardClick(s)}
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden mb-3">
                    {s.coverUrl ? (
                      <img src={s.coverUrl} alt={s.seriesName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-5xl font-black"
                        style={{ background: getCoverGradient(s.seriesId) }}>
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
                    {mapping && mapping.episodes.length > 0 && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-black px-2 py-1 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {mapping.episodes.length}集
                      </div>
                    )}
                    {/* 最近播放提示角标 */}
                    {recentEp && (
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 max-w-[70%] truncate">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{formatTimeAgo(recentEp.lastPlayedAt)}</span>
                      </div>
                    )}
                  </div>

                  <div className={`text-base font-black text-center mb-1 leading-tight ${unlocked ? 'text-gray-900' : 'text-gray-400'}`}>
                    {s.seriesName}
                  </div>

                  {/* 进度预览条 */}
                  {mapping && mapping.episodes.length > 0 && recentEp && (
                    <div className="mb-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${recentEp.progress ?? 0}%` }} />
                      </div>
                      <div className="text-[10px] text-orange-600 font-bold text-center mt-0.5">
                        上次播到：{recentEp.filename.replace(/\.[^.]+$/, '')}
                      </div>
                    </div>
                  )}

                  <div
                    className={`text-center py-2 rounded-full text-sm font-black ${
                      unlocked ? 'text-orange-800' : 'bg-gray-200 text-gray-400'
                    }`}
                    style={unlocked ? { background: '#FFD13B', boxShadow: '0 4px 12px rgba(255, 209, 59, 0.4)' } : {}}
                  >
                    {unlocked ? '选集播放' : '未解锁'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 居中选集弹窗 */}
      {openSheetSeriesId && openSheetSeries && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={() => setOpenSheetSeriesId(null)}>
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* 弹窗 */}
          <div
            className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.3)', animation: 'modalIn 0.25s cubic-bezier(.2,.9,.3,1.1) both' }}
          >
            {/* 头部 */}
            <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-yellow-50">
              <div className="flex items-start gap-4">
                <div
                  className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-orange-200 to-yellow-200 flex items-center justify-center text-4xl"
                  style={{ border: '3px solid #FFF' }}
                >
                  {openSheetSeries.coverUrl ? (
                    <img src={openSheetSeries.coverUrl} className="w-full h-full object-cover" />
                  ) : (
                    <span>🎬</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-black text-gray-900 truncate pt-1">{openSheetSeries.seriesName}</h3>
                    <button onClick={() => setOpenSheetSeriesId(null)}
                      className="w-9 h-9 rounded-full bg-white/80 flex items-center justify-center text-gray-500 hover:bg-white flex-shrink-0">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                      共 {(cloudEpisodes.length || 0) + (coursesEpisodes.length || 0)} 集
                    </span>
                    {cloudEpisodes.length > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-0.5">
                        <CheckCircle className="w-3 h-3" /> 已关联
                      </span>
                    )}
                  </div>
                  {/* 最近播放提示条 */}
                  {(() => {
                    const m = getSeriesMapping(openSheetSeriesId);
                    const recent = m?.episodes.find((ep) => ep.lastPlayedAt != null);
                    if (!recent) return null;
                    return (
                      <div className="mt-2 flex items-center gap-2 text-xs bg-orange-50 rounded-lg px-2.5 py-1.5">
                        <Clock className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                        <span className="truncate text-gray-700">
                          上次播到 <b className="text-orange-600">{recent.filename.replace(/\.[^.]+$/, '')}</b>
                        </span>
                        <span className="text-gray-400 flex-shrink-0">· {formatTimeAgo(recent.lastPlayedAt)}</span>
                        {recent.progress != null && recent.progress > 0 && recent.progress < 95 && (
                          <button
                            onClick={() => playCloudEpisode(openSheetSeriesId, recent, m!.episodes, m!.subtitleDlink)}
                            className="ml-auto px-2.5 py-0.5 rounded-full bg-orange-500 text-white text-[11px] font-black flex-shrink-0 hover:bg-orange-600"
                          >
                            ▶ 继续 {Math.round(recent.progress)}%
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 选集区域 - 列表方式 */}
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ backgroundColor: '#FFFDF5' }}>
              {sheetLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                </div>
              )}

              {!sheetLoading && !hasAnyEpisodes && (
                <div className="bg-white rounded-2xl p-8 text-center border border-orange-100">
                  <div className="text-4xl mb-3">📂</div>
                  <div className="font-black text-gray-700 mb-1">还没有视频</div>
                  <p className="text-sm text-gray-500 mb-5">把网盘里的动画片文件夹关联过来，就能看到所有集数</p>
                  <button onClick={openLinkingFromSheet}
                    className="inline-flex items-center px-5 py-2.5 rounded-full text-white font-black shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)', boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)' }}>
                    <Link2 className="w-4 h-4 mr-2" /> 关联网盘资源
                  </button>
                </div>
              )}

              {/* 网盘关联集 - 列表 */}
              {cloudEpisodes.length > 0 && (
                <>
                  {(coursesEpisodes.length > 0) && (
                    <h4 className="text-sm font-black text-gray-600 mb-2 flex items-center gap-1.5 px-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      网盘资源
                    </h4>
                  )}
                  <div className="space-y-2 mb-4">
                    {cloudEpisodes.map((ep, idx) => {
                      const hasPlayed = ep.lastPlayedAt != null;
                      return (
                        <div
                          key={ep.fsId}
                          className="bg-white rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border border-gray-100"
                          style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                          onClick={() => {
                            const m = getSeriesMapping(openSheetSeriesId!);
                            if (m) playCloudEpisode(openSheetSeriesId!, ep, m.episodes, m.subtitleDlink);
                          }}
                        >
                          {/* 序号 */}
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-400 flex items-center justify-center text-white text-base font-black flex-shrink-0 shadow-sm">
                            {idx + 1}
                          </div>
                          {/* 集名 + 进度 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-gray-900 truncate leading-tight">
                              {ep.filename.replace(/\.[^.]+$/, '')}
                            </div>
                            {hasPlayed ? (
                              <>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${ep.progress ?? 0}%` }} />
                                  </div>
                                  <span className="text-[11px] font-bold text-orange-600 flex-shrink-0">
                                    {Math.round(ep.progress ?? 0)}%
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatTimeAgo(ep.lastPlayedAt)}
                                </div>
                              </>
                            ) : (
                              <div className="text-[11px] text-gray-400 mt-1">未播放 · {formatSize(ep.size)}</div>
                            )}
                          </div>
                          {/* 播放按钮 */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                            hasPlayed && (ep.progress ?? 0) > 0 && (ep.progress ?? 0) < 95
                              ? 'bg-orange-500'
                              : 'bg-blue-500'
                          }`}>
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* courses 静态集 - 列表 */}
              {coursesEpisodes.length > 0 && (
                <>
                  {cloudEpisodes.length > 0 && (
                    <h4 className="text-sm font-black text-gray-600 mb-2 flex items-center gap-1.5 px-1 mt-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                      课程课件
                    </h4>
                  )}
                  <div className="space-y-2 mb-2">
                    {coursesEpisodes.map((ep, idx) => (
                      <div
                        key={String(ep.episodeId)}
                        onClick={() => ep.videoUrl && playCourseEpisode(openSheetSeriesId!, ep)}
                        className={`rounded-2xl p-3 flex items-center gap-3 transition-all border ${
                          ep.videoUrl
                            ? 'bg-white cursor-pointer hover:shadow-md border-gray-100 active:scale-[0.99]'
                            : 'bg-gray-50 cursor-not-allowed border-gray-50 opacity-60'
                        }`}
                        style={{ boxShadow: ep.videoUrl ? '0 2px 6px rgba(0,0,0,0.04)' : undefined }}
                      >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-black flex-shrink-0 shadow-sm ${
                          ep.videoUrl ? 'bg-gradient-to-br from-orange-400 to-yellow-400' : 'bg-gradient-to-br from-gray-300 to-gray-400'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900 truncate">
                            {ep.title || ep.episodeId}
                          </div>
                          <div className={`text-[11px] mt-1 ${ep.videoUrl ? 'text-green-600' : 'text-gray-400'}`}>
                            {ep.videoUrl ? '✓ 视频已就绪' : '待配置视频'}
                          </div>
                        </div>
                        {ep.videoUrl && (
                          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 底部操作栏 */}
            {cloudEpisodes.length > 0 && (
              <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-white">
                <button onClick={openLinkingFromSheet}
                  className="w-full py-2.5 rounded-full bg-white border-2 border-orange-200 text-orange-700 text-sm font-bold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2">
                  <FolderOpen className="w-4 h-4" /> 重新关联网盘资源
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 网盘关联弹窗 */}
      {linkingOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setLinkingOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute inset-4 max-w-lg mx-auto rounded-3xl p-5 flex flex-col"
            style={{ background: '#FFFDF5', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', top: '50%', transform: 'translateY(-50%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-black mb-1" style={{ color: '#1A2980' }}>选择网盘文件夹</div>
                <div className="text-xs text-gray-500">找到动画片文件夹 → 选中它 → 点「确认关联」</div>
              </div>
              <button onClick={() => { setLinkingOpen(false); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-3 border border-yellow-100 mb-3">
              <div className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                <button onClick={() => setCurrentDir('/')} className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black">根</button>
                <button onClick={() => setCurrentDir(DEFAULT_DIR)} className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black">默认</button>
                {currentDir !== '/' && (
                  <button onClick={() => {
                    const parts = currentDir.split('/').filter(Boolean); parts.pop();
                    setCurrentDir(parts.length ? '/' + parts.join('/') : '/');
                  }} className="px-2 py-1 rounded-full bg-blue-500 text-white text-[11px] font-black">上一级</button>
                )}
              </div>
            </div>

            {panError && <div className="bg-red-50 text-red-700 text-xs rounded-lg border border-red-100 p-2 mb-2">{panError}</div>}

            <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3" style={{ maxHeight: 300 }}>
              {panLoading ? (
                <div className="p-8 flex flex-col justify-center items-center gap-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  <span className="text-xs font-bold">正在拉取 {currentDir}</span>
                </div>
              ) : panFiles.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="text-3xl mb-2">🗂️</div>
                  <div className="font-black text-gray-700 mb-1 text-sm">当前目录为空</div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 300 }}>
                  {panFiles.filter((f) => isDir(f) || VIDEO_EXT_RE.test(f.server_filename || '')).map((file: any) => {
                    const dir = isDir(file);
                    const selected = selectedFile && String(selectedFile.fs_id) === String(file.fs_id);
                    return (
                      <div key={String(file.fs_id)}
                        className={`px-3 py-2 flex items-center cursor-pointer transition-colors ${selected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                        onClick={() => dir ? null : setSelectedFile(file)}>
                        <div className={`w-4 h-4 rounded-full border-2 mr-2 flex-shrink-0 ${selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-900 truncate">{file.server_filename}</div>
                          <div className="text-[11px] text-gray-500">{dir ? '📁 文件夹' : `🎞 视频 · ${formatSize(file.size)}`}</div>
                        </div>
                        {dir && (
                          <button onClick={(e) => { e.stopPropagation(); setCurrentDir(
                            typeof file.path === 'string' && file.path ? file.path : `${currentDir === '/' ? '' : currentDir}/${file.server_filename}`
                          ); }}
                            className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black">进入</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={confirmLink} disabled={!selectedFile || linking}
              className="w-full h-11 rounded-full font-black text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)', boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)' }}>
              {linking ? (<><Loader2 className="w-4 h-4 animate-spin" /> 关联中...</>) : (<><Link2 className="w-4 h-4" /> 确认关联</>)}
            </button>
          </div>
        </div>
      )}

      {/* 激活码弹窗 */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center"
            style={{ background: '#FFFDF5', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
            <div className="text-2xl font-black mb-2" style={{ color: '#1A2980' }}>输入教案激活码</div>
            <div className="text-sm text-gray-500 text-center mb-6">请刮开实体卡片背面的涂层，输入激活码</div>
            <input type="text" placeholder="例如: PEPPA-2024" value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)} autoFocus
              className="w-full h-12 bg-white border-4 border-gray-200 rounded-2xl px-4 text-center text-base text-gray-800 mb-6 focus:outline-none focus:border-orange-500" />
            <div className="flex w-full gap-3">
              <button onClick={() => { setShowKeyModal(false); setKeyValue(''); }}
                className="flex-1 h-12 rounded-full bg-gray-100 text-gray-500 font-black text-base">取消</button>
              <button onClick={handleKeySubmit} disabled={unlockingId !== null}
                className="flex-1 h-12 rounded-full font-black text-white text-base disabled:opacity-70"
                style={{ background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)', boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)' }}>
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
        @keyframes modalIn {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
