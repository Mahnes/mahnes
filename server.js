const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PROXIES = [
  'http://43.153.103.58:8080',
  'http://47.251.43.179:8080'
];

function getRandomProxy() {
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL gerekli' });
  
  try {
    const proxy = getRandomProxy();
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      proxy: proxy
    });
    
    const formats = (info.formats || [])
      .filter(f => f.height && f.vcodec !== 'none')
      .sort((a, b) => b.height - a.height)
      .reduce((acc, f) => {
        if (!acc.find(x => x.height === f.height)) {
          acc.push({
            format_id: f.format_id,
            height: f.height,
            ext: f.ext,
            filesize: f.filesize || f.filesize_approx
          });
        }
        return acc;
      }, [])
      .slice(0, 6);
    
    res.json({
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      channel: info.channel || info.uploader,
      formats
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/download', async (req, res) => {
  const { url, formatId, mp3 } = req.body;
  if (!url) return res.status(400).json({ error: 'URL gerekli' });

  const tmpBase = path.join(os.tmpdir(), `mahnes_${Date.now()}`);
  const ext = mp3 ? 'mp3' : 'mp4';
  
  try {
    const proxy = getRandomProxy();
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      proxy: proxy
    });
    
    const safeTitle = (info.title || 'video')
      .replace(/[<>:"/\\|?*]/g, '').slice(0, 60);

    const args = {
      noWarnings: true,
      proxy: proxy,
      output: mp3 ? `${tmpBase}.%(ext)s` : `${tmpBase}.${ext}`
    };
    
    if (mp3) {
      args.extractAudio = true;
      args.audioFormat = 'mp3';
      args.audioQuality = 0;
    } else if (formatId) {
      args.format = `${formatId}+bestaudio/best`;
    } else {
      args.format = 'bestvideo+bestaudio/best';
    }

    await youtubedl(url, args);
    
    const finalFile = mp3 ? `${tmpBase}.mp3` : `${tmpBase}.${ext}`;
    if (!fs.existsSync(finalFile)) throw new Error('Dosya oluşturulamadı');

    const stat = fs.statSync(finalFile);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.${ext}"`);
    res.setHeader('Content-Type', mp3 ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    
    const stream = fs.createReadStream(finalFile);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(finalFile, () => {}));
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`mahnes calisiyor -> port ${PORT}`);
});
