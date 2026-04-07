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

// Piped API instance (hızlı ve stabil)
const PIPED_API = 'https://api.piped.projectkrea.id';

function pipedRequest(path) {
  return new Promise((resolve, reject) => {
    https.get(PIPED_API + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse hatası'));
        }
      });
    }).on('error', reject).setTimeout(15000, () => reject(new Error('timeout')));
  });
}

// YouTube URL'den video ID çıkar
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
    
    // Formatları düzenle
    const formats = [];
    
    // Video + Ses formatları
    if (data.videoStreams) {
      data.videoStreams
        .filter(v => v.format === 'MPEG_4')
        .forEach(v => {
          formats.push({
            format_id: v.url.split('itag=')[1]?.split('&')[0] || 'best',
            height: v.quality?.replace('p', '') || 720,
            ext: 'mp4',
            filesize: null,
            url: v.url
          });
        });
    }
    
    // Sadece ses
    if (data.audioStreams && data.audioStreams[0]) {
      formats.push({
        format_id: 'audio',
        height: 'MP3',
        ext: 'mp3',
        filesize: null,
        url: data.audioStreams[0].url
      });
    }
    
    res.json({
      id: videoId,
      title: data.title || 'Video',
      thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: data.duration,
      channel: data.uploader || 'Bilinmiyor',
      formats: formats.slice(0, 6)
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
      const video = data.videoStreams?.find(v => v.format === 'MPEG_4');
      if (!video) throw new Error('Video stream bulunamadı');
      streamUrl = video.url;
    }
    
    // Stream'i yönlendir
    https.get(streamUrl, (streamRes) => {
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
