import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// COOP/COEP headers for FFmpeg.wasm SharedArrayBuffer support
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

// Gemini dosya yükleme proxy endpoint'i (CORS sorununu önlemek için)
app.post('/api/gemini-upload', express.raw({ type: '*/*', limit: '600mb' }), async (req, res) => {
  try {
    const apiKey = req.headers['x-gemini-api-key'];
    const filename = decodeURIComponent(req.headers['x-filename'] || 'upload');
    const mimeType = req.headers['content-type'] || 'video/mp4';

    if (!apiKey) {
      return res.status(400).json({ error: 'API key gerekli' });
    }

    const genai = new GoogleGenAI({ apiKey });
    const blob = new Blob([req.body], { type: mimeType });

    const uploadedFile = await genai.files.upload({
      file: blob,
      config: { displayName: filename },
    });

    let file = await genai.files.get({ name: uploadedFile.name });
    while (file.state === 'PROCESSING') {
      await new Promise(r => setTimeout(r, 5000));
      file = await genai.files.get({ name: uploadedFile.name });
    }

    if (file.state === 'FAILED') {
      return res.status(500).json({ error: 'Dosya işleme başarısız' });
    }

    res.json(file);
  } catch (error) {
    console.error('Gemini upload hatası:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Serve static files from dist/
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback - serve index.html for all non-file routes
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
