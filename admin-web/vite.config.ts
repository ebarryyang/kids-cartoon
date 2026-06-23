import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  build: {
    sourcemap: 'hidden',
  },
  server: {
    port: 1011,
    strictPort: false,
    proxy: {
      '/baidu-video': {
        target: 'https://d.pcs.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baidu-video/, ''),
        headers: {
          'User-Agent': 'pan.baidu.com',
          'Referer': ''
        }
      },
      // 新增：代理所有的 baidupcs.com CDN 请求，彻底解决 CORS 问题
      '/baidu-cdn': {
        target: 'https://xafj-ct11.baidupcs.com', // 这是一个占位，实际会在 router 中动态替换
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baidu-cdn/, ''),
        router: (req) => {
          // 动态解析请求头中我们自己约定的 target-host，来决定代理到哪个真实的 CDN 节点
          if (req.headers['x-target-host']) {
            return req.headers['x-target-host'] as string;
          }
          return 'https://d.pcs.baidu.com';
        },
        headers: {
          'User-Agent': 'pan.baidu.com',
          'Referer': ''
        }
      }
    }
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths()
  ],
})
