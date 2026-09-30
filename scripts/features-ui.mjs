import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Library, hashFile } from '../electron/library.ts';
import { Job } from '../electron/media.ts';
import { defaultImage, defaultAudio } from '../src/shared.ts';
import { texture, recording } from '../tests/fixtures.ts';

const require = createRequire(import.meta.url), executable = process.env.FIELD_KIT_EXECUTABLE;
const root = path.resolve('.test-output', `features-ui-${Date.now()}`), library = path.join(root, 'Field library'), profile = path.join(root, 'profile');
await fs.mkdir(profile, { recursive: true });
const lib = new Library(path.resolve('vendor/ffmpeg/bin')); await lib.open(library, true);
const sources = [path.join(root, 'Stone.png'), path.join(root, 'Bark.png'), path.join(root, 'Rain.wav'), path.join(root, 'Click.wav')];
await texture(sources[0], 888, 800, 500); await texture(sources[1], 889, 500, 700); await recording(sources[2], 111, 20); await recording(sources[3], 112, 1);
await lib.import(sources, undefined, new Job(), () => {});
const originals = lib.state().assets, stone = originals.find(a => a.name === 'Stone'), bark = originals.find(a => a.name === 'Bark'), rain = originals.find(a => a.name === 'Rain'), click = originals.find(a => a.name === 'Click');
lib.collection('Forest'); lib.collection('Project');
lib.update({ id: stone.id, name: stone.name, tags: ['existing'], notes: 'Private field note', collections: [] });
lib.saveRecipe(stone.id, { ...defaultImage, size: 512 });
lib.saveRecipe(bark.id, { ...defaultImage, crop: { x: .1, y: .2, w: .6, h: .5 }, rotation: 90, flipX: true, size: 512 });
lib.saveRecipe(rain.id, { ...defaultAudio(20), fadeIn: 8, fadeOut: 9, crossfade: 5, normalize: true, channels: 1 });
lib.close(); await fs.writeFile(path.join(profile, 'last-library.json'), JSON.stringify({ library }));
const report = { root, executable: executable || 'development', checks: [], errors: [], network: [] };
let app, page, mainPid, child;
const state = () => page.evaluate(() => window.fieldKit.getState());
const start = async () => {
  app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : ['.']), `--user-data-dir=${profile}`], env: executable ? { ...process.env, PATH: 'C:\\Windows\\System32;C:\\Windows' } : process.env, timeout: 45000 });
  child = app.process(); mainPid = await app.evaluate(() => process.pid); report.version = await app.evaluate(({ app }) => app.getVersion());
  page = await app.firstWindow(); page.setDefaultTimeout(18000); await page.context().setOffline(true);
  page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) report.network.push(r.url()); });
  await page.getByRole('heading', { name: 'All materials', exact: true }).waitFor();
};
const open = async name => { await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click(); await page.locator('.recipe-status').filter({ hasText: /export-ready|Original ·/ }).waitFor(); };
const chooseFolder = folder => app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: !folder, filePaths: folder ? [folder] : [] }); }, folder);
const savePreset = async name => { await page.getByRole('button', { name: 'Save current settings as preset', exact: true }).click(); await page.getByLabel('Preset name', { exact: true }).fill(name); await page.getByRole('button', { name: 'Save preset', exact: true }).click(); };
const capture = async name => { const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await fs.writeFile(path.join(root, name), Buffer.from(png, 'base64')); };
const cleanClose = async () => { const closed = app.waitForEvent('close', { timeout: 18000 }); await app.evaluate(({ app }) => app.quit()); await closed; app = undefined; };
try {
  await start();
  await page.getByRole('button', { name: 'Favorite Stone', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Favorite Stone"]')?.getAttribute('aria-pressed') === 'true');
  await page.getByLabel('Material status', { exact: true }).selectOption('favorites'); assert.equal(await page.locator('.asset-card').count(), 1);
  await page.getByLabel('Material status', { exact: true }).selectOption('original'); assert.equal(await page.locator('.asset-card').count(), 1);
  await page.getByLabel('Material status', { exact: true }).selectOption('all'); await page.getByLabel('Sort materials').selectOption('name');
  assert.deepEqual(await page.locator('.card-title strong').allTextContents(), ['Bark', 'Click', 'Rain', 'Stone']);
  report.checks.push('favorite toggle, favorite/unprepared filters and natural name sorting work in the catalog');

  await page.getByLabel('Select Stone for export', { exact: true }).check();
  await page.getByRole('button', { name: 'Sounds', exact: true }).click(); await page.getByLabel('Select visible assets', { exact: true }).check();
  assert(await page.getByText('3 selected', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'All', exact: true }).click();
  report.checks.push('selecting visible assets preserves earlier selections outside the current filter');
  await page.getByRole('button', { name: 'Organize', exact: true }).click();
  const batchDialog = page.getByRole('dialog', { name: 'Organize selected materials' });
  await batchDialog.getByRole('button', { name: 'Apply to selected' }).click(); await batchDialog.getByRole('alert').waitFor();
  await page.getByLabel('Batch tags').fill('forest, collected, forest'); await batchDialog.getByLabel('Forest', { exact: true }).check();
  await batchDialog.getByRole('button', { name: 'Apply to selected' }).click(); await batchDialog.waitFor({ state: 'hidden' });
  let current = await state(); assert.deepEqual(current.assets.find(a => a.id === stone.id).tags, ['existing', 'forest', 'collected']); assert.equal(current.assets.find(a => a.id === stone.id).notes, 'Private field note');
  assert(current.assets.find(a => a.id === click.id).tags.includes('forest')); assert(!current.assets.find(a => a.id === bark.id).tags.includes('forest'));
  report.checks.push('batch dialog validates empty changes and atomically adds deduplicated tags and memberships to selected materials');
  await page.getByRole('button', { name: 'Organize', exact: true }).click(); await page.getByLabel('Organize action').selectOption('remove'); await page.getByLabel('Batch tags').fill('collected');
  await batchDialog.getByRole('button', { name: 'Apply to selected' }).click(); await batchDialog.waitFor({ state: 'hidden' });
  assert.deepEqual((await state()).assets.find(a => a.id === stone.id).tags, ['existing', 'forest']);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  report.checks.push('batch removal keeps unrelated tags, notes and collection memberships');

  await open('Stone');
  await page.getByLabel('Brightness', { exact: true }).fill('1.4'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  await savePreset('Warm surface'); await page.getByRole('dialog', { name: 'Save processing preset' }).waitFor({ state: 'hidden' });
  await savePreset('warm surface'); await page.getByRole('dialog', { name: 'Save processing preset' }).getByRole('alert').filter({ hasText: 'already exists' }).waitFor(); await page.keyboard.press('Escape');
  await open('Bark'); await page.getByLabel('Texture preset').selectOption({ label: 'Warm surface' }); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Brightness"]').value === '1.4'); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  current = await state(); const applied = current.assets.find(a => a.id === bark.id).recipe; assert.equal(applied.rotation, 90); assert.deepEqual(applied.crop, { x: .1, y: .2, w: .6, h: .5 }); assert.equal(applied.brightness, 1.4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForFunction(() => document.querySelector('input[aria-label="Brightness"]').value === '1');
  await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  report.checks.push('texture presets save, reject duplicate names, apply across materials without altering framing, and undo');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const before = page.getByAltText('Original photograph before edits'), after = page.getByAltText('Texture after edits');
  await page.waitForFunction(() => [...document.querySelectorAll('.texture-comparison img')].length === 2 && [...document.querySelectorAll('.texture-comparison img')].every(i => i.complete && i.naturalWidth));
  assert((await before.getAttribute('src')).includes('/originals/')); assert((await after.getAttribute('src')).includes('/cache/'));
  assert.equal(await hashFile(path.join(library, bark.original)), bark.hash); await capture('texture-comparison.png');
  report.checks.push('comparison displays decoded original and processed texture side by side without changing original bytes');
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1100, 760); w.webContents.setZoomFactor(1.25); });
  const controls = await page.locator('.preview-toolbar').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth, overflow: el.scrollWidth > el.clientWidth }; });
  assert(controls.right <= controls.width && !controls.overflow); await capture('features-125-percent.png');
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 940); w.webContents.setZoomFactor(1); });
  report.checks.push('comparison controls fit a 1100 by 760 window at 125 percent scale');

  await open('Rain'); await savePreset('Soft loop'); await page.getByRole('dialog', { name: 'Save processing preset' }).waitFor({ state: 'hidden' });
  await open('Click'); await page.getByLabel('Trim start seconds').fill('.2'); await page.getByLabel('Trim end seconds').fill('.8');
  await page.getByLabel('Sound preset').selectOption({ label: 'Soft loop' }); await page.getByRole('button', { name: 'Apply', exact: true }).click(); await page.getByText('Saved · preview is export-ready', { exact: true }).waitFor();
  const short = (await state()).assets.find(a => a.id === click.id).recipe; assert.equal(short.start, .2); assert.equal(short.end, .8); assert.equal(short.channels, 1); assert(short.fadeIn + short.fadeOut <= .6000001); assert(short.crossfade <= .2000001);
  await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1); await capture('sound-preset.png');
  report.checks.push('sound presets preserve trim, fit fades and crossfade to a short clip and produce playable PCM output');
  await page.getByRole('button', { name: 'Delete selected preset' }).click(); await page.getByRole('dialog', { name: 'Delete preset?' }).getByRole('button', { name: 'Delete preset', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete preset?' }).waitFor({ state: 'hidden' }); assert.deepEqual((await state()).assets.find(a => a.id === click.id).recipe, short);
  report.checks.push('preset deletion requires its confirmation and leaves applied recipes intact');

  await chooseFolder(null); await page.getByRole('button', { name: 'Back up library', exact: true }).click(); await page.getByRole('button', { name: 'Choose backup folder' }).click();
  await page.locator('.job-progress').waitFor({ state: 'hidden' }); assert(!(await fs.readdir(root)).some(n => n.includes('-backup-')));
  await chooseFolder(library); await page.getByRole('button', { name: 'Back up library', exact: true }).click(); await page.getByRole('button', { name: 'Choose backup folder' }).click();
  await page.getByRole('alert').filter({ hasText: 'outside the current library' }).waitFor();
  report.checks.push('backup destination cancellation creates nothing and a destination inside the library is rejected');

  await open('Stone'); await page.getByRole('tab', { name: 'Details', exact: true }).click(); await page.getByLabel('Private notes').fill('Save this draft into the complete backup');
  await chooseFolder(root); await page.getByRole('button', { name: 'Back up library', exact: true }).click(); await page.getByRole('button', { name: 'Choose backup folder' }).click();
  await page.getByRole('status').filter({ hasText: 'Verified backup of 4 materials' }).waitFor();
  const backupName = (await fs.readdir(root)).find(n => n.includes('-backup-') && !n.endsWith('.partial')); assert(backupName); report.backup = path.join(root, backupName);
  const backup = new Library(path.resolve('vendor/ffmpeg/bin'));
  try { const copied = await backup.open(report.backup); assert.equal(copied.assets.find(a => a.id === stone.id).notes, 'Save this draft into the complete backup'); assert(copied.assets.find(a => a.id === stone.id).favorite); assert.equal(copied.presets[0].name, 'Warm surface'); for (const a of copied.assets) assert.equal(await hashFile(await backup.resolve(a.original)), a.hash); } finally { backup.close(); }
  report.checks.push('backup saves dirty details and includes verified originals, recipes, collections, favorites and presets');
  await chooseFolder(report.backup); await page.getByRole('button', { name: 'Open library', exact: true }).click(); await page.getByText('Library ready. Originals stay safe; edits live here.', { exact: true }).waitFor();
  await cleanClose(); await start(); assert.equal((await state()).presets[0].name, 'Warm surface');
  await page.getByLabel('Material status').selectOption('favorites'); assert.equal(await page.locator('.asset-card').count(), 1); await open('Stone');
  report.checks.push('completed backup opens through the normal library picker and survives application restart');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []); await cleanClose();
} catch (error) { report.failure = error.stack; if (app) { await capture('failure.png').catch(() => {}); } throw error; }
finally {
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('FEATURE_UI_RESULTS ' + JSON.stringify(report));
  if (app) { if (mainPid) { try { process.kill(mainPid); } catch {} } await app.close().catch(() => {}); if (child && child.exitCode === null) child.kill(); }
}
