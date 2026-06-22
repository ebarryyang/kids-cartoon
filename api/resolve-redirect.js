import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/api/resolve-redirect', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const client = targetUrl.toString().startsWith('https:') ? require('https') : require('http');
    const url = new URL(targetUrl);
    
    const options = {
      headers: {
        'User-Agent': 'pan.baidu.com',
        'Connection': 'keep-alive'
      }
    };

    client.get(url, options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 303 || response.statusCode === 307) {
        let location = response.headers.location;
        if (location && location.startsWith('http://')) {
          location = location.replace('http://', 'https://');
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ location }));
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ location: targetUrl, statusCode: response.statusCode }));
      }
    }).on('error', (e) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message, targetUrl }));
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default app;
