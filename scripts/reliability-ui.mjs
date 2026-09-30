import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { Library } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { texture, recording } from '../tests/fixtures.ts';

const require = createRequire(import.meta.url), executable = process.env.FIELD_KIT_EXECUTABLE;
const root = path.resolve('.test-output', `reliability-ui-${Date.now()}`), profile = path.join(root, 'profile'), library = path.join(root, 'library');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
for (const [name, seed] of [['First', 14], ['Second', 41]]) { const source = path.join(root, name + '.png'); await texture(source, seed, 640, 480); await lib.import([source], undefined, new Job(), () => {}); }
lib.close(); await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const report = { root, executable: executable || 'development', checks: [], errors: [], network: [] };
let app, page, mainPid, child;
try {
  app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`], env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env, timeout: 45000 });
  child = app.process(); mainPid = await app.evaluate(() => process.pid);
  report.version = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.context().setOffline(true);
  page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
  await page.getByRole('button', { name: 'Edit First', exact: true }).click(); await page.getByText('Original · change a control to prepare', { exact: true }).waitFor();
  await app.evaluate(() => {
    const { Worker } = process.getBuiltinModule('node:worker_threads'), emit = Worker.prototype.emit, post = Worker.prototype.postMessage;
    Worker.prototype.emit = function(event, ...args) {
      globalThis.regressionWorker = this;
      const message = args[0];
      if (event === 'message' && message?.result?.recipe?.brightness === 1.23 && !globalThis.delayedReply) { globalThis.delayedReply = true; setTimeout(() => emit.call(this, event, ...args), 1500); return true; }
      const result = emit.call(this, event, ...args);
      if (event === 'message' && message?.child?.active && globalThis.crashOnChild) {
        globalThis.crashOnChild = false; globalThis.failedChildPid = message.child.pid;
        try { process.kill(message.child.pid, 0); globalThis.childWasAlive = true; } catch { globalThis.childWasAlive = false; }
        void this.terminate();
      }
      return result;
    };
    Worker.prototype.postMessage = function(message, ...args) {
      if (globalThis.failNextSave && message.action === 'save') { globalThis.failNextSave = false; setTimeout(() => this.emit('message', { id: message.id, error: 'Simulated write failure' }), 20); return; }
      return post.call(this, message, ...args);
    };
  });
  await page.getByLabel('Brightness', { exact: true }).fill('1.23');
  await page.getByRole('button', { name: 'Edit Second', exact: true }).click();
  await page.getByRole('button', { name: 'Edit First', exact: true }).click();
  assert.equal(await page.getByLabel('Brightness', { exact: true }).inputValue(), '1.23');
  assert(await page.getByRole('button', { name: 'Export pack', exact: true }).isDisabled());
  await page.getByLabel('Contrast', { exact: true }).fill('1.1');
  await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor(); await page.waitForTimeout(1600);
  let state = await page.evaluate(() => window.fieldKit.getState());
  assert.equal(state.assets.find(a => a.name === 'First').recipe.brightness, 1.23);
  assert.equal(state.assets.find(a => a.name === 'First').recipe.contrast, 1.1);
  assert.equal(await page.getByLabel('Brightness', { exact: true }).inputValue(), '1.23');
  report.checks.push('delayed save, immediate return, newer edit and late reply preserve the latest recipe');

  await page.getByLabel('Contrast', { exact: true }).focus(); await page.keyboard.press('Control+z'); assert.equal(await page.getByLabel('Contrast', { exact: true }).inputValue(), '1');
  await page.keyboard.press('Control+Shift+z'); assert.equal(await page.getByLabel('Contrast', { exact: true }).inputValue(), '1.1');
  await page.getByRole('tab', { name: 'Prepare', exact: true }).focus(); await page.keyboard.press('End');
  await page.getByLabel('Private notes').fill('Keep this private note');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Edit Second', exact: true }).click();
  assert.equal(await page.getByLabel('Private notes').inputValue(), 'Keep this private note');
  await page.getByRole('button', { name: 'Save details', exact: true }).click(); await page.getByText('Details saved', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Details', exact: true }).focus(); await page.keyboard.press('Home');
  await page.getByRole('tabpanel', { name: 'Prepare', exact: true }).waitFor();
  report.checks.push('keyboard recipe undo/redo, roving workbench tabs and unsaved-details protection');

  await app.evaluate(() => { globalThis.failNextSave = true; });
  await page.getByLabel('Brightness', { exact: true }).fill('1.44');
  await page.getByText('Some edits have not been saved', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Export pack', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Retry saves', exact: true }).click();
  await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  state = await page.evaluate(() => window.fieldKit.getState()); assert.equal(state.assets.find(a => a.name === 'First').recipe.brightness, 1.44);
  report.checks.push('failed writes retain the draft, block export and recover with Retry saves');

  const damaged = path.join(root, 'damaged'); await fs.mkdir(damaged); await fs.writeFile(path.join(damaged, 'field-kit.json'), JSON.stringify({ format: 'field-kit', version: 1, name: 'Damaged' })); await fs.writeFile(path.join(damaged, 'library.sqlite'), 'Damaged database');
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, damaged);
  await page.getByRole('button', { name: 'Open library', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Could not open this library' }).waitFor();
  state = await page.evaluate(() => window.fieldKit.getState()); assert.equal(state.assets.length, 2);
  assert(await page.getByAltText('Processed square texture').evaluate(img => img.complete && img.naturalWidth > 0));
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, library);
  await page.getByRole('button', { name: 'Open library', exact: true }).click();
  await page.getByText('Library ready. Originals stay safe; edits live here.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit First', exact: true }).click(); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  report.checks.push('failed library switch preserves media access and healthy library reopening');

  const asset = state.assets.find(a => a.name === 'First');
  const cached = await page.evaluate(a => window.fieldKit.render(a.id, a.recipe), asset);
  await fs.writeFile(path.join(library, cached.path), 'Corrupt disposable cache');
  const destination = path.join(root, 'recovered-pack.zip');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
  await page.getByRole('button', { name: 'Export pack', exact: true }).click(); await page.getByRole('button', { name: 'Choose destination', exact: true }).click(); await page.getByText(/Exported 1 assets to/).waitFor();
  const extracted = path.join(root, 'extracted');
  const expanded = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${destination.replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}'`], { windowsHide: true });
  assert.equal(expanded.status, 0, expanded.stderr.toString());
  const manifest = JSON.parse(await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8'));
  assert.equal((await sharp(path.join(extracted, manifest.assets[0].path)).metadata()).width, 1024);
  assert(!JSON.stringify(manifest).includes('private note')); report.checks.push('UI export regenerates a corrupted cache and creates a decodable private-metadata-free pack');

  const colors = await page.locator('.control-help, .card-meta, .sidebar .eyebrow, .workbench-tabs button').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => {
    let parent = e, background = 'rgba(0, 0, 0, 0)'; while (parent && background === 'rgba(0, 0, 0, 0)') { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
    const style = getComputedStyle(e); return { text: e.textContent.slice(0, 60), color: style.color, background, size: style.fontSize };
  }));
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  report.contrast = colors.map(c => { const a = luminance(c.color), b = luminance(c.background); return { ...c, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
  assert(report.contrast.every(c => c.ratio >= 4.5), JSON.stringify(report.contrast));
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1280, 800); window.webContents.setZoomFactor(1.25); });
  await page.waitForTimeout(200);
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await fs.writeFile(path.join(root, 'readable-workbench-125.png'), Buffer.from(image, 'base64'));
  report.checks.push('audited small-text colors meet 4.5:1 contrast; native 125% workbench capture');

  await app.evaluate(() => globalThis.regressionWorker.terminate());
  await page.getByRole('button', { name: 'Restart processing', exact: true }).waitFor();
  const started = performance.now(); const rejected = await page.evaluate(async () => { try { await window.fieldKit.getState(); return false; } catch { return true; } });
  assert(rejected); assert(performance.now() - started < 1000);
  await page.getByRole('button', { name: 'Restart processing', exact: true }).click(); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  state = await page.evaluate(() => window.fieldKit.getState()); assert.equal(state.assets.length, 2); assert.equal(state.assets.find(a => a.name === 'First').notes, 'Keep this private note');
  assert.equal(state.assets.find(a => a.name === 'First').recipe.brightness, 1.44);
  report.checks.push('abnormal worker exit rejects requests promptly and Restart processing restores saved work');
  const recordingPath = path.join(root, 'interrupted recording.wav'); await recording(recordingPath, 17, 4);
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); globalThis.crashOnChild = true; }, recordingPath);
  await page.getByRole('button', { name: 'Import', exact: true }).click(); await page.getByRole('button', { name: 'Restart processing', exact: true }).waitFor();
  const childFault = await app.evaluate(() => ({ pid: globalThis.failedChildPid, wasAlive: globalThis.childWasAlive })); assert(childFault.wasAlive);
  let stillAlive = true;
  for (let i = 0; i < 40; i++) { try { process.kill(childFault.pid, 0); } catch (e) { if (e.code === 'ESRCH') { stillAlive = false; break; } throw e; } await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.equal(stillAlive, false, 'Media child survived worker failure');
  await page.getByRole('button', { name: 'Restart processing', exact: true }).click(); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  assert.equal((await fs.readdir(path.join(library, 'originals'))).length, 2);
  assert.equal((await fs.readdir(path.join(library, '.tmp'))).length, 0);
  report.checks.push('worker failure terminates its live media child and reopening removes the staged import');
  await app.evaluate(() => globalThis.regressionWorker.terminate()); await page.getByRole('button', { name: 'Restart processing', exact: true }).waitFor();
  const closing = performance.now(); await app.close(); app = undefined; report.quitMilliseconds = performance.now() - closing; assert(report.quitMilliseconds < 5000);
  report.checks.push('normal application quit succeeds after a dead worker');
  assert.equal(report.errors.length, 0, report.errors.join('\n')); assert.equal(report.network.length, 0);
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('RELIABILITY_UI_RESULTS ' + JSON.stringify(report));
} finally {
  if (app) { try { process.kill(mainPid, 'SIGKILL'); } catch {} await app.close().catch(() => {}); if (child.exitCode === null) child.kill('SIGKILL'); }
}
