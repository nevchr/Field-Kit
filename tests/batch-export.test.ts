import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { Library, hashFile } from '../electron/library';
import { Job } from '../electron/media';
import { defaultImage, defaultAudio, defaultExportSettings, type ImageRecipe, type AudioRecipe, type ExportProfile } from '../src/shared';
import { planExport } from '../src/export-plan';
import { texture, recording } from './fixtures';

test('batch preparation and export profiles', { timeout: 180000 }, async t => {
  const root = path.resolve('.test-output', `batch-export-${Date.now()}`), folder = path.join(root, 'Library 雨'), bin = path.resolve('vendor/ffmpeg/bin'), lib = new Library(bin);
  const report = { root, checks: [] as string[] };
  const check = async (name: string, fn: () => Promise<void> | void) => t.test(name, async () => { await fn(); report.checks.push(name); });
  await fs.mkdir(root, { recursive: true }); await lib.open(folder, true);
  const sources = [path.join(root, 'Wall.png'), path.join(root, 'Bark.png'), path.join(root, 'Steps.wav')];
  await texture(sources[0], 410, 600, 480); await texture(sources[1], 411, 480, 640); await recording(sources[2], 51, 2);
  await lib.import(sources, undefined, new Job(), () => {});
  const original = lib.state().assets, image = original.find(a => a.name === 'Wall')!, other = original.find(a => a.name === 'Bark')!, sound = original.find(a => a.kind === 'audio')!;
  const ids = [image.id, other.id, sound.id], collection = lib.collection('Outing');
  lib.update({ id: image.id, name: 'Wall', tags: ['stone'], notes: 'PRIVATE: preserve notes', collections: [collection.id] }); lib.favorite({ id: image.id, favorite: true });
  lib.saveRecipe(image.id, { ...defaultImage, crop: { x: .1, y: .1, w: .7, h: .8 }, rotation: 90, flipX: true, size: 512 });
  lib.saveRecipe(sound.id, { ...defaultAudio(2), start: .1, end: .6 });
  const initial = lib.state().assets;
  const imagePreset = lib.savePreset({ name: 'Warm', kind: 'image', recipe: { ...defaultImage, brightness: 1.3, blend: .2, size: 512 } });
  const audioPreset = lib.savePreset({ name: 'Loop', kind: 'audio', recipe: { ...defaultAudio(10), fadeIn: 3, fadeOut: 3, crossfade: 2, normalize: true, channels: 1 } });
  const batch = { ids, imagePresetId: imagePreset.id, audioPresetId: audioPreset.id };
  let historyId = '', profile: ExportProfile;
  try {
    await check('legacy libraries gain extension tables without changing core records', async () => {
      lib.close(); const db = new DatabaseSync(path.join(folder, 'library.sqlite')); db.exec('DROP TABLE export_preferences; DROP TABLE export_profiles; DROP TABLE batch_history;');
      const before = db.prepare('SELECT data FROM assets ORDER BY id').all(); db.close(); const state = await lib.open(folder);
      assert.deepEqual(state.exportProfiles, []); assert.deepEqual(state.batchHistory, []); assert.equal(state.lastExportProfile, null); assert.deepEqual(lib.db.prepare('SELECT data FROM assets ORDER BY id').all(), before);
    });
    await check('mixed batches prepare real outputs, deduplicate IDs and preserve framing, trim and metadata', async () => {
      const progress: number[] = []; const result = await lib.applyBatchPreset({ ...batch, ids: [...ids, image.id] }, new Job(), p => progress.push(p.completed));
      assert.equal(result.assets.length, 3); assert.deepEqual(progress, [0, 1, 2, 3]); assert.equal(result.history[0].count, 3); historyId = result.history[0].id;
      const a = lib.asset(image.id), r = a.recipe as ImageRecipe, before = initial.find(a => a.id === image.id)!;
      assert.deepEqual(r.crop, (before.recipe as ImageRecipe).crop); assert.equal(r.rotation, 90); assert(r.flipX); assert.equal(r.brightness, 1.3); assert.equal(a.notes, before.notes); assert(a.favorite); assert.deepEqual(a.collections, before.collections);
      const soundRecipe = lib.asset(sound.id).recipe as AudioRecipe; assert.equal(soundRecipe.start, .1); assert.equal(soundRecipe.end, .6); assert(soundRecipe.fadeIn + soundRecipe.fadeOut <= .5 + 1e-9); assert(soundRecipe.crossfade <= 1 / 6 + 1e-9);
      const rendered = await lib.render(sound.id, soundRecipe, new Job()); assert.equal(rendered.info.channels, 1); assert.equal(rendered.info.codec, 'pcm_s16le');
    });
    await check('undo restores exact recipes and prepared status while preserving newer details', () => {
      lib.update({ id: image.id, name: 'Renamed Wall', tags: ['new tag'], notes: 'PRIVATE: newer note', collections: [collection.id] });
      const result = lib.changeBatchHistory({ id: historyId, action: 'undo' }); assert.equal(result.history[0].state, 'undone');
      for (const a of initial) { assert.deepEqual(lib.asset(a.id).recipe, a.recipe); assert.equal(lib.asset(a.id).prepared, a.prepared); }
      assert.equal(lib.asset(image.id).name, 'Renamed Wall'); assert.equal(lib.asset(image.id).notes, 'PRIVATE: newer note');
    });
    await check('redo and batch records survive close and reopen', async () => {
      lib.close(); await lib.open(folder); assert.equal(lib.state().batchHistory[0].state, 'undone'); lib.changeBatchHistory({ id: historyId, action: 'redo' }); lib.close(); await lib.open(folder);
      assert.equal((lib.asset(image.id).recipe as ImageRecipe).brightness, 1.3); assert.equal(lib.state().batchHistory[0].state, 'applied');
    });
    await check('newer individual edits and Trash prevent undo without a partial change', () => {
      const before = lib.asset(other.id).recipe; lib.saveRecipe(other.id, { ...before, brightness: 1.7 }); const changed = lib.state();
      assert.throws(() => lib.changeBatchHistory({ id: historyId, action: 'undo' }), /newer edits/); assert.deepEqual(lib.state(), changed);
      lib.saveRecipe(other.id, before); lib.setTrash({ ids: [sound.id], trashed: true }); const trashed = lib.state();
      assert.throws(() => lib.changeBatchHistory({ id: historyId, action: 'undo' }), /in Trash/); assert.deepEqual(lib.state(), trashed); lib.setTrash({ ids: [sound.id], trashed: false });
    });
    await check('missing presets, wrong media, unknown IDs and oversized batches fail without mutation', async () => {
      const before = lib.state();
      for (const data of [{ ids }, { ids, imagePresetId: audioPreset.id }, { ids, audioPresetId: randomUUID() }, { ids: [image.id, randomUUID()], imagePresetId: imagePreset.id }, { ...batch, ids: Array.from({ length: 1001 }, () => image.id) }]) await assert.rejects(lib.applyBatchPreset(data, new Job(), () => {}));
      assert.deepEqual(lib.state(), before);
    });
    await check('cancel during preparation saves no batch recipes or history', async () => {
      lib.changeBatchHistory({ id: historyId, action: 'undo' }); const before = lib.state(), job = new Job();
      await assert.rejects(lib.applyBatchPreset(batch, job, p => { if (p.completed === 1) job.cancel(); }), /Cancelled/); assert.deepEqual(lib.state(), before);
    });
    await check('processing failure after an earlier result saves no batch recipes', async () => {
      const before = lib.state(), render = lib.render.bind(lib); let calls = 0;
      lib.render = async (...args) => { if (++calls === 2) throw new Error('Injected decoder failure'); return render(...args); };
      try { await assert.rejects(lib.applyBatchPreset(batch, new Job(), () => {}), /decoder failure/); assert.deepEqual(lib.state(), before); } finally { lib.render = render; }
    });
    await check('database faults roll back apply, undo and redo as a whole', async () => {
      const abort = () => lib.db.exec(`CREATE TRIGGER fail_batch BEFORE UPDATE ON assets WHEN NEW.id='${other.id}' BEGIN SELECT RAISE(ABORT, 'Injected batch write failure'); END;`), release = () => lib.db.exec('DROP TRIGGER fail_batch');
      let before = lib.state(); abort(); try { await assert.rejects(lib.applyBatchPreset(batch, new Job(), () => {}), /batch write failure/); assert.deepEqual(lib.state(), before); } finally { release(); }
      historyId = (await lib.applyBatchPreset(batch, new Job(), () => {})).history[0].id;
      before = lib.state(); abort(); try { assert.throws(() => lib.changeBatchHistory({ id: historyId, action: 'undo' }), /batch write failure/); assert.deepEqual(lib.state(), before); } finally { release(); }
      lib.changeBatchHistory({ id: historyId, action: 'undo' }); before = lib.state(); abort(); try { assert.throws(() => lib.changeBatchHistory({ id: historyId, action: 'redo' }), /batch write failure/); assert.deepEqual(lib.state(), before); } finally { release(); }
    });
    await check('types without a chosen preset are skipped and completed history is bounded to ten', async () => {
      const soundBefore = lib.asset(sound.id), cool = lib.savePreset({ name: 'Cool', kind: 'image', recipe: { ...defaultImage, brightness: .8, size: 512 } });
      for (let i = 0; i < 12; i++) await lib.applyBatchPreset({ ids, imagePresetId: (i % 2 ? cool : imagePreset).id }, new Job(), () => {});
      assert.deepEqual(lib.asset(sound.id), soundBefore); assert.equal(lib.state().batchHistory.length, 10); assert.equal(lib.state().batchHistory[0].count, 2);
      assert.throws(() => lib.changeBatchHistory({ id: historyId, action: 'redo' }), /last ten/); historyId = lib.state().batchHistory[0].id;
    });
    await check('profiles create, update, rename and duplicate without changing materials', () => {
      const before = lib.state().assets;
      profile = lib.saveExportProfile({ name: 'Mobile', settings: { ...defaultExportSettings, textureSize: 512, channels: 1, normalize: 'on', prefix: 'Game ', spaces: 'underscore', letterCase: 'lower' }, author: 'Creator', attribution: 'User supplied credit' });
      profile = lib.saveExportProfile({ ...profile, name: 'Small pack', settings: { ...profile.settings, prefix: 'field_' } });
      const { id: _id, ...copy } = profile; const duplicate = lib.saveExportProfile({ ...copy, name: 'Small pack copy' }); assert.notEqual(duplicate.id, profile.id); assert.deepEqual(duplicate.settings, profile.settings);
      lib.deleteExportProfile(duplicate.id); assert.deepEqual(lib.state().assets, before);
    });
    await check('profile validation rejects duplicate names, unsafe payloads and invalid settings', () => {
      const { id: _id, ...copy } = profile; const before = lib.state();
      for (const input of [{ ...copy, name: ' small PACK ' }, { ...copy, name: 'Bad', settings: { ...copy.settings, textureSize: 4096 } }, { ...copy, name: 'Bad', destination: '../somewhere' }, { ...profile, id: randomUUID() }, { ...copy, name: '' }]) assert.throws(() => lib.saveExportProfile(input));
      assert.deepEqual(lib.state(), before);
    });
    await check('file plans resolve collisions and reserved names with deterministic numbering', () => {
      const sample = lib.state().assets.filter(a => a.kind === 'image');
      const names = planExport([{ ...sample[0], name: 'CON' }, { ...sample[1], name: 'con' }, { ...sample[0], id: randomUUID(), name: '../odd\\name. ' }], { ...defaultExportSettings, letterCase: 'lower' });
      assert.equal(names[0].output, 'textures/asset-con.png'); assert.equal(names[1].output, 'textures/asset-con-2.png'); assert(!names[2].output.slice('textures/'.length).includes('/')); assert(!names[2].output.includes('\\'));
      const numbered = planExport(sample, { ...defaultExportSettings, prefix: 'test_', numbering: 'prefix', spaces: 'dash' }); assert(numbered[0].output.startsWith('textures/001-test_')); assert(numbered[1].output.startsWith('textures/002-test_'));
    });
    await check('export applies overrides and exact preview names without changing saved recipes', async () => {
      for (const id of [image.id, other.id]) lib.saveRecipe(id, { ...lib.asset(id).recipe, size: 1024 });
      lib.update({ id: image.id, name: 'Same Name', tags: ['stone'], notes: 'PRIVATE: newer note', collections: [collection.id] }); lib.update({ id: other.id, name: 'same name', tags: [], notes: '', collections: [] });
      const before = lib.state().assets, selected = ids.map(id => lib.asset(id)), planned = planExport(selected, profile.settings), destination = path.join(root, 'Profile pack.zip');
      const result = await lib.export({ ids, settings: profile.settings, author: profile.author, attribution: profile.attribution, profileId: profile.id }, destination, new Job(), () => {}); assert(!result.warning);
      assert.deepEqual(lib.state().assets, before); assert.equal(lib.state().lastExportProfile, profile.id);
      const extracted = path.join(root, 'extracted'); const extractedResult = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${destination.replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}'`], { windowsHide: true }); assert.equal(extractedResult.status, 0, extractedResult.stderr.toString());
      const raw = await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8'), manifest = JSON.parse(raw); assert(!raw.includes('PRIVATE')); assert(!raw.includes(folder)); assert.equal(manifest.author, 'Creator'); assert.equal(manifest.attribution, 'User supplied credit'); assert.deepEqual(manifest.assets.map((a: { path: string }) => a.path), planned.map(a => a.output));
      for (const a of manifest.assets) { const file = path.join(extracted, a.path); if (a.type === 'texture') { const metadata = await sharp(file).metadata(); assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); } else { const info = await lib.media.probe(file, new Job()); assert.equal(info.channels, 1); assert.equal(info.sampleRate, 48000); assert.equal(info.codec, 'pcm_s16le'); const expected = await lib.render(sound.id, planned.find(p => p.asset.id === sound.id)!.recipe, new Job()); assert.equal(await hashFile(file), await hashFile(await lib.resolve(expected.path))); assert(Math.abs(expected.info.peakDb! + 1) < .01); } }
    });
    await check('cancelled and failed exports do not remember another profile or publish a ZIP', async () => {
      const destination = path.join(root, 'cancelled.zip'), before = lib.state().lastExportProfile, job = new Job(); job.cancel();
      await assert.rejects(lib.export({ ids, settings: defaultExportSettings, author: '', attribution: '' }, destination, job, () => {}), /Cancelled/); await assert.rejects(fs.access(destination)); assert.equal(lib.state().lastExportProfile, before);
      await assert.rejects(lib.export({ ids, profileId: randomUUID(), author: '', attribution: '' }, destination, new Job(), () => {}), /no longer exists/); await assert.rejects(fs.access(destination));
    });
    await check('failure to remember a choice reports a completed export with a warning', async () => {
      lib.db.exec("CREATE TRIGGER fail_preference BEFORE UPDATE ON export_preferences BEGIN SELECT RAISE(ABORT, 'Injected preference failure'); END;");
      try { const destination = path.join(root, 'Remember warning.zip'), result = await lib.export({ ids: [image.id], author: '', attribution: '' }, destination, new Job(), () => {}); assert(result.warning); await fs.access(destination); assert.equal(lib.state().lastExportProfile, profile.id); } finally { lib.db.exec('DROP TRIGGER fail_preference'); }
    });
    await check('profiles, last choice and reversible batch history survive moved backups and restart', async () => {
      await lib.applyBatchPreset({ ids, imagePresetId: imagePreset.id }, new Job(), () => {});
      const before = lib.state(), copied = await lib.backup(root, new Job(), () => {}), moved = path.join(root, 'Moved backup'); await fs.rename(copied.path, moved);
      const reopened = new Library(bin); try { assert.deepEqual(await reopened.open(moved), before); assert.equal(reopened.state().lastExportProfile, profile.id); assert.equal(reopened.state().batchHistory.length, 10); reopened.changeBatchHistory({ id: before.batchHistory[0].id, action: 'undo' }); reopened.changeBatchHistory({ id: before.batchHistory[0].id, action: 'redo' }); assert.deepEqual(reopened.state(), before); } finally { reopened.close(); }
      lib.close(); assert.deepEqual(await lib.open(folder), before);
    });
    await check('invalid profile and history data in another library cannot replace the active library', async () => {
      const before = lib.state();
      for (const table of ['batch_history', 'export_profiles']) { const copy = (await lib.backup(root, new Job(), () => {})).path, db = new DatabaseSync(path.join(copy, 'library.sqlite')); db.exec(`UPDATE ${table} SET data='{}'`); db.close(); await assert.rejects(lib.open(copy), /could not be read/); assert.deepEqual(lib.state(), before); }
    });
    await check('profile deletion clears its remembered choice and preserves all materials and original bytes', async () => {
      const before = lib.state().assets; lib.deleteExportProfile(profile.id); assert.equal(lib.state().lastExportProfile, null); assert.deepEqual(lib.state().assets, before);
      for (const asset of original) assert.equal(await hashFile(await lib.resolve(asset.original)), asset.hash);
      assert.equal((await fs.readdir(path.join(folder, 'originals'))).length, 3);
    });
  } finally { lib.close(); await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('BATCH_EXPORT_RESULTS ' + JSON.stringify(report)); }
});
