import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = JSON.parse(await fs.readFile('package.json', 'utf8'));
const seen = new Set();
let output = 'FIELD KIT — THIRD-PARTY NOTICES\n\nField Kit application licensing has not been chosen. The package metadata UNLICENSED prevents accidental npm publication; it is not an application license grant.\n\nElectron and Chromium notices are shipped beside the application (LICENSE.electron.txt and LICENSES.chromium.html). FFmpeg LGPL 3 notices and build origin are in resources/ffmpeg. See resources/FFMPEG.md. Windows system fonts are used, with no remote fonts.\n';
async function visit(name, from) {
  let dir;
  const resolver = createRequire(path.join(from, 'package.json'));
  try { dir = path.dirname(resolver.resolve(`${name}/package.json`)); }
  catch { try { dir = path.dirname(resolver.resolve(name)); while (dir !== path.dirname(dir)) { try { if (JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8')).name === name) break; } catch {} dir = path.dirname(dir); } } catch { return; } }
  let pkg; try { dir = await fs.realpath(dir); pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); } catch { return; }
  const id = `${pkg.name}@${pkg.version}`; if (seen.has(id)) return; seen.add(id);
  output += `\n\n${'='.repeat(72)}\n${id}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n`;
  const files = (await fs.readdir(dir)).filter(n => /^(licen[cs]e|copying|notice)/i.test(n));
  for (const file of files) { const full = path.join(dir,file); if ((await fs.stat(full)).isFile()) output += `\n${file}\n${await fs.readFile(full,'utf8')}\n`; }
  if (pkg.name.startsWith('@img/sharp-')) { for (const file of ['README.md','versions.json']) { try { output += `\n${file}\n${await fs.readFile(path.join(dir,file),'utf8')}\n`; } catch {} } }
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) await visit(dep,dir);
}
// Renderer and schema libraries are bundled at build time and intentionally live in
// devDependencies so electron-builder does not copy their complete packages.
const bundled = ['lucide-react', 'react', 'react-dom', 'three', 'zod'];
for (const dep of [...new Set([...Object.keys(root.dependencies), ...bundled, 'electron'])]) await visit(dep,process.cwd());
// sharp distributes libvips and its dependency notices with the platform package.
for (const dir of ['node_modules/@img/sharp-libvips-win32-x64','node_modules/@img/sharp-win32-x64']) { try { for (const name of await fs.readdir(dir)) if (/license|notice/i.test(name)) output += '\n' + await fs.readFile(path.join(dir,name),'utf8'); } catch {} }
for (const file of ['LICENSE.txt','COPYING.GPLv3']) { try { output += `\nFFmpeg license text — ${file}\n${await fs.readFile(path.join('vendor/ffmpeg',file),'utf8')}\n`; } catch {} }
await fs.writeFile('THIRD_PARTY_NOTICES.txt', output); console.log(`Recorded ${seen.size} package notices`);
