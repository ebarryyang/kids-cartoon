import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_KEY, getTokenWithCode } from '../lib/baiduApi';
import { useStore } from '../store/useStore';
import { KeyRound, Link2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [step, setStep] = useState<'guide' | 'input' | 'success'>('guide');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAccessToken = useStore((state) => state.setAccessToken);
  const navigate = useNavigate();

  // 检测 URL 中是否有授权码（OAuth callback）
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    if (authCode) {
      setCode(authCode);
      setStep('input');
      // 清理 URL
      window.history.replaceState({}, '', '/auth');
    }
  }, []);

  const handleAuthClick = () => {
    const authUrl = `http://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=oob&scope=basic,netdisk&display=page`;
    window.open(authUrl, '_blank');
    // 引导用户复制授权码
    setTimeout(() => {
      setStep('input');
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('请输入授权码');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await getTokenWithCode(code.trim());
      if (data.access_token) {
        setAccessToken(data.access_token);
        setStep('success');
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setError('获取 Token 失败，请检查授权码是否正确或已过期');
        setStep('input');
      }
    } catch (err: any) {
      setError(err.response?.data?.error_description || err.message || '网络请求失败');
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ 
      backgroundColor: '#FFFDF5',
      backgroundImage: 'radial-gradient(#FFE270 2px, transparent 2px)',
      backgroundSize: '40px 40px',
    }}>
      <div className="w-full max-w-md">
        {/* Logo / 标题 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
               style={{ 
                 background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                 boxShadow: '0 8px 24px rgba(255, 125, 0, 0.3)'
               }}>
            <span className="text-4xl">🎬</span>
          </div>
          <h1 className="text-3xl font-black mb-2" style={{ color: '#FF7D00' }}>
            英语宝贝动画宝
          </h1>
          <p className="text-base font-bold" style={{ color: '#8C5A00' }}>
            连接百度网盘，开启动画学习之旅
          </p>
        </div>

        {/* 步骤卡片 */}
        <div className="bg-white rounded-3xl p-6 space-y-6"
             style={{ 
               boxShadow: '0 16px 40px rgba(255, 125, 0, 0.15)',
               border: '4px solid #FFD13B'
             }}>
          
          {step === 'guide' && (
            <>
              {/* 步骤1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-black"
                     style={{ background: 'linear-gradient(135deg, #FFD13B, #FF7D00)' }}>
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-gray-900 mb-2">获取百度网盘授权</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    点击下方按钮，在打开的百度页面中登录并授权本应用访问您的网盘文件。
                  </p>
                  <button
                    onClick={handleAuthClick}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full text-base font-black text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{ 
                      background: 'linear-gradient(135deg, #1A2980 0%, #26D0CE 100%)',
                      boxShadow: '0 4px 12px rgba(26, 41, 128, 0.3)'
                    }}
                  >
                    <Link2 className="w-5 h-5" />
                    去百度网盘授权
                  </button>
                </div>
              </div>

              {/* 步骤2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-black bg-gray-300">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 mb-2">输入授权码</h3>
                  <p className="text-sm text-gray-600">
                    授权成功后，百度页面会显示一个授权码，复制后粘贴到下方输入框中。
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-bold mb-1">为什么需要授权？</p>
                    <p>只有获得您的授权，应用才能读取网盘中的动画视频文件，为您提供播放服务。我们不会上传或修改您的任何文件。</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'input' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-2">请输入授权码</h3>
                <p className="text-sm text-gray-600 mb-4">
                  将百度页面显示的授权码粘贴到下方：
                </p>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="在此粘贴授权码"
                    autoFocus
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-2xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('guide')}
                  className="flex-1 py-3 px-4 rounded-full bg-gray-100 text-gray-600 font-black hover:bg-gray-200 transition-colors"
                >
                  返回
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-4 rounded-full font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ 
                    background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                    boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      连接中...
                    </>
                  ) : (
                    '完成连接'
                  )}
                </button>
              </div>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">连接成功！</h3>
              <p className="text-sm text-gray-600">正在进入动画乐园...</p>
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs font-medium mt-6" style={{ color: '#8C5A00' }}>
          授权即表示您同意我们将访问您的网盘文件列表
        </p>
      </div>
    </div>
  );
}
