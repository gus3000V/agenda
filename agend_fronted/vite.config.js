import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5174, // <-- Puerto dedicado para agend_fronted (el panel admin usa 5173)
    strictPort: true // Forzará a usar el 5174 y no buscará otro
  }
})
