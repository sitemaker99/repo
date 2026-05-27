import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev proxy: /atsu-api/* → atsu.moe (handles CORS in dev)
      '/atsu-api': {
        target: 'https://atsu.moe',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/atsu-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
          });
        },
      },
    },
  },
})
