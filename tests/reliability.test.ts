import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { Library, hashFile } from '../electron/library';
import { Job, WAVEFORM_VERSION } from '../electron/media';
import { RecipeSaves } from '../src/recipe-saves';
import { defaultImage, defaultAudio, type Asset, type ImageRecipe } from '../src/shared';
import { texture } from './fixtures';

const bin = path.resolve('vendor/ffmpeg/bin');

test('pending recipes survive navigation, late replies and a library-session change', async () => {
  const asset = { id: 'fixture', recipe: structuredClone(defaultImage), name: 'Material' } as Asset;
  const replies: ((value: Asset) => void)[] = [];
  const saves = new RecipeSaves(() => new Promise(resolve => replies.push(resolve)));
  const received: Asset[] = [], onSaved = (a: Asset) => received.push(a);
  const edited = { ...defaultImage, brightness: 1.23 };
  const first = saves.save(asset, edited, onSaved);
  // A different editor instance initializes before the first reply arrives.
  assert.equal((saves.recipe(asset) as ImageRecipe).brightness, 1.23);
  const next = { ...saves.recipe(asset), contrast: 1.1 } as ImageRecipe;
  const second = saves.save(asset, next, onSaved);
  replies[1]({ ...asset, recipe: next, prepared: true }); await second;
  replies[0]({ ...asset, recipe: edited, prepared: true }); await first;
  assert.equal(received.length, 1); assert.deepEqual(received[0].recipe, next);
  assert.equal((saves.recipe(asset) as ImageRecipe).brightness, 1.23);
  const oldSession = saves.save(asset, { ...next, brightness: 1.4 }, onSaved);
  saves.reset(); replies[2]({ ...asset, recipe: { ...next, brightness: 1.4 } }); await oldSession;
  assert.equal(received.length, 1); assert.deepEqual(saves.recipe(asset), defaultImage);
});

test('failed saves stay visible, prevent flush and retry the latest draft', async () => {
  const asset = { id: 'fixture', recipe: defaultImage, name: 'Material' } as Asset;
  let failing = true;
  const saves = new RecipeSaves(async (_id, recipe) => { if (failing) throw new Error('Disk full'); return { ...asset, recipe, prepared: true }; });
  const edited = { ...defaultImage, brightness: 1.5 };
  await assert.rejects(saves.save(asset, edited, () => {}), /Disk full/);
  assert.equal(saves.getSnapshot().failed.length, 1);
  await assert.rejects(saves.flush(), /Disk full/);
  failing = false; let stored: Asset | undefined;
  await saves.retry(asset => { stored = asset; }); await saves.flush();
  assert.deepEqual(stored!.recipe, edited); assert.equal(saves.getSnapshot().failed.length, 0); assert.equal(saves.getSnapshot().pending, 0);
});

test('library, cache and stereo audit regressions', { timeout: 120000 }, async t => {
  const root = path.resolve('.test-output', `reliability-${Date.now()}`), good = path.join(root, 'healthy-library');
  await fs.mkdir(root, { recursive: true });
  const source = path.join(root, 'source.png'); await texture(source, 2026, 640, 480);
  const lib = new Library(bin); await lib.open(good, true); await lib.import([source], undefined, new Job(), () => {});
  const image = lib.state().assets[0], recipe = { ...defaultImage, size: 512 as const };
  const observations: Record<string, unknown> = { root };
  try {
    await t.test('damaged, missing and unsupported databases preserve the active library', async () => {
      const before = lib.db;
      const damaged = path.join(root, 'damaged'); await fs.mkdir(damaged);
      const marker = JSON.stringify({ format: 'field-kit', version: 1, name: 'Fault fixture' });
      await fs.writeFile(path.join(damaged, 'field-kit.json'), marker);
      await fs.writeFile(path.join(damaged, 'library.sqlite'), 'Damaged SQLite fixture');
      await assert.rejects(lib.open(damaged), /Could not open/);
      assert.equal(lib.db, before); assert.equal(lib.root, good); assert.equal(lib.state().assets[0].id, image.id);
      const missing = path.join(root, 'missing'); await fs.mkdir(missing); await fs.writeFile(path.join(missing, 'field-kit.json'), marker);
      await assert.rejects(lib.open(missing), /missing library.sqlite/); await assert.rejects(fs.access(path.join(missing, 'library.sqlite')));
      const future = path.join(root, 'future'), candidate = new Library(bin); await candidate.open(future, true); candidate.db.exec('PRAGMA user_version=99'); candidate.close();
      await assert.rejects(lib.open(future), /unsupported database version/);
      const check = new DatabaseSync(path.join(future, 'library.sqlite')); assert.equal((check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 99); check.close();
      assert.equal((await lib.open(good)).assets[0].id, image.id);
      observations.libraryFailureRecovery = true;
    });
    await t.test('malformed asset records cannot replace the current library', async () => {
      const malformed = path.join(root, 'malformed'), candidate = new Library(bin); await candidate.open(malformed, true);
      candidate.db.prepare('INSERT INTO assets(id,hash,data) VALUES(?,?,?)').run(image.id, image.hash, '{}'); candidate.close();
      await assert.rejects(lib.open(malformed), /database could not be read/);
      assert.equal(lib.state().assets[0].id, image.id);
    });
    await t.test('close releases the SQLite handle even when checkpointing fails', () => {
      const candidate = new Library(bin), database = new DatabaseSync(':memory:'); candidate.db = database;
      database.exec = () => { throw new Error('Checkpoint failure'); };
      assert.throws(() => candidate.close(), /Checkpoint failure/); assert.equal(candidate.db, undefined);
      assert.throws(() => database.prepare('SELECT 1'), /not open|closed/i);
    });
    await t.test('truncated and equal-size corrupt cache bytes regenerate', async () => {
      lib.saveRecipe(image.id, recipe);
      const rendered = await lib.render(image.id, recipe, new Job()), full = await lib.resolve(rendered.path), digest = await hashFile(full);
      await fs.writeFile(full, 'truncated'); await lib.render(image.id, recipe, new Job()); assert.equal(await hashFile(full), digest);
      const bytes = await fs.readFile(full); bytes[100] ^= 0xff; await fs.writeFile(full, bytes);
      await lib.render(image.id, recipe, new Job()); assert.equal(await hashFile(full), digest);
      assert.equal((await sharp(full).metadata()).width, 512); observations.cacheRegeneration = true;
    });
    await t.test('invalid cache metadata cannot redirect export to the original', async () => {
      const rendered = await lib.render(image.id, recipe, new Job()), full = await lib.resolve(rendered.path);
      const record = JSON.parse(await fs.readFile(full + '.json', 'utf8')); record.path = image.original; record.info.width = 2048;
      await fs.writeFile(full + '.json', JSON.stringify(record));
      const recovered = await lib.render(image.id, recipe, new Job()); assert.equal(recovered.path, rendered.path); assert.equal(recovered.info.width, 512);
      assert.equal('path' in JSON.parse(await fs.readFile(full + '.json', 'utf8')), false);
      await lib.export({ ids: [image.id], author: '', attribution: '' }, path.join(root, 'recovered-pack.zip'), new Job(), () => {});
      observations.recoveredPack = path.join(root, 'recovered-pack.zip');
    });
    await t.test('irrecoverable media fails export without publishing a pack', async () => {
      const rendered = await lib.render(image.id, recipe, new Job()), original = await lib.resolve(image.original), backup = await fs.readFile(original);
      await fs.writeFile(await lib.resolve(rendered.path), 'broken derivative'); await fs.writeFile(original, 'broken disposable original');
      const destination = path.join(root, 'must-not-exist.zip');
      try { await assert.rejects(lib.export({ ids: [image.id], author: '', attribution: '' }, destination, new Job(), () => {})); await assert.rejects(fs.access(destination)); assert(!(await fs.readdir(root)).some(n => n.endsWith('.partial'))); }
      finally { await fs.writeFile(original, backup); }
      assert.equal(await hashFile(original), await hashFile(source));
    });
    await t.test('opposite-phase and single-channel stereo retain waveform energy; legacy waveforms upgrade', async () => {
      const peaks = [];
      for (const mode of ['opposite', 'right-only', 'silence']) {
        const frames = 48000, wav = Buffer.alloc(44 + frames * 4);
        wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(192000, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
        for (let i = 0; i < frames; i++) { const v = mode === 'silence' ? 0 : Math.round(Math.sin(2 * Math.PI * 440 * i / 48000) * 20000); wav.writeInt16LE(mode === 'right-only' ? 0 : v, 44 + i * 4); wav.writeInt16LE(-v, 46 + i * 4); }
        const file = path.join(root, mode + '.wav'); await fs.writeFile(file, wav); await lib.import([file], undefined, new Job(), () => {});
        const asset = lib.state().assets.find(a => a.name === mode)!;
        const peak = Math.max(...asset.waveform); peaks.push({ mode, peak });
        mode === 'silence' ? assert.equal(peak, 0) : assert(peak > .58, `${mode}: ${peak}`);
        if (mode === 'opposite') {
          lib.store({ ...asset, waveform: Array(600).fill(0), waveformVersion: 1 });
          const rendered = await lib.render(asset.id, defaultAudio(1), new Job());
          assert(Math.max(...rendered.originalWaveform!) > .58); assert(Math.max(...rendered.waveform!) > .58);
          assert.equal(lib.asset(asset.id).waveformVersion, WAVEFORM_VERSION);
          const mono = await lib.render(asset.id, { ...defaultAudio(1), channels: 1 }, new Job()); assert.equal(Math.max(...mono.waveform!), 0);
        }
      }
      observations.stereoPeaks = peaks;
    });
    await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(observations, null, 2));
    console.log('RELIABILITY_RESULTS ' + JSON.stringify(observations));
  } finally { lib.close(); }
});
