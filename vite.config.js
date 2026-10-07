import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import photoDownload from './api/photo-download.js'
import youtubeMetadata from './api/youtube-metadata.js'
import weverseLiveMetadata from './api/weverse-live-metadata.js'
import process from 'node:process'
import { request as httpsRequest } from 'node:https'

function localR2Upload() {
  return { name: 'local-r2-upload', configureServer(server) {
    server.middlewares.use('/api/r2-upload', (req, res) => {
      let target;
      try {
        target = new URL(new URL(req.url, 'http://localhost').searchParams.get('url'));
        if (req.method !== 'PUT' || target.protocol !== 'https:' || target.port
          || !/^(?:[a-z0-9-]+\.)?[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(target.hostname)
          || target.username || target.password || !target.searchParams.has('X-Amz-Signature')
          || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) throw new Error();
      } catch { res.statusCode = 400; res.end('Invalid upload request'); return; }
      const upstream = httpsRequest(target, { method: 'PUT', headers: {
        'content-type': req.headers['content-type'] || 'application/octet-stream',
        ...(req.headers['content-length'] ? {'content-length':req.headers['content-length']} : {}),
      } }, result => { res.statusCode = result.statusCode || 502; result.pipe(res); });
      upstream.setTimeout(120000, () => upstream.destroy(new Error('Upload timeout')));
      upstream.on('error', () => { if (!res.headersSent) res.statusCode = 502; res.end('Upload connection failed'); });
      req.on('aborted', () => upstream.destroy());
      req.pipe(upstream);
    });
  } };
}

function localPhotoDownload() {
  return {
    name: 'local-photo-download',
    configureServer(server) {
      server.middlewares.use('/api/photo-download', (request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname !== '/') return next();
        request.query = Object.fromEntries(url.searchParams);
        response.status = (code) => { response.statusCode = code; return response; };
        void photoDownload(request, response);
      });
    },
  };
}

function localYoutubeMetadata() {
  return { name: 'local-youtube-metadata', configureServer(server) {
    server.middlewares.use('/api/weverse-live-metadata', (request, response, next) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/') return next();
      request.query = Object.fromEntries(url.searchParams);
      void weverseLiveMetadata(request, response);
    });
    server.middlewares.use('/api/youtube-metadata', (request, response, next) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/') return next();
      request.query = Object.fromEntries(url.searchParams);
      void youtubeMetadata(request, response);
    });
  } };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'R2_PUBLIC_BASE_URL', 'YOUTUBE_API_KEY']) {
    if (env[name]) process.env[name] = env[name];
  }
  return {
  plugins: [react(), localPhotoDownload(), localYoutubeMetadata(), localR2Upload()],
  server: {
    proxy: {
      '^/api/(?!r2-upload)': {
        target: 'https://riwooarchive.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  };
})
