import { build } from 'esbuild'
import { cp, mkdir } from 'node:fs/promises'

await mkdir('dist/renderer', { recursive: true })
await build({
  entryPoints: ['renderer/app.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/renderer/app.js',
  target: 'es2022',
  logLevel: 'silent',
})
await cp('renderer/index.html', 'dist/renderer/index.html')
await cp('renderer/styles.css', 'dist/renderer/styles.css')
await cp('renderer/mark.png', 'dist/renderer/mark.png')
