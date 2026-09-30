import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Library } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { texture, recording } from '../tests/fixtures.ts';

const require = createRequire(import.meta.url), executable = process.env.FIELD_KIT_EXECUTABLE;
const root = path.resolve('.test-output', `continuity-ui-${Date.now()}`), library = path.join(root, 'library'), profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
await texture(path.join(root, 'Surface.png'), 211, 640, 480); await recording(path.join(root, 'Recording.wav'), 15, 4);
await lib.import([path.join(root, 'Surface.png'), path.join(root, 'Recording.wav')], undefined, new Job(), () => {}); lib.close();
await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const report = { root, executable: executable || 'development', checks: [], errors: [], network: [] };
let app, page, mainPid, child;
const start = async () => {
  app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`], env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env, timeout: 45000 });
  child = app.process(); mainPid = await app.evaluate(() => process.pid); report.version = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.context().setOffline(true);
  page.on('pageerror', error => report.errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  await page.getByRole('heading', { name: 'All materials', exact: true }).waitFor();
};
const nativeClose = () => app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 20); });
const closeDialog = () => page.getByRole('dialog', { name: 'Close Field Kit?', exact: true });
const waitClosed = async action => { const closed = app.waitForEvent('close', { timeout: 18000 }); await action(); await closed; app = undefined; };
const state = () => page.evaluate(() => window.fieldKit.getState());
const faultWrites = () => app.evaluate(() => {
  const { Worker } = process.getBuiltinModule('node:worker_threads'), post = Worker.prototype.postMessage, emit = Worker.prototype.emit;
  Worker.prototype.postMessage = function(message, ...args) {
    if (message.action === globalThis.failAction) { globalThis.failAction = ''; setTimeout(() => this.emit('message', { id: message.id, error: 'Simulated disk write failure' }), 20); return; }
    if (message.action === 'shutdown' && globalThis.ignoreShutdown) return;
    return post.call(this, message, ...args);
  };
  Worker.prototype.emit = function(event, ...args) {
    const message = args[0];
    if (event === 'message' && message?.result?.recipe?.brightness === globalThis.delayBrightness && globalThis.delayMilliseconds) {
      const delay = globalThis.delayMilliseconds; globalThis.delayMilliseconds = 0; setTimeout(() => emit.call(this, event, ...args), delay); return true;
    }
    return emit.call(this, event, ...args);
  };
});
try {
  await start(); await faultWrites();
  await page.getByRole('button', { name: 'New collection', exact: true }).click();
  await page.getByRole('textbox', { name: 'Collection name' }).fill('   '); await page.getByRole('button', { name: 'Create collection', exact: true }).click();
  await page.getByRole('dialog', { name: 'New collection', exact: true }).getByRole('alert').filter({ hasText: 'Enter a collection name' }).waitFor();
  await page.keyboard.press('Escape'); report.checks.push('collection validation is visible inside its dialog and Escape dismisses it');

  await page.getByRole('button', { name: 'Edit Surface', exact: true }).click(); await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Material name', { exact: true }).fill('  Stone surface  '); await page.getByLabel('Tags', { exact: false }).fill('stone, stone, weathered, ');
  await page.getByRole('button', { name: 'Save details', exact: true }).click(); await page.getByText('Details saved', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Material name', { exact: true }).inputValue(), 'Stone surface'); assert.equal(await page.getByLabel('Tags', { exact: false }).inputValue(), 'stone, weathered');
  assert.equal(await page.getByText('Unsaved changes', { exact: true }).count(), 0);
  report.checks.push('saved names and duplicate tags reconcile with the form without false unsaved changes');

  await page.getByLabel('Private notes').fill('Preserve these details when closing');
  await nativeClose(); await closeDialog().waitFor(); await nativeClose(); assert.equal(await closeDialog().count(), 1);
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1100, 760); window.webContents.setZoomFactor(1.25); }); await page.waitForTimeout(150);
  const layout = await closeDialog().evaluate(dialog => { const rect = dialog.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight }; });
  assert(layout.left >= 0 && layout.top >= 0 && layout.right <= layout.width && layout.bottom <= layout.height);
  const capture = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  await fs.writeFile(path.join(root, 'close-unsaved-details.png'), Buffer.from(capture, 'base64'));
  await closeDialog().getByRole('button', { name: 'Keep working', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(1440, 940); window.webContents.setZoomFactor(1); });
  assert.equal(await page.getByLabel('Private notes').inputValue(), 'Preserve these details when closing');
  report.checks.push('native window close protects unsaved details; repeated close and Keep working retain the form');

  await app.evaluate(({ app }) => { globalThis.failAction = 'update'; app.quit(); }); await closeDialog().waitFor();
  await closeDialog().getByRole('button', { name: 'Save and close', exact: true }).click();
  await closeDialog().getByRole('alert').filter({ hasText: 'Simulated disk write failure' }).waitFor();
  assert.equal((await state()).assets.find(asset => asset.kind === 'image').notes, '');
  await waitClosed(() => closeDialog().getByRole('button', { name: 'Save and close', exact: true }).click());
  await start(); await faultWrites(); assert.equal((await state()).assets.find(asset => asset.kind === 'image').notes, 'Preserve these details when closing');
  report.checks.push('application quit supports Save and close; failed metadata writes keep the window open and retry persists after restart');

  await page.getByRole('button', { name: 'Edit Recording', exact: true }).click(); await page.getByLabel('Trim start seconds').fill('2'); await page.getByLabel('Trim end seconds').fill('1');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Edit Stone surface', exact: true }).click();
  assert.equal(await page.getByLabel('Trim end seconds').inputValue(), '1');
  await nativeClose(); await closeDialog().waitFor(); assert(await closeDialog().getByRole('button', { name: 'Save and close', exact: true }).isDisabled());
  await closeDialog().getByRole('button', { name: 'Keep working', exact: true }).click();
  await page.getByLabel('Trim end seconds').fill('4'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  report.checks.push('invalid recipe controls are protected during asset navigation and close');

  await page.getByRole('button', { name: 'Edit Stone surface', exact: true }).click();
  await app.evaluate(() => { globalThis.failAction = 'save'; }); await page.getByLabel('Brightness', { exact: true }).fill('1.46');
  await page.getByText('Some edits have not been saved', { exact: true }).waitFor();
  await nativeClose(); await closeDialog().waitFor();
  await app.evaluate(({ dialog }) => { globalThis.modalImportCalls = 0; dialog.showOpenDialog = async () => { globalThis.modalImportCalls++; return { canceled: true, filePaths: [] }; }; });
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+i');
  assert.equal(await page.getByLabel('Brightness', { exact: true }).inputValue(), '1.46'); assert.equal(await app.evaluate(() => globalThis.modalImportCalls), 0);
  await waitClosed(() => closeDialog().getByRole('button', { name: 'Save and close', exact: true }).click());
  await start(); await faultWrites(); assert.equal((await state()).assets.find(asset => asset.kind === 'image').recipe.brightness, 1.46);
  report.checks.push('Save and close retries a failed recipe, modal shortcuts stay isolated and the result survives restart');

  await page.getByRole('button', { name: 'Edit Stone surface', exact: true }).click(); await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Private notes').fill('Deliberately discard this draft'); await nativeClose(); await closeDialog().waitFor();
  await waitClosed(() => closeDialog().getByRole('button', { name: 'Discard and close', exact: true }).click());
  await start(); await faultWrites(); assert.equal((await state()).assets.find(asset => asset.kind === 'image').notes, 'Preserve these details when closing');
  report.checks.push('explicit Discard and close preserves the previously saved details');

  await page.getByRole('button', { name: 'Edit Stone surface', exact: true }).click();
  await app.evaluate(() => { globalThis.delayBrightness = 1.29; globalThis.delayMilliseconds = 1500; }); await page.getByLabel('Brightness', { exact: true }).fill('1.29');
  const closing = performance.now(); await waitClosed(nativeClose); report.delayedCloseMilliseconds = performance.now() - closing;
  assert(report.delayedCloseMilliseconds >= 1000); await start(); await faultWrites(); assert.equal((await state()).assets.find(asset => asset.kind === 'image').recipe.brightness, 1.29);
  report.checks.push('close waits for an outstanding real recipe save reply before shutdown');

  await page.getByRole('button', { name: 'Edit Stone surface', exact: true }).click();
  await app.evaluate(() => { globalThis.delayBrightness = 1.31; globalThis.delayMilliseconds = 9000; }); await page.getByLabel('Brightness', { exact: true }).fill('1.31');
  await nativeClose(); await closeDialog().getByRole('alert').filter({ hasText: 'Saving is taking longer' }).waitFor();
  await closeDialog().getByRole('button', { name: 'Keep working', exact: true }).click(); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  assert.equal((await state()).assets.find(asset => asset.kind === 'image').recipe.brightness, 1.31);
  report.checks.push('a delayed close save times out to usable recovery controls and accepts its later successful reply');

  await app.evaluate(() => { globalThis.delayBrightness = 1.32; globalThis.delayMilliseconds = 60000; }); await page.getByLabel('Brightness', { exact: true }).fill('1.32');
  await nativeClose(); await closeDialog().getByRole('alert').filter({ hasText: 'Saving is taking longer' }).waitFor();
  await waitClosed(() => closeDialog().getByRole('button', { name: 'Close without waiting', exact: true }).click());
  await start(); await faultWrites(); assert.equal((await state()).assets.find(asset => asset.kind === 'image').recipe.brightness, 1.32);
  report.checks.push('an unreturned save reply permits explicit Close without waiting after the recovery timeout');

  const batch = path.join(root, 'import batch'); await fs.mkdir(batch);
  for (let i = 0; i < 60; i++) await texture(path.join(batch, `Surface ${i}.png`), 1000 + i, 640, 480);
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, batch);
  await page.getByRole('button', { name: 'Import folder', exact: true }).click();
  await page.waitForFunction(() => { const progress = document.querySelector('.job-progress progress'); return progress && progress.max === 60 && progress.value >= 2 && progress.value < 60; });
  await nativeClose(); await closeDialog().getByText(/Closing cancels the current import, export or backup/).waitFor();
  await waitClosed(() => closeDialog().getByRole('button', { name: 'Close Field Kit', exact: true }).click());
  await start(); await faultWrites(); const afterImport = await state(); report.assetsAfterInterruptedImport = afterImport.assets.length;
  assert(afterImport.assets.length > 2 && afterImport.assets.length < 62);
  assert.equal((await fs.readdir(path.join(library, 'originals'))).length, afterImport.assets.length);
  assert.equal((await fs.readdir(path.join(library, '.tmp'))).length, 0);
  report.checks.push('closing during import cancels remaining work, preserves completed assets and cleans staging');

  await app.evaluate(() => { globalThis.ignoreShutdown = true; }); const deadline = performance.now(); await waitClosed(nativeClose);
  report.shutdownDeadlineMilliseconds = performance.now() - deadline; assert(report.shutdownDeadlineMilliseconds >= 9500 && report.shutdownDeadlineMilliseconds < 14000);
  report.checks.push('a worker that ignores shutdown is terminated by the ten-second deadline');

  await start();
  await app.evaluate(({ dialog, BrowserWindow }) => { globalThis.fallbackCalls = 0; dialog.showMessageBox = async () => ({ response: ++globalThis.fallbackCalls === 1 ? 0 : 1, checkboxChecked: false }); BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer(); });
  await nativeClose();
  for (let i = 0; i < 50; i++) { if (await app.evaluate(() => globalThis.fallbackCalls === 1)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal(await app.evaluate(() => globalThis.fallbackCalls), 1); assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await waitClosed(nativeClose); report.checks.push('a crashed renderer has a native Keep open or Close anyway fallback');

  assert.equal(report.errors.length, 0, report.errors.join('\n')); assert.equal(report.network.length, 0);
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('CONTINUITY_UI_RESULTS ' + JSON.stringify(report));
} finally {
  if (app) { try { process.kill(mainPid, 'SIGKILL'); } catch {} await app.close().catch(() => {}); if (child.exitCode === null) child.kill('SIGKILL'); }
}
