import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';

const app = express();
app.use(cors());

app.get('/api/proxy-video', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  const headers = {
    'User-Agent': 'pan.baidu.com',
    'Accept': '*/*',
    'Connection': 'keep-alive'
  };

  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  const client = targetUrl.toString().startsWith('https:') ? https : http;

  client.get(targetUrl, { headers }, (response) => {
    res.status(response.statusCode);
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (response.headers[key]) {
        res.setHeader(key, response.headers[key]);
      }
    }
    response.pipe(res);
  }).on('error', (e) => {
    res.status(500).send(e.message);
  });
});

export default app;
