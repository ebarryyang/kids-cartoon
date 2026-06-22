import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// 您的百度网盘应用凭证 (注意：生产环境中这些应当放在 .env 环境变量中)
const BAIDU_APP_KEY = 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP';
const BAIDU_SECRET_KEY = 'Ig5e7CeRvJDKhfsuZoueUyqkxUYPWnH8';

// Step 1: 客户端请求获取授权 URL
app.get('/api/baidu/auth-url', (req, res) => {
  // 小程序中通常使用 device_code 模式或者由后端引导跳转。
  // 为了在微信小程序环境中顺利完成 OAuth，百度推荐使用 Device Flow（设备授权码模式）或者普通的 Authorization Code。
  // 这里我们演示基础的 Authorization Code 授权 URL 生成
  const redirectUri = 'https://your-domain.com/api/baidu/callback'; // 必须是您在百度后台配置的合法回调地址
  const authUrl = `https://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=${BAIDU_APP_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=basic,netdisk`;
  
  res.json({ success: true, url: authUrl });
});

// Step 2: 获取 Access Token (这里模拟前端直接传 Code，或者通过 Device Flow 获取)
app.post('/api/baidu/token', async (req, res) => {
  const { code, redirectUri } = req.body;
  
  try {
    const response = await axios.get('https://openapi.baidu.com/oauth/2.0/token', {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: BAIDU_APP_KEY,
        client_secret: BAIDU_SECRET_KEY,
        redirect_uri: redirectUri
      }
    });

    // 成功获取到 Token
    // response.data 包含: access_token, refresh_token, expires_in 等
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Baidu Token Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: '获取 Token 失败' });
  }
});

// Step 3: 获取视频流直链 (通过 AccessToken 和文件 fsid)
app.get('/api/baidu/video-stream', async (req, res) => {
  const { access_token, fsid } = req.query;
  
  try {
    // 百度网盘获取文件下载直链的接口
    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/multimedia', {
      params: {
        method: 'filemetas',
        access_token,
        fsids: `[${fsid}]`, // 文件ID数组
        dlink: 1 // 请求返回 dlink
      }
    });

    if (response.data?.list?.[0]?.dlink) {
      // 百度返回的 dlink 需要附带 access_token 才能真正下载/播放
      const streamingUrl = `${response.data.list[0].dlink}&access_token=${access_token}`;
      res.json({ success: true, url: streamingUrl });
    } else {
      res.status(404).json({ success: false, error: '无法获取该文件的直链' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '获取视频流失败' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Baidu OAuth Server is running on port ${PORT}`);
});