import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getCourseDetail, type CourseMaterial, type EpisodeMaterial, getEpisodeTitle } from '../lib/courseApi';
import { getFileList, getFileMetas } from '../lib/baiduApi';
import type { EpisodeFile, PanFile } from '../store/types';
import {
  Loader2, Link2, Film, Check, X,
  Home, ArrowUp, RefreshCw, ChevronRight, Folder
} from 'lucide-react';

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|m4v|flv|wmv|ts|webm)$/i;
const DEFAULT_DIR = '/我的应用数据/英语宝贝动画宝';

function isDir(v: PanFile | null | undefined): boolean {
  return Number(v?.isdir ?? 0) === 1;
}

function formatSize(size: any): string {
  const n = Number(size || 0);
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function SeriesDetail() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const {
    accessToken,
    logout,
    isSeriesUnlocked,
    getSeriesMapping,
    setSeriesMapping,
  } = useStore();

  const [series, setSeries] = useState<CourseMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 网盘关联弹窗
  const [linkingOpen, setLinkingOpen] = useState(false);
  const [currentDir, setCurrentDir] = useState(DEFAULT_DIR);
  const [panFiles, setPanFiles] = useState<PanFile[]>([]);
  const [panLoading, setPanLoading] = useState(false);
  const [panError, setPanError] = useState('');
  const [selectedFile, setSelectedFile] = useState<PanFile | null>(null);
  const [linking, setLinking] = useState(false);

  const mapping = seriesId ? getSeriesMapping(seriesId) : undefined;
  const unlocked = seriesId ? isSeriesUnlocked(seriesId) : false;
  const hasCloudEpisodes = mapping && mapping.episodes.length > 0;
  const hasCoursesEpisodes = (series?.episodes?.length ?? 0) > 0;
  const isLinked = hasCloudEpisodes || hasCoursesEpisodes;

  useEffect(() => {
    if (!seriesId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getCourseDetail(seriesId);
        if (!alive) return;
        if (res.success && res.data) {
          setSeries(res.data);
        } else {
          setError('未找到该动画片的课程数据');
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || '加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [seriesId]);

  // 网盘文件加载
  useEffect(() => {
    if (!linkingOpen || !accessToken) return;
    void loadFiles(currentDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingOpen, currentDir, accessToken]);

  const loadFiles = async (dir: string) => {
    if (!accessToken) return;
    try {
      setPanLoading(true);
      setPanError('');
      const data = await getFileList(accessToken, dir);
      if (!data) {
        setPanError('百度未返回任何数据');
        setPanFiles([]);
        return;
      }
      const errno = Number(data.errno ?? data.error_code ?? 0);
      if (errno === 0) {
        const list: PanFile[] = Array.isArray(data.list) ? data.list : [];
        setPanFiles(list);
        if (!selectedFile || !list.find((x) => String(x.fs_id) === String(selectedFile.fs_id))) {
          const firstFolder = list.find((f) => isDir(f));
          setSelectedFile(firstFolder || list[0] || null);
        }
      } else {
        setPanError(`获取列表失败 [errno=${errno}]`);
        setPanFiles([]);
        if (errno === -6) logout();
      }
    } catch (err: any) {
      setPanError(err?.message || '网络请求失败');
      setPanFiles([]);
    } finally {
      setPanLoading(false);
    }
  };

  const resolveFolderPath = (file: any): string => {
    if (typeof file?.path === 'string' && file.path) return file.path;
    const base = currentDir === '/' ? '' : currentDir;
    return `${base}/${file?.server_filename || ''}`;
  };

  const handleConfirmLink = async () => {
    if (!seriesId || !selectedFile || !accessToken) return;
    try {
      setLinking(true);
      let filesToProcess: PanFile[] = [];
      const selectedIsDir = isDir(selectedFile);
      if (selectedIsDir) {
        const dirPath = resolveFolderPath(selectedFile);
        const data = await getFileList(accessToken, dirPath);
        if (Number(data?.errno ?? 0) === 0) {
          filesToProcess = ((data.list || []) as PanFile[]).filter((f) => !isDir(f) && VIDEO_EXT_RE.test(f.server_filename || ''));
        } else {
          alert(`进入目录失败 [errno=${data?.errno}]`);
          return;
        }
      } else if (VIDEO_EXT_RE.test(selectedFile.server_filename || '')) {
        filesToProcess = [selectedFile];
      } else {
        alert('请选择包含视频文件的文件夹（或单个视频文件）');
        return;
      }
      if (filesToProcess.length === 0) {
        alert('该文件夹中没有找到视频文件');
        return;
      }
      const fsids = filesToProcess.map((f) => f.fs_id);
      const meta = await getFileMetas(accessToken, fsids);
      if (Number(meta?.errno ?? 0) === 0 && Array.isArray(meta.list) && meta.list.length > 0) {
        const episodes: EpisodeFile[] = meta.list.map((item: any) => ({
          fsId: item.fs_id,
          filename: item.filename || filesToProcess.find((f) => f.fs_id === item.fs_id)?.server_filename || '',
          dlink: item.dlink,
          size: filesToProcess.find((f) => f.fs_id === item.fs_id)?.size,
        }));
        const parentDir = selectedIsDir ? resolveFolderPath(selectedFile) : currentDir;
        setSeriesMapping(seriesId, {
          folderPath: parentDir,
          episodes,
          subtitleDlink: undefined,
          vocabularyDlink: undefined,
        });
        alert(`关联成功！已绑定 ${episodes.length} 集视频`);
        setLinkingOpen(false);
        setSelectedFile(null);
        return;
      }
      alert(`获取文件信息失败 [errno=${meta?.errno}]`);
    } catch (err: any) {
      alert(err?.message || '关联失败');
    } finally {
      setLinking(false);
    }
  };

  const handleEpisodeClick = (episode: EpisodeMaterial) => {
    navigate('/player', { state: { seriesId, episodeId: episode.episodeId } });
  };

  const handleCloudEpisodeClick = (ep: EpisodeFile) => {
    if (!mapping || !ep.dlink) return;
    navigate('/player', {
      state: {
        dlink: ep.dlink,
        filename: ep.filename,
        subtitleDlink: mapping.subtitleDlink,
        seriesId,
        episodeFsId: ep.fsId,
        episodes: mapping.episodes,
      },
    });
  };

  const breadcrumbParts = currentDir.split('/').filter(Boolean);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDF5' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
          <span className="text-sm font-bold text-gray-600">加载动画片信息…</span>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDF5' }}>
        <div className="text-center px-6">
          <div className="text-5xl mb-4">😢</div>
          <div className="font-black text-gray-700 mb-2">{error || '未找到该动画片'}</div>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-full bg-orange-500 text-white text-sm font-black shadow-sm hover:bg-orange-600"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  // 未解锁
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDF5' }}>
        <div className="text-center px-6 max-w-sm">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-black text-gray-800 mb-2">这部动画片还没解锁</h2>
          <p className="text-sm text-gray-500 mb-6">请先在首页通过激活码或扫码解锁</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-full bg-orange-500 text-white text-sm font-black shadow-sm hover:bg-orange-600"
          >
            返回首页解锁
          </button>
        </div>
      </div>
    );
  }

  const coursesEpisodes = series.episodes || [];
  const cloudEpisodes = mapping?.episodes || [];

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FFFDF5' }}>
      {/* Header - 面包屑导航 */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-orange-100">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-2">
          {/* 面包屑 */}
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 font-bold text-orange-600 hover:text-orange-700 transition-colors"
            >
              ← 返回乐园
            </button>
          </div>
        </div>
      </div>

      {/* 封面+介绍 */}
      <div className="px-4 pt-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-4 mb-6">
            <div
              className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-orange-200 to-yellow-200 flex items-center justify-center text-5xl shadow-md"
              style={{ border: '4px solid #FFF' }}
            >
              {series.coverUrl ? (
                <img src={series.coverUrl} alt={series.seriesName} className="w-full h-full object-cover" />
              ) : (
                <span>🎬</span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h2 className="text-xl font-black text-gray-900 leading-tight mb-1">{series.seriesName}</h2>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  {coursesEpisodes.length + cloudEpisodes.length} 集
                </span>
                {isLinked && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> 已就绪
                  </span>
                )}
              </div>
              {(series as any).description && (
                <p className="text-xs text-gray-500 line-clamp-2">{(series as any).description}</p>
              )}
            </div>
          </div>

          {/* 选集区域标题 - 醒目引导 */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-black text-gray-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center">2</span>
              选择单集播放
            </h3>
            <span className="text-xs text-gray-400 font-bold">点击下方集数 →</span>
          </div>

          {coursesEpisodes.length === 0 && cloudEpisodes.length === 0 && (
            <div className="bg-white rounded-2xl p-8 text-center border border-orange-100 mb-4">
              <div className="text-4xl mb-3">📂</div>
              <div className="font-black text-gray-700 mb-2">还没有绑定任何视频</div>
              <p className="text-sm text-gray-500 mb-5">点击下方按钮，把网盘里的视频文件夹关联到这部动画片</p>
              <button
                onClick={() => setLinkingOpen(true)}
                className="inline-flex items-center px-5 py-2.5 rounded-full text-white text-sm font-black shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                  boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)',
                }}
              >
                <Link2 className="w-4 h-4 mr-2" />
                关联网盘资源
              </button>
            </div>
          )}

          {/* courses 静态集 - 网格方块 */}
          {coursesEpisodes.length > 0 && (
            <>
              {cloudEpisodes.length > 0 && (
                <h4 className="text-sm font-bold text-gray-500 mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                  课程课件 · {coursesEpisodes.length} 集
                </h4>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-4">
                {coursesEpisodes.map((ep, idx) => (
                  <button
                    key={String(ep.episodeId)}
                    onClick={() => handleEpisodeClick(ep)}
                    className="group bg-white rounded-xl p-2.5 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-md transition-all active:scale-95 border border-gray-100"
                    style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                    title={getEpisodeTitle(ep)}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-lg font-black flex-shrink-0 shadow-sm ${
                      ep.videoUrl
                        ? 'bg-gradient-to-br from-orange-400 to-yellow-400 group-hover:from-orange-500 group-hover:to-yellow-500'
                        : 'bg-gradient-to-br from-gray-300 to-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="w-full text-[11px] font-bold text-gray-700 text-center truncate leading-tight" style={{ maxWidth: '100%' }}>
                      {getEpisodeTitle(ep)}
                    </div>
                    <div className={`text-[10px] font-bold ${ep.videoUrl ? 'text-green-600' : 'text-gray-400'}`}>
                      {ep.videoUrl ? '就绪' : '待配置'}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 网盘关联集 - 网格方块 */}
          {cloudEpisodes.length > 0 && (
            <>
              {coursesEpisodes.length > 0 && (
                <h4 className="text-sm font-bold text-gray-500 mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  网盘资源 · {cloudEpisodes.length} 集
                </h4>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-4">
                {cloudEpisodes.map((ep, idx) => (
                  <button
                    key={ep.fsId}
                    onClick={() => handleCloudEpisodeClick(ep)}
                    className="group bg-white rounded-xl p-2.5 flex flex-col items-center gap-1.5 cursor-pointer hover:shadow-md transition-all active:scale-95 border border-gray-100"
                    style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                    title={ep.filename}
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-400 flex items-center justify-center text-white text-lg font-black flex-shrink-0 shadow-sm group-hover:from-blue-500 group-hover:to-indigo-500">
                      {idx + 1}
                    </div>
                    <div className="w-full text-[11px] font-bold text-gray-700 text-center truncate leading-tight">
                      {ep.filename.replace(/\.[^.]+$/, '')}
                    </div>
                    {ep.progress !== undefined && ep.progress > 0 ? (
                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${ep.progress}%` }} />
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-400">{formatSize(ep.size)}</div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 关联/重新关联按钮 */}
          {isLinked && (
            <button
              onClick={() => setLinkingOpen(true)}
              className="w-full py-2.5 rounded-full bg-white border-2 border-orange-200 text-orange-700 text-sm font-bold hover:bg-orange-50 transition-colors flex items-center justify-center gap-2 mb-4"
            >
              <Link2 className="w-4 h-4" />
              {hasCloudEpisodes ? '重新关联网盘' : '关联网盘资源'}
            </button>
          )}
        </div>
      </div>

      {/* 关联网盘资源弹窗 */}
      {linkingOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl p-5 flex flex-col"
            style={{ background: '#FFFDF5', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)' }}
          >
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xl font-black mb-1" style={{ color: '#1A2980' }}>
                  选择要关联的网盘文件夹
                </div>
                <div className="text-xs text-gray-500">
                  找到你的动画片文件夹 → 选中它 → 点「确认关联」
                </div>
              </div>
              <button
                onClick={() => { setLinkingOpen(false); setSelectedFile(null); }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 工具栏+面包屑 */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-3 border border-yellow-100 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs text-gray-600 font-black">当前目录</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setCurrentDir('/')} className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                    <Home className="w-3 h-3" /> 根
                  </button>
                  <button onClick={() => setCurrentDir(DEFAULT_DIR)} className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-black text-gray-700 hover:bg-gray-50">
                    默认
                  </button>
                  {currentDir !== '/' && (
                    <button onClick={() => {
                      const parts = currentDir.split('/').filter(Boolean);
                      parts.pop();
                      setCurrentDir(parts.length ? '/' + parts.join('/') : '/');
                    }} className="px-2 py-1 rounded-full bg-blue-500 text-white text-[11px] font-black flex items-center gap-1 hover:bg-blue-600">
                      <ArrowUp className="w-3 h-3" /> 上一级
                    </button>
                  )}
                  <button onClick={() => loadFiles(currentDir)} disabled={panLoading} className="px-2 py-1 rounded-full bg-gray-50 text-gray-600 text-[11px] font-black border border-gray-200 flex items-center gap-1 hover:bg-gray-100 disabled:opacity-60">
                    <RefreshCw className={`w-3 h-3 ${panLoading ? 'animate-spin' : ''}`} /> 刷新
                  </button>
                </div>
              </div>
              <div className="flex items-center flex-wrap gap-1 text-xs text-gray-600">
                <button onClick={() => setCurrentDir('/')} className={`px-1.5 py-0.5 rounded-lg hover:bg-white ${currentDir === '/' ? 'bg-orange-500 text-white font-black' : 'font-bold'}`}>/</button>
                {breadcrumbParts.map((p, i) => {
                  const pathTo = '/' + breadcrumbParts.slice(0, i + 1).join('/');
                  const isLast = i === breadcrumbParts.length - 1;
                  return (
                    <div key={'mb' + p + i} className="flex items-center gap-1">
                      <span className="text-gray-300">/</span>
                      <button onClick={() => setCurrentDir(pathTo)} className={`max-w-[150px] truncate px-1.5 py-0.5 rounded-lg hover:bg-white ${isLast ? 'bg-orange-500 text-white font-black' : 'font-bold'}`} title={decodeURIComponent(p)}>
                        {decodeURIComponent(p)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {panError && (
              <div className="bg-red-50 text-red-700 text-xs rounded-2xl border border-red-100 p-3 mb-3">{panError}</div>
            )}

            {/* 文件列表 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-3" style={{ maxHeight: 320 }}>
              {panLoading ? (
                <div className="p-8 flex flex-col justify-center items-center text-gray-500 gap-2">
                  <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
                  <span className="text-xs font-bold">正在拉取 {currentDir} ...</span>
                </div>
              ) : panFiles.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2">🗂️</div>
                  <div className="font-black text-gray-700 mb-1 text-sm">当前目录为空</div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 320 }}>
                  {panFiles.map((file) => {
                    const dir = isDir(file);
                    const isVideo = !dir && VIDEO_EXT_RE.test(file.server_filename || '');
                    if (!dir && !isVideo) return null;
                    const selected = selectedFile && String(selectedFile.fs_id) === String(file.fs_id);
                    return (
                      <div
                        key={String(file.fs_id)}
                        className={`px-3 py-2.5 flex items-center cursor-pointer transition-colors ${selected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                        onClick={() => setSelectedFile(file)}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 mr-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {dir ? <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" /> : <Film className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-900 truncate">{file.server_filename || '(未命名)'}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{dir ? '📁 文件夹' : `🎞 视频 · ${formatSize(file.size)}`}</div>
                        </div>
                        {dir && (
                          <button onClick={(e) => { e.stopPropagation(); setCurrentDir(resolveFolderPath(file)); }} className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black hover:bg-orange-200 flex items-center gap-1 flex-shrink-0 ml-2">
                            进入 <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleConfirmLink}
              disabled={!selectedFile || linking}
              className="w-full h-12 rounded-full font-black text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)', boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)' }}
            >
              {linking ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> 关联中...</>
              ) : (
                <><Link2 className="w-5 h-5" /> 确认关联</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
