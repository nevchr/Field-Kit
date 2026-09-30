// Audit probes use the delivered binary, an isolated profile, and disposable libraries.
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { texture } from '../tests/fixtures.ts';

const root = path.resolve('.test-output', `audit-ui-${Date.now()}`), profile = path.join(root, 'profile'), library = path.join(root, 'library');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
for (const [name, seed] of [['First', 14], ['Second', 41]]) { const file = path.join(root, `${name}.png`); await texture(file, seed, 640, 480); await lib.import([file], undefined, new Job(), () => {}); }
const initial = lib.state(); lib.close();
await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const executable = path.resolve('.test-output/installed-delivery/Field Kit.exe');
const results = { root, executable, started: new Date().toISOString(), probes: {}, errors: [] };
let app, page, mainPid;
try {
  app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${profile}`], env: { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' }, timeout: 45000 });
  mainPid = await app.evaluate(() => process.pid);
  page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', e => results.errors.push(e.message));
  await page.getByRole('button', { name: 'Edit First', exact: true }).click();
  await page.getByText('Original · change a control to prepare', { exact: true }).waitFor();
  // Model a slow worker reply after a successful save. The actual write is not mocked.
  const hook = await app.evaluate(() => {
    const { Worker } = process.getBuiltinModule('node:worker_threads');
    const emit = Worker.prototype.emit;
    globalThis.auditWorkers = new Set();
    Worker.prototype.emit = function(event, ...args) {
      globalThis.auditWorkers.add(this);
      const msg = args[0];
      if (event === 'message' && msg?.result?.recipe && msg.result.recipe.brightness === 1.23 && !globalThis.auditSaveDelayed) {
        globalThis.auditSaveDelayed = true;
        setTimeout(() => emit.call(this, event, ...args), 1500);
        return true;
      }
      return emit.call(this, event, ...args);
    };
    globalThis.auditRestoreWorker = () => { Worker.prototype.emit = emit; };
    return true;
  });
  await page.getByLabel('Brightness', { exact: true }).fill('1.23');
  await page.getByRole('button', { name: 'Edit Second', exact: true }).click();
  await page.waitForTimeout(1800);
  const persisted = await page.evaluate(() => window.fieldKit.getState());
  await page.getByRole('button', { name: 'Edit First', exact: true }).click();
  await page.getByAltText('Processed square texture').waitFor();
  const brightness = await page.getByLabel('Brightness', { exact: true }).inputValue();
  const source = persisted.assets.find(a => a.name === 'First');
  results.probes.delayedSaveReply = { delayMs: 1500, hook, databaseBrightness: source.recipe.brightness, displayedBrightness: Number(brightness), databasePrepared: source.prepared, displayedStatus: await page.locator('.recipe-status').textContent() };
  await page.screenshot({ path: path.join(root, 'stale-editor-after-save.png') });
  await page.getByLabel('Contrast', { exact: true }).fill('1.1');
  await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  const after = await page.evaluate(() => window.fieldKit.getState());
  results.probes.delayedSaveReply.afterNextEdit = after.assets.find(a => a.name === 'First').recipe;
  await app.evaluate(() => globalThis.auditRestoreWorker());

  // Measure actual painted text/background pairs, and hit test controls after normal scaling.
  const colors = await page.locator('.control-help, .card-meta, .sidebar .eyebrow, .workbench-tabs button').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => {
    let parent = e; let background = 'rgba(0, 0, 0, 0)';
    while (parent && background === 'rgba(0, 0, 0, 0)') { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
    const s = getComputedStyle(e); return { selector: e.className || e.tagName, text: e.textContent.slice(0, 90), color: s.color, background, fontSize: s.fontSize };
  }));
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  results.probes.contrast = colors.map(c => { const a = luminance(c.color), b = luminance(c.background); return { ...c, ratio: Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(3)) }; });
  results.probes.layouts = [];
  for (const [width, height, zoom] of [[1366, 768, 1.25], [900, 560, 1], [900, 560, 1.25], [1280, 800, 1.5]]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(width, height); w.webContents.setZoomFactor(zoom); }, { width, height, zoom });
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Crop', exact: true }).click();
    const measured = await page.evaluate(() => {
      const selector = ['.top-actions button', '.workbench-tabs button', '.orientation button', '.crop-fields input', '.output-section select'];
      return { viewport: { width: innerWidth, height: innerHeight }, documentOverflow: document.documentElement.scrollWidth > innerWidth, controls: selector.flatMap(s => [...document.querySelectorAll(s)]).map(e => { const r = e.getBoundingClientRect(); return { text: e.getAttribute('aria-label') || e.textContent, left: r.left, right: r.right, width: r.width, horizontallyClipped: r.left < 0 || r.right > innerWidth + 1 }; }), workbench: { client: document.querySelector('.workbench-body').clientWidth, scroll: document.querySelector('.workbench-body').scrollWidth } };
    });
    results.probes.layouts.push({ width, height, zoom, ...measured });
    const capture = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    await fs.writeFile(path.join(root, `layout-${width}-${height}-${zoom}.png`), Buffer.from(capture, 'base64'));
  }

  // Ordinary damaged-library open followed by a healthy reopen via the real renderer bridge.
  const damaged = path.join(root, 'damaged-library'); await fs.mkdir(damaged);
  await fs.writeFile(path.join(damaged, 'field-kit.json'), JSON.stringify({ format: 'field-kit', version: 1, name: 'Damaged' }));
  await fs.writeFile(path.join(damaged, 'library.sqlite'), 'Damaged SQLite fixture');
  await app.evaluate(({ dialog }, damaged) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [damaged] }); dialog.showErrorBox = (title, text) => { globalThis.auditErrorDialog = { title, text }; }; }, damaged);
  const badOpen = await page.evaluate(async () => { try { await window.fieldKit.chooseLibrary(false); return null; } catch (e) { return e.message; } });
  await app.evaluate(({ dialog }, library) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [library] }); }, library);
  const goodReopen = await page.evaluate(async () => { try { await window.fieldKit.chooseLibrary(false); return null; } catch (e) { return e.message; } });
  await app.evaluate(({ app }) => app.quit());
  await page.waitForTimeout(1000);
  const afterQuit = await app.evaluate(({ BrowserWindow }) => ({ liveWindows: BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).length, errorDialog: globalThis.auditErrorDialog }));
  const requestAfterFailure = await page.evaluate(() => Promise.race([window.fieldKit.getState().then(() => 'resolved', e => 'rejected: ' + e.message), new Promise(resolve => setTimeout(() => resolve('still pending after 1500ms'), 1500))]));
  results.probes.damagedLibraryRuntime = { badOpen, goodReopen, afterQuit, requestAfterFailure, processStillAlive: app.process().exitCode === null };
  results.finished = new Date().toISOString();
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ root, probes: Object.keys(results.probes), results: path.join(root, 'results.json') }));
} finally {
  if (app) {
    const child = app.process();
    // Playwright can expose a Windows launcher PID; terminate the verified app main PID too.
    if (mainPid) { try { process.kill(mainPid, 'SIGKILL'); } catch {} }
    await app.close().catch(() => {});
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
