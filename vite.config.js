import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180, // 设置一个固定端口
    strictPort: false, // 如果端口被占用，尝试下一个可用端口
  }
})
