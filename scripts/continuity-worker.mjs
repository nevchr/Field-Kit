import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { texture } from '../tests/fixtures.ts';
import { Library } from '../electron/library.ts';
import { defaultExportSettings } from '../src/shared.ts';

const root = path.resolve('.test-output', `continuity-worker-${Date.now()}`), library = path.join(root, 'library');
await fs.mkdir(root, { recursive: true });
const source = path.join(root, 'surface.png'); await texture(source, 12, 3072, 2048);
const worker = new Worker(path.resolve('dist-electron/worker.cjs'), { workerData: { bin: path.resolve('vendor/ffmpeg/bin') } });
const pending = new Map(); let shutdown;
worker.on('message', message => {
  if (message.shutdown) { shutdown?.(); return; }
  const request = pending.get(message.id);
  if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error)) : request.resolve(message.result); }
});
const rpc = (action, args = {}) => new Promise((resolve, reject) => { const id = randomUUID(); pending.set(id, { resolve, reject }); worker.postMessage({ id, action, args }); });
try {
  await rpc('open', { root: library, create: true }); await rpc('import', { paths: [source] });
  const asset = (await rpc('state')).assets[0];
  const obsoletePreset = await rpc('preset:save', { name: 'Remove before close', kind: 'image', recipe: asset.recipe });
  const historyPreset = await rpc('preset:save', { name: 'History before close', kind: 'image', recipe: { ...asset.recipe, brightness: 1.2, size: 512 } });
  const completedBatch = await rpc('preset:batch', { ids: [asset.id], imagePresetId: historyPreset.id });
  await rpc('batch:history', { id: completedBatch.history[0].id, action: 'undo' }); await rpc('preset:delete', { id: historyPreset.id });
  const obsoleteProfile = await rpc('profile:save', { name: 'Remove profile before close', settings: defaultExportSettings, author: '', attribution: '' });
  const rendering = rpc('render', { id: asset.id, recipe: { ...asset.recipe, size: 2048, brightness: 1.1 } }).catch(error => ({ error: error.message }));
  const redone = rpc('batch:history', { id: completedBatch.history[0].id, action: 'redo' });
  const undone = rpc('batch:history', { id: completedBatch.history[0].id, action: 'undo' });
  const profile = rpc('profile:save', { name: 'Saved profile before close', settings: { ...defaultExportSettings, textureSize: 512 }, author: 'Creator', attribution: '' });
  const deletedProfile = rpc('profile:delete', { id: obsoleteProfile.id });
  const saving = rpc('save', { id: asset.id, recipe: { ...asset.recipe, brightness: 1.37 } }).catch(error => ({ error: error.message }));
  const details = rpc('update', { id: asset.id, name: 'Saved before close', tags: ['kept'], notes: 'Queued details survive shutdown', collections: [] }).catch(error => ({ error: error.message }));
  const favorite = rpc('favorite', { id: asset.id, favorite: true });
  const organized = rpc('organize', { ids: [asset.id], tags: ['batch-kept'], collections: [], mode: 'add' });
  const preset = rpc('preset:save', { name: 'Saved before close', kind: 'image', recipe: asset.recipe });
  const deleted = rpc('preset:delete', { id: obsoletePreset.id });
  const moved = rpc('trash', { ids: [asset.id], trashed: true });
  const restored = rpc('trash', { ids: [asset.id], trashed: false });
  const movedAgain = rpc('trash', { ids: [asset.id], trashed: true });
  const backup = rpc('backup', { parent: root }).catch(error => ({ error: error.message }));
  const queuedBatch = rpc('preset:batch', { ids: [asset.id], imagePresetId: obsoletePreset.id }).catch(error => ({ error: error.message }));
  const stopped = new Promise(resolve => { shutdown = resolve; }); worker.postMessage({ action: 'shutdown' });
  const replies = await Promise.all([rendering, saving, details]); await stopped;
  await Promise.all([favorite, organized, preset, deleted]); assert.equal((await backup).error, 'Cancelled');
  await Promise.all([redone, undone, profile, deletedProfile]); assert.equal((await queuedBatch).error, 'Cancelled');
  const [moveResult, restoreResult, finalMoveResult] = await Promise.all([moved, restored, movedAgain]);
  assert(moveResult[0].trashedAt); assert.equal(restoreResult[0].trashedAt, undefined); assert(finalMoveResult[0].trashedAt);
  const reopened = new Library(path.resolve('vendor/ffmpeg/bin'));
  const state = await reopened.open(library), saved = state.assets[0]; reopened.close();
  assert.equal(replies[0].error, 'Cancelled');
  assert.equal(saved.recipe.brightness, 1.37); assert.equal(saved.name, 'Saved before close'); assert.equal(saved.notes, 'Queued details survive shutdown');
  assert.equal(saved.favorite, true); assert(saved.tags.includes('batch-kept')); assert.equal(state.presets.length, 1); assert.equal(state.presets[0].name, 'Saved before close');
  assert.equal(saved.trashedAt, finalMoveResult[0].trashedAt);
  assert.equal(state.batchHistory[0].state, 'undone'); assert.equal(state.exportProfiles.length, 1); assert.equal(state.exportProfiles[0].name, 'Saved profile before close');
  const report = { root, replies: replies.map(reply => ({ error: reply.error ?? null })), brightness: saved.recipe.brightness, name: saved.name, notes: saved.notes, acceptedTrashAndRestoreDrained: true, trashedAt: saved.trashedAt, queuedBackupCancelled: true, acceptedProfileAndHistoryWritesDrained: true, queuedBatchCancelled: true };
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(report, null, 2)); console.log('CONTINUITY_WORKER_RESULTS ' + JSON.stringify(report));
} finally { await worker.terminate(); }
