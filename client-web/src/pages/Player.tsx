import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { EpisodeFile } from '../store/types';
import { resolveRedirect, getProxiedVideoUrl } from '../lib/baiduApi';
import { getEpisodeMaterial, type EpisodeMaterial } from '../lib/courseApi';
import { 
  ArrowLeft, Play, Pause, Volume2, Maximize, 
  CheckCircle2, BookOpen, Mic, Loader2, AlertCircle, ChevronRight,
  SkipBack, SkipForward
} from 'lucide-react';

export default function Player() {
  const location = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const accessToken = useStore((state) => state.accessToken);
  const updateEpisodeProgress = useStore((state) => state.updateEpisodeProgress);
  
  // 从 location.state 获取参数
  const { dlink, filename, subtitleDlink, seriesId, episodeFsId, episodes } = location.state as any || {};
  
  const [videoUrl, setVideoUrl] = useState('');
  const [subtitleUrl, setSubtitleUrl] = useState('');
  const [vocabularyUrl, setVocabularyUrl] = useState('');
  const [hasExercise, setHasExercise] = useState(false);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentEpisodeIdx, setCurrentEpisodeIdx] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [platformSubtitleLoaded, setPlatformSubtitleLoaded] = useState(false);

  // 解析视频播放地址
  useEffect(() => {
    if (!dlink || !accessToken) {
      navigate('/');
      return;
    }

    const fetchRealUrl = async () => {
      try {
        setLoading(true);
        setError('');
        const realCdnUrl = await resolveRedirect(dlink, accessToken);
        console.log('Real CDN URL parsed:', realCdnUrl);
        const proxiedUrl = getProxiedVideoUrl(realCdnUrl);
        console.log('Proxied URL generated:', proxiedUrl);
        setVideoUrl(proxiedUrl);

        // 优先从平台拉取字幕和生词表（版权规避：不依赖用户网盘）
        if (seriesId && episodeFsId) {
          try {
            const materialRes = await getEpisodeMaterial(seriesId, String(episodeFsId));
            if (materialRes.success && materialRes.data) {
              const material: EpisodeMaterial = materialRes.data;
              console.log('平台课程资料加载成功:', material);
              
              // 加载平台字幕
              if (material.subtitleUrl && !platformSubtitleLoaded) {
                setSubtitleUrl(material.subtitleUrl);
                setPlatformSubtitleLoaded(true);
              }
              
              // 加载生词表
              if (material.vocabularyUrl) {
                setVocabularyUrl(material.vocabularyUrl);
              }
              
              // 互动练习状态
              setHasExercise(material.hasExercise);
              setExerciseCount(material.exerciseCount || 0);
            }
          } catch (err) {
            console.warn('平台课程资料加载失败，使用备用方案:', err);
          }
        }

        // 备用方案：如果平台没有字幕，但用户网盘有字幕dlink，则使用用户网盘字幕
        if (!platformSubtitleLoaded && subtitleDlink) {
          try {
            const realSubCdnUrl = await resolveRedirect(subtitleDlink, accessToken);
            const proxiedSubUrl = getProxiedVideoUrl(realSubCdnUrl);
            setSubtitleUrl(proxiedSubUrl);
          } catch (err) {
            console.warn('备用字幕解析失败:', err);
          }
        }
      } catch (err: any) {
        setError(err.message || '获取视频播放地址失败');
      } finally {
        setLoading(false);
      }
    };

    fetchRealUrl();
  }, [dlink, accessToken, navigate, subtitleDlink, seriesId, episodeFsId, platformSubtitleLoaded]);

  // 自动播放
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('自动播放被阻止:', err);
        setIsPlaying(false);
      });
    }
  }, [videoUrl]);

  // 视频时间更新
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // 每10秒保存一次进度
      if (seriesId && episodeFsId && Math.floor(video.currentTime) % 10 === 0) {
        const progress = (video.currentTime / video.duration) * 100;
        updateEpisodeProgress(seriesId, episodeFsId, progress);
      }
    };

    const handleDurationChange = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      // 播放完成，保存100%进度
      if (seriesId && episodeFsId) {
        updateEpisodeProgress(seriesId, episodeFsId, 100);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [seriesId, episodeFsId, updateEpisodeProgress]);

  // 查找当前集数索引
  useEffect(() => {
    if (episodes && episodeFsId) {
      const idx = episodes.findIndex((ep: EpisodeFile) => ep.fsId === episodeFsId);
      if (idx !== -1) {
        setCurrentEpisodeIdx(idx);
      }
    }
  }, [episodes, episodeFsId]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const playPrev = () => {
    if (!episodes || currentEpisodeIdx <= 0) return;
    const prevEp = episodes[currentEpisodeIdx - 1];
    if (prevEp.dlink) {
      navigate('/player', {
        state: {
          dlink: prevEp.dlink,
          filename: prevEp.filename,
          subtitleDlink,
          seriesId,
          episodeFsId: prevEp.fsId,
          episodes,
        }
      });
    }
  };

  const playNext = () => {
    if (!episodes || currentEpisodeIdx >= episodes.length - 1) return;
    const nextEp = episodes[currentEpisodeIdx + 1];
    if (nextEp.dlink) {
      navigate('/player', {
        state: {
          dlink: nextEp.dlink,
          filename: nextEp.filename,
          subtitleDlink,
          seriesId,
          episodeFsId: nextEp.fsId,
          episodes,
        }
      });
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* 视频区域 */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center">
              <Loader2 className="w-16 h-16 animate-spin text-orange-500 mx-auto mb-4" />
              <p className="text-white font-bold">正在加载视频...</p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10 p-8">
            <div className="text-center max-w-md">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <p className="text-white font-bold text-lg mb-2">播放失败</p>
              <p className="text-gray-400 text-sm mb-6">{error}</p>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-3 bg-orange-500 text-white rounded-full font-bold"
              >
                返回
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          playsInline
          onClick={togglePlay}
        />

        {/* 字幕 */}
          {subtitleUrl && (
            <track kind="subtitles" src={subtitleUrl} srcLang="zh" label="中文字幕" default />
          )}
          
          {/* 平台字幕加载状态提示 */}
          {platformSubtitleLoaded && subtitleUrl && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-green-500/90 text-white text-xs px-3 py-1 rounded-full z-20">
              ✓ 平台字幕已加载
            </div>
          )}

        {/* 顶部栏 */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-20">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="text-white font-bold text-center flex-1 mx-4 truncate">
              {filename}
            </div>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
            >
              <BookOpen className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 底部控制栏 */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20">
          {/* 进度条 */}
          <div className="mb-3">
            <div 
              className="h-1.5 bg-white/30 rounded-full cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                handleSeek(percent * duration);
              }}
            >
              <div 
                className="h-full bg-orange-500 rounded-full relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-xs text-white/70 font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={playPrev}
                disabled={!episodes || currentEpisodeIdx <= 0}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 disabled:opacity-30"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-600"
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>
              
              <button
                onClick={playNext}
                disabled={!episodes || currentEpisodeIdx >= episodes.length - 1}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 disabled:opacity-30"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-white/70" />
              <button className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 集数信息 */}
          {episodes && episodes.length > 1 && (
            <div className="mt-3 text-center">
              <span className="text-white/70 text-sm">
                第 {currentEpisodeIdx + 1} 集 / 共 {episodes.length} 集
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 侧边栏：课程资料 */}
      {showSidebar && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-gray-900 z-30 transform transition-transform">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-white font-bold">课程资料</h3>
            <button
              onClick={() => setShowSidebar(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="p-4 space-y-4">
            {/* 字幕 */}
            {subtitleUrl ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">字幕</span>
                  {platformSubtitleLoaded && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">平台</span>
                  )}
                </div>
                <p className="text-gray-400 text-sm">
                  {platformSubtitleLoaded ? '已自动加载平台中英文字幕' : '字幕加载中...'}
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">字幕</span>
                </div>
                <p className="text-gray-500 text-sm">暂无字幕</p>
              </div>
            )}
            
            {/* 生词表 */}
            {vocabularyUrl ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">生词表</span>
                </div>
                <p className="text-gray-400 text-sm">平台托管本课重点单词</p>
                <button className="mt-3 w-full py-2 rounded-lg bg-orange-500/20 text-orange-500 text-sm font-bold flex items-center justify-center gap-2">
                  开始学习生词
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">生词表</span>
                </div>
                <p className="text-gray-500 text-sm">暂无生词表</p>
              </div>
            )}

            {/* 互动题 */}
            {hasExercise ? (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-bold">互动练习</span>
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                    {exerciseCount} 题
                  </span>
                </div>
                <p className="text-gray-400 text-sm">观看完成后进行答题</p>
                <button className="mt-3 w-full py-2 rounded-lg bg-blue-500/20 text-blue-500 text-sm font-bold flex items-center justify-center gap-2">
                  开始练习
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl p-4 opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-400 font-bold">互动练习</span>
                </div>
                <p className="text-gray-500 text-sm">暂无练习题</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
