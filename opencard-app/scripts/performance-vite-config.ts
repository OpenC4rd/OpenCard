import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'output/performance',
    rollupOptions: { input: 'performance/interaction.html' },
  },
})
