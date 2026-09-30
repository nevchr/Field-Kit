import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Library, hashFile } from '../electron/library';
import { Job } from '../electron/media';
import { defaultImage, defaultAudio } from '../src/shared';
import { texture, recording } from './fixtures';

test('Trash and Restore preserve the complete material', { timeout: 120000 }, async t => {
  const root = path.resolve('.test-output', `trash-${Date.now()}`), folder = path.join(root, 'Library 雨'), bin = path.resolve('vendor/ffmpeg/bin'), lib = new Library(bin);
  const report = { root, checks: [] as string[] };
  const check = async (name: string, fn: () => Promise<void> | void) => t.test(name, async () => { await fn(); report.checks.push(name); });
  await fs.mkdir(root, { recursive: true }); await lib.open(folder, true);
  const imageFile = path.join(root, 'Wall.png'), soundFile = path.join(root, 'Steps.wav');
  await texture(imageFile, 212, 640, 480); await recording(soundFile, 19, 2);
  await lib.import([imageFile, soundFile], undefined, new Job(), () => {});
  const image = lib.state().assets.find(a => a.kind === 'image')!, audio = lib.state().assets.find(a => a.kind === 'audio')!, collection = lib.collection('Trail');
  lib.update({ id: image.id, name: 'Wall', tags: ['stone'], notes: 'Private note', collections: [collection.id] });
  lib.favorite({ id: image.id, favorite: true }); lib.saveRecipe(image.id, { ...defaultImage, brightness: 1.3, size: 512 }); lib.saveRecipe(audio.id, { ...defaultAudio(2), start: .1, end: 1.8, normalize: true });
  const saved = lib.state(), hashes = new Map(await Promise.all(saved.assets.map(async a => [a.id, await hashFile(await lib.resolve(a.original))] as const)));
  const ids = saved.assets.map(a => a.id);
  try {
    await check('older libraries gain Trash without changing core asset records or source files', async () => {
      lib.close(); const old = new DatabaseSync(path.join(folder, 'library.sqlite')); old.exec('DROP TABLE trashed_assets'); const before = old.prepare('SELECT data FROM assets ORDER BY id').all(); old.close();
      assert.deepEqual(await lib.open(folder), saved); assert.deepEqual(lib.db.prepare('SELECT data FROM assets ORDER BY id').all(), before);
    });
    await check('single and batch moves preserve originals, recipes, notes, favorites and collections after reopen', async () => {
      lib.setTrash({ ids: [image.id], trashed: true }); lib.setTrash({ ids: [audio.id], trashed: true });
      lib.close(); const state = await lib.open(folder); assert(state.assets.every(a => a.trashedAt));
      for (const a of state.assets) { const { trashedAt, ...record } = a; assert(trashedAt); assert.deepEqual(record, saved.assets.find(v => v.id === a.id)); assert.equal(await hashFile(await lib.resolve(a.original)), hashes.get(a.id)); }
      assert.equal((await fs.readdir(path.join(folder, 'originals'))).length, 2);
    });
    await check('trashed materials cannot be edited, rendered, organized, favorited or exported through stale requests', async () => {
      assert.throws(() => lib.saveRecipe(image.id, defaultImage), /in Trash/);
      assert.throws(() => lib.update({ id: image.id, name: 'Changed', tags: [], notes: '', collections: [] }), /in Trash/);
      assert.throws(() => lib.organize({ ids: [image.id], tags: ['changed'], collections: [], mode: 'add' }), /in Trash/);
      assert.throws(() => lib.favorite({ id: image.id, favorite: false }), /in Trash/);
      await assert.rejects(lib.render(image.id, defaultImage, new Job()), /in Trash/);
      const destination = path.join(root, 'must-not-export.zip');
      await assert.rejects(lib.export({ ids, author: '', attribution: '' }, destination, new Job(), () => {}), /in Trash/); await assert.rejects(fs.access(destination));
    });
    await check('duplicate imports identify items in Trash without silently restoring or changing memberships', async () => {
      const other = lib.collection('Other outing'), before = lib.asset(image.id, true);
      const result = await lib.import([imageFile], other.id, new Job(), () => {});
      assert.equal(result.duplicates, 1); assert.equal(result.inTrash, 1); assert.equal(result.added, 0); assert.equal(result.failed.length, 0); assert.deepEqual(lib.asset(image.id, true), before); assert.equal(lib.state().assets.length, 2);
    });
    await check('repeated moves and restores are idempotent and restore the exact saved recipe', async () => {
      const timestamp = lib.asset(image.id, true).trashedAt;
      lib.setTrash({ ids: [image.id, image.id], trashed: true }); assert.equal(lib.asset(image.id, true).trashedAt, timestamp);
      lib.setTrash({ ids, trashed: false }); lib.setTrash({ ids, trashed: false });
      assert.deepEqual(lib.asset(image.id), saved.assets.find(a => a.id === image.id));
      const rendered = await lib.render(image.id, lib.asset(image.id).recipe, new Job()); assert.equal(rendered.info.width, 512);
      await lib.export({ ids, author: '', attribution: '' }, path.join(root, 'restored-pack.zip'), new Job(), () => {});
    });
    await check('invalid requests and an unknown ID never partially move a batch', () => {
      const before = lib.state();
      for (const request of [{ ids: [], trashed: true }, { ids: [image.id, randomUUID()], trashed: true }, { ids: ['../originals'], trashed: true }, { ids, trashed: 'true' }, { ids, trashed: true, destination: root }]) assert.throws(() => lib.setTrash(request));
      assert.deepEqual(lib.state(), before);
    });
    await check('a database failure rolls back both move and restore transactions', () => {
      const before = lib.state();
      lib.db.exec(`CREATE TRIGGER fail_trash BEFORE INSERT ON trashed_assets WHEN NEW.id='${audio.id}' BEGIN SELECT RAISE(ABORT, 'Simulated trash disk failure'); END;`);
      try { assert.throws(() => lib.setTrash({ ids: [image.id, audio.id], trashed: true }), /Simulated trash/); assert.deepEqual(lib.state(), before); } finally { lib.db.exec('DROP TRIGGER fail_trash'); }
      lib.setTrash({ ids, trashed: true }); const trashed = lib.state();
      lib.db.exec(`CREATE TRIGGER fail_restore BEFORE DELETE ON trashed_assets WHEN OLD.id='${audio.id}' BEGIN SELECT RAISE(ABORT, 'Simulated restore disk failure'); END;`);
      try { assert.throws(() => lib.setTrash({ ids: [image.id, audio.id], trashed: false }), /Simulated restore/); assert.deepEqual(lib.state(), trashed); } finally { lib.db.exec('DROP TRIGGER fail_restore'); }
    });
    await check('backups include Trash, remain restorable after a move and preserve file hashes', async () => {
      const expected = lib.state(), backup = await lib.backup(root, new Job(), () => {}), moved = path.join(root, 'Moved backup');
      await fs.rename(backup.path, moved); const restored = new Library(bin);
      try { assert.deepEqual(await restored.open(moved), expected); restored.setTrash({ ids, trashed: false }); for (const a of restored.state().assets) { assert(!a.trashedAt); assert.equal(await hashFile(await restored.resolve(a.original)), hashes.get(a.id)); } await restored.render(audio.id, restored.asset(audio.id).recipe, new Job()); } finally { restored.close(); }
    });
    await check('malformed Trash metadata in a candidate library cannot replace the active library', async () => {
      const badFolder = (await lib.backup(root, new Job(), () => {})).path, db = new DatabaseSync(path.join(badFolder, 'library.sqlite'));
      db.prepare('UPDATE trashed_assets SET trashed_at=?').run('invalid timestamp'); db.close();
      const before = lib.state(); await assert.rejects(lib.open(badFolder), /could not be read/); assert.deepEqual(lib.state(), before);
    });
    await check('final restore survives reopening with original hashes and metadata unchanged', async () => {
      lib.setTrash({ ids, trashed: false }); lib.close(); const state = await lib.open(folder);
      for (const a of state.assets) { assert(!a.trashedAt); assert.deepEqual(a, saved.assets.find(v => v.id === a.id)); assert.equal(await hashFile(await lib.resolve(a.original)), hashes.get(a.id)); }
    });
  } finally { lib.close(); await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('TRASH_RESULTS ' + JSON.stringify(report)); }
});
