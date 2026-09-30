import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Library, hashFile } from '../electron/library';
import { Job } from '../electron/media';
import { defaultImage, defaultAudio, applyPreset, audioRecipeSchema, type ImageRecipe, type AudioRecipe } from '../src/shared';
import { texture, recording } from './fixtures';

test('Field Kit 1.1 library features', { timeout: 120000 }, async t => {
  const root = path.resolve('.test-output', `features-${Date.now()}`), folder = path.join(root, 'Original library'), bin = path.resolve('vendor/ffmpeg/bin'), lib = new Library(bin);
  const report: { root: string; checks: string[]; backup?: string } = { root, checks: [] };
  const check = async (name: string, fn: () => Promise<void> | void) => t.test(name, async () => { await fn(); report.checks.push(name); });
  await fs.mkdir(root, { recursive: true }); await lib.open(folder, true);
  const one = path.join(root, 'Stone.png'), two = path.join(root, 'Bark.png'), sound = path.join(root, 'Rain.wav');
  await texture(one, 83, 600, 400); await texture(two, 84, 480, 640); await recording(sound, 5, 2);
  await lib.import([one, two, sound], undefined, new Job(), () => {});
  const image = lib.state().assets.find(a => a.name === 'Stone')!, other = lib.state().assets.find(a => a.name === 'Bark')!, audio = lib.state().assets.find(a => a.kind === 'audio')!;
  try {
    await check('opens a legacy v1 database and adds optional tables without rewriting asset records', async () => {
      lib.close(); const legacy = new DatabaseSync(path.join(folder, 'library.sqlite'));
      legacy.exec('DROP TABLE favorites; DROP TABLE presets;');
      const before = legacy.prepare('SELECT data FROM assets ORDER BY id').all(); legacy.close();
      const state = await lib.open(folder); assert.equal(state.presets.length, 0); assert(state.assets.every(a => !a.favorite));
      assert.deepEqual(lib.db.prepare('SELECT data FROM assets ORDER BY id').all(), before);
      assert.equal((lib.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 1);
    });
    await check('favorites survive metadata changes, recipe saves, close and reopen', async () => {
      lib.favorite({ id: image.id, favorite: true }); lib.update({ id: image.id, name: image.name, tags: ['existing'], notes: 'Private original note', collections: [] });
      lib.saveRecipe(image.id, { ...defaultImage, brightness: 1.2, size: 512 }); lib.close(); await lib.open(folder);
      assert.equal(lib.asset(image.id).favorite, true);
      assert.equal('favorite' in JSON.parse((lib.db.prepare('SELECT data FROM assets WHERE id=?').get(image.id) as { data: string }).data), false);
      assert.throws(() => lib.favorite({ id: randomUUID(), favorite: true }), /not found/);
      assert.throws(() => lib.favorite({ id: image.id, favorite: 'true' }));
    });
    const collection = lib.collection('Forest'), collection2 = lib.collection('Surfaces');
    await check('batch adds and removes only specified memberships and tags, preserving notes, recipes and favorites', () => {
      lib.organize({ ids: [image.id, other.id, image.id], tags: ['stone', 'stone'], collections: [collection.id, collection2.id], mode: 'add' });
      assert.deepEqual(lib.asset(image.id).tags, ['existing', 'stone']);
      lib.organize({ ids: [image.id, other.id], tags: ['stone'], collections: [collection.id], mode: 'remove' });
      assert.deepEqual(lib.asset(image.id).tags, ['existing']); assert.deepEqual(lib.asset(image.id).collections, [collection2.id]);
      assert.equal(lib.asset(image.id).notes, 'Private original note'); assert.equal(lib.asset(image.id).favorite, true); assert.equal((lib.asset(image.id).recipe as ImageRecipe).brightness, 1.2);
    });
    await check('batch failure rolls back earlier rows, invalid collections and empty operations', () => {
      const before = lib.state();
      assert.throws(() => lib.organize({ ids: [image.id, randomUUID()], tags: ['rollback'], collections: [], mode: 'add' }), /not found/);
      assert.deepEqual(lib.state(), before);
      assert.throws(() => lib.organize({ ids: [image.id], tags: [], collections: [randomUUID()], mode: 'add' }), /not found/);
      assert.throws(() => lib.organize({ ids: [image.id], tags: [], collections: [], mode: 'add' }));
      lib.update({ id: other.id, name: other.name, tags: Array.from({ length: 30 }, (_, i) => `tag${i}`), notes: '', collections: [] });
      assert.throws(() => lib.organize({ ids: [image.id, other.id], tags: ['overflow'], collections: [], mode: 'add' }), /No materials were changed/);
      assert(!lib.asset(image.id).tags.includes('overflow'));
    });
    const texturePreset = lib.savePreset({ name: 'Warm stone', kind: 'image', recipe: { ...defaultImage, brightness: 1.4, contrast: 1.1, blend: .4, size: 512 } });
    const soundPreset = lib.savePreset({ name: 'Soft loop', kind: 'audio', recipe: { ...defaultAudio(20), fadeIn: 8, fadeOut: 9, crossfade: 5, normalize: true, channels: 1 } });
    await check('texture presets preserve crop and orientation, audio presets preserve trim and fit short selections', () => {
      const framing: ImageRecipe = { ...defaultImage, crop: { x: .1, y: .2, w: .5, h: .5 }, rotation: 90, flipX: true };
      const texture = applyPreset(texturePreset, framing) as ImageRecipe;
      assert.deepEqual(texture.crop, framing.crop); assert.equal(texture.rotation, 90); assert.equal(texture.flipX, true); assert.equal(texture.brightness, 1.4); assert.equal(texture.size, 512);
      for (const length of [.02, .03, .3333, 1, 2]) {
        const clip = applyPreset(soundPreset, { ...defaultAudio(3), start: .2, end: .2 + length }) as AudioRecipe;
        assert(audioRecipeSchema.safeParse(clip).success); assert.equal(clip.start, .2); assert.equal(clip.end, .2 + length); assert.equal(clip.channels, 1); assert.equal(clip.normalize, true);
        assert(clip.fadeIn + clip.fadeOut <= length + 1e-9); assert(clip.crossfade <= length / 3 + 1e-9);
      }
      assert.throws(() => applyPreset(soundPreset, framing), /material type/);
    });
    await check('preset validation prevents mismatched media, duplicate names and invalid settings', () => {
      assert.throws(() => lib.savePreset({ name: 'bad', kind: 'image', recipe: defaultAudio(1) }));
      assert.throws(() => lib.savePreset({ name: ' warm stone ', kind: 'image', recipe: defaultImage }), /already exists/);
      assert.throws(() => lib.savePreset({ name: ' ', kind: 'image', recipe: defaultImage }));
      assert.throws(() => lib.savePreset({ name: 'bad', kind: 'audio', recipe: { ...defaultAudio(1), volume: -1 } }));
      assert.equal(lib.state().presets.length, 2);
    });
    await check('a 20 ms selection renders a valid shorter WAV when a fitted loop preset overlaps its ends', async () => {
      const clip = applyPreset(soundPreset, { ...defaultAudio(2), start: .2, end: .22 });
      const rendered = await lib.render(audio.id, clip, new Job());
      assert(rendered.info.duration! > .012 && rendered.info.duration! < .015); assert.equal(rendered.info.codec, 'pcm_s16le'); assert.equal(rendered.waveform?.length, 600);
      const cached = await lib.render(audio.id, clip, new Job()); assert.equal(cached.path, rendered.path);
    });
    await check('presets persist after restart and can be removed without changing existing recipes', async () => {
      lib.saveRecipe(audio.id, applyPreset(soundPreset, audio.recipe)); lib.close(); await lib.open(folder);
      assert.deepEqual(lib.state().presets, [texturePreset, soundPreset]);
      const saved = lib.asset(audio.id).recipe; lib.deletePreset(soundPreset.id); assert.deepEqual(lib.asset(audio.id).recipe, saved); assert.equal(lib.state().presets.length, 1);
    });
    let completed = '';
    await check('backup is reopenable after moving, with matching originals, details, collections, favorites and presets', async () => {
      const expected = lib.state(), copied = await lib.backup(root, new Job(), () => {}); completed = copied.path; report.backup = completed;
      assert.equal(copied.count, 3);
      const moved = path.join(root, 'Moved backup'); await fs.rename(completed, moved); completed = moved;
      const reopened = new Library(bin);
      try {
        assert.deepEqual(await reopened.open(moved), expected);
        assert.deepEqual(await fs.readdir(path.join(moved, 'cache')), []);
        for (const a of expected.assets) assert.equal(await hashFile(await reopened.resolve(a.original)), a.hash);
        const rendered = await reopened.render(image.id, expected.assets.find(a => a.id === image.id)!.recipe, new Job()); assert.equal(rendered.info.width, 512);
        await reopened.export({ ids: [image.id, audio.id], author: '', attribution: '' }, path.join(root, 'restored-pack.zip'), new Job(), () => {});
      } finally { reopened.close(); }
    });
    await check('backup rejects destinations inside the current library and handles invalid destination files', async () => {
      await assert.rejects(lib.backup(folder, new Job(), () => {}), /outside/);
      await assert.rejects(lib.backup(path.join(folder, 'originals'), new Job(), () => {}), /outside/);
      await assert.rejects(lib.backup(one, new Job(), () => {}), /folder/);
    });
    await check('cancelled backup cleans staging and leaves an existing backup and active library intact', async () => {
      const before = lib.state(), previousHash = await hashFile(path.join(completed, 'library.sqlite')), job = new Job();
      await assert.rejects(lib.backup(root, job, p => { if (p.label.startsWith('Copying')) job.cancel(); }), /Cancelled/);
      assert.deepEqual(lib.state(), before); assert.equal(await hashFile(path.join(completed, 'library.sqlite')), previousHash);
      assert(!(await fs.readdir(root)).some(p => p.endsWith('.partial')));
    });
    await check('backup refuses corrupted originals and missing files instead of publishing a broken copy', async () => {
      const original = await lib.resolve(image.original), bytes = await fs.readFile(original);
      try {
        await fs.writeFile(original, 'corrupted disposable fixture'); await assert.rejects(lib.backup(root, new Job(), () => {}), /verification/);
        await fs.unlink(original); await assert.rejects(lib.backup(root, new Job(), () => {}), /ENOENT/);
        assert(!(await fs.readdir(root)).some(p => p.endsWith('.partial')));
      } finally { await fs.writeFile(original, bytes); }
      assert.equal(await hashFile(original), image.hash);
    });
    await check('successive backups get separate folders and favorite removal persists', async () => {
      lib.favorite({ id: image.id, favorite: false }); const next = await lib.backup(root, new Job(), () => {}); assert.notEqual(next.path, completed);
      const recovered = new Library(bin); try { assert.equal((await recovered.open(next.path)).assets.find(a => a.id === image.id)!.favorite, false); } finally { recovered.close(); }
    });
    await check('temporary Windows cache locks retry; persistent locks fail without deleting the prior file', async () => {
      const recipe = lib.asset(image.id).recipe, rendered = await lib.render(image.id, recipe, new Job()), file = await lib.resolve(rendered.path);
      const valid = await fs.readFile(file), rename = fs.rename;
      let failures = 0;
      try {
        await fs.writeFile(file, 'broken cache');
        fs.rename = async (from, to) => { if (String(to) === file && failures++ < 2) throw Object.assign(new Error('Temporary Windows sharing violation'), { code: 'EPERM' }); return rename(from, to); };
        await lib.render(image.id, recipe, new Job()); assert(failures >= 3); assert.deepEqual(await fs.readFile(file), valid);
        await fs.writeFile(file, 'locked cache');
        fs.rename = async (from, to) => { if (String(to) === file) throw Object.assign(new Error('Persistent Windows sharing violation'), { code: 'EBUSY' }); return rename(from, to); };
        await assert.rejects(lib.render(image.id, recipe, new Job()), /Persistent Windows/);
        assert.equal(await fs.readFile(file, 'utf8'), 'locked cache'); assert.deepEqual(await fs.readdir(path.join(folder, '.tmp')), []);
      } finally { fs.rename = rename; await fs.writeFile(file, valid); }
    });
  } finally { lib.close(); await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('FEATURE_RESULTS ' + JSON.stringify(report)); }
});
