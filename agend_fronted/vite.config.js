import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['API_URL', 'VITE_API_URL']);
  const configured = process.env.API_URL || process.env.VITE_API_URL || env.API_URL || env.VITE_API_URL;
  if (process.env.VERCEL && !configured) {
    throw new Error('Configura API_URL en Vercel antes de compilar el frontend.');
  }
  let apiUrl = (configured || '/api/public').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(apiUrl)) {
    const url = new URL(apiUrl);
    if (url.username || url.password || url.search || url.hash) throw new Error('API_URL debe ser una URL sin credenciales, parámetros ni fragmentos.');
    if (!url.pathname || url.pathname === '/') apiUrl += '/api/public';
    else if (url.pathname === '/api') apiUrl += '/public';
    else if (url.pathname !== '/api/public') throw new Error('API_URL debe terminar en /api/public.');
  } else if (apiUrl !== '/api/public') {
    throw new Error('API_URL debe ser una URL HTTP(S) del backend o /api/public para el proxy local.');
  }
  return {
    plugins: [vue(), tailwindcss()],
    // Expose only this public URL, never the complete environment or ADMIN_PIN.
    define: { 'import.meta.env.API_URL': JSON.stringify(apiUrl) },
    server: {
      port: 5174,
      strictPort: true,
      proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
    }
  };
});
