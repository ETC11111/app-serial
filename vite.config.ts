import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      external: ['@capacitor/app'], // 빌드 시 @capacitor/app을 external로 처리
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: [
      'seriallog.com',
      'www.seriallog.com',
      'localhost',
      '127.0.0.1',
      '114.207.245.71',
      '115.95.144.61',
    ],
    proxy: {
      // 🔧 기존 API 프록시
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
    // 🔧 프록시 제거 - nginx에서 직접 처리 (주석 처리)
  },
  // 🔧 base 경로 제거 - 루트 경로 사용
})