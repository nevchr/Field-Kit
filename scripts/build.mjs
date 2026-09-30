import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import fs from 'node:fs/promises';
const sourceMaps = process.env.FIELD_KIT_SOURCEMAPS === '1';
await fs.rm('dist-electron', { recursive: true, force: true });
await fs.mkdir('dist-electron', { recursive: true });
await build({ entryPoints: ['./electron/main.ts', './electron/preload.ts', './electron/worker.ts'], absWorkingDir: process.cwd(), outdir: 'dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron', 'sharp', 'yazl'], sourcemap: sourceMaps });
await viteBuild({ base: './', build: { outDir: 'dist', sourcemap: sourceMaps }, logLevel: 'info' });
