const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function cobaltRequest(url, isAudio = false) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      url: url,
      downloadMode: isAudio ? 'audio' : 'auto',
      audioCodec: 'mp3'
    });
    
    const options = {
      hostname: 'api.cobalt.tools',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': data.length
      },
      timeout: 30000
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(new Error('API yanıt hatası'));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('timeout')));
    req.write(data);
    req.end();
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
  
  // Cobalt info alamaz, o yüzden direkt thumbnail ve ID döndür
  res.json({
    id: videoId,
    title: 'YouTube Video',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: null,
    channel: 'YouTube',
    formats: [
      { format_id: '720', height: 720, ext: 'mp4', filesize: null },
      { format_id: '1080', height: 1080, ext: 'mp4', filesize: null },
      { format_id: 'audio', height: 'MP3', ext: 'mp3', filesize: null }
    ]
  });
});

app.post('/download', async (req, res) => {
  const { url, formatId, mp3 } = req.body;
  
  if (!url) return res.status(400).json({ error: 'URL gerekli' });
  
  try {
    const result = await cobaltRequest(url, mp3);
    
    if (result.status === 'error') {
      throw new Error(result.text || 'İndirme hatası');
    }
    
    if (result.url) {
      // Cobalt indirme linkini yönlendir
      res.json({ 
        redirectUrl: result.url,
        filename: result.filename || `video.${mp3 ? 'mp3' : 'mp4'}`
      });
    } else {
      throw new Error('İndirme linki alınamadı');
    }
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`mahnes calisiyor -> port ${PORT}`);
});
