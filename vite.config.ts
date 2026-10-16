import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * 读取 Rust 服务写下的端口。开发时代理按请求读取，避免 Vite 比服务更早启动。
 * @returns 监听端口，读不到时回退到 3780
 */
const readServerPort = (): number => {
  try {
    const text = fs.readFileSync(path.join(root, '.server-port'), 'utf8').trim()
    const port = Number(text)
    return Number.isFinite(port) && port > 0 ? port : 3780
  } catch {
    return 3780
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3780',
        changeOrigin: true,
        router: () => `http://127.0.0.1:${readServerPort()}`,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3780',
        ws: true,
        router: () => `ws://127.0.0.1:${readServerPort()}`,
      },
    },
  },
})
