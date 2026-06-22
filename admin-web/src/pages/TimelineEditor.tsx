import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Play, Save, Trash2, Crosshair, Volume2, Upload } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  time: number;
  wordEn: string;
  wordZh: string;
  imageUrl: string;
  audioUrl: string;
  coordX: number;
  coordY: number;
}

export default function TimelineEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // States
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [activePreview, setActivePreview] = useState<TimelineEvent | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const triggeredIds = useRef<Set<string>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playCountRef = useRef(0);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 视频配置状态
  const [videoUrl, setVideoUrl] = useState("https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4");
  const [subtitlesEnUrl, setSubtitlesEnUrl] = useState("");
  const [subtitlesZhUrl, setSubtitlesZhUrl] = useState("");

  // 拦截视频 URL，如果是百度网盘的 CDN 地址，则进行代理转换
  const getProxiedVideoUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('baidupcs.com')) {
      try {
        const urlObj = new URL(url);
        // 将真正的 CDN 域名（例如 xafj-ct11.baidupcs.com）替换为本地代理前缀
        return `/baidu-cdn${urlObj.pathname}${urlObj.search}`;
      } catch (e) {
        return url;
      }
    }
    return url;
  };

  // 播放音频（优先使用自定义音频，否则使用机器合成），支持指定播放次数
  const playAudio = (event: TimelineEvent, playCount: number = 3) => {
    playCountRef.current = playCount;

    // 停止可能正在播放的声音
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
    }

    const playNext = () => {
      if (playCountRef.current <= 0) return;
      playCountRef.current--;

      if (event.audioUrl) {
        const audio = new Audio(event.audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => {
          if (playCountRef.current > 0) {
            audioTimeoutRef.current = setTimeout(playNext, 800); // 间隔800ms后播放下一遍
          }
        };
        audio.play().catch(e => console.error("Audio play failed:", e));
      } else if (event.wordEn && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(event.wordEn);
        utterance.lang = 'en-US';
        utterance.rate = 0.85; // 稍微放慢语速适合儿童
        utterance.onend = () => {
          if (playCountRef.current > 0) {
            audioTimeoutRef.current = setTimeout(playNext, 800); // 间隔800ms后播放下一遍
          }
        };
        window.speechSynthesis.speak(utterance);
      }
    };

    playNext();
  };

  // Handle video time update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Simulation logic (只有在没有激活的气泡时才触发)
    if (isPreviewing && !activePreview) {
      events.forEach(event => {
        if (Math.abs(time - event.time) <= 0.2 && !triggeredIds.current.has(event.id)) {
          triggerPreviewBubble(event);
        }
      });
    }
  };

  const triggerPreviewBubble = (event: TimelineEvent) => {
    triggeredIds.current.add(event.id);
    setActivePreview(event);
    
    // 暂停视频
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // 自动发音
    playAudio(event);
  };

  const resumeVideo = () => {
    setActivePreview(null);
    playCountRef.current = 0; // 取消后续播放计划
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);

    if (videoRef.current) {
      videoRef.current.play();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  const startSimulation = () => {
    if (!videoRef.current) return;
    setIsPreviewing(true);
    triggeredIds.current.clear();
    setActivePreview(null);
    
    playCountRef.current = 0;
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentAudioRef.current) currentAudioRef.current.pause();
    
    videoRef.current.currentTime = 0;
    videoRef.current.play();
  };

  const addEvent = () => {
    const newEvent: TimelineEvent = {
      id: `evt_${Date.now()}`,
      time: Number(currentTime.toFixed(1)),
      wordEn: '',
      wordZh: '',
      imageUrl: '',
      audioUrl: '',
      coordX: 50,
      coordY: 20
    };
    
    const newEvents = [...events, newEvent].sort((a, b) => a.time - b.time);
    setEvents(newEvents);
  };

  const updateEvent = (id: string, field: keyof TimelineEvent, value: string | number) => {
    setEvents(events.map(evt => 
      evt.id === id ? { ...evt, [field]: value } : evt
    ).sort((a, b) => a.time - b.time));
  };

  const removeEvent = (id: string) => {
    setEvents(events.filter(evt => evt.id !== id));
  };

  const seekAndPlay = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const handleSave = () => {
    // Here you would typically save to your backend API
    const payload = {
      videoUrl,
      subtitlesEnUrl,
      subtitlesZhUrl,
      events
    };
    console.log('Saved Timeline Data:', JSON.stringify(payload, null, 2));
    alert('保存成功！时间轴数据与视频配置已更新。');
  };

  // 处理 Markdown 导入
  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      // 简单的 Markdown 表格解析
      // 假设格式为: | 触发时间(s) | 英文单词 | 中文释义 | X坐标 | Y坐标 |
      const lines = content.split('\n');
      const newEvents: TimelineEvent[] = [];
      let isTable = false;

      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
          if (trimmedLine.includes('---')) {
            isTable = true; // 遇到表头分隔线，开始解析数据
            return;
          }
          if (isTable) {
            const columns = trimmedLine.split('|').map(col => col.trim()).filter(col => col !== '');
            if (columns.length >= 3) {
              const time = parseFloat(columns[0]) || 0;
              const wordEn = columns[1] || '';
              const wordZh = columns[2] || '';
              const coordX = columns.length >= 4 ? parseFloat(columns[3]) : 50;
              const coordY = columns.length >= 5 ? parseFloat(columns[4]) : 20;

              if (wordEn) {
                newEvents.push({
                  id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  time,
                  wordEn,
                  wordZh,
                  imageUrl: '',
                  audioUrl: '',
                  coordX: isNaN(coordX) ? 50 : coordX,
                  coordY: isNaN(coordY) ? 20 : coordY,
                });
              }
            }
          }
        }
      });

      if (newEvents.length > 0) {
        setEvents(prev => [...prev, ...newEvents].sort((a, b) => a.time - b.time));
        alert(`成功导入 ${newEvents.length} 个生词节点！`);
      } else {
        alert('未能从文件中解析出有效的生词数据，请检查 Markdown 格式是否正确。');
      }
    };
    reader.readAsText(file);
    // 清空 input value，以便重复导入同一个文件
    if (e.target) e.target.value = '';
  };

  useEffect(() => {
    return () => {
      playCountRef.current = 0;
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
      
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/content')}
            className="mr-4 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI 动画交互编辑器</h1>
            <p className="text-sm text-slate-500">正在编辑视频 ID: {id}</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <label className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium cursor-pointer border border-emerald-200">
            <Upload className="w-4 h-4 mr-2" />
            导入词汇表 (MD)
            <input 
              type="file" 
              accept=".md,.txt" 
              className="hidden" 
              onChange={handleImportMarkdown} 
            />
          </label>
          <button 
            onClick={startSimulation}
            className="flex items-center px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium"
          >
            <Play className="w-4 h-4 mr-2" />
            AI 模拟预览
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            保存并发布
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Left: Video Player */}
        <div className="flex-[3] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="relative bg-black aspect-video w-full flex-shrink-0">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              crossOrigin="anonymous"
              src={getProxiedVideoUrl(videoUrl)}
              onTimeUpdate={handleTimeUpdate}
            >
              {subtitlesEnUrl && (
                <track 
                  kind="subtitles" 
                  src={subtitlesEnUrl} 
                  srcLang="en" 
                  label="English" 
                  default 
                />
              )}
              {subtitlesZhUrl && (
                <track 
                  kind="subtitles" 
                  src={subtitlesZhUrl} 
                  srcLang="zh" 
                  label="中文" 
                />
              )}
            </video>
            
            {/* Preview Bubble */}
            {activePreview && (
              <div 
                className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-white/5 backdrop-blur-md px-8 py-6 rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.15)] border-2 border-white/60 pointer-events-auto animate-in zoom-in flex flex-col items-center gap-4 z-10"
                style={{ 
                  left: `${activePreview.coordX}%`, 
                  top: `${activePreview.coordY}%`,
                  marginLeft: '3cm',
                  marginTop: '2cm'
                }}
              >
                {activePreview.imageUrl && (
                  <img src={activePreview.imageUrl} alt="preview" className="w-24 h-24 object-contain drop-shadow-md" />
                )}
                <div className="text-center flex flex-col items-center">
                  <div className="flex items-center gap-3">
                    <div className="font-black text-4xl text-rose-500 tracking-wide" style={{ WebkitTextStroke: '1px white' }}>
                      {activePreview.wordEn || 'English'}
                    </div>
                    <button 
                      onClick={() => playAudio(activePreview)}
                      className="bg-blue-100 text-blue-600 p-2 rounded-full hover:bg-blue-200 hover:scale-110 transition-all cursor-pointer shadow-sm flex-shrink-0"
                      title="播放发音"
                    >
                      <Volume2 className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="font-bold text-2xl text-blue-500 mt-2">
                    {activePreview.wordZh || '中文'}
                  </div>
                </div>
                
                <button 
                  onClick={resumeVideo}
                  className="mt-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-8 rounded-full shadow-lg active:scale-95 transition-transform text-lg w-full"
                >
                  继续播放
                </button>
              </div>
            )}
          </div>
          
          <div className="p-6 flex-1 flex flex-col bg-slate-50 border-t border-slate-200 overflow-y-auto">
            <div className="flex justify-center mb-6">
              <button 
                onClick={addEvent}
                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-transform active:scale-95 shadow-md font-medium text-lg"
              >
                <Plus className="w-6 h-6 mr-2" />
                添加交互点 (当前时间: {currentTime.toFixed(1)}s)
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm border-b pb-2">视频与字幕配置</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">视频源文件 URL</label>
                <input 
                  type="text" 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="https://..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">英文字幕文件 URL (.vtt)</label>
                  <input 
                    type="text" 
                    value={subtitlesEnUrl}
                    onChange={(e) => setSubtitlesEnUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="https://.../en.vtt"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">中文字幕文件 URL (.vtt)</label>
                  <input 
                    type="text" 
                    value={subtitlesZhUrl}
                    onChange={(e) => setSubtitlesZhUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="https://.../zh.vtt"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">注：推荐使用 WebVTT (.vtt) 格式。如果跨域，请确保字幕服务器配置了 CORS 跨域规则。</p>
            </div>
          </div>
        </div>

        {/* Right: Timeline Events */}
        <div className="flex-[2] flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-900">交互节点列表 ({events.length})</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Crosshair className="w-12 h-12 mb-3 text-slate-300" />
                <p>暂无交互点，请在左侧添加</p>
              </div>
            ) : (
              events.map((event, index) => (
                <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative group">
                  <div className="absolute -left-2 top-4 w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-sm" />
                  
                  <div className="ml-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded text-sm">
                        触发时间: {event.time.toFixed(1)}s
                      </span>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => seekAndPlay(event.time)}
                          className="text-xs px-2 py-1 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                        >
                          定位播放
                        </button>
                        <button 
                          onClick={() => removeEvent(event.id)}
                          className="text-xs px-2 py-1 text-rose-600 bg-rose-50 rounded hover:bg-rose-100 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">英文单词 (English)</label>
                          <input 
                            type="text" 
                            value={event.wordEn}
                            onChange={(e) => updateEvent(event.id, 'wordEn', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="例如: Apple"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">中文释义 (Chinese)</label>
                          <input 
                            type="text" 
                            value={event.wordZh}
                            onChange={(e) => updateEvent(event.id, 'wordZh', e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="例如: 苹果"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">卡通图片 URL (可选)</label>
                        <input 
                          type="text" 
                          value={event.imageUrl}
                          onChange={(e) => updateEvent(event.id, 'imageUrl', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="输入图片链接，例如: https://.../apple.png"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">留空则不显示图片。可填入卡通风格插图URL。</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">自定义发音音频 URL (可选)</label>
                        <input 
                          type="text" 
                          value={event.audioUrl}
                          onChange={(e) => updateEvent(event.id, 'audioUrl', e.target.value)}
                          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="输入音频链接，例如: https://.../apple.mp3"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">留空则使用系统自带的机器合成发音。</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">X坐标(%)</label>
                          <input 
                            type="number" 
                            min="0" max="100"
                            value={event.coordX}
                            onChange={(e) => updateEvent(event.id, 'coordX', Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Y坐标(%)</label>
                          <input 
                            type="number" 
                            min="0" max="100"
                            value={event.coordY}
                            onChange={(e) => updateEvent(event.id, 'coordY', Number(e.target.value))}
                            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
