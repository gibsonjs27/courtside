import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        courtside: 'index.html',
        playbackCheck: 'playback-check.html',
      },
    },
  },
})
