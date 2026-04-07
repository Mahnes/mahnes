const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function cobaltRequest(videoUrl, isAudio, quality) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      url: videoUrl,
      videoQuality: quality || '720',
      downloadMode: isAudio ? 'audio' : 'video',
      filenameStyle: 'pretty'
    });
    
    const options = {
      hostname: 'api.cobalt.tools',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(new Error('API yanıtı bozuk'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.post('/download', async (req, res) => {
  const { url, mp3, quality } = req.body;
  if (!url) return res.status(400).json({ error: 'URL eksik' });
  
  try {
    const result = await cobaltRequest(url, mp3, quality);
    if (result.status === 'error') throw new Error(result.text);
    if (result.url) {
      res.json({ redirectUrl: result.url });
    } else {
      throw new Error('İndirme linki oluşturulamadı');
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`mahnes ${PORT} portunda aktif`));
