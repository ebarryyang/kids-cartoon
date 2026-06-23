import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin to resolve 302 redirects for Baidu Netdisk
const resolveRedirectPlugin = () => {
  return {
    name: 'resolve-redirect',
    configureServer(server) {
      server.middlewares.use('/api/resolve-redirect', (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const targetUrl = url.searchParams.get('url');
        
        if (!targetUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        const options = {
          headers: {
            'User-Agent': 'pan.baidu.com',
            'Connection': 'keep-alive'
          }
        };

        const client = targetUrl.startsWith('https:') ? require('https') : require('http');

        const request = client.get(targetUrl, options, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 303 || response.statusCode === 307) {
            let location = response.headers.location;
            
            if (location && location.startsWith('http://')) {
               location = location.replace('http://', 'https://');
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ location: location }));
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ location: targetUrl, statusCode: response.statusCode }));
          }
        });

        request.on('error', (e) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message, targetUrl }));
        });
      });
    }
  }
}

export default defineConfig({
  base: '/client/',
  server: {
    port: 5173,
    proxy: {
      '/baidu-oauth': {
        target: 'https://openapi.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baidu-oauth/, '')
      },
      '/baidu-api': {
        target: 'https://pan.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/baidu-api/, '')
      },
      '/api/course-materials': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/course-materials/, '')
      },
      '/baidu-cdn': {
        target: 'https://d.pcs.baidu.com',
        changeOrigin: true,
        rewrite: (path) => {
          const cleanPath = path.replace(/^\/baidu-cdn/, '');
          return cleanPath.replace(/&targetHost=[^&]*/g, '').replace(/&targetProtocol=[^&]*/g, '');
        },
        router: (req) => {
          try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const targetHost = url.searchParams.get('targetHost');
            const targetProtocol = url.searchParams.get('targetProtocol') || 'https';
            if (targetHost) {
              req.headers.host = targetHost;
              return `${targetProtocol}://${targetHost}`;
            }
          } catch (e) {
            // ignore
          }
          return 'https://d.pcs.baidu.com';
        },
        secure: false,
        onProxyReq: (proxyReq, req) => {
          proxyReq.removeHeader('Origin');
          proxyReq.removeHeader('Referer');
          proxyReq.removeHeader('Cookie');
          proxyReq.setHeader('User-Agent', 'pan.baidu.com');
          
          const targetHostMatch = req.url?.match(/targetHost=([^&]+)/);
          if (targetHostMatch && targetHostMatch[1]) {
             proxyReq.setHeader('Host', targetHostMatch[1]);
          }

          proxyReq.setHeader('Accept', '*/*');
          proxyReq.removeHeader('Accept-Encoding');
        }
      }
    }
  },
  plugins: [react(), resolveRedirectPlugin()],
})
