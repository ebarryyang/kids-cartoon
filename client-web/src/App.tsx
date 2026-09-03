import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Auth from './pages/Auth';
import Login from './pages/Login';
import VideoList from './pages/VideoList';
import SeriesDetail from './pages/SeriesDetail';
import Player from './pages/Player';
import Discover from './pages/Discover';
import Honor from './pages/Honor';
import Mine from './pages/Mine';
import CustomTabBar from './components/CustomTabBar';
import { useStore } from './store/useStore';

function AuthOnly({ children, redirectToLogin }: { children: React.ReactNode; redirectToLogin?: boolean }) {
  const user = useStore((state) => state.user);
  const location = useLocation();

  if (!user) {
    const { pathname, search, hash } = location;
    const back = encodeURIComponent(`${pathname}${search}${hash}`);
    return <Navigate to={`/login?redirect=${back}`} replace />;
  }

  if (redirectToLogin !== false) {
    // noop
  }

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthOnly>
      <BaiduAuthRequired>{children}</BaiduAuthRequired>
    </AuthOnly>
  );
}

// 需要百度网盘授权的页面（不包括授权页本身、登录页、授权回调页）
function BaiduAuthRequired({ children }: { children: React.ReactNode }) {
  const accessToken = useStore((state) => state.accessToken);
  const location = useLocation();
  const { pathname, search, hash } = location;
  const redirect = `${pathname}${search}${hash}`;
  
  if (!accessToken) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const location = useLocation();
  
  // 根据路径确定当前激活的标签
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path === '/') return 0;
    if (path === '/discover') return 1;
    if (path === '/honor') return 2;
    if (path === '/mine') return 3;
    return -1;
  };

  const currentTab = getCurrentTab();
  const showTabBar = currentTab !== -1;

  return (
    <div className="min-h-screen">
      <Routes>
        {/* 登录注册页 - 无需登录 */}
        <Route path="/login" element={<Login />} />
        
        {/* 百度网盘授权页 - 需已登录（但不再要求已授权百度网盘，避免自循环） */}
        <Route 
          path="/auth" 
          element={
            <AuthOnly>
              <Auth />
            </AuthOnly>
          } 
        />
        <Route 
          path="/auth/callback" 
          element={
            <AuthOnly>
              <Auth />
            </AuthOnly>
          } 
        />
        
        {/* 主页面 - 需登录+百度网盘授权（ProtectedRoute = AuthOnly + BaiduAuthRequired，不再重复嵌套） */}
        <Route path="/" element={<ProtectedRoute><VideoList /></ProtectedRoute>} />
        <Route path="/series/:seriesId" element={<ProtectedRoute><SeriesDetail /></ProtectedRoute>} />
        <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
        <Route path="/honor" element={<ProtectedRoute><Honor /></ProtectedRoute>} />
        <Route path="/mine" element={<ProtectedRoute><Mine /></ProtectedRoute>} />
        <Route path="/player" element={<ProtectedRoute><Player /></ProtectedRoute>} />
        
        {/* 默认重定向到登录页 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      {showTabBar && <CustomTabBar current={currentTab} />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
