import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Library, hashFile } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { defaultImage } from '../src/shared.ts';
import { texture, recording } from '../tests/fixtures.ts';

const require = createRequire(import.meta.url), executable = process.env.FIELD_KIT_EXECUTABLE;
const root = path.resolve('.test-output', `trash-ui-${Date.now()}`), library = path.join(root, 'Library'), profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
const files = [path.join(root, 'Stone.png'), path.join(root, 'Bark.png'), path.join(root, 'Rain.wav')];
await texture(files[0], 302, 640, 480); await texture(files[1], 303, 480, 640); await recording(files[2], 32, 3);
await lib.import(files, undefined, new Job(), () => {}); const initial = lib.state(), stone = initial.assets.find(a => a.name === 'Stone'), bark = initial.assets.find(a => a.name === 'Bark'), rain = initial.assets.find(a => a.name === 'Rain');
const forest = lib.collection('Forest'); lib.update({ id: stone.id, name: 'Stone', tags: ['stone'], notes: 'Original private note', collections: [forest.id] }); lib.favorite({ id: stone.id, favorite: true });
for (const a of [stone, bark]) lib.saveRecipe(a.id, { ...defaultImage, size: 512 });
lib.close(); await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const report = { root, executable: executable || 'development', checks: [], errors: [], network: [] };
let app, page, child, mainPid;
const start = async () => {
  app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`], env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env, timeout: 45000 });
  child = app.process(); mainPid = await app.evaluate(() => process.pid); report.version = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.context().setOffline(true); page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
  await page.getByRole('heading', { name: 'All materials', exact: true }).waitFor();
  await app.evaluate(() => {
    const { Worker } = process.getBuiltinModule('node:worker_threads'), post = Worker.prototype.postMessage, emit = Worker.prototype.emit;
    Worker.prototype.postMessage = function(message, ...args) { if (message.action === globalThis.failAction) { globalThis.failAction = ''; setTimeout(() => this.emit('message', { id: message.id, error: 'Simulated library write failure' }), 20); return; } return post.call(this, message, ...args); };
    Worker.prototype.emit = function(event, ...args) { if (event === 'message' && globalThis.delayTrash && Array.isArray(args[0]?.result) && args[0].result.some(a => a.trashedAt)) { globalThis.delayTrash = false; setTimeout(() => emit.call(this, event, ...args), 1500); return true; } return emit.call(this, event, ...args); };
  });
};
const state = () => page.evaluate(() => window.fieldKit.getState());
const open = async name => { await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click(); await page.locator('.recipe-status').filter({ hasText: /export-ready|Original ·/ }).waitFor(); };
const trashNav = () => page.getByRole('button', { name: /^Trash \d+$/ });
const allNav = () => page.getByRole('button', { name: /^All materials \d+$/ });
const modal = () => page.getByRole('dialog', { name: 'Move to Trash?', exact: true });
const confirm = async () => { await modal().getByRole('button', { name: 'Move to Trash', exact: true }).click(); await modal().waitFor({ state: 'hidden' }); };
const capture = async name => { const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await fs.writeFile(path.join(root, name), Buffer.from(png, 'base64')); };
const nativeClose = () => app.evaluate(({ BrowserWindow }) => { setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 20); });
const close = async action => { const closed = app.waitForEvent('close', { timeout: 18000 }); await action(); await closed; app = undefined; };
try {
  await start(); await open('Stone');
  await page.getByRole('button', { name: 'Move this material to Trash', exact: true }).click(); await modal().getByRole('button', { name: 'Keep materials' }).click(); assert(!(await state()).assets.some(a => a.trashedAt));
  report.checks.push('Move to Trash confirmation can be cancelled without changing materials');

  await page.getByLabel('Brightness', { exact: true }).fill('1.4'); await page.getByRole('tab', { name: 'Details', exact: true }).click(); await page.getByLabel('Private notes').fill('Keep this unsaved field note');
  await page.getByRole('button', { name: 'Move this material to Trash', exact: true }).click(); await confirm();
  await page.getByText('1 material moved to Trash.', { exact: true }).waitFor();
  let current = (await state()).assets.find(a => a.id === stone.id); assert(current.trashedAt); assert.equal(current.recipe.brightness, 1.4); assert.equal(current.notes, 'Keep this unsaved field note'); assert(current.favorite); assert.deepEqual(current.collections, [forest.id]); assert.equal(await page.getByRole('button', { name: 'Edit Stone', exact: true }).count(), 0); assert.equal(await hashFile(path.join(library, stone.original)), stone.hash);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByText('1 material restored to the library.', { exact: true }).waitFor(); assert(!(await state()).assets.find(a => a.id === stone.id).trashedAt);
  report.checks.push('moving saves pending recipes and dirty details, preserves original bytes and memberships, and Undo restores the material');

  await page.getByLabel('Select Stone for export', { exact: true }).check(); await page.getByRole('button', { name: 'Sounds', exact: true }).click(); await page.getByLabel('Select visible assets', { exact: true }).check();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click(); await confirm(); await page.getByRole('button', { name: 'All', exact: true }).click(); assert.equal(await page.locator('.asset-card').count(), 1);
  await page.getByLabel('Search assets').fill('Stone'); assert.equal(await page.locator('.asset-card').count(), 0); await page.getByLabel('Search assets').fill('');
  report.checks.push('batch moves include hidden selections and removed materials disappear from normal search and collection counts');
  await trashNav().click(); assert.equal(await page.locator('.asset-card').count(), 2); assert(await page.getByRole('button', { name: 'Export pack', exact: true }).isDisabled());
  await page.getByLabel('Search assets').fill('Rain'); assert.equal(await page.locator('.asset-card').count(), 1); await page.getByRole('button', { name: 'View Rain in Trash', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.trash-details audio')?.readyState >= 1); assert.equal(await page.getByLabel('Trim start seconds').count(), 0);
  await page.getByLabel('Select Rain to restore', { exact: true }).check(); await page.getByRole('button', { name: 'Restore selected', exact: true }).click(); await page.getByText('1 material restored to the library.', { exact: true }).waitFor();
  assert(!(await state()).assets.find(a => a.id === rain.id).trashedAt); assert((await state()).assets.find(a => a.id === stone.id).trashedAt);
  report.checks.push('Trash has searchable read-only previews, blocks export and can restore only the selected sound');

  await page.getByLabel('Search assets').fill(''); await page.getByRole('button', { name: 'View Stone in Trash', exact: true }).click(); await page.getByText('Keep this unsaved field note', { exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1100, 760); w.webContents.setZoomFactor(1.25); });
  await page.getByRole('button', { name: 'Restore material', exact: true }).scrollIntoViewIfNeeded();
  const bounds = await page.getByRole('button', { name: 'Restore material', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return { right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; }); assert(bounds.right <= bounds.width && bounds.bottom <= bounds.height); await capture('trash-125-percent.png');
  await close(nativeClose); await start(); await trashNav().click(); assert.equal(await page.locator('.asset-card').count(), 1);
  report.checks.push('Trash details are usable at 125 percent zoom and remain available after restarting');

  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, files[0]);
  await page.getByRole('button', { name: 'Import', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'already in Trash; restore them there' }).waitFor(); assert((await state()).assets.find(a => a.id === stone.id).trashedAt); assert.equal((await state()).assets.length, 3);
  report.checks.push('reimporting a trashed original explains where to restore it without creating a duplicate');
  await app.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, root);
  await page.getByRole('button', { name: 'Back up library', exact: true }).click(); await page.getByRole('button', { name: 'Choose backup folder' }).click(); await page.getByRole('status').filter({ hasText: 'Verified backup of 3 materials' }).waitFor();
  const backupPath = path.join(root, (await fs.readdir(root)).find(n => n.includes('-backup-') && !n.endsWith('.partial'))); const backup = new Library(path.resolve('vendor/ffmpeg/bin'));
  try { const snapshot = await backup.open(backupPath); assert(snapshot.assets.find(a => a.id === stone.id).trashedAt); backup.setTrash({ ids: [stone.id], trashed: false }); assert.equal(await hashFile(await backup.resolve(stone.original)), stone.hash); } finally { backup.close(); }
  report.checks.push('a backup made while viewing Trash retains the trashed original and supports restoration');

  await page.getByRole('button', { name: 'View Stone in Trash', exact: true }).click(); await app.evaluate(() => { globalThis.failAction = 'trash'; }); await page.getByRole('button', { name: 'Restore material', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Simulated library write failure' }).waitFor(); assert((await state()).assets.find(a => a.id === stone.id).trashedAt);
  await page.getByRole('button', { name: 'Restore material', exact: true }).click(); await page.getByRole('heading', { name: 'Trash is empty' }).waitFor();
  report.checks.push('a failed restore keeps the material in Trash and a retry succeeds');

  await allNav().click(); await open('Bark'); await page.getByRole('tab', { name: 'Details', exact: true }).click(); await page.getByLabel('Private notes').fill('Save before moving'); await app.evaluate(() => { globalThis.failAction = 'update'; });
  await page.getByRole('button', { name: 'Move this material to Trash', exact: true }).click(); await modal().getByRole('button', { name: 'Move to Trash', exact: true }).click(); await modal().getByRole('alert').filter({ hasText: 'Simulated library write failure' }).waitFor(); assert(!(await state()).assets.find(a => a.id === bark.id).trashedAt);
  await confirm(); assert.equal((await state()).assets.find(a => a.id === bark.id).notes, 'Save before moving'); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByText('1 material restored to the library.', { exact: true }).waitFor();
  report.checks.push('failed detail saves block moving to Trash and retry preserves the latest draft');

  await open('Rain'); await page.getByLabel('Trim start seconds').fill('2'); await page.getByLabel('Trim end seconds').fill('1'); await page.getByRole('button', { name: 'Move this material to Trash', exact: true }).click(); await modal().getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await modal().getByRole('alert').filter({ hasText: 'Correct the invalid recipe fields' }).waitFor(); assert(!(await state()).assets.find(a => a.id === rain.id).trashedAt); await page.keyboard.press('Escape'); await page.getByLabel('Trim end seconds').fill('3'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  report.checks.push('invalid recipe controls stay visible and block the move until corrected');

  await open('Bark'); await page.getByRole('button', { name: 'Move this material to Trash', exact: true }).click(); await app.evaluate(() => { globalThis.delayTrash = true; }); await modal().getByRole('button', { name: 'Move to Trash', exact: true }).click(); await nativeClose();
  const closing = page.getByRole('dialog', { name: 'Close Field Kit?', exact: true }); await closing.getByText('A library change is being saved. Closing waits for it to finish.').waitFor();
  await close(() => closing.getByRole('button', { name: 'Close Field Kit', exact: true }).click()); await start(); assert((await state()).assets.find(a => a.id === bark.id).trashedAt); await trashNav().click(); await page.getByLabel('Select visible assets').check(); await page.getByRole('button', { name: 'Restore selected', exact: true }).click(); await page.getByRole('heading', { name: 'Trash is empty' }).waitFor();
  report.checks.push('normal close waits for a delayed Trash reply and the change survives restart and restoration');
  for (const a of initial.assets) assert.equal(await hashFile(path.join(library, a.original)), a.hash);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []); await close(nativeClose);
} catch (error) { report.failure = error.stack; if (app) await capture('failure.png').catch(() => {}); throw error; }
finally { await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('TRASH_UI_RESULTS ' + JSON.stringify(report)); if (app) { try { process.kill(mainPid); } catch {} await app.close().catch(() => {}); if (child?.exitCode === null) child.kill(); } }
