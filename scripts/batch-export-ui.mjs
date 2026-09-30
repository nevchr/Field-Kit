import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { Library, hashFile } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { defaultImage, defaultAudio } from '../src/shared.ts';
import { texture, recording } from '../tests/fixtures.ts';

const require = createRequire(import.meta.url), executable = process.env.FIELD_KIT_EXECUTABLE;
const root = path.resolve('.test-output', `batch-export-ui-${Date.now()}`), library = path.join(root, 'Library'), profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
const files = [path.join(root, 'Stone.png'), path.join(root, 'STONE.png'), path.join(root, 'Rain.wav')];
// Distinct source filenames on Windows; the library names intentionally differ only in case.
files[1] = path.join(root, 'Bark.png');
await texture(files[0], 520, 800, 600); await texture(files[1], 521, 480, 640); await recording(files[2], 62, 3);
await lib.import(files, undefined, new Job(), () => {});
const initial = lib.state(), stone = initial.assets.find(a => a.name === 'Stone'), bark = initial.assets.find(a => a.name === 'Bark'), rain = initial.assets.find(a => a.name === 'Rain');
lib.update({ id: bark.id, name: 'STONE', tags: [], notes: '', collections: [] });
lib.saveRecipe(stone.id, { ...defaultImage, crop: { x: .1, y: .1, w: .6, h: .7 }, rotation: 90, size: 512 });
lib.saveRecipe(rain.id, { ...defaultAudio(3), start: .1, end: 2.8 });
const warm = lib.savePreset({ name: 'Warm', kind: 'image', recipe: { ...defaultImage, brightness: 1.4, blend: .2, size: 512 } });
const cool = lib.savePreset({ name: 'Cool', kind: 'image', recipe: { ...defaultImage, brightness: .8, size: 512 } });
const large = lib.savePreset({ name: 'Large', kind: 'image', recipe: { ...defaultImage, brightness: 1.6, size: 2048 } });
const loop = lib.savePreset({ name: 'Loop', kind: 'audio', recipe: { ...defaultAudio(20), fadeIn: 8, fadeOut: 8, crossfade: 5, channels: 1, normalize: true } });
lib.close(); await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const report = { root, executable: executable || 'development', checks: [], errors: [], network: [] };
let app, page, child, mainPid;
const state = () => page.evaluate(() => window.fieldKit.getState());
const start = async () => {
  app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`], env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env, timeout: 45000 });
  child = app.process(); mainPid = await app.evaluate(() => process.pid); report.version = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow(); page.setDefaultTimeout(18000); await page.context().setOffline(true);
  page.on('pageerror', error => report.errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) report.network.push(request.url()); });
  await page.getByRole('heading', { name: 'All materials', exact: true }).waitFor();
  await app.evaluate(() => {
    const { Worker } = process.getBuiltinModule('node:worker_threads'), post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...args) { if (message.action === globalThis.failAction) { globalThis.failAction = ''; setTimeout(() => this.emit('message', { id: message.id, error: 'Simulated library write failure' }), 20); return; } return post.call(this, message, ...args); };
  });
};
const cleanClose = async () => { const closed = app.waitForEvent('close', { timeout: 20000 }); await app.evaluate(({ app }) => app.quit()); await closed; app = undefined; };
const open = async name => { await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click(); await page.locator('.recipe-status').filter({ hasText: /export-ready|Original ·/ }).waitFor(); };
const batchDialog = () => page.getByRole('dialog', { name: 'Apply presets to selected materials', exact: true });
const historyDialog = () => page.getByRole('dialog', { name: 'Batch history', exact: true });
const exportDialog = () => page.getByRole('dialog', { name: 'Export asset pack', exact: true });
const all = () => page.getByRole('button', { name: /^All materials \d+$/ }).click();
const capture = async name => { const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await fs.writeFile(path.join(root, name), Buffer.from(png, 'base64')); };
const chooseFile = file => app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: !file, filePath: file || undefined }); }, file);
try {
  await start(); await open('Stone'); await page.getByLabel('Brightness', { exact: true }).fill('1.11');
  await page.getByRole('tab', { name: 'Details', exact: true }).click(); await page.getByLabel('Private notes').fill('PRIVATE: pending batch details');
  await page.getByLabel('Select Stone for export', { exact: true }).check(); await page.getByRole('button', { name: 'Sounds', exact: true }).click(); await page.getByLabel('Select Rain for export', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply presets', exact: true }).click(); await page.getByLabel('Texture preset for batch').selectOption(warm.id);
  await batchDialog().getByText('1 to change · 0 already match · 1 skipped', { exact: true }).waitFor(); assert((await batchDialog().innerText()).includes('1 selected outside the current view'));
  await page.getByLabel('Sound preset for batch').selectOption(loop.id); await batchDialog().getByText('2 to change · 0 already match · 0 skipped', { exact: true }).waitFor();
  report.checks.push('mixed selections review separate presets, skipped types and hidden selections');

  const beforeFailedSave = await state(); await app.evaluate(() => { globalThis.failAction = 'update'; });
  await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().getByRole('alert').filter({ hasText: 'Simulated library write failure' }).waitFor(); assert.deepEqual((await state()).assets, beforeFailedSave.assets); assert.equal((await state()).batchHistory.length, 0);
  report.checks.push('failed Details saves block a batch and keep the unsaved draft for retry');
  await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().waitFor({ state: 'hidden' });
  let current = await state(), completed = current.batchHistory[0]; assert.equal(completed.count, 2);
  assert.equal(current.assets.find(a => a.id === stone.id).recipe.brightness, 1.4); assert.equal(current.assets.find(a => a.id === stone.id).notes, 'PRIVATE: pending batch details'); assert.equal(current.assets.find(a => a.id === stone.id).recipe.rotation, 90);
  assert.equal(current.assets.find(a => a.id === rain.id).recipe.start, .1); assert.equal(current.assets.find(a => a.id === rain.id).recipe.end, 2.8); assert.equal(current.assets.find(a => a.id === rain.id).recipe.channels, 1);
  report.checks.push('a completed batch saves pending edits, fits sound settings and preserves image framing');

  await page.getByRole('button', { name: 'Batch history', exact: true }).click(); await historyDialog().getByRole('button', { name: 'Undo batch Warm + Loop', exact: true }).click(); await historyDialog().getByRole('button', { name: 'Redo batch Warm + Loop', exact: true }).waitFor();
  assert.equal((await state()).assets.find(a => a.id === stone.id).recipe.brightness, 1.11); assert.equal((await state()).assets.find(a => a.id === stone.id).notes, 'PRIVATE: pending batch details');
  await historyDialog().getByRole('button', { name: 'Redo batch Warm + Loop', exact: true }).click(); await historyDialog().getByRole('button', { name: 'Undo batch Warm + Loop', exact: true }).waitFor(); await capture('batch-history.png'); await historyDialog().getByRole('button', { name: 'Done', exact: true }).click();
  await cleanClose(); await start(); assert.equal((await state()).batchHistory[0].id, completed.id); assert.equal((await state()).batchHistory[0].state, 'applied');
  report.checks.push('batch undo and redo restore exact recipes, preserve details and survive restart');

  await open('Stone'); await page.getByLabel('Brightness', { exact: true }).fill('1.6'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor(); const newer = (await state()).assets;
  await page.getByRole('button', { name: 'Batch history', exact: true }).click(); await historyDialog().getByRole('button', { name: 'Undo batch Warm + Loop', exact: true }).click(); await historyDialog().getByRole('alert').filter({ hasText: 'newer edits' }).waitFor(); assert.deepEqual((await state()).assets, newer); await historyDialog().getByRole('button', { name: 'Done', exact: true }).click();
  report.checks.push('history refuses to overwrite newer individual edits and leaves the whole batch intact');

  await page.getByLabel('Select visible assets', { exact: true }).check(); await page.getByRole('button', { name: 'Export pack', exact: true }).click();
  await page.getByLabel('Pack texture size', { exact: true }).selectOption('2048'); await page.getByLabel('Pack sound channels', { exact: true }).selectOption('2'); await page.getByLabel('Pack normalization', { exact: true }).selectOption('off');
  await page.getByLabel('Filename prefix', { exact: true }).fill('game_'); await page.getByLabel('Filename case', { exact: true }).selectOption('lower'); await page.getByLabel('Filename spaces', { exact: true }).selectOption('underscore');
  await page.getByLabel('Author', { exact: false }).fill('Creator'); await page.getByLabel('Attribution', { exact: false }).fill('User supplied credit');
  let previewNames = await exportDialog().locator('.export-preview code').allTextContents(); assert(previewNames.some(name => name === 'textures/game_stone-2.png')); assert(previewNames.some(name => name === 'sounds/game_rain.wav'));
  await page.getByLabel('Filename numbering').selectOption('prefix'); assert((await exportDialog().locator('.export-preview code').first().textContent()).includes('/001-')); await page.getByLabel('Filename numbering').selectOption('none');
  report.checks.push('export previews collision-resolved filenames, case, prefix, spaces and numbering');

  await exportDialog().getByRole('button', { name: 'Save as profile', exact: true }).click(); await page.getByLabel('Profile name', { exact: true }).fill('Prototype'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await exportDialog().waitFor();
  assert.equal((await state()).exportProfiles.length, 1);
  await exportDialog().getByRole('button', { name: 'Save as profile', exact: true }).click(); await page.getByLabel('Profile name', { exact: true }).fill('prototype'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'already exists' }).waitFor();
  await page.getByLabel('Profile name', { exact: true }).fill('Prototype copy'); await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await exportDialog().waitFor(); assert.equal((await state()).exportProfiles.length, 2);
  report.checks.push('profiles save and duplicate settings and credits while rejecting duplicate names');

  await exportDialog().getByRole('button', { name: 'Delete profile', exact: true }).click(); await page.getByRole('dialog', { name: 'Delete export profile?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal((await state()).exportProfiles.length, 2);
  await exportDialog().getByRole('button', { name: 'Delete profile', exact: true }).click(); await page.getByRole('button', { name: 'Delete export profile', exact: true }).click(); await exportDialog().waitFor(); assert.equal((await state()).exportProfiles.length, 1);
  const prototype = (await state()).exportProfiles[0]; await page.getByLabel('Export profile', { exact: true }).selectOption(prototype.id);
  await exportDialog().getByRole('button', { name: 'Update profile', exact: true }).click(); await page.getByLabel('Profile name', { exact: true }).fill('Game pack'); await page.getByRole('button', { name: 'Save profile changes', exact: true }).click(); await exportDialog().waitFor(); assert.equal((await state()).exportProfiles[0].name, 'Game pack');
  report.checks.push('profiles can be renamed and updated, and deletion requires confirmation');

  await chooseFile(null); await exportDialog().getByRole('button', { name: 'Choose destination', exact: true }).click(); await exportDialog().waitFor({ state: 'hidden' }); await page.waitForFunction(() => !document.querySelector('.job-progress'));
  assert.equal((await state()).lastExportProfile, null); await page.getByRole('button', { name: 'Export pack', exact: true }).click(); await page.getByLabel('Export profile', { exact: true }).selectOption(prototype.id);
  report.checks.push('cancelling the destination leaves the last successful profile choice unchanged');

  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1100, 760); BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25); });
  await exportDialog().locator('.export-preview').scrollIntoViewIfNeeded(); await capture('export-preview-125.png'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const dialogBox = await exportDialog().boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight })); assert(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= viewport.width + 1); assert(dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= viewport.height + 1);
  report.checks.push('profile controls and file previews fit a laptop window at 125 percent app zoom');

  previewNames = await exportDialog().locator('.export-preview code').allTextContents(); const beforeExport = (await state()).assets, destination = path.join(root, 'Profile pack.zip'); await chooseFile(destination);
  await exportDialog().getByRole('button', { name: 'Choose destination', exact: true }).click(); await page.getByText(/Exported 3 assets to/).waitFor(); assert.deepEqual((await state()).assets, beforeExport);
  const extracted = path.join(root, 'extracted'); const extraction = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${destination.replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}'`], { windowsHide: true }); assert.equal(extraction.status, 0, extraction.stderr.toString());
  const raw = await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8'), manifest = JSON.parse(raw); assert.deepEqual(manifest.assets.map(a => a.path), previewNames); assert(!raw.includes('PRIVATE')); assert(!raw.includes(library)); assert.equal(manifest.author, 'Creator');
  for (const item of manifest.assets) { const file = path.join(extracted, item.path); if (item.type === 'texture') assert.equal((await sharp(file).metadata()).width, 2048); else { const info = await lib.media.probe(file, new Job()); assert.equal(info.channels, 2); assert.equal(info.sampleRate, 48000); } }
  report.checks.push('exported ZIP paths match the preview and media overrides leave saved recipes unchanged');

  await cleanClose(); await start(); await page.getByLabel('Select visible assets', { exact: true }).check(); await page.getByRole('button', { name: 'Export pack', exact: true }).click();
  assert.equal(await page.getByLabel('Export profile', { exact: true }).inputValue(), prototype.id); assert.equal(await page.getByLabel('Pack texture size', { exact: true }).inputValue(), '2048'); assert.equal(await page.getByLabel('Author', { exact: false }).inputValue(), 'Creator'); await exportDialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  report.checks.push('the last successful profile and its credits are restored after restarting');

  const beforeBackup = await state(); await app.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, root);
  await page.getByRole('button', { name: 'Back up library', exact: true }).click(); await page.getByRole('button', { name: 'Choose backup folder', exact: true }).click(); await page.getByText(/Verified backup of 3 materials:/).waitFor();
  const backup = (await fs.readdir(root)).find(name => name.startsWith('Library-backup-')); assert(backup); const backupFolder = path.join(root, backup);
  const backupLib = new Library(path.resolve('vendor/ffmpeg/bin')); try { const restored = await backupLib.open(backupFolder); assert.deepEqual(restored.exportProfiles, beforeBackup.exportProfiles); assert.deepEqual(restored.batchHistory, beforeBackup.batchHistory); assert.equal(restored.lastExportProfile, prototype.id); } finally { backupLib.close(); }
  report.checks.push('verified backups preserve profiles, last choice and persistent batch history');

  await all(); await open('Rain'); await page.getByLabel('Trim end seconds').fill('0'); await page.getByLabel('Select visible assets', { exact: true }).check();
  await page.getByRole('button', { name: 'Apply presets', exact: true }).click(); await page.getByLabel('Texture preset for batch').selectOption(cool.id); await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().getByRole('alert').filter({ hasText: 'invalid recipe fields' }).waitFor(); await batchDialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Trim end seconds').fill('2.8'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  report.checks.push('invalid recipe fields block batch work until corrected');

  const beforeFailedBatch = (await state()).assets; await page.getByRole('button', { name: 'Apply presets', exact: true }).click(); await page.getByLabel('Texture preset for batch').selectOption(cool.id); await app.evaluate(() => { globalThis.failAction = 'preset:batch'; });
  await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().getByRole('alert').filter({ hasText: 'Simulated library write failure' }).waitFor(); assert.deepEqual((await state()).assets, beforeFailedBatch);
  await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().waitFor({ state: 'hidden' }); assert.equal((await state()).assets.find(a => a.id === rain.id).recipe.channels, 1);
  report.checks.push('failed batch requests leave recipes intact and retry succeeds while skipped types stay unchanged');

  const extra = path.join(root, 'Cancellation fixtures'); await fs.mkdir(extra); for (let i = 0; i < 32; i++) await texture(path.join(extra, `Extra ${i}.png`), 700 + i, 320, 240);
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, extra); await page.getByRole('button', { name: 'Import folder', exact: true }).click(); await page.getByText('32 imported · 0 duplicates skipped', { exact: true }).waitFor();
  await all(); await page.getByLabel('Select visible assets', { exact: true }).check(); const beforeCancel = await state();
  await page.getByRole('button', { name: 'Apply presets', exact: true }).click(); await page.getByLabel('Texture preset for batch').selectOption(large.id); await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click(); await batchDialog().getByRole('button', { name: 'Cancel batch', exact: true }).click();
  await batchDialog().getByRole('alert').filter({ hasText: 'Batch cancelled' }).waitFor(); assert.deepEqual((await state()).assets, beforeCancel.assets); assert.deepEqual((await state()).batchHistory, beforeCancel.batchHistory); await batchDialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  report.checks.push('Cancel batch stops real multi-material processing without committing recipes or history');

  await page.getByRole('button', { name: 'Apply presets', exact: true }).click(); await page.getByLabel('Texture preset for batch').selectOption(large.id); await batchDialog().getByRole('button', { name: 'Prepare selected', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 20); }); const closeDialog = page.getByRole('dialog', { name: 'Close Field Kit?', exact: true }); await closeDialog.waitFor();
  const closed = app.waitForEvent('close', { timeout: 20000 }); await closeDialog.getByRole('button', { name: 'Close Field Kit', exact: true }).click(); await closed; app = undefined;
  await start(); assert.deepEqual((await state()).assets, beforeCancel.assets); assert.deepEqual((await state()).batchHistory, beforeCancel.batchHistory);
  report.checks.push('normal closing cancels batch preparation and reopening retains the last committed recipes');

  const final = await state(); for (const asset of final.assets) assert.equal(await hashFile(path.join(library, asset.original)), asset.hash);
  assert.equal(report.errors.length, 0, report.errors.join('\n')); assert.equal(report.network.length, 0); report.checks.push('all managed original hashes remain unchanged and the workflow stays offline');
  await cleanClose();
} catch (error) { report.failure = String(error.stack || error); if (app) await capture('failure.png').catch(() => {}); throw error; }
finally { await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('BATCH_EXPORT_UI_RESULTS ' + JSON.stringify(report)); if (app) { try { process.kill(mainPid); } catch {} await app.close().catch(() => {}); if (child?.exitCode === null) child.kill(); } }
