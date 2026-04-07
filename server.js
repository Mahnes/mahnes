const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Çalışan Piped API'ler (sırayla dene)
const PIPED_APIS = [
  'https://pipedapi.moomoo.me',
  'https://api.piped.projectkrea.id',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.mint.lgbt'
];

function pipedRequest(path, apiIndex = 0) {
  return new Promise((resolve, reject) => {
    if (apiIndex >= PIPED_APIS.length) {
      return reject(new Error('Tüm APIler çalışmıyor'));
    }
    
    const api = PIPED_APIS[apiIndex];
    https.get(api + path, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON hatası'));
        }
      });
    }).on('error', (e) => {
      // Hata olursa sonraki API'yi dene
      pipedRequest(path, apiIndex + 1).then(resolve).catch(reject);
    }).on('timeout', () => {
      pipedRequest(path, apiIndex + 1).then(resolve).catch(reject);
    });
  });
}

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

app.post('/info', async (req, res) => {
  const { url } = req.body;
  const videoId = extractVideoId(url);
  
  if (!videoId) return res.status(400).json({ error: 'Geçersiz YouTube URL' });
  
  try {
    const data = await pipedRequest(`/streams/${videoId}`);
    
    const formats = [];
    
    if (data.videoStreams) {
      data.videoStreams
        .filter(v => v.format === 'MPEG_4')
        .slice(0, 5)
        .forEach(v => {
          const quality = v.quality?.replace('p', '') || 720;
          formats.push({
            format_id: quality,
            height: parseInt(quality),
            ext: 'mp4',
            filesize: null
          });
        });
    }
    
    res.json({
      id: videoId,
      title: data.title || 'Video',
      thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: data.duration,
      channel: data.uploader || 'Bilinmiyor',
      formats: formats.length ? formats : [{format_id: '720', height: 720, ext: 'mp4'}]
    });
  } catch (e) {
    res.status(500).json({ error: 'Video bilgisi alınamadı: ' + e.message });
  }
});

app.post('/download', async (req, res) => {
  const { url, formatId, mp3 } = req.body;
  const videoId = extractVideoId(url);
  
  if (!videoId) return res.status(400).json({ error: 'Geçersiz URL' });
  
  try {
    const data = await pipedRequest(`/streams/${videoId}`);
    const title = (data.title || 'video').replace(/[<>:"/\\|?*]/g, '').slice(0, 60);
    
    let streamUrl;
    
    if (mp3 && data.audioStreams && data.audioStreams[0]) {
      streamUrl = data.audioStreams[0].url;
    } else {
      const targetHeight = parseInt(formatId) || 720;
      const video = data.videoStreams?.find(v => {
        const q = parseInt(v.quality?.replace('p', '')) || 0;
        return q <= targetHeight && v.format === 'MPEG_4';
      }) || data.videoStreams?.[0];
      
      if (!video) throw new Error('Video stream bulunamadı');
      streamUrl = video.url;
    }
    
    https.get(streamUrl, { timeout: 30000 }, (streamRes) => {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.${mp3 ? 'mp3' : 'mp4'}"`);
      res.setHeader('Content-Type', mp3 ? 'audio/mpeg' : 'video/mp4');
      streamRes.pipe(res);
    }).on('error', (e) => {
      res.status(500).json({ error: 'İndirme hatası: ' + e.message });
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`mahnes calisiyor -> port ${PORT}`);
});
