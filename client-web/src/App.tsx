import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Auth from './pages/Auth';
import Login from './pages/Login';
import VideoList from './pages/VideoList';
import Player from './pages/Player';
import Discover from './pages/Discover';
import Honor from './pages/Honor';
import Mine from './pages/Mine';
import CustomTabBar from './components/CustomTabBar';
import { useStore } from './store/useStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useStore((state) => state.user);
  const accessToken = useStore((state) => state.accessToken);
  
  // 未登录或未授权百度网盘，跳转到登录页
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // 已登录但未授权百度网盘，跳转到授权页
  if (!accessToken) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

// 需要百度网盘授权的页面（不包括授权页本身）
function BaiduAuthRequired({ children }: { children: React.ReactNode }) {
  const accessToken = useStore((state) => state.accessToken);
  
  if (!accessToken) {
    return <Navigate to="/auth" replace />;
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
        
        {/* 百度网盘授权页 - 需已登录 */}
        <Route 
          path="/auth" 
          element={
            <ProtectedRoute>
              <Auth />
            </ProtectedRoute>
          } 
        />
        
        {/* 主页面 - 需登录+百度网盘授权 */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <BaiduAuthRequired>
                <VideoList />
              </BaiduAuthRequired>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/discover" 
          element={
            <ProtectedRoute>
              <BaiduAuthRequired>
                <Discover />
              </BaiduAuthRequired>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/honor" 
          element={
            <ProtectedRoute>
              <BaiduAuthRequired>
                <Honor />
              </BaiduAuthRequired>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/mine" 
          element={
            <ProtectedRoute>
              <BaiduAuthRequired>
                <Mine />
              </BaiduAuthRequired>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/player" 
          element={
            <ProtectedRoute>
              <BaiduAuthRequired>
                <Player />
              </BaiduAuthRequired>
            </ProtectedRoute>
          } 
        />
        
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
