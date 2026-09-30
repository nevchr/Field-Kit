import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const appBuilder = createRequire(builder.resolve('app-builder-lib'));
const asar = appBuilder('@electron/asar');
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const supplied = process.argv.flatMap((value, index, values) => value === '--bundle' && values[index + 1] ? [values[index + 1]] : []);
const defaults = [
  'release/win-unpacked/resources/app.asar',
  `.test-output/installed-${version}/resources/app.asar`,
  `.test-output/portable-${version}/resources/app.asar`,
  `.test-output/package-audit-${version}/resources/app.asar`,
];
const bundles = [...new Set((supplied.length ? supplied : defaults).map(file => path.resolve(file)).filter(fs.existsSync))];
if (!bundles.length) throw new Error(`No packaged app.asar was found for ${version}. Keep release/win-unpacked, or pass one or more --bundle <path> arguments.`);

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = { version, checked: 0, differences: [], bundles: [], sourceMaps: [], forbiddenPackages: [], ffmpeg: [], artifacts: [] };
for (const bundle of bundles) {
  const packageVersion = JSON.parse(asar.extractFile(bundle, 'package.json')).version;
  assert.equal(packageVersion, version, `${bundle} contains version ${packageVersion}, expected ${version}`);
  for (const dir of ['dist', 'dist-electron']) {
    for (const file of fs.readdirSync(dir, { recursive: true })) {
      const full = path.join(dir, file);
      if (!fs.statSync(full).isFile()) continue;
      const archived = full;
      const label = full.replaceAll(path.sep, '/');
      try { if (!fs.readFileSync(full).equals(asar.extractFile(bundle, archived))) report.differences.push(`${bundle}: ${label}`); }
      catch (error) { report.differences.push(`${bundle}: ${label}: ${error.message}`); }
      report.checked++;
    }
  }

  const entries = asar.listPackage(bundle).map(entry => entry.replaceAll('\\', '/').replace(/^\//, ''));
  report.sourceMaps.push(...entries.filter(entry => entry.endsWith('.map')).map(entry => `${bundle}: ${entry}`));
  for (const name of ['lucide-react', 'react', 'react-dom', 'three', 'zod']) {
    if (entries.some(entry => entry === `node_modules/${name}` || entry.startsWith(`node_modules/${name}/`))) report.forbiddenPackages.push(`${bundle}: ${name}`);
  }

  const resources = path.dirname(bundle);
  const ffmpeg = path.join(resources, 'ffmpeg');
  for (const required of ['bin/ffmpeg.exe', 'bin/ffprobe.exe', 'LICENSE.txt', 'COPYING.GPLv3', 'BUILD-ORIGIN.json']) assert(fs.existsSync(path.join(ffmpeg, required)), `${bundle} is missing ffmpeg/${required}`);
  for (const forbidden of ['bin/ffplay.exe', 'doc', 'include', 'lib', 'presets']) assert(!fs.existsSync(path.join(ffmpeg, forbidden)), `${bundle} contains unused ffmpeg/${forbidden}`);
  const ffmpegFiles = fs.readdirSync(ffmpeg, { recursive: true }).filter(file => fs.statSync(path.join(ffmpeg, file)).isFile());
  report.ffmpeg.push({ bundle, files: ffmpegFiles.length, bytes: ffmpegFiles.reduce((sum, file) => sum + fs.statSync(path.join(ffmpeg, file)).size, 0) });
  report.bundles.push({ file: bundle, bytes: fs.statSync(bundle).size, sha256: sha256(bundle), entries: entries.length });
}

for (const file of [
  `release/Field-Kit-${version}-Setup-x64.exe`,
  `release/Field-Kit-${version}-Portable-x64.zip`,
  `release/Field-Kit-${version}-UNSIGNED-QA-Setup-x64.exe`,
  `release/Field-Kit-${version}-UNSIGNED-QA-Portable-x64.zip`,
]) {
  if (fs.existsSync(file)) report.artifacts.push({ file, bytes: fs.statSync(file).size, sha256: sha256(file) });
}

fs.mkdirSync('.test-output', { recursive: true });
fs.writeFileSync(`.test-output/audit-package-${version}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.equal(report.differences.length, 0, 'Packaged files differ from the current build');
assert.equal(report.sourceMaps.length, 0, 'Production package contains source maps');
assert.equal(report.forbiddenPackages.length, 0, 'Production package contains build-only libraries already bundled into the application');
assert.equal(new Set(report.bundles.map(bundle => bundle.sha256)).size, 1, 'The audited application bundles differ');
