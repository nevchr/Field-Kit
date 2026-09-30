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
import { defaultImage, defaultAudio, defaultExportSettings, exportSchema, type ExportHistory } from '../src/shared';
import { texture, recording } from './fixtures';

test('folder exports and recorded pack history', { timeout: 180000 }, async t => {
  const root = path.resolve('.test-output', `game-exports-${Date.now()}`), folder = path.join(root, 'Library 雨'), bin = path.resolve('vendor/ffmpeg/bin'), lib = new Library(bin);
  const report = { root, checks: [] as string[] };
  const check = async (name: string, fn: () => Promise<void> | void) => t.test(name, async () => { await fn(); report.checks.push(name); });
  const read = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'));
  const cleanStaging = async () => assert(!(await fs.readdir(root)).some(name => name.startsWith('.field-kit-') && name.endsWith('.partial')));
  await fs.mkdir(root, { recursive: true }); await lib.open(folder, true);
  const files = [path.join(root, 'Wall.png'), path.join(root, 'Bark.png'), path.join(root, 'Rain.wav')];
  await texture(files[0], 650, 640, 480); await texture(files[1], 651, 600, 520); await recording(files[2], 75, 1.8);
  await lib.import(files, undefined, new Job(), () => {});
  const originals = lib.state().assets, wall = originals.find(a => a.name === 'Wall')!, bark = originals.find(a => a.name === 'Bark')!, rain = originals.find(a => a.kind === 'audio')!;
  lib.update({ id: wall.id, name: 'Rock', tags: ['outdoor'], notes: 'PRIVATE capture note', collections: [] });
  lib.update({ id: bark.id, name: 'ROCK', tags: [], notes: 'PRIVATE GPS text', collections: [] });
  lib.saveRecipe(wall.id, { ...defaultImage, size: 512, brightness: 1.2 });
  lib.saveRecipe(bark.id, { ...defaultImage, size: 512 });
  lib.saveRecipe(rain.id, { ...defaultAudio(1.8), start: .1, end: 1.6, crossfade: .1, channels: 1, normalize: true });
  const ids = [wall.id, bark.id, rain.id], settings = { ...defaultExportSettings, letterCase: 'lower' as const, prefix: 'game_' };
  const profile = lib.saveExportProfile({ name: 'Game', settings, author: 'Sample maker', attribution: 'Supplied credit' });
  const options = { ids, settings, author: profile.author, attribution: profile.attribution, profileId: profile.id };
  const destination = path.join(root, 'Pack 雨'); let record: ExportHistory;
  try {
    await check('older libraries gain empty history without changing original records', async () => {
      const before = lib.db.prepare('SELECT data FROM assets ORDER BY id').all(); lib.close();
      const db = new DatabaseSync(path.join(folder, 'library.sqlite')); db.exec('DROP TABLE export_history'); db.close();
      assert.deepEqual((await lib.open(folder)).exportHistory, []); assert.deepEqual(lib.db.prepare('SELECT data FROM assets ORDER BY id').all(), before);
    });
    await check('folder export publishes complete measured media, exact filenames and private-safe metadata', async () => {
      const before = lib.state().assets, progress: number[] = [];
      const result = await lib.export({ ...options, format: 'folder', folderName: 'Pack 雨' }, destination, new Job(), p => { progress.push(p.completed); });
      assert.equal(result.count, 3); assert(result.record); assert(!result.warning); assert(result.profileRemembered);
      record = lib.getExportHistory(result.record.id);
      const raw = await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'), manifest = JSON.parse(raw);
      assert.deepEqual(manifest.assets.map((a: { path: string }) => a.path), ['textures/game_rock.png', 'textures/game_rock-2.png', 'sounds/game_rain.wav']);
      assert(!raw.includes('PRIVATE')); assert(!raw.includes(folder)); assert(!raw.includes(wall.original)); assert.equal(manifest.author, profile.author);
      for (const item of manifest.assets) {
        const file = path.join(destination, item.path);
        if (item.type === 'texture') { const info = await sharp(file).metadata(); assert.equal(info.width, 512); assert.equal(info.height, 512); assert(!info.exif); }
        else { const info = await lib.media.probe(file, new Job()); assert.equal(info.codec, 'pcm_s16le'); assert.equal(info.sampleRate, 48000); assert.equal(info.channels, 1); assert(Math.abs(info.duration! - 1.4) < .002); }
      }
      assert.deepEqual(lib.state().assets, before); assert.equal(progress.at(-1), 7); await cleanStaging();
    });
    await check('ZIP and folder exports contain byte-identical rendered assets and manifests', async () => {
      const zip = path.join(root, 'Same.zip'); await lib.export(options, zip, new Job(), () => {});
      const extracted = path.join(root, 'Extracted'); const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}'`], { windowsHide: true }); assert.equal(result.status, 0, result.stderr.toString());
      const manifest = await read(path.join(destination, 'manifest.json'));
      assert.deepEqual(await read(path.join(extracted, 'manifest.json')), manifest);
      for (const item of manifest.assets) assert.equal(await hashFile(path.join(extracted, item.path)), await hashFile(path.join(destination, item.path)));
      assert((await fs.readFile(path.join(destination, 'README.txt'), 'utf8')).includes('GODOT'));
    });
    await check('history records only public snapshot fields and persists across restart', async () => {
      assert.deepEqual(record.assets.map(a => a.id), ids); assert.deepEqual(record.settings, settings);
      const serialized = JSON.stringify(record); assert(!serialized.includes('PRIVATE')); assert(!serialized.includes(folder)); assert(!serialized.includes('originals/'));
      assert.equal(record.name, 'Pack 雨'); assert.equal(record.format, 'folder');
      const before = lib.state(); lib.close(); assert.deepEqual(await lib.open(folder), before); assert.deepEqual(lib.getExportHistory(record.id), record);
    });
    await check('re-export keeps the original names, tags, recipes and settings after edits and profile deletion', async () => {
      lib.update({ id: wall.id, name: 'New name', tags: ['new-tag'], notes: 'PRIVATE changed', collections: [] });
      lib.saveRecipe(wall.id, { ...defaultImage, size: 2048, brightness: .6 });
      lib.saveRecipe(rain.id, { ...defaultAudio(1.8), start: .6, end: 1.7, channels: 2 }); lib.deleteExportProfile(profile.id);
      const before = lib.state().assets, repeated = path.join(root, 'Repeated');
      await lib.export({ ids, settings: record.settings, author: record.author, attribution: record.attribution, historyId: record.id, format: 'folder', folderName: 'Repeated' }, repeated, new Job(), () => {});
      const expected = await read(path.join(destination, 'manifest.json')); assert.deepEqual(await read(path.join(repeated, 'manifest.json')), expected);
      for (const item of expected.assets) assert.equal(await hashFile(path.join(repeated, item.path)), await hashFile(path.join(destination, item.path)));
      assert.deepEqual(lib.state().assets, before);
    });
    await check('moved backups retain snapshots and can actually re-export the recorded pack', async () => {
      const before = lib.state(), backed = await lib.backup(root, new Job(), () => {}), moved = path.join(root, 'Relocated backup 雨'); await fs.rename(backed.path, moved);
      const copy = new Library(bin);
      try {
        assert.deepEqual(await copy.open(moved), before); const history = copy.getExportHistory(record.id);
        const target = path.join(root, 'From backup'); await copy.export({ ids, settings: history.settings, author: history.author, attribution: history.attribution, historyId: record.id, format: 'folder', folderName: 'From backup' }, target, new Job(), () => {});
        assert.deepEqual(await read(path.join(target, 'manifest.json')), await read(path.join(destination, 'manifest.json')));
      } finally { copy.close(); }
    });
    await check('Trash blocks repeat export and restoring the material makes the record usable again', async () => {
      lib.setTrash({ ids: [wall.id], trashed: true }); assert.equal(lib.state().exportHistory.find(h => h.id === record.id)!.unavailable, 1);
      const target = path.join(root, 'Trash.zip'); await assert.rejects(lib.export({ ids, historyId: record.id, author: '', attribution: '' }, target, new Job(), () => {}), /Trash/); await assert.rejects(fs.access(target));
      lib.setTrash({ ids: [wall.id], trashed: false }); assert.equal(lib.state().exportHistory.find(h => h.id === record.id)!.unavailable, 0);
      await lib.export({ ids, historyId: record.id, settings: record.settings, author: '', attribution: '' }, target, new Job(), () => {});
    });
    await check('re-export verifies original bytes even when an older processed preview is cached', async () => {
      const original = await lib.resolve(wall.original), saved = await fs.readFile(original), before = lib.state().exportHistory;
      try {
        await fs.writeFile(original, await fs.readFile(await lib.resolve(bark.original)));
        await assert.rejects(lib.export({ ids, historyId: record.id, settings: record.settings, author: '', attribution: '' }, path.join(root, 'Changed original.zip'), new Job(), () => {}), /recorded original.*changed/);
        await assert.rejects(fs.access(path.join(root, 'Changed original.zip'))); assert.deepEqual(lib.state().exportHistory, before);
      } finally { await fs.writeFile(original, saved); }
    });
    await check('invalid folder names and mismatched history selections are rejected before writing', async () => {
      for (const folderName of ['', '..', '../outside', 'foo\\bar', 'CON', 'name.', 'bad:name']) assert(!exportSchema.safeParse({ ...options, format: 'folder', folderName }).success);
      assert(!exportSchema.safeParse({ ...options, format: 'folder' }).success); assert(!exportSchema.safeParse({ ...options, format: 'exe' }).success);
      await assert.rejects(lib.export({ ids: [wall.id], historyId: record.id, author: '', attribution: '' }, path.join(root, 'Bad selection.zip'), new Job(), () => {}), /selection/);
      await assert.rejects(lib.export({ ids, historyId: randomUUID(), author: '', attribution: '' }, path.join(root, 'Missing history.zip'), new Job(), () => {}), /last twenty/);
      await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: 'Mismatch' }, path.join(root, 'Different'), new Job(), () => {}), /folder name/);
    });
    await check('existing files, empty folders and nonempty folders remain untouched', async () => {
      for (const [name, kind] of [['Existing file', 'file'], ['Empty', 'empty'], ['Occupied', 'directory']]) {
        const target = path.join(root, name); if (kind === 'file') await fs.writeFile(target, 'keep'); else { await fs.mkdir(target); if (kind === 'directory') await fs.writeFile(path.join(target, 'keep.txt'), 'keep'); }
        const before = lib.state().exportHistory;
        await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: name }, target, new Job(), () => {}), /already exists/);
        if (kind === 'file') assert.equal(await fs.readFile(target, 'utf8'), 'keep'); else assert.deepEqual(await fs.readdir(target), kind === 'empty' ? [] : ['keep.txt']);
        assert.deepEqual(lib.state().exportHistory, before);
      }
    });
    await check('folder publication refuses a destination that appears after the final existence check', async () => {
      const rename = fs.rename, target = path.join(root, 'Race'), before = lib.state().exportHistory;
      fs.rename = async (from, to) => { if (String(to) === target) await fs.mkdir(target); return rename(from, to); };
      try { await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: 'Race' }, target, new Job(), () => {})); }
      finally { fs.rename = rename; }
      assert.deepEqual(await fs.readdir(target), []); assert.deepEqual(lib.state().exportHistory, before); await cleanStaging();
    });
    await check('real parent paths prevent ZIP and folder exports through links into the library', async () => {
      const link = path.join(root, 'Library junction'); await fs.symlink(folder, link, 'junction');
      for (const format of ['zip', 'folder'] as const) await assert.rejects(lib.export({ ids, author: '', attribution: '', format, ...(format === 'folder' ? { folderName: 'Nope' } : {}) }, path.join(link, format === 'zip' ? 'Nope.zip' : 'Nope'), new Job(), () => {}), /outside/);
      assert(!(await fs.readdir(folder)).some(name => /^Nope/.test(name))); await fs.unlink(link);
    });
    await check('cancellation before render, during preparation and during folder copying publishes nothing', async () => {
      for (const phase of ['before', 'prepare', 'copy']) {
        const target = path.join(root, `Cancel-${phase}`), before = lib.state().exportHistory, job = new Job(); if (phase === 'before') job.cancel();
        await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: path.basename(target) }, target, job, p => { if ((phase === 'prepare' && p.completed === 1) || (phase === 'copy' && p.label.startsWith('Copying file 1'))) job.cancel(); }), /Cancelled/);
        await assert.rejects(fs.access(target)); assert.deepEqual(lib.state().exportHistory, before); await cleanStaging();
      }
    });
    await check('failed rendering or writing cleans partial folders and keeps export history unchanged', async () => {
      const before = lib.state().exportHistory, render = lib.render.bind(lib), write = fs.writeFile; let calls = 0;
      lib.render = async (...args) => { if (++calls === 2) throw new Error('Injected decoder failure'); return render(...args); };
      try { await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: 'Decode failure' }, path.join(root, 'Decode failure'), new Job(), () => {}), /decoder failure/); } finally { lib.render = render; }
      fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => { if (String(args[0]).endsWith('manifest.json')) throw new Error('Injected write failure'); return write(...args); }) as typeof fs.writeFile;
      try { await assert.rejects(lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: 'Write failure' }, path.join(root, 'Write failure'), new Job(), () => {}), /write failure/); } finally { fs.writeFile = write; }
      assert.deepEqual(lib.state().exportHistory, before); await assert.rejects(fs.access(path.join(root, 'Write failure'))); await cleanStaging();
    });
    await check('history database failure reports a completed pack with a warning and no half-written record', async () => {
      const before = lib.state().exportHistory; lib.db.exec("CREATE TRIGGER history_fault BEFORE INSERT ON export_history BEGIN SELECT RAISE(ABORT, 'Injected history failure'); END;");
      try { const result = await lib.export({ ids, author: '', attribution: '', format: 'folder', folderName: 'History warning' }, path.join(root, 'History warning'), new Job(), () => {}); assert.match(result.warning!, /history/); assert(!result.record); assert(result.profileRemembered); await fs.access(path.join(result.path, 'manifest.json')); }
      finally { lib.db.exec('DROP TRIGGER history_fault'); }
      assert.deepEqual(lib.state().exportHistory, before);
    });
    await check('invalid history in another library cannot replace the active one', async () => {
      const before = lib.state(), copied = await lib.backup(root, new Job(), () => {}), db = new DatabaseSync(path.join(copied.path, 'library.sqlite'));
      db.exec("UPDATE export_history SET data='{}'"); db.close(); await assert.rejects(lib.open(copied.path), /could not be read/); assert.deepEqual(lib.state(), before);
    });
    await check('history stays bounded to the twenty newest successful exports', async () => {
      for (let i = 0; i < 21; i++) await lib.export({ ids: [bark.id], author: '', attribution: '', format: 'folder', folderName: `Recent ${i}` }, path.join(root, `Recent ${i}`), new Job(), () => {});
      assert.equal(lib.state().exportHistory.length, 20); assert.equal(lib.state().exportHistory[0].name, 'Recent 20'); assert.equal(lib.state().exportHistory.at(-1)!.name, 'Recent 1'); assert.throws(() => lib.getExportHistory(record.id), /last twenty/);
    });
    await check('all external and managed original bytes remain unchanged', async () => {
      for (const asset of originals) { assert.equal(await hashFile(await lib.resolve(asset.original)), asset.hash); assert.equal(await hashFile(files.find(f => path.basename(f, path.extname(f)) === asset.name)!), asset.hash); }
      await cleanStaging();
    });
  } finally { lib.close(); await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); }
});
