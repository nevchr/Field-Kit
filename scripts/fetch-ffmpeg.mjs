import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-26-13-03/ffmpeg-n8.1.3-win64-lgpl-shared-8.1.zip';
const sha256 = '75ce8e7ea1cf95758d7840666e78342542557d620bdc6b8e95c38c8aaf52c7b8';
const tag = 'autobuild-2026-09-26-13-03';
const archiveFile = '.downloads/ffmpeg-n8.1.3-20260926-lgpl-shared.zip';
const vendorRoot = path.resolve('vendor');
const target = path.join(vendorRoot, 'ffmpeg');
try { const pinned = JSON.parse(await fs.readFile(path.join(target, 'BUILD-ORIGIN.json'),'utf8')); if (pinned.sha256 === sha256) { await fs.access(path.join(target, 'bin', 'ffmpeg.exe')); await fs.access(path.join(target, 'bin', 'ffprobe.exe')); console.log('Pinned FFmpeg is already available'); process.exit(0); } } catch {}
await fs.mkdir('.downloads', { recursive: true });
await fs.mkdir(vendorRoot, { recursive: true });
const res = await fetch(url); if (!res.ok) throw new Error('Download failed: ' + res.status);
const data = Buffer.from(await res.arrayBuffer());
const actual = createHash('sha256').update(data).digest('hex');
if (actual !== sha256) throw new Error('Pinned archive checksum mismatch; review the release before changing the pin: ' + actual);
try { const prior = await fs.readFile(archiveFile); if (createHash('sha256').update(prior).digest('hex') !== sha256) throw new Error('A different archive already exists at the pinned path; preserve it before retrying'); } catch (e) { if (e.code !== 'ENOENT') throw e; await fs.writeFile(archiveFile, data, { flag: 'wx' }); }
const extract = await fs.mkdtemp(path.join(vendorRoot, 'ffmpeg-extract-'));
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath ' + quote(path.resolve(archiveFile)) + ' -DestinationPath ' + quote(extract)], { stdio: 'inherit', windowsHide: true });
if (r.status) throw new Error('Extraction failed');
const entries = await fs.readdir(extract); if (entries.length !== 1) throw new Error('Unexpected archive layout');
const incoming = path.resolve(extract, entries[0]); if (!incoming.startsWith(extract + path.sep)) throw new Error('Archive directory escaped extraction root');
await fs.access(path.join(incoming, 'bin', 'ffmpeg.exe')); await fs.access(path.join(incoming, 'bin', 'ffprobe.exe'));
const license = await fetch('https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.3/COPYING.GPLv3');
if (!license.ok) throw new Error('Could not obtain GPL text referenced by LGPL v3');
await fs.writeFile(path.join(incoming, 'COPYING.GPLv3'), await license.text());
await fs.writeFile(path.join(incoming, 'BUILD-ORIGIN.json'), JSON.stringify({ url, sha256, tag, archiveFile, downloadedAt: new Date().toISOString(), variant: 'LGPL v3 shared, FFmpeg n8.1.3-20260926' }, null, 2));
let preserved;
try { await fs.access(target); preserved = path.join(vendorRoot, 'ffmpeg-preserved-' + Date.now()); if (path.dirname(target) !== vendorRoot || path.dirname(preserved) !== vendorRoot) throw new Error('Preservation target escaped vendor root'); await fs.rename(target, preserved); console.log('Previous local FFmpeg retained at ' + preserved); } catch (e) { if (e.code !== 'ENOENT') throw e; }
try { await fs.rename(incoming, target); } catch (e) { if (preserved) await fs.rename(preserved, target); throw e; }
console.log('Verified FFmpeg archive (' + data.length + ' bytes), installed to vendor/ffmpeg');
