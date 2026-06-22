import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const BAIDU_APP_KEY = 'QzZpo7lkiRQjYoYtACRyYCWjrcNyLqmP';
const BAIDU_SECRET_KEY = 'Ig5e7CeRvJDKhfsuZoueUyqkxUYPWnH8';

app.post('/api/baidu-token', async (req, res) => {
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
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Baidu Token Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: '获取 Token 失败' });
  }
});

app.get('/api/baidu-file', async (req, res) => {
  const { method, dir, access_token } = req.query;
  try {
    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/file', {
      params: { method, dir, access_token }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ success: false, error: '获取文件列表失败' });
  }
});

app.get('/api/baidu-metas', async (req, res) => {
  const { method, fsids, dlink, access_token } = req.query;
  try {
    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/multimedia', {
      params: { method, fsids, dlink, access_token }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ success: false, error: '获取文件元数据失败' });
  }
});

export default app;
