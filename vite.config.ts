import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const devHost = env.VITE_DEV_HOST || '0.0.0.0';
    const devPort = Number(env.VITE_DEV_PORT || '3000');
    const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4317';

    return {
      server: {
        port: devPort,
        host: devHost,
        watch: {
          usePolling: env.VITE_DOCKER === 'true'
        },
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
        }
      }
    };
});
