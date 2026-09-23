// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4, // Aktifkan Nuxt 4 Directory Structure & Features
  },
  devtools: { enabled: false },
  ssr: false, // SPA Mode untuk Tauri Desktop
  devServer: {
    port: 3420,
    host: '127.0.0.1'
  },
  modules: [
    '@nuxtjs/tailwindcss'
  ],
  css: [
    '@xterm/xterm/css/xterm.css',
    '~/assets/css/main.css'
  ],
  vite: {
    clearScreen: false,
    server: {
      strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
  },
  router: {
    options: {
      hashMode: true
    }
  }
})
