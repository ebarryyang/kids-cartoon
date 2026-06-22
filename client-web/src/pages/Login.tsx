import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Mail, Lock, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const setUser = useStore((state) => state.setUser);
  const isLoggedIn = useStore((state) => state.isLoggedIn);
  const navigate = useNavigate();

  // 如果已登录，跳转到首页
  useEffect(() => {
    if (isLoggedIn()) {
      navigate('/');
    }
  }, [isLoggedIn, navigate]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!validateEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    if (mode === 'register') {
      if (!password) {
        setError('请输入密码');
        return;
      }
      if (password.length < 6) {
        setError('密码长度至少6位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    if (mode === 'login' && !password) {
      setError('请输入密码');
      return;
    }

    try {
      setLoading(true);
      
      // 模拟API请求延迟
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 获取本地存储的用户数据
      const users = JSON.parse(localStorage.getItem('app_users') || '[]');
      
      if (mode === 'register') {
        // 检查用户是否已存在
        if (users.find((u: any) => u.email === email)) {
          setError('该邮箱已被注册');
          return;
        }
        
        // 创建新用户
        const newUser = {
          id: Date.now().toString(),
          email,
          password, // 实际项目中应该加密存储
          nickname: email.split('@')[0],
          createdAt: new Date().toISOString(),
        };
        
        users.push(newUser);
        localStorage.setItem('app_users', JSON.stringify(users));
        
        // 自动登录
        const { password: _, ...userWithoutPassword } = newUser;
        setUser(userWithoutPassword);
        localStorage.setItem('app_current_user', JSON.stringify(userWithoutPassword));
        
        setSuccess('注册成功！正在进入...');
        setTimeout(() => navigate('/'), 1000);
      } else {
        // 登录验证
        const user = users.find((u: any) => u.email === email && u.password === password);
        if (!user) {
          setError('邮箱或密码错误');
          return;
        }
        
        const { password: _, ...userWithoutPassword } = user;
        setUser(userWithoutPassword);
        localStorage.setItem('app_current_user', JSON.stringify(userWithoutPassword));
        
        setSuccess('登录成功！正在进入...');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = () => {
    setError('');
    setSuccess('');
    if (!email.trim()) {
      setError('请先输入邮箱地址');
      return;
    }
    if (!validateEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    // 模拟发送重置邮件
    setSuccess('密码重置邮件已发送（模拟）');
    setTimeout(() => setSuccess(''), 3000);
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
            {mode === 'login' ? '欢迎回来！' : mode === 'register' ? '创建新账户' : '找回密码'}
          </p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white rounded-3xl p-6 space-y-6"
             style={{ 
               boxShadow: '0 16px 40px rgba(255, 125, 0, 0.15)',
               border: '4px solid #FFD13B'
             }}>
          
          {/* 切换标签 */}
          {mode !== 'forgot' && (
            <div className="flex bg-gray-100 rounded-2xl p-1">
              <button
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
                  mode === 'login' 
                    ? 'bg-white text-orange-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                登录
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
                  mode === 'register' 
                    ? 'bg-white text-orange-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                注册
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">邮箱地址</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  autoFocus
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-2xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* 密码 */}
            {mode !== 'forgot' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">密码</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 border-2 border-gray-200 rounded-2xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* 确认密码 */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">确认密码</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入密码"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-2xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            )}

            {/* 错误/成功提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            {/* 提交按钮 */}
            {mode !== 'forgot' && (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-full font-black text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                style={{ 
                  background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                  boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {mode === 'login' ? '登录中...' : '注册中...'}
                  </>
                ) : (
                  mode === 'login' ? '登录' : '立即注册'
                )}
              </button>
            )}

            {/* 辅助链接 */}
            {mode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="font-medium text-orange-600 hover:text-orange-700"
                >
                  忘记密码？
                </button>
              </div>
            )}

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={resetPassword}
                className="w-full py-3 px-4 rounded-full font-black text-white transition-all hover:scale-[1.02] active:scale-95"
                style={{ 
                  background: 'linear-gradient(135deg, #FFD13B 0%, #FF7D00 100%)',
                  boxShadow: '0 4px 12px rgba(255, 125, 0, 0.3)'
                }}
              >
                发送重置邮件
              </button>
            )}
          </form>

          {/* 底部切换 */}
          {mode === 'forgot' ? (
            <p className="text-center text-sm text-gray-600">
              <button
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="font-bold text-orange-600 hover:text-orange-700"
              >
                返回登录
              </button>
            </p>
          ) : (
            <p className="text-center text-sm text-gray-600">
              {mode === 'login' ? '还没有账户？' : '已有账户？'}
              <button
                onClick={() => { 
                  setMode(mode === 'login' ? 'register' : 'login'); 
                  setError(''); 
                  setSuccess(''); 
                }}
                className="font-bold text-orange-600 hover:text-orange-700 ml-1"
              >
                {mode === 'login' ? '立即注册' : '去登录'}
              </button>
            </p>
          )}
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs font-medium mt-6" style={{ color: '#8C5A00' }}>
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
