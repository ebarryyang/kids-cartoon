import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { EpisodeFile } from '../store/types';
import { getFileList, getFileMetas } from '../lib/baiduApi';
import { 
  Folder, Film, Loader2, ChevronRight, Link2, Check, X, 
  Play, ChevronDown, ChevronUp
} from 'lucide-react';

interface VideoCard {
  id: string;
  title: string;
  cover: string;
  isUnlocked: boolean;
}

export default function VideoList() {
  const { 
    accessToken, 
    logout, 
    isSeriesUnlocked, 
    unlockSeries, 
    showKeyModal, 
    setShowKeyModal,
    seriesMappings,
    setSeriesMapping,
    getSeriesMapping
  } = useStore();
  const navigate = useNavigate();
  
  // 预设动画系列数据
  const [animations, setAnimations] = useState<VideoCard[]>([
    {
      id: 'peppa_01',
      title: '粉红猪小妹 第一季',
      cover: 'https://picsum.photos/id/237/400/400',
      isUnlocked: true,
    },
    {
      id: 'paw_01',
      title: '汪汪队立大功 第一季',
      cover: 'https://picsum.photos/id/1025/400/400',
      isUnlocked: false,
    },
    {
      id: 'disney_01',
      title: '米奇妙妙屋',
      cover: 'https://picsum.photos/id/1080/400/400',
      isUnlocked: false,
    }
  ]);

  // 百度网盘状态
  const [currentDir, setCurrentDir] = useState('/我的应用数据/英语宝贝动画宝');
  const [panFiles, setPanFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [panError, setPanError] = useState('');
  
  // 关联网盘资源的流程状态
  const [linkingSeriesId, setLinkingSeriesId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [linking, setLinking] = useState(false);
  
  // 展开的系列卡片
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  // 激活码输入
  const [keyValue, setKeyValue] = useState('');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  // 加载百度网盘文件列表
  useEffect(() => {
    if (!accessToken) {
      navigate('/auth');
      return;
    }
    loadFiles(currentDir);
  }, [currentDir, accessToken, navigate]);

  const loadFiles = async (dir: string) => {
    try {
      setLoading(true);
      setPanError('');
      const data = await getFileList(accessToken!, dir);
      if (data.errno === 0) {
        setPanFiles(data.list || []);
      } else {
        setPanError(`获取列表失败: errno ${data.errno}`);
        if (data.errno === -6) {
          logout();
        }
      }
    } catch (err: any) {
      setPanError(err.message || '网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  // 模拟扫码解锁
  const handleScanCard = () => {
    const lockedAnim = animations.find(a => !a.isUnlocked);
    if (lockedAnim) {
      setUnlockingId(lockedAnim.id);
      setTimeout(() => {
        unlockSeries(lockedAnim.id);
        setAnimations(prev => prev.map(item => 
          item.id === lockedAnim.id ? { ...item, isUnlocked: true } : item
        ));
        setUnlockingId(null);
      }, 1500);
    }
  };

  // 激活码提交
  const handleKeySubmit = () => {
    if (!keyValue.trim()) {
      alert('请输入激活码');
      return;
    }
    
    const lockedAnim = animations.find(a => !a.isUnlocked);
    if (lockedAnim) {
      setUnlockingId(lockedAnim.id);
      setTimeout(() => {
        unlockSeries(lockedAnim.id);
        setAnimations(prev => prev.map(item => 
          item.id === lockedAnim.id ? { ...item, isUnlocked: true } : item
        ));
        setShowKeyModal(false);
        setKeyValue('');
        setUnlockingId(null);
      }, 1500);
    }
  };

  // 处理视频卡片点击
  const handleVideoClick = async (video: VideoCard) => {
    if (!video.isUnlocked) {
      setShowKeyModal(true);
      return;
    }

    const mapping = getSeriesMapping(video.id);
    if (mapping && mapping.episodes.length > 0) {
      // 已关联多集，直接播放第一集
      const firstEp = mapping.episodes[0];
      navigate('/player', { 
        state: { 
          dlink: firstEp.dlink || '', 
          filename: firstEp.filename,
          subtitleDlink: mapping.subtitleDlink,
          seriesId: video.id,
          episodeFsId: firstEp.fsId,
          episodes: mapping.episodes
        } 
      });
      return;
    }

    // 未关联，进入关联流程
    setLinkingSeriesId(video.id);
  };

  // 确认关联整个文件夹（多集）
  const handleConfirmLink = async () => {
    if (!linkingSeriesId || !selectedFile || !accessToken) return;
    
    try {
      setLinking(true);
      
      // 如果选中的是文件夹，先获取文件夹内的所有视频文件
      let filesToProcess: any[] = [];
      if (selectedFile.isdir) {
        // 进入文件夹获取文件列表
        const dirPath = selectedFile.path;
        const data = await getFileList(accessToken, dirPath);
        if (data.errno === 0) {
          filesToProcess = data.list.filter((f: any) => 
            !f.isdir && f.server_filename.match(/\.(mp4|mkv|avi|mov)$/i)
          );
        }
      } else {
        filesToProcess = [selectedFile];
      }

      if (filesToProcess.length === 0) {
        alert('该文件夹中没有找到视频文件');
        return;
      }

      // 获取所有视频文件的 dlink
      const fsids = filesToProcess.map(f => f.fs_id);
      const data = await getFileMetas(accessToken, fsids);
      
      if (data.errno === 0 && data.list?.length > 0) {
        const episodes: EpisodeFile[] = data.list.map((item: any) => ({
          fsId: item.fs_id,
          filename: item.filename || filesToProcess.find(f => f.fs_id === item.fs_id)?.server_filename || '',
          dlink: item.dlink,
          size: filesToProcess.find(f => f.fs_id === item.fs_id)?.size,
        }));

        // 只绑定视频文件，字幕和生词表由平台自动匹配（不依赖用户网盘）
        const parentDir = selectedFile.isdir ? selectedFile.path : currentDir;

        setSeriesMapping(linkingSeriesId, {
          folderPath: parentDir,
          episodes,
          subtitleDlink: undefined,
          vocabularyDlink: undefined,
        });
        
        alert(`关联成功！已绑定 ${episodes.length} 集视频\n字幕和生词表将自动从平台加载`);
        setLinkingSeriesId(null);
        setSelectedFile(null);
        return;
      }
      alert('获取文件信息失败');
    } catch (err: any) {
      alert(err.message || '关联失败');
    } finally {
      setLinking(false);
    }
  };

  // 处理文件点击（列表模式）
  const handleFileClick = async (file: any) => {
    if (file.isdir) {
      setCurrentDir(file.path);
    } else if (file.server_filename.match(/\.(mp4|mkv|avi|mov)$/i)) {
      // 点击视频文件，检查是否有关联的课程
      const mapping = seriesMappings.find(m => 
        m.episodes.some(ep => ep.fsId === file.fs_id)
      );
      if (mapping && isSeriesUnlocked(mapping.seriesId)) {
        const episode = mapping.episodes.find(ep => ep.fsId === file.fs_id);
        navigate('/player', { 
          state: { 
            dlink: episode?.dlink || '', 
            filename: file.server_filename,
            subtitleDlink: mapping.subtitleDlink,
            seriesId: mapping.seriesId,
            episodeFsId: file.fs_id,
            episodes: mapping.episodes
          } 
        });
      } else {
        alert('该文件尚未关联到任何已解锁的课程');
      }
    }
  };

  const handleBack = () => {
    const parentDir = currentDir.split('/').slice(0, -1).join('/') || '/';
    setCurrentDir(parentDir);
  };

  const toggleExpand = (seriesId: string) => {
    setExpandedSeries(expandedSeries === seriesId ? null : seriesId);
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
          {/* 用户信息 */}
          <div className="inline-flex items-center bg-white rounded-full px-4 py-2 shadow-lg" 
               style={{ 
                 boxShadow: '0 8px 24px rgba(255, 209, 59, 0.3)',
                 border: '4px solid #FFD13B'
               }}>
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
            <span className="text-2xl font-black text-white" 
                  style={{ textShadow: '0 4px 8px rgba(200, 80, 0, 0.5)' }}>
              扫卡片/输激活码 解锁新动画
            </span>
          </button>
          <div className="mt-2 text-sm font-bold px-4 py-1 rounded-full"
               style={{ 
                 color: '#8C5A00',
                 background: 'rgba(255, 209, 59, 0.3)'
               }}>
            包含：静默下载 2-3MB Lottie 动效与本地发音包
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <main className="px-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-black" style={{ color: '#FF7D00' }}>
              🎮 我的动画乐园
            </h2>
          </div>

          {/* 卡片网格 */}
          <div className="grid grid-cols-2 gap-4">
            {animations.map((anim) => {
              const mapping = getSeriesMapping(anim.id);
              const isLinked = !!mapping && mapping.episodes.length > 0;
              const isExpanded = expandedSeries === anim.id;
              
              return (
                <div
                  key={anim.id}
                  className={`rounded-3xl p-3 cursor-pointer transition-all active:scale-95 ${
                    anim.isUnlocked ? 'bg-white' : 'bg-gray-100'
                  }`}
                  style={{
                    boxShadow: anim.isUnlocked 
                      ? '0 12px 32px rgba(255, 209, 59, 0.15)' 
                      : '0 8px 24px rgba(0, 0, 0, 0.05)',
                    border: '4px solid #FFF',
                  }}
                >
                  {/* 封面 */}
                  <div 
                    className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-gray-200"
                    onClick={() => handleVideoClick(anim)}
                  >
                    <img 
                      src={anim.cover} 
                      alt={anim.title}
                      className="w-full h-full object-cover"
                    />
                    {!anim.isUnlocked && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                        <span className="text-6xl filter drop-shadow-lg">🔒</span>
                      </div>
                    )}
                    {unlockingId === anim.id && (
                      <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
                        <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
                      </div>
                    )}
                    {isLinked && anim.isUnlocked && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-black px-2 py-1 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        已关联
                      </div>
                    )}
                    {/* 展开按钮 */}
                    {isLinked && anim.isUnlocked && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(anim.id);
                        }}
                        className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {mapping.episodes.length}集
                      </button>
                    )}
                  </div>
                  
                  {/* 标题 */}
                  <div 
                    className={`text-base font-black text-center mb-2 leading-tight ${
                      anim.isUnlocked ? 'text-gray-900' : 'text-gray-400'
                    }`}
                    onClick={() => handleVideoClick(anim)}
                  >
                    {anim.title}
                  </div>
                  
                  {/* 徽章 */}
                  <div 
                    className={`text-center py-2 rounded-full text-sm font-black ${
                      anim.isUnlocked 
                        ? 'text-orange-800' 
                        : 'bg-gray-200 text-gray-400'
                    }`}
                    style={anim.isUnlocked ? { 
                      background: '#FFD13B',
                      boxShadow: '0 4px 12px rgba(255, 209, 59, 0.4)'
                    } : {}}
                    onClick={() => handleVideoClick(anim)}
                  >
                    {anim.isUnlocked ? (isLinked ? '立即播放' : '点击关联资源') : '未解锁'}
                  </div>

                  {/* 展开的剧集列表 */}
                  {isExpanded && isLinked && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      {mapping.episodes.map((ep, idx) => (
                        <div 
                          key={ep.fsId}
                          onClick={() => {
                            if (ep.dlink) {
                              navigate('/player', { 
                                state: { 
                                  dlink: ep.dlink, 
                                  filename: ep.filename,
                                  subtitleDlink: mapping.subtitleDlink,
                                  seriesId: anim.id,
                                  episodeFsId: ep.fsId,
                                  episodes: mapping.episodes
                                } 
                              });
                            }
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-orange-50 cursor-pointer transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-black text-orange-600">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-gray-900 truncate">
                              {ep.filename}
                            </div>
                            {ep.progress !== undefined && ep.progress > 0 && (
                              <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-orange-400 rounded-full"
                                  style={{ width: `${ep.progress}%` }}
                                />
                              </div>
                            )}
                          </div>
                          <Play className="w-5 h-5 text-orange-500 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 网盘文件列表（用于关联资源） */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium mr-2">📂 百度网盘文件</span>
                <span className="text-gray-400">点击视频文件可直接播放</span>
              </div>
              {currentDir !== '/我的应用数据/英语宝贝动画宝' && (
                <button 
                  onClick={handleBack}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  返回上一级
                </button>
              )}
            </div>

            {panError && (
              <div className="p-4 bg-red-50 text-red-600 text-sm border-b border-red-100">
                {panError}
              </div>
            )}

            <ul className="divide-y divide-gray-200">
              {loading ? (
                <li className="p-8 flex justify-center items-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </li>
              ) : panFiles.length === 0 ? (
                <li className="p-8 text-center text-gray-500">
                  当前目录为空或没有视频文件
                </li>
              ) : (
                panFiles.map((file) => {
                  const isVideo = file.server_filename.match(/\.(mp4|mkv|avi|mov)$/i);
                  const isLinked = seriesMappings.some(m => 
                    m.folderPath === currentDir || m.episodes.some(ep => ep.fsId === file.fs_id)
                  );
                  
                  return (
                    <li 
                      key={file.fs_id}
                      onClick={() => handleFileClick(file)}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                        isVideo ? '' : ''
                      }`}
                    >
                      <div className="px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center">
                          {file.isdir ? (
                            <Folder className="w-6 h-6 text-yellow-400 mr-3" />
                          ) : isVideo ? (
                            <Film className="w-6 h-6 text-green-500 mr-3" />
                          ) : (
                            <Film className="w-6 h-6 text-blue-500 mr-3" />
                          )}
                          <span className={`font-medium ${
                            isLinked ? 'text-green-600' : 'text-gray-900'
                          }`}>
                            {file.server_filename}
                          </span>
                          {isLinked && (
                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                              已关联
                            </span>
                          )}
                        </div>
                        {file.isdir && <ChevronRight className="w-5 h-5 text-gray-400" />}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      </main>

      {/* 激活码输入弹窗 */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center"
            style={{
              background: '#FFFDF5',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
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
                  boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
                }}
              >
                {unlockingId ? '解锁中...' : '立即解锁'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 关联网盘资源弹窗 */}
      {linkingSeriesId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md rounded-3xl p-6 flex flex-col"
            style={{
              background: '#FFFDF5',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl font-black mb-1" style={{ color: '#1A2980' }}>
                  关联网盘资源
                </div>
                <div className="text-sm text-gray-500">
                  选择动画所在的文件夹，绑定视频源（字幕和生词表由平台自动提供）
                </div>
              </div>
              <button 
                onClick={() => {
                  setLinkingSeriesId(null);
                  setSelectedFile(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 当前目录文件列表 */}
            <div className="bg-white rounded-2xl border border-gray-200 max-h-64 overflow-y-auto mb-4">
              {loading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {panFiles.map((file) => {
                    const isVideo = !file.isdir && file.server_filename.match(/\.(mp4|mkv|avi|mov)$/i);
                    const isFolder = file.isdir;
                    const isRelevant = isFolder || isVideo;
                    
                    if (!isRelevant) return null;
                    
                    return (
                      <div 
                        key={file.fs_id}
                        onClick={() => setSelectedFile(file)}
                        className={`px-4 py-3 flex items-center cursor-pointer transition-colors ${
                          selectedFile?.fs_id === file.fs_id 
                            ? 'bg-orange-50' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                          selectedFile?.fs_id === file.fs_id
                            ? 'border-orange-500 bg-orange-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedFile?.fs_id === file.fs_id && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        {isFolder ? (
                          <Folder className="w-5 h-5 text-yellow-500 mr-3" />
                        ) : (
                          <Film className="w-5 h-5 text-blue-500 mr-3" />
                        )}
                        <span className="flex-1 text-sm font-medium text-gray-900">
                          {file.server_filename}
                        </span>
                        {!isFolder && (
                          <span className="text-xs text-gray-400">
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 导航提示 */}
            <div className="text-xs text-gray-500 mb-4 text-center">
              💡 提示：选择包含视频文件的文件夹，字幕和生词表将自动从平台加载
            </div>

            <button
              onClick={handleConfirmLink}
              disabled={!selectedFile || linking}
              className="w-full h-12 rounded-full font-black text-white text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
              }}
            >
              {linking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  关联中...
                </>
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  确认关联文件夹
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* CSS 动画 */}
      <style>{`
        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
