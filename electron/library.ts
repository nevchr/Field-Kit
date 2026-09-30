import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { version } from '../package.json';
import { Media, Job, Cancelled, LIMITS, WAVEFORM_VERSION } from './media';
import { defaultImage, defaultAudio, imageRecipeSchema, audioRecipeSchema, metadataSchema, exportSchema, type Asset, type LibraryState, type Collection, type Progress, type ImportResult, type RenderResult, type ExportOptions } from '../src/shared';
import { favoriteSchema, batchSchema, presetSchema, savePresetSchema, trashSchema, type Preset } from '../src/shared';
import { applyPreset, batchPresetSchema, batchHistorySchema, batchHistoryActionSchema, exportProfileSchema, saveExportProfileSchema, defaultExportSettings, type BatchHistory, type BatchHistorySummary, type BatchResult, type ExportProfile } from '../src/shared';
import { safeName, planExport } from '../src/export-plan';
import { exportHistorySchema, type ExportHistory, type ExportHistorySummary, type ExportResult } from '../src/shared';
import { requireNewDestination, writePack } from './export-pack';
export { safeName } from '../src/export-plan';

export const hashFile = async (file: string, job = new Job()): Promise<string> => { const h = createHash('sha256'); for await (const b of createReadStream(file)) { job.check(); h.update(b); } return h.digest('hex'); };
const inside = (root: string, file: string) => { const relative = path.relative(root, file); return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
const waveformSchema = z.array(z.number().min(0).max(1)).length(600);
const infoSchema = z.object({ width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), duration: z.number().positive().max(900).optional(), sampleRate: z.number().int().positive().optional(), channels: z.number().int().positive().max(64).optional(), codec: z.string().optional(), format: z.string().optional(), bytes: z.number().int().nonnegative().optional(), peakDb: z.number().finite().optional(), enlarged: z.boolean().optional() }).strict();
const assetSchema = metadataSchema.extend({ name: z.string().max(255), hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(['image', 'audio']), original: z.string().min(1), thumbnail: z.string(), waveform: z.array(z.number().min(0).max(1)).max(600), waveformVersion: z.number().int().optional(), info: infoSchema, recipe: z.union([imageRecipeSchema, audioRecipeSchema]), prepared: z.boolean(), created: z.string() }).refine(a => a.kind === 'image' ? imageRecipeSchema.safeParse(a.recipe).success && !!a.info.width && !!a.info.height : audioRecipeSchema.safeParse(a.recipe).success && !!a.info.duration && !!a.info.channels, 'Invalid asset media properties');
const cacheSchema = z.object({ version: z.literal(2), sha256: z.string().regex(/^[a-f0-9]{64}$/), info: infoSchema, waveform: waveformSchema.optional() }).strict();
function readState(db: DatabaseSync, name: string): LibraryState {
  try {
    const assets = (db.prepare('SELECT data FROM assets ORDER BY rowid DESC').all() as { data: string }[]).map(r => assetSchema.parse(JSON.parse(r.data)));
    const collections = z.array(z.object({ id: z.string().uuid(), name: z.string().min(1).max(100) })).parse(db.prepare('SELECT id,name FROM collections ORDER BY name COLLATE NOCASE').all());
    const hasTable = (table: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    const favorites = new Set(hasTable('favorites') ? z.array(z.object({ id: z.string().uuid() })).parse(db.prepare('SELECT id FROM favorites').all()).map(r => r.id) : []);
    const presets = hasTable('presets') ? (db.prepare('SELECT data FROM presets ORDER BY rowid').all() as { data: string }[]).map(r => presetSchema.parse(JSON.parse(r.data))) : [];
    const trash = new Map(hasTable('trashed_assets') ? z.array(z.object({ id: z.string().uuid(), trashed_at: z.string().datetime() })).parse(db.prepare('SELECT id,trashed_at FROM trashed_assets').all()).map(r => [r.id, r.trashed_at]) : []);
    const knownIds = new Set(assets.map(a => a.id));
    const assetsById = new Map(assets.map(a => [a.id, a]));
    if ([...trash.keys()].some(id => !knownIds.has(id))) throw new Error('Trash contains a missing material reference');
    const history = hasTable('batch_history') ? (db.prepare('SELECT id,data FROM batch_history ORDER BY rowid DESC').all() as { id: string; data: string }[]).map(row => {
      const item = batchHistorySchema.parse(JSON.parse(row.data));
      if (item.id !== row.id || new Set(item.changes.map(c => c.id)).size !== item.changes.length) throw new Error('Invalid batch history identity');
      for (const change of item.changes) {
        const asset = assetsById.get(change.id);
        if (!asset || (asset.kind === 'image' ? !('crop' in change.before.recipe && 'crop' in change.after.recipe) : !('start' in change.before.recipe && 'start' in change.after.recipe))) throw new Error('Invalid batch history material');
        if (asset.kind === 'audio' && [change.before.recipe, change.after.recipe].some(r => 'end' in r && r.end > asset.info.duration! + .001)) throw new Error('Invalid batch history trim');
      }
      return item;
    }) : [];
    const exportProfiles = hasTable('export_profiles') ? (db.prepare('SELECT id,data FROM export_profiles ORDER BY rowid').all() as { id: string; data: string }[]).map(row => { const profile = exportProfileSchema.parse(JSON.parse(row.data)); if (profile.id !== row.id) throw new Error('Invalid export profile identity'); return profile; }) : [];
    const preference = hasTable('export_preferences') ? db.prepare('SELECT profile_id FROM export_preferences WHERE id=1').get() as { profile_id: string | null } | undefined : undefined;
    const lastExportProfile = z.string().uuid().nullable().parse(preference?.profile_id ?? null);
    if (lastExportProfile && !exportProfiles.some(p => p.id === lastExportProfile)) throw new Error('Missing export profile preference');
    const exports = hasTable('export_history') ? (db.prepare('SELECT id,data FROM export_history ORDER BY rowid DESC').all() as { id: string; data: string }[]).map(row => {
      const record = parseExportHistory(row);
      for (const snapshot of record.assets) {
        const asset = assetsById.get(snapshot.id);
        if (asset && (asset.hash !== snapshot.hash || asset.kind !== snapshot.kind || ('end' in snapshot.recipe && snapshot.recipe.end > asset.info.duration! + .001))) throw new Error('Invalid export history material');
      }
      return summarizeExport(record, record.assets.filter(a => !knownIds.has(a.id) || trash.has(a.id)).length);
    }) : [];
    if (history.length > 10 || exportProfiles.length > 100 || exports.length > 20) throw new Error('Library extension limit exceeded');
    return { name, assets: assets.map(a => ({ ...a, favorite: favorites.has(a.id), ...(trash.has(a.id) ? { trashedAt: trash.get(a.id)! } : {}) })), collections, presets, batchHistory: history.map(summarizeBatch), exportProfiles, lastExportProfile, exportHistory: exports };
  } catch (error) { throw new Error(`The library database could not be read. Your current library has not been replaced. ${(error as Error).message.slice(0, 180)}`); }
}
function closeDatabase(db: DatabaseSync) { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { db.close(); } }
async function replaceDerivedFile(source: string, destination: string, job: Job) {
  // Windows scanners or a preview reader can briefly hold a derived file open.
  // Keep the old file until atomic replacement succeeds; never unlink it first.
  for (let attempt = 0; ; attempt++) {
    job.check();
    try { await fs.rename(source, destination); return; }
    catch (error) {
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(40 * 2 ** attempt, 200)));
    }
  }
}
const summarizeBatch = ({ changes, ...summary }: BatchHistory): BatchHistorySummary => ({ ...summary, count: changes.length });
const recipeSnapshot = (asset: Asset) => ({ recipe: asset.kind === 'image' ? imageRecipeSchema.parse(asset.recipe) : audioRecipeSchema.parse(asset.recipe), prepared: asset.prepared });
function parseExportHistory(row: { id: string; data: string }): ExportHistory {
  const record = exportHistorySchema.parse(JSON.parse(row.data));
  if (record.id !== row.id || new Set(record.assets.map(a => a.id)).size !== record.assets.length || record.assets.some(a => a.kind === 'image' ? !('crop' in a.recipe) : !('start' in a.recipe))) throw new Error('Invalid export history snapshot');
  return record;
}
const summarizeExport = (record: ExportHistory, unavailable = 0): ExportHistorySummary => ({ id: record.id, created: record.created, name: record.name, format: record.format, count: record.assets.length, unavailable });
export class Library {
  db!: DatabaseSync; root = ''; name = ''; media: Media;
  constructor(bin: string) { this.media = new Media(bin); }
  async open(root: string, create = false): Promise<LibraryState> {
    if (!path.isAbsolute(root)) throw new Error('Choose an absolute library folder');
    if (create) await fs.mkdir(root, { recursive: true });
    const resolved = await fs.realpath(root);
    const marker = path.join(resolved, 'field-kit.json');
    if (create) {
      if ((await fs.readdir(resolved)).length) throw new Error('Create a library in an empty folder, or use Open library for an existing one');
      await fs.writeFile(marker, JSON.stringify({ format: 'field-kit', version: 1, name: path.basename(resolved) }, null, 2), { flag: 'wx' });
    }
    const meta = JSON.parse(await fs.readFile(marker, 'utf8').catch(() => { throw new Error('This folder is not a Field Kit library'); }));
    if (meta.format !== 'field-kit' || meta.version !== 1) throw new Error('This library uses an unsupported format');
    const name = String(meta.name).slice(0, 160);
    for (const dir of ['originals', 'thumbnails', 'cache', '.tmp']) {
      const folder = path.join(resolved, dir); await fs.mkdir(folder, { recursive: true });
      if (!inside(resolved, await fs.realpath(folder))) throw new Error('Library folders cannot be links outside the library');
    }
    const databasePath = path.join(resolved, 'library.sqlite');
    try { if (!inside(resolved, await fs.realpath(databasePath))) throw new Error('Library database cannot link outside the library'); } catch(e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; if (!create) throw new Error('This library is missing library.sqlite. Restore the complete library folder or choose a different library.'); }
    let candidate: DatabaseSync | undefined;
    try {
      candidate = new DatabaseSync(databasePath);
      candidate.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
      if (create) candidate.exec('PRAGMA journal_mode=WAL; CREATE TABLE assets (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, data TEXT NOT NULL); CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL); PRAGMA user_version=1;');
      const schema = candidate.prepare('PRAGMA user_version').get() as { user_version: number };
      if (schema.user_version !== 1) throw new Error('This library uses an unsupported database version');
      const check = candidate.prepare('PRAGMA quick_check(1)').get() as { quick_check: string };
      if (check.quick_check !== 'ok') throw new Error('The library database is damaged');
      const state = readState(candidate, name);
      // Additive tables keep original v1 asset records readable by earlier releases.
      candidate.exec('BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS trashed_assets (id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE, trashed_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS batch_history (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS export_profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS export_preferences (id INTEGER PRIMARY KEY CHECK(id=1), profile_id TEXT REFERENCES export_profiles(id) ON DELETE SET NULL); CREATE TABLE IF NOT EXISTS export_history (id TEXT PRIMARY KEY, data TEXT NOT NULL); COMMIT;');
      // Validate everything before replacing the active connection or its media root.
      const previous = this.db;
      this.db = candidate; candidate = undefined; this.root = resolved; this.name = name;
      if (previous) { try { closeDatabase(previous); } catch { /* SQLite close still ran; the validated replacement is usable. */ } }
      // Temporary files are never authoritative. Only remove our flat, named intermediates.
      for (const file of await fs.readdir(path.join(resolved, '.tmp')).catch(() => [])) if (/^[a-f0-9-]+\.(part|png|jpe?g|webp|wav|mp3|flac|ogg|m4a|json)$/.test(file)) await fs.unlink(path.join(resolved, '.tmp', file)).catch(() => {});
      return state;
    } catch (error) {
      if (candidate) { try { candidate.close(); } catch {} }
      throw new Error(`Could not open this library. Your current library is still available. ${(error as Error).message}`);
    }
  }
  close() { const database = this.db; this.db = undefined!; if (database) closeDatabase(database); }
  isInside(file: string) { return inside(this.root, file); }
  async resolve(relative: string) {
    if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(s => s === '..' || s === '.')) throw new Error('Invalid managed file reference');
    const full = path.resolve(this.root, relative);
    if (!this.isInside(full)) throw new Error('File is outside the library');
    const real = await fs.realpath(full);
    if (!this.isInside(real)) throw new Error('Managed files cannot link outside the library');
    return real;
  }
  state(): LibraryState { this.ready(); return readState(this.db, this.name); }
  ready() { if (!this.db) throw new Error('Open a library first'); }
  asset(id: string, includeTrash = false): Asset {
    this.ready();
    const row = this.db.prepare('SELECT a.data,t.trashed_at FROM assets a LEFT JOIN trashed_assets t ON t.id=a.id WHERE a.id=?').get(id) as { data: string; trashed_at: string | null } | undefined;
    if (!row) throw new Error('Asset was not found');
    if (row.trashed_at && !includeTrash) throw new Error('This material is in Trash. Restore it before editing or exporting.');
    return { ...JSON.parse(row.data), favorite: !!this.db.prepare('SELECT id FROM favorites WHERE id=?').get(id), ...(row.trashed_at ? { trashedAt: row.trashed_at } : {}) };
  }
  store(asset: Asset) { const { favorite: _favorite, trashedAt: _trashedAt, ...record } = asset; this.db.prepare('INSERT INTO assets(id,hash,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(asset.id, asset.hash, JSON.stringify(record)); return this.asset(asset.id, true); }
  setTrash(data: unknown): Asset[] {
    this.ready(); const { ids, trashed } = trashSchema.parse(data), unique = [...new Set(ids)];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of unique) this.asset(id, true);
      const timestamp = new Date().toISOString();
      for (const id of unique) {
        if (trashed) this.db.prepare('INSERT OR IGNORE INTO trashed_assets(id,trashed_at) VALUES(?,?)').run(id, timestamp);
        else this.db.prepare('DELETE FROM trashed_assets WHERE id=?').run(id);
      }
      const result = unique.map(id => this.asset(id, true)); this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  favorite(data: unknown): Asset {
    const { id, favorite } = favoriteSchema.parse(data); this.asset(id);
    this.db.prepare(favorite ? 'INSERT OR IGNORE INTO favorites(id) VALUES(?)' : 'DELETE FROM favorites WHERE id=?').run(id);
    return this.asset(id);
  }
  organize(data: unknown): Asset[] {
    this.ready(); const valid = batchSchema.parse(data);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of valid.collections) if (!this.db.prepare('SELECT id FROM collections WHERE id=?').get(id)) throw new Error('Collection was not found');
      const merge = (current: string[], changes: string[]) => valid.mode === 'add' ? [...new Set([...current, ...changes])] : current.filter(v => !changes.includes(v));
      const result = [...new Set(valid.ids)].map(id => {
        const a = this.asset(id), tags = merge(a.tags, valid.tags), collections = merge(a.collections, valid.collections);
        if (tags.length > 30 || collections.length > 100) throw new Error(`“${a.name}” would exceed 30 tags or 100 collections. No materials were changed.`);
        return this.store({ ...a, tags, collections });
      });
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  savePreset(data: unknown): Preset {
    this.ready(); const valid = savePresetSchema.parse(data), id = randomUUID();
    let preset: Preset;
    if (valid.kind === 'image') {
      const { brightness, contrast, saturation, blend, size } = imageRecipeSchema.parse(valid.recipe);
      preset = { id, name: valid.name, kind: 'image', settings: { brightness, contrast, saturation, blend, size } };
    } else {
      const { volume, fadeIn, fadeOut, normalize, crossfade, channels } = audioRecipeSchema.parse(valid.recipe);
      preset = { id, name: valid.name, kind: 'audio', settings: { volume, fadeIn, fadeOut, normalize, crossfade, channels } };
    }
    const existing = this.state().presets;
    if (existing.some(p => p.kind === preset.kind && p.name.toLowerCase() === preset.name.toLowerCase())) throw new Error('A preset with this name already exists. Choose another name.');
    if (existing.length >= 500) throw new Error('This library already has 500 presets. Remove one before adding another.');
    this.db.prepare('INSERT INTO presets(id,data) VALUES(?,?)').run(id, JSON.stringify(preset)); return preset;
  }
  deletePreset(id: string) { this.ready(); z.string().uuid().parse(id); this.db.prepare('DELETE FROM presets WHERE id=?').run(id); }
  async applyBatchPreset(data: unknown, job: Job, progress: (p: Omit<Progress, 'id'>) => void): Promise<BatchResult> {
    this.ready(); const options = batchPresetSchema.parse(data); job.check();
    const presets = this.state().presets;
    const pick = (id: string | undefined, kind: 'image' | 'audio') => {
      if (!id) return undefined;
      const found = presets.find(p => p.id === id && p.kind === kind);
      if (!found) throw new Error('A selected preset is no longer available for this material type.');
      return found;
    };
    const image = pick(options.imagePresetId, 'image'), audio = pick(options.audioPresetId, 'audio');
    const changes: BatchHistory['changes'] = [];
    for (const id of new Set(options.ids)) {
      const asset = this.asset(id), preset = asset.kind === 'image' ? image : audio;
      if (!preset) continue;
      const before = recipeSnapshot(asset), after = { recipe: applyPreset(preset, asset.recipe), prepared: true };
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ id, before, after });
    }
    if (!changes.length) throw new Error('No selected materials need these preset settings.');
    for (let i = 0; i < changes.length; i++) {
      job.check(); const change = changes[i];
      progress({ kind: 'batch', completed: i, total: changes.length, label: `Preparing ${this.asset(change.id).name}` });
      await this.render(change.id, change.after.recipe, job);
    }
    job.check();
    const record: BatchHistory = { id: randomUUID(), created: new Date().toISOString(), label: [image?.name, audio?.name].filter(Boolean).join(' + '), state: 'applied', changes };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const assets = changes.map(change => {
        const asset = this.asset(change.id);
        if (JSON.stringify(recipeSnapshot(asset)) !== JSON.stringify(change.before)) throw new Error('A material changed while the batch was preparing. No batch recipes were saved.');
        return this.store({ ...asset, ...change.after });
      });
      this.db.prepare('INSERT INTO batch_history(id,data) VALUES(?,?)').run(record.id, JSON.stringify(record));
      this.db.exec('DELETE FROM batch_history WHERE rowid NOT IN (SELECT rowid FROM batch_history ORDER BY rowid DESC LIMIT 10)');
      this.db.exec('COMMIT');
      progress({ kind: 'batch', completed: changes.length, total: changes.length, label: 'Batch saved' });
      return { assets, history: this.state().batchHistory };
    } catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }
  changeBatchHistory(data: unknown): BatchResult {
    this.ready(); const { id, action } = batchHistoryActionSchema.parse(data);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT data FROM batch_history WHERE id=?').get(id) as { data: string } | undefined;
      if (!row) throw new Error('This batch is no longer in the last ten saved batches.');
      const record = batchHistorySchema.parse(JSON.parse(row.data));
      if (record.state !== (action === 'undo' ? 'applied' : 'undone')) throw new Error('This batch has already changed. Reopen Batch history.');
      const assets = record.changes.map(change => {
        const asset = this.asset(change.id), expected = action === 'undo' ? change.after : change.before, replacement = action === 'undo' ? change.before : change.after;
        if (JSON.stringify(recipeSnapshot(asset)) !== JSON.stringify(expected)) throw new Error(`“${asset.name}” has newer edits. This batch cannot ${action} without overwriting them; no materials were changed.`);
        return this.store({ ...asset, ...replacement });
      });
      record.state = action === 'undo' ? 'undone' : 'applied';
      this.db.prepare('UPDATE batch_history SET data=? WHERE id=?').run(JSON.stringify(record), id);
      this.db.exec('COMMIT'); return { assets, history: this.state().batchHistory };
    } catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }
  saveExportProfile(data: unknown): ExportProfile {
    this.ready(); const valid = saveExportProfileSchema.parse(data), existing = this.state().exportProfiles;
    if (valid.id && !existing.some(p => p.id === valid.id)) throw new Error('This export profile no longer exists. Save it as a new profile.');
    if (existing.some(p => p.id !== valid.id && p.name.toLowerCase() === valid.name.toLowerCase())) throw new Error('An export profile with this name already exists.');
    if (!valid.id && existing.length >= 100) throw new Error('This library already has 100 export profiles.');
    const profile: ExportProfile = { ...valid, id: valid.id || randomUUID() };
    this.db.prepare('INSERT INTO export_profiles(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(profile.id, JSON.stringify(profile));
    return profile;
  }
  deleteExportProfile(id: string) { this.ready(); z.string().uuid().parse(id); this.db.prepare('DELETE FROM export_profiles WHERE id=?').run(id); }
  getExportHistory(id: string): ExportHistory {
    this.ready(); z.string().uuid().parse(id);
    const row = this.db.prepare('SELECT id,data FROM export_history WHERE id=?').get(id) as { id: string; data: string } | undefined;
    if (!row) throw new Error('This export is no longer in the last twenty records.');
    return parseExportHistory(row);
  }
  async backup(parent: string, job: Job, progress: (p: Omit<Progress, 'id'>) => void): Promise<{ path: string; count: number }> {
    this.ready(); job.check();
    if (!path.isAbsolute(parent)) throw new Error('Choose an absolute backup destination');
    const resolved = await fs.realpath(parent);
    if (resolved === this.root || this.isInside(resolved)) throw new Error('Choose a backup destination outside the current library');
    if (!(await fs.stat(resolved)).isDirectory()) throw new Error('Choose a folder for the backup');
    const id = randomUUID(), destination = path.join(resolved, `${safeName(this.name)}-backup-${new Date().toISOString().slice(0,10)}-${id}`);
    const staged = path.join(resolved, `.field-kit-backup-${id}.partial`);
    await fs.mkdir(staged);
    try {
      progress({ kind: 'backup', completed: 0, total: 0, label: 'Snapshotting library…' });
      await backup(this.db, path.join(staged, 'library.sqlite'));
      job.check();
      const snapshot = new DatabaseSync(path.join(staged, 'library.sqlite'), { readOnly: true });
      let state: LibraryState;
      try { state = readState(snapshot, this.name); } finally { snapshot.close(); }
      for (const folder of ['originals', 'thumbnails', 'cache', '.tmp']) await fs.mkdir(path.join(staged, folder));
      const files = state.assets.flatMap(a => [{ relative: a.original, hash: a.hash }, ...(a.thumbnail ? [{ relative: a.thumbnail, hash: '' }] : [])]);
      const copied = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        job.check(); const file = files[i];
        if (!/^(originals|thumbnails)\/[a-f0-9-]+\.(png|jpe?g|webp|wav|mp3|flac|ogg|m4a)$/.test(file.relative)) throw new Error('The library contains an invalid managed file reference');
        if (copied.has(file.relative)) continue;
        progress({ kind: 'backup', completed: i, total: files.length, label: `Copying and verifying file ${i + 1} of ${files.length}` });
        const source = await this.resolve(file.relative), target = path.join(staged, file.relative), hash = createHash('sha256');
        await pipeline(createReadStream(source), async function* (chunks) { for await (const chunk of chunks) { job.check(); hash.update(chunk); yield chunk; } }, createWriteStream(target, { flags: 'wx' }));
        const digest = hash.digest('hex');
        if ((file.hash && digest !== file.hash) || await hashFile(target, job) !== digest) throw new Error('A library file failed verification. No completed backup was created.');
        copied.add(file.relative);
      }
      await fs.writeFile(path.join(staged, 'field-kit.json'), JSON.stringify({ format: 'field-kit', version: 1, name: state.name }, null, 2), { flag: 'wx' });
      job.check();
      try { await fs.lstat(destination); throw new Error('Backup destination already exists'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await fs.rename(staged, destination);
      progress({ kind: 'backup', completed: files.length, total: files.length, label: 'Backup verified' });
      return { path: destination, count: state.assets.length };
    } finally {
      // Only this job's exclusively created staging folder may be removed.
      if (inside(resolved, staged) && path.basename(staged) === `.field-kit-backup-${id}.partial`) await fs.rm(staged, { recursive: true, force: true });
    }
  }
  update(data: unknown) {
    const valid = metadataSchema.parse(data), a = this.asset(valid.id);
    for (const id of valid.collections) if (!this.db.prepare('SELECT id FROM collections WHERE id=?').get(id)) throw new Error('Collection was not found');
    return this.store({ ...a, ...valid, tags: [...new Set(valid.tags.filter(Boolean))], collections: [...new Set(valid.collections)] });
  }
  saveRecipe(id: string, recipe: unknown) { const a = this.asset(id); const valid = a.kind === 'image' ? imageRecipeSchema.parse(recipe) : audioRecipeSchema.parse(recipe); if (a.kind === 'audio' && 'end' in valid && valid.end > a.info.duration! + .001) throw new Error('Trim end exceeds duration'); return this.store({ ...a, recipe: valid, prepared: true }); }
  collection(name: string, id = randomUUID()): Collection { this.ready(); const clean = name.trim(); if (!clean || clean.length > 100) throw new Error('Collection name must be 1–100 characters'); this.db.prepare('INSERT INTO collections(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(id, clean); return { id, name: clean }; }
  async gather(paths: string[], job: Job) {
    const files: string[] = []; const visited = new Set<string>();
    const walk = async (file: string, depth: number) => {
      job.check(); if (depth > 25) throw new Error('Folder nesting exceeds 25 levels');
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) { const real = await fs.realpath(file); if (visited.has(real) || real === this.root || this.isInside(real)) return; visited.add(real); for (const entry of await fs.readdir(file)) await walk(path.join(file, entry), depth + 1); }
      else if (stat.isFile()) { files.push(file); if (files.length > LIMITS.files) throw new Error('Import at most 10,000 files at once'); }
    };
    for (const file of paths) await walk(file, 0);
    return files;
  }
  async import(paths: string[], collection: string | undefined, job: Job, progress: (p: Omit<Progress, 'id'>) => void): Promise<ImportResult> {
    this.ready(); if (collection && !this.db.prepare('SELECT id FROM collections WHERE id=?').get(collection)) throw new Error('Collection was not found');
    const result: ImportResult = { added: 0, duplicates: 0, failed: [], cancelled: false };
    let files: string[];
    progress({ kind: 'import', completed: 0, total: 0, label: 'Finding files…' });
    try { files = await this.gather(paths, job); } catch (e) { if (e instanceof Cancelled) return { ...result, cancelled: true }; throw e; }
    for (let i = 0; i < files.length; i++) {
      if (job.cancelled) { result.cancelled = true; break; }
      const file = files[i], ext = path.extname(file).toLowerCase(), name = path.basename(file);
      const id = randomUUID(); let original = '', thumb = '', committed = false;
      const staged = path.join(this.root, '.tmp', id + ext), stagedThumb = path.join(this.root, '.tmp', randomUUID() + '.webp');
      progress({ kind: 'import', completed: i, total: files.length, label: name });
      try {
        const kind = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? 'image' : ['.wav', '.mp3', '.flac', '.ogg', '.m4a'].includes(ext) ? 'audio' : null;
        if (!kind) throw new Error('Unsupported format. Use JPEG, PNG, WebP, WAV, MP3, FLAC, OGG Vorbis or M4A');
        if ((await fs.stat(file)).size > LIMITS.fileBytes) throw new Error('File exceeds the 512 MB import limit');
        original = `originals/${id}${ext}`;
        await fs.copyFile(file, staged, constants.COPYFILE_EXCL);
        const managed = staged, hash = await hashFile(managed, job);
        const existing = this.db.prepare('SELECT id FROM assets WHERE hash=?').get(hash) as { id: string } | undefined;
        if (existing) { const a = this.asset(existing.id, true); if (a.trashedAt) result.inTrash = (result.inTrash || 0) + 1; else if (collection && !a.collections.includes(collection)) this.store({ ...a, collections: [...a.collections, collection] }); result.duplicates++; continue; }
        const info = kind === 'image' ? await this.media.inspectImage(managed) : await this.media.probe(managed, job);
        let waveform: number[] = [];
        if (kind === 'image') { thumb = `thumbnails/${id}.webp`; await this.media.thumbnail(managed, stagedThumb); }
        else { if (ext === '.ogg' && info.codec !== 'vorbis') throw new Error('V1 supports OGG Vorbis; this OGG uses a different codec'); if (ext === '.m4a' && info.codec !== 'aac') throw new Error('V1 supports AAC audio inside M4A'); waveform = await this.media.waveform(managed, job, 600, info.channels); }
        job.check();
        await fs.rename(staged, path.join(this.root, original));
        if (thumb) await fs.rename(stagedThumb, path.join(this.root, thumb));
        job.check();
        this.store({ id, hash, kind, name: path.basename(file, path.extname(file)).trim().slice(0, 160) || 'Untitled material', tags: [], notes: '', collections: collection ? [collection] : [], original, thumbnail: thumb, waveform, waveformVersion: WAVEFORM_VERSION, info, recipe: kind === 'image' ? structuredClone(defaultImage) : defaultAudio(info.duration!), prepared: false, created: new Date().toISOString() });
        committed = true; result.added++;
      } catch (e) { if (e instanceof Cancelled) { result.cancelled = true; break; } result.failed.push({ name, reason: (e as Error).message.slice(0, 600) }); }
      finally { await fs.unlink(staged).catch(() => {}); await fs.unlink(stagedThumb).catch(() => {}); if (!committed) { if (original) await fs.unlink(path.join(this.root, original)).catch(() => {}); if (thumb) await fs.unlink(path.join(this.root, thumb)).catch(() => {}); } }
    }
    progress({ kind: 'import', completed: result.added + result.duplicates + result.failed.length, total: files.length, label: result.cancelled ? 'Import cancelled' : 'Import complete' });
    return result;
  }
  async render(id: string, recipe: unknown, job: Job): Promise<RenderResult> {
    let a = this.asset(id);
    const valid = a.kind === 'image' ? imageRecipeSchema.parse(recipe) : audioRecipeSchema.parse(recipe);
    if (a.kind === 'audio' && a.waveformVersion !== WAVEFORM_VERSION) {
      const waveform = await this.media.waveform(await this.resolve(a.original), job, 600, a.info.channels);
      job.check(); a = this.store({ ...a, waveform, waveformVersion: WAVEFORM_VERSION });
    }
    const originalWaveform = a.kind === 'audio' ? a.waveform : undefined;
    const key = createHash('sha256').update('renderer-v4:' + a.hash + JSON.stringify(valid)).digest('hex').slice(0, 24);
    const relative = `cache/${id}-${key}.${a.kind === 'image' ? 'png' : 'wav'}`, full = path.join(this.root, relative);
    const sidecar = `${full}.json`;
    try {
      const cached = await this.resolve(relative);
      const record = cacheSchema.parse(JSON.parse(await fs.readFile(await this.resolve(relative + '.json'), 'utf8')));
      const consistent = a.kind === 'image' ? record.info.width === (valid as { size: number }).size && record.info.height === record.info.width && record.info.format === 'png' : record.info.codec === 'pcm_s16le' && record.info.sampleRate === 48000 && record.info.channels === (valid as { channels: number }).channels && !!record.info.duration && !!record.waveform;
      if (consistent && (await fs.stat(cached)).size === record.info.bytes && await hashFile(cached, job) === record.sha256) {
        job.check(); return { path: relative, info: record.info, waveform: record.waveform, originalWaveform };
      }
    } catch (e) { if (e instanceof Cancelled) throw e; }
    const temporary = path.join(this.root, '.tmp', `${randomUUID()}.${a.kind === 'image' ? 'png' : 'wav'}`);
    const temporarySidecar = path.join(this.root, '.tmp', `${randomUUID()}.json`);
    try {
      const original = await this.resolve(a.original);
      const info = a.kind === 'image' ? await this.media.image(original, temporary, imageRecipeSchema.parse(valid), job) : await this.media.audio(original, temporary, audioRecipeSchema.parse(valid), job);
      const waveform = a.kind === 'audio' ? await this.media.waveform(temporary, job, 600, info.channels) : undefined;
      const sha256 = await hashFile(temporary, job);
      await fs.writeFile(temporarySidecar, JSON.stringify({ version: 2, sha256, info, waveform }), { flag: 'wx' });
      job.check(); await replaceDerivedFile(temporary, full, job); await replaceDerivedFile(temporarySidecar, sidecar, job);
      // Keep only eight past renders per asset. Current recipe outputs regenerate on demand.
      const older = (await fs.readdir(path.join(this.root, 'cache'))).filter(n => n.startsWith(id) && !n.endsWith('.json') && n !== path.basename(full));
      const dated = await Promise.all(older.map(async n => ({ n, time: (await fs.stat(path.join(this.root, 'cache', n))).mtimeMs })));
      for (const entry of dated.sort((a, b) => b.time - a.time).slice(7)) { await fs.unlink(path.join(this.root, 'cache', entry.n)).catch(() => {}); await fs.unlink(path.join(this.root, 'cache', entry.n + '.json')).catch(() => {}); }
      return { path: relative, info, waveform, originalWaveform };
    } finally { await fs.unlink(temporary).catch(() => {}); await fs.unlink(temporarySidecar).catch(() => {}); }
  }
  async export(options: ExportOptions, destination: string, job: Job, progress: (p: Omit<Progress, 'id'>) => void): Promise<ExportResult> {
    const valid = exportSchema.parse(options), format = valid.format || 'zip'; this.ready(); job.check();
    if (!path.isAbsolute(destination) || (format === 'zip' && path.extname(destination).toLowerCase() !== '.zip')) throw new Error('Choose a ZIP destination');
    if (format === 'folder' && path.basename(destination) !== valid.folderName) throw new Error('Choose a valid new folder name');
    const parent = await fs.realpath(path.dirname(destination));
    if (!(await fs.stat(parent)).isDirectory()) throw new Error('Choose a destination folder');
    destination = path.join(parent, path.basename(destination));
    if (parent === this.root || this.isInside(parent) || destination === this.root) throw new Error('Export packs outside the managed library');
    await requireNewDestination(destination);
    let assets = [...new Set(valid.ids)].map(id => this.asset(id));
    if (valid.historyId) {
      const history = this.getExportHistory(valid.historyId);
      if (assets.length !== history.assets.length || assets.some((a, i) => a.id !== history.assets[i].id)) throw new Error('The selection does not match this export history record. Open it again.');
      assets = assets.map((asset, index) => {
        const snapshot = history.assets[index];
        if (asset.hash !== snapshot.hash || asset.kind !== snapshot.kind) throw new Error('A recorded original no longer matches this library.');
        return { ...asset, name: snapshot.name, tags: snapshot.tags, recipe: snapshot.recipe };
      });
    }
    const manifest: { schemaVersion: number; generator: string; author?: string; attribution?: string; assets: unknown[] } = { schemaVersion: 1, generator: `Field Kit ${version}`, assets: [] };
    if (valid.author.trim()) manifest.author = valid.author.trim(); if (valid.attribution.trim()) manifest.attribution = valid.attribution.trim();
    if (valid.profileId && !this.state().exportProfiles.some(p => p.id === valid.profileId)) throw new Error('This export profile no longer exists. Choose another profile.');
    const settings = valid.settings || defaultExportSettings, planned = planExport(assets, settings);
    const total = assets.length * (format === 'folder' ? 2 : 1) + 1;
    const files: { full: string; output: string }[] = [];
    for (let i = 0; i < assets.length; i++) {
      job.check(); const a = assets[i]; progress({ kind: 'export', completed: i, total, label: `Preparing ${a.name}` });
      if (valid.historyId && await hashFile(await this.resolve(a.original), job) !== a.hash) throw new Error(`The recorded original for “${a.name}” has changed. Restore it from a library backup before repeating this pack.`);
      const rendered = await this.render(a.id, planned[i].recipe, job), output = planned[i].output;
      files.push({ full: await this.resolve(rendered.path), output });
      manifest.assets.push({ name: a.name, tags: a.tags, type: a.kind === 'image' ? 'texture' : 'sound', path: output, ...(a.kind === 'image' ? { width: rendered.info.width, height: rendered.info.height, format: 'png', colorSpace: 'sRGB' } : { duration: rendered.info.duration, sampleRate: rendered.info.sampleRate, channels: rendered.info.channels, codec: rendered.info.codec, bitDepth: 16 }) });
    }
    job.check(); progress({ kind: 'export', completed: assets.length, total, label: 'Writing asset pack…' });
    await writePack(destination, format, files, manifest, job, count => progress({ kind: 'export', completed: assets.length + count, total, label: `Copying file ${count} of ${assets.length}` }));
    // Once published, an export is successful even if the following bookkeeping fails.
    const warnings: string[] = []; let profileRemembered = true, record: ExportHistorySummary | undefined;
    try { this.db.prepare('INSERT INTO export_preferences(id,profile_id) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET profile_id=excluded.profile_id').run(valid.profileId || null); }
    catch { profileRemembered = false; warnings.push('The pack was exported, but the last profile choice could not be saved.'); }
    try {
      const history = exportHistorySchema.parse({ id: randomUUID(), created: new Date().toISOString(), name: path.basename(destination), format, settings, author: valid.author, attribution: valid.attribution, ...(valid.profileId ? { profileId: valid.profileId } : {}), assets: assets.map(a => ({ id: a.id, hash: a.hash, kind: a.kind, name: a.name, tags: a.tags, recipe: recipeSnapshot(a).recipe })) });
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare('INSERT INTO export_history(id,data) VALUES(?,?)').run(history.id, JSON.stringify(history));
        this.db.exec('DELETE FROM export_history WHERE id NOT IN (SELECT id FROM export_history ORDER BY rowid DESC LIMIT 20)');
        this.db.exec('COMMIT'); record = summarizeExport(history);
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } catch { warnings.push('The pack was exported, but its export history could not be saved.'); }
    progress({ kind: 'export', completed: total, total, label: 'Pack exported' });
    return { path: destination, count: assets.length, profileRemembered, ...(record ? { record } : {}), ...(warnings.length ? { warning: warnings.join(' ') } : {}) };
  }
}
