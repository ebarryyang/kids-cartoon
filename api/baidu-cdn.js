import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());

const CDN_BASE = 'https://d.pcs.baidu.com';

app.all('/api/baidu-cdn/*', async (req, res) => {
  const path = req.url.replace(/^\/api\/baidu-cdn/, '');
  const targetUrl = `${CDN_BASE}${path}`;
  
  const headers = {
    'User-Agent': 'pan.baidu.com',
    'Referer': ''
  };

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  try {
    const response = await axios({
      method: req.method.toLowerCase(),
      url: targetUrl,
      headers,
      data: req.body,
      responseType: 'stream'
    });

    res.status(response.status);
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (response.headers[key]) {
        res.setHeader(key, response.headers[key]);
      }
    }
    response.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'CDN 代理失败', details: error.message });
  }
});

export default app;
