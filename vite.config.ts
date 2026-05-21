import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

// Dev sunucusunda Gemini upload endpoint'ini ekleyen plugin
function geminiUploadPlugin() {
  return {
    name: 'gemini-upload-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/gemini-upload', async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks);
            const apiKey = req.headers['x-gemini-api-key'] as string;
            const filename = decodeURIComponent((req.headers['x-filename'] as string) || 'upload');
            const mimeType = (req.headers['content-type'] as string) || 'video/mp4';

            if (!apiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'API key gerekli' }));
              return;
            }

            const { GoogleGenAI } = await import('@google/genai');
            const genai = new GoogleGenAI({ apiKey });
            const blob = new Blob([body], { type: mimeType });

            const uploadedFile = await genai.files.upload({
              file: blob,
              config: { displayName: filename },
            });

            let file = await genai.files.get({ name: uploadedFile.name! });
            while (file.state === 'PROCESSING') {
              await new Promise(r => setTimeout(r, 5000));
              file = await genai.files.get({ name: uploadedFile.name! });
            }

            if (file.state === 'FAILED') {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Dosya işleme başarısız' }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(file));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3500,
        host: '0.0.0.0',
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
      },
      plugins: [react(), geminiUploadPlugin()],
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
