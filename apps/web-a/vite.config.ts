import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // アプリごとに分けないと、同時に起動したときに依存の事前バンドルの出力先が衝突する
  cacheDir: '../../node_modules/.vite/apps/web-a',
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: '../../dist/apps/web-a',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
