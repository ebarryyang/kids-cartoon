## 1. 架构设计
```mermaid
graph TD
    subgraph Frontend [前端 (React + Vite)]
        A[页面组件: Auth/List/Player]
        B[状态管理: Zustand]
        C[代理配置: Vite Proxy]
    end
    
    subgraph BaiduAPI [百度网盘 API]
        D[OAuth 2.0 授权]
        E[获取文件列表]
        F[获取视频 Dlink]
    end
    
    subgraph Assets [本地静态资源]
        G[VTT 字幕文件]
        H[Markdown 词汇表]
    end

    A <-->|用户授权/获取数据| D
    A <-->|拉取视频列表| E
    A <-->|请求直链| F
    A -->|解析/渲染| G
    A -->|解析/渲染| H
    C -->|代理解决 CORS| BaiduAPI
```

## 2. 技术说明
- 前端框架: React@18 + TypeScript + Vite
- 样式方案: Tailwind CSS + Lucide React (图标)
- 状态管理: Zustand (用于跨页面共享 Access Token 和视频信息)
- Markdown解析: react-markdown 或手写简单解析器 (用于解析生词表)
- 跨域解决方案: Vite 开发服务器的 proxy 功能，将特定的请求转发到百度网盘的 CDN 节点。

## 3. 路由定义
| 路由 | 页面组件 | 作用 |
|-------|---------|------|
| `/` | `Home` | 默认首页，如果未授权则展示授权入口；如果已授权则展示视频列表 |
| `/auth/callback` | `Callback` | 处理百度网盘授权回调，提取 Access Token |
| `/player/:fsId` | `Player` | 核心播放页面，根据网盘文件 ID 请求直链，并提供互动播放体验 |

## 4. 核心逻辑实现方案
### 4.1 百度网盘 API 封装
需要封装统一的 API 请求函数：
- `getBaiduAuthUrl()`: 生成授权链接
- `getFileList(token)`: 拉取 `/apps/英语宝贝动画宝` 下的文件
- `getDlink(token, fsId)`: 获取文件的 Dlink 并尝试解析真实 CDN 地址

### 4.2 互动播放器
基于原生 `<video>` 标签，利用 `onTimeUpdate` 事件监听播放进度。
- 维护一个 `activeEvent` 状态，当视频当前时间达到词汇表中的预设时间时，设置 `activeEvent` 并调用 `videoRef.current.pause()`。
- 显示互动单词卡，卡片包含 TTS 发音按钮和“继续播放”按钮。点击“继续”时清除 `activeEvent` 并调用 `videoRef.current.play()`。

### 4.3 Vite Proxy 配置
由于百度网盘直链在前端直接播放会遇到 CORS 问题，需要在 `vite.config.ts` 中配置代理：
```typescript
proxy: {
  '/baidu-video': {
    target: 'https://d.pcs.baidu.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/baidu-video/, ''),
    headers: { 'User-Agent': 'pan.baidu.com', 'Referer': '' }
  },
  '/baidu-cdn': {
    target: 'https://xafj-ct11.baidupcs.com', // 动态代理目标
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/baidu-cdn/, ''),
    router: (req) => req.headers['x-target-host'] as string || 'https://d.pcs.baidu.com',
    headers: { 'User-Agent': 'pan.baidu.com', 'Referer': '' }
  }
}
```