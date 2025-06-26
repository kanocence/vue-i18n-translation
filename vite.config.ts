import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    target: 'node22',
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),

        '@babel/generator',
        '@babel/parser',
        '@babel/traverse',
        '@babel/types',
        '@vue/compiler-sfc',
        'consola',
        'glob',
      ],
    },
  },
})
