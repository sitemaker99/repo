import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// Proxy /atsu-api/* → atsu.moe
app.use('/atsu-api', createProxyMiddleware({
    target: 'https://atsu.moe',
    changeOrigin: true,
    pathRewrite: { '^/atsu-api': '' },
    on: {
        error: (err, req, res) => {
            console.error('[proxy]', err.message);
            res.status(502).json({ error: 'Upstream error' });
        },
    },
}));

// Chapter polling endpoint for service worker
app.get('/api/chapters/:mangaId', async (req, res) => {
    try {
        const r = await fetch(
            `https://atsu.moe/api/manga/info?mangaId=${encodeURIComponent(req.params.mangaId)}`,
            { headers: { 'User-Agent': 'Atsumaru/2.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return res.status(r.status).json({ error: 'Upstream error' });
        const data = await r.json();
        res.json((data?.chapters ?? []).map(ch => ({
            id:     ch.id ?? ch.chapterId,
            number: ch.number ?? ch.chapterNumber ?? ch.index,
            title:  ch.title ?? null,
        })));
    } catch (err) { res.status(502).json({ error: err.message }); }
});

// Serve React build
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));

app.listen(PORT, () => console.log(`Atsumaru running on http://localhost:${PORT}`));
