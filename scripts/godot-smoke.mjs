import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { hashFile } from '../electron/library.ts';

const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const root = path.resolve('.test-output', `godot-${Date.now()}`), project = path.join(root, 'Material Walk');
const executable = path.resolve(process.env.FIELD_KIT_GODOT || '.downloads/godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe');
await fs.access(executable);
const suppliedProject = process.env.FIELD_KIT_DEMO_PROJECT;
let sourcePack = suppliedProject ? path.join(suppliedProject, 'assets', 'field-kit') : process.env.FIELD_KIT_DEMO_PACK, exportEvidence, referencePack;
if (process.env.FIELD_KIT_DEMO_EVIDENCE) {
  const file = path.resolve(process.env.FIELD_KIT_DEMO_EVIDENCE), report = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(report.version, version); assert(!report.failure); assert.equal(report.checks.length, 13);
  exportEvidence = { file, executable: report.executable, version: report.version };
  referencePack = path.join(report.root, 'First pack 雨'); sourcePack ||= referencePack;
}
if (!sourcePack) {
  const candidates = (await fs.readdir('.test-output')).filter(name => /^game-exports-ui-\d+$/.test(name)).sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
  for (const folder of candidates) {
    try { const file = path.resolve('.test-output', folder, 'results.json'), report = JSON.parse(await fs.readFile(file, 'utf8')); if (report.version === version && !report.failure && report.checks.length >= 13) { sourcePack = path.join(report.root, 'First pack 雨'); exportEvidence = { file, executable: report.executable, version: report.version }; break; } } catch {}
  }
}
assert(sourcePack, 'Run test:game-exports-ui first, or set FIELD_KIT_DEMO_PACK to a completed folder export.');
const manifest = JSON.parse(await fs.readFile(path.join(sourcePack, 'manifest.json'), 'utf8'));
assert.equal(manifest.generator, `Field Kit ${version}`); assert(manifest.assets.some(a => a.type === 'texture') && manifest.assets.some(a => a.type === 'sound'));
await fs.mkdir(project, { recursive: true });
if (suppliedProject) await fs.cp(suppliedProject, project, { recursive: true, filter: source => path.basename(source) !== '.godot' });
else {
  await fs.cp('examples/godot-demo', project, { recursive: true, filter: source => !['.godot', 'assets'].includes(path.basename(source)) });
  await fs.cp(sourcePack, path.join(project, 'assets', 'field-kit'), { recursive: true, errorOnExist: true, force: false });
}
const originalHashes = [];
for (const asset of manifest.assets) { const sourceHash = await hashFile(path.join(sourcePack, asset.path)); assert.equal(await hashFile(path.join(project, 'assets', 'field-kit', asset.path)), sourceHash); if (referencePack) assert.equal(sourceHash, await hashFile(path.join(referencePack, asset.path))); originalHashes.push({ path: asset.path, sha256: sourceHash }); }
const run = async (label, args, timeout = 90000) => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let text = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', data => { text += data; }); child.stderr.on('data', data => { text += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, text, timedOut }); });
  });
  await fs.writeFile(path.join(root, `${label}.log`), output.text);
  assert(!output.timedOut, `${label} timed out: ${output.text}`); assert.equal(output.code, 0, output.text); assert(!/SCRIPT ERROR|Parse Error|ERROR:/i.test(output.text), output.text);
  return output.text;
};
await run('import', ['--headless', '--path', project, '--import']);
const engineReport = path.join(root, 'engine-results.json'), capture = path.join(root, 'material-walk.png');
await run('runtime', ['--verbose', '--path', project, '--rendering-method', 'gl_compatibility', '--audio-driver', 'Dummy', '--resolution', '1280x800', '--quit-after', '1800', '--', '--verify', `--report=${engineReport}`, `--capture=${capture}`]);
const engine = JSON.parse(await fs.readFile(engineReport, 'utf8')); assert.deepEqual(engine.errors, []); assert.equal(engine.renderer, 'gl_compatibility'); assert.notEqual(engine.display, 'headless');
for (const image of engine.importedTextures) {
  const source = await sharp(path.join(project, 'assets', 'field-kit', image.source)).ensureAlpha().raw().toBuffer();
  const imported = await sharp(image.image).ensureAlpha().raw().toBuffer(); assert(source.equals(imported), `Godot decoded texture pixels differ: ${image.source}`);
}
for (const sound of engine.importedSounds) {
  const wav = await fs.readFile(path.join(project, 'assets', 'field-kit', sound.source)); let pcm;
  for (let offset = 12; offset + 8 <= wav.length;) { const bytes = wav.readUInt32LE(offset + 4); if (wav.toString('ascii', offset, offset + 4) === 'data') { pcm = wav.subarray(offset + 8, offset + 8 + bytes); break; } offset += 8 + bytes + (bytes % 2); }
  assert(pcm); assert(pcm.equals(await fs.readFile(sound.data)), `Godot decoded audio samples differ: ${sound.source}`);
}
const captureInfo = await sharp(capture).metadata(), captureStats = await sharp(capture).stats(); assert.equal(captureInfo.width, 1280); assert.equal(captureInfo.height, 800); assert(captureStats.channels.slice(0, 3).some(c => c.stdev > 20), 'Runtime capture is blank');
for (const asset of originalHashes) assert.equal(await hashFile(path.join(sourcePack, asset.path)), asset.sha256);
const result = { version, root, project, executable, exportEvidence, verifiedProjectSource: suppliedProject ? path.resolve(suppliedProject) : null, sourcePack: path.resolve(sourcePack), sourceHashes: originalHashes, engine, capture, additionalChecks: ['all copied pack bytes match the real Field Kit export', 'Godot decoded texture pixels exactly match exported PNG pixels', 'Godot imported PCM samples exactly match exported WAV samples', 'the captured scene is 1280 by 800 and contains rendered content', 'verification did not change the exported source media'], limitations: ['Local Windows host only', 'Dummy audio driver verifies playback timing; no physical-speaker or subjective listening test', 'Only the pinned Godot version is verified', 'Collectible triggers use controlled player positions after testing real movement input'] };
await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(result, null, 2));
console.log('GODOT_RESULTS ' + JSON.stringify(result));
