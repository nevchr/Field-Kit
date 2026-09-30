import { parentPort, workerData } from 'node:worker_threads';
import { Library } from './library';
import { Job } from './media';

const library = new Library(workerData.bin);
let queue = Promise.resolve();
let current: { id: string; kind: string; job: Job } | undefined;
let newestRender = '';
let shuttingDown = false;
const queued = new Map<string,string>();
const cancelled = new Set<string>();
parentPort!.on('message', message => {
  if (message.action === 'cancel') { current?.job.cancel(); for (const [id, action] of queued) if (['import','export','render','backup','preset:batch'].includes(action)) cancelled.add(id); return; }
  if (message.action === 'shutdown') {
    if (shuttingDown) return;
    shuttingDown = true; current?.job.cancel();
    void queue.finally(() => {
      let error: string | undefined;
      try { library.close(); } catch (e) { error = (e as Error).message; }
      finally { parentPort!.postMessage({ shutdown: true, error }); parentPort!.close(); }
    }).catch(() => parentPort!.close());
    return;
  }
  if (shuttingDown) { parentPort!.postMessage({ id: message.id, error: 'Field Kit is closing' }); return; }
  if (message.action === 'render') { newestRender = message.id; if (current?.kind === 'render') current.job.cancel(); }
  queued.set(message.id,message.action);
  queue = queue.then(async () => {
    const { id, action, args } = message;
    const job = new Job(); if (cancelled.has(id)) job.cancel(); current = { id, kind: action, job };
    const progress = (p: object) => parentPort!.postMessage({ progress: { ...p, id } });
    try {
      // Finish writes already accepted before shutdown; cancel expensive media and library switches.
      if ((shuttingDown && !['save', 'update', 'collection', 'favorite', 'organize', 'preset:save', 'preset:delete', 'trash', 'batch:history', 'profile:save', 'profile:delete'].includes(action)) || (action === 'render' && id !== newestRender)) throw new Error('Cancelled');
      let result: unknown;
      switch (action) {
        case 'open': result = await library.open(args.root, args.create); break;
        case 'state': result = library.root ? library.state() : null; break;
        case 'import': result = await library.import(args.paths, args.collection, job, progress); break;
        case 'update': result = library.update(args); break;
        case 'favorite': result = library.favorite(args); break;
        case 'trash': result = library.setTrash(args); break;
        case 'organize': result = library.organize(args); break;
        case 'preset:save': result = library.savePreset(args); break;
        case 'preset:delete': result = library.deletePreset(args.id); break;
        case 'preset:batch': result = await library.applyBatchPreset(args, job, progress); break;
        case 'batch:history': result = library.changeBatchHistory(args); break;
        case 'profile:save': result = library.saveExportProfile(args); break;
        case 'profile:delete': result = library.deleteExportProfile(args.id); break;
        case 'export:history': result = library.getExportHistory(args.id); break;
        case 'backup': result = await library.backup(args.parent, job, progress); break;
        case 'save': result = library.saveRecipe(args.id, args.recipe); break;
        case 'render': result = await library.render(args.id, args.recipe, job); break;
        case 'collection': result = library.collection(args.name, args.id); break;
        case 'export': result = await library.export(args.options, args.destination, job, progress); break;
        default: throw new Error('Unknown library operation');
      }
      parentPort!.postMessage({ id, result });
    } catch (e) { parentPort!.postMessage({ id, error: (e as Error).message }); }
    finally { if (['import', 'export', 'backup', 'preset:batch'].includes(action)) parentPort!.postMessage({ progress: null }); queued.delete(id); cancelled.delete(id); current = undefined; }
  });
});
