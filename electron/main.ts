import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, session, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { metadataSchema, exportSchema, imageRecipeSchema, audioRecipeSchema, favoriteSchema, batchSchema, savePresetSchema, trashSchema } from '../src/shared';
import { batchPresetSchema, batchHistoryActionSchema, saveExportProfileSchema } from '../src/shared';

protocol.registerSchemesAsPrivileged([{ scheme: 'fieldkit', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const customProfile = app.commandLine.getSwitchValue('user-data-dir');
if (customProfile && path.isAbsolute(customProfile)) { mkdirSync(customProfile, { recursive: true }); app.setPath('userData', customProfile); }
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
let win: BrowserWindow, worker: Worker, root = '', busy = false, quitting = false;
let workerAvailable = false, shutdownRequested = false, quitTimer: NodeJS.Timeout | undefined;
let closeReady = false, closeRequest = '', closeTimer: NodeJS.Timeout | undefined;
const children = new Set<number>();
const pending = new Map<string, { resolve: (r: any) => void; reject: (e: Error) => void }>();
const preference = () => path.join(app.getPath('userData'), 'last-library.json');
const rpc = (action: string, args: unknown = {}) => new Promise<any>((resolve, reject) => {
  if (!workerAvailable || shutdownRequested) { reject(new Error('Processing is unavailable. Use Restart processing to recover your saved library.')); return; }
  const id = randomUUID(); pending.set(id, { resolve, reject });
  try { worker.postMessage({ id, action, args }); } catch (error) { pending.delete(id); reject(error); }
});
function stopChildren() { for (const pid of children) { try { process.kill(pid); } catch {} } children.clear(); }
function finishQuit() { if (quitting) return; if (quitTimer) clearTimeout(quitTimer); if (closeTimer) clearTimeout(closeTimer); stopChildren(); quitting = true; app.quit(); }
function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  if (!workerAvailable) { finishQuit(); return; }
  quitTimer = setTimeout(() => { stopChildren(); void worker.terminate().catch(() => {}); finishQuit(); }, 10000);
  try { worker.postMessage({ action: 'shutdown' }); } catch { finishQuit(); }
}
function requestClose() {
  if (shutdownRequested || closeRequest) return;
  if (!win || win.isDestroyed() || !closeReady) { shutdown(); return; }
  const id = closeRequest = randomUUID();
  // A crashed or unresponsive renderer must not trap the application in its close protocol.
  closeTimer = setTimeout(async () => {
    if (closeRequest !== id || win.isDestroyed()) return;
    const choice = await dialog.showMessageBox(win, { type: 'warning', title: 'Close Field Kit?', message: 'Field Kit is not responding.', detail: 'Keep it open to wait, or close without saving any changes that have not reached the library.', buttons: ['Keep open', 'Close anyway'], defaultId: 0, cancelId: 0, noLink: true });
    if (closeRequest !== id) return;
    choice.response === 1 ? shutdown() : closeRequest = '';
  }, 3000);
  win.webContents.send('window:close-request', id);
}
function startWorker() {
  const active = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: { bin: path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), app.isPackaged ? 'ffmpeg/bin' : 'vendor/ffmpeg/bin') } });
  worker = active; workerAvailable = true;
  const failed = (error: Error) => {
    if (worker !== active || !workerAvailable) return;
    workerAvailable = false; stopChildren();
    for (const request of pending.values()) request.reject(new Error('Processing stopped. Your saved library can be reopened with Restart processing.'));
    pending.clear();
    if (shutdownRequested) finishQuit();
    else if (win && !win.isDestroyed()) { win.webContents.send('job:progress', null); win.webContents.send('processing:error', `Processing stopped. ${error.message}`); }
  };
  active.on('message', msg => {
    if (worker !== active) return;
    if (msg.child) { msg.child.active ? children.add(msg.child.pid) : children.delete(msg.child.pid); return; }
    if (msg.shutdown) { workerAvailable = false; finishQuit(); return; }
    if ('progress' in msg) { if (win && !win.isDestroyed()) win.webContents.send('job:progress', msg.progress); return; }
    const request = pending.get(msg.id);
    if (request) { pending.delete(msg.id); msg.error ? request.reject(new Error(msg.error)) : request.resolve(msg.result); }
  });
  active.on('error', failed);
  active.on('exit', code => { if (worker !== active) return; if (shutdownRequested) { workerAvailable = false; finishQuit(); } else failed(new Error(`The media process exited (${code}).`)); });
}
function sender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame?.url.startsWith('fieldkit://app/')) throw new Error('Untrusted request'); }
function handle(name: string, fn: (arg: any) => unknown) { ipcMain.handle(name, (event, arg) => { sender(event); return fn(arg); }); }
async function exclusive(fn: () => Promise<any>) { if (busy) throw new Error('Wait for the current import, export or backup to finish'); busy = true; try { return await fn(); } finally { busy = false; } }
async function openLibrary(folder: string, create: boolean) { const state = await rpc('open', { root: folder, create }); root = await fs.realpath(folder); await fs.writeFile(preference(), JSON.stringify({ library: root })).catch(() => {}); return state; }
const recipeRequest = z.object({ id: z.string().uuid(), recipe: z.union([imageRecipeSchema, audioRecipeSchema]) }).strict();
async function serve(request: Request) {
  try {
    const url = new URL(request.url), relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(s => s === '..')) return new Response('Invalid path', { status: 400 });
    let base: string;
    if (url.hostname === 'app') base = path.join(app.getAppPath(), 'dist');
    else if (url.hostname === 'media' && root && /^(originals|thumbnails|cache)\/[a-f0-9-]+\.(png|jpe?g|webp|wav|mp3|flac|ogg|m4a)$/.test(relative)) base = root;
    else return new Response('Not found', { status: 404 });
    const file = path.resolve(base, relative || 'index.html');
    if (!file.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
    // Electron virtual ASAR paths are already contained; library files require realpath containment.
    if (url.hostname === 'media' && !(await fs.realpath(file)).startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    const stat = await fs.stat(file); if (!stat.isFile()) return new Response('Not found', { status: 404 });
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4' };
    const headers: Record<string, string> = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': 'fieldkit://app', 'Accept-Ranges': 'bytes', 'Cache-Control': url.hostname === 'media' ? 'no-cache' : 'no-store' };
    let start = 0, end = stat.size - 1, status = 200;
    const range = request.headers.get('Range');
    if (range) { const match = /^bytes=(\d+)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416 }); start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; if (start > end || start < 0) return new Response(null, { status: 416 }); status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; }
    headers['Content-Length'] = String(Math.max(0, end - start + 1));
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status, headers });
  } catch { return new Response('File unavailable. Reopen the library if it was moved.', { status: 404 }); }
}
app.whenReady().then(async () => {
  if (!primaryInstance) return;
  Menu.setApplicationMenu(null);
  startWorker();
  protocol.handle('fieldkit', serve);
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(fieldkit:|devtools:|data:|blob:)/.test(details.url) }));
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 900, minHeight: 560, backgroundColor: '#f4f1e9', title: 'Field Kit', icon: path.join(app.getAppPath(), 'dist/icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('close', event => { if (!quitting) { event.preventDefault(); requestClose(); } });
  app.on('second-instance', () => { if (win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.focus(); });
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  handle('app:diagnostics', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    packaged: app.isPackaged,
    libraryPath: root || null,
    processingAvailable: workerAvailable && !shutdownRequested,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    gpu: app.getGPUFeatureStatus() as unknown as Record<string, string>,
  }));
  handle('app:copy-diagnostics', text => { clipboard.writeText(z.string().max(50000).parse(text)); });
  handle('library:state', () => rpc('state'));
  handle('asset:favorite', data => rpc('favorite', favoriteSchema.parse(data)));
  handle('asset:trash', data => rpc('trash', trashSchema.parse(data)));
  handle('asset:organize', data => rpc('organize', batchSchema.parse(data)));
  handle('preset:save', data => rpc('preset:save', savePresetSchema.parse(data)));
  handle('preset:delete', id => rpc('preset:delete', { id: z.string().uuid().parse(id) }));
  handle('preset:batch', data => exclusive(() => rpc('preset:batch', batchPresetSchema.parse(data))));
  handle('batch:history', data => rpc('batch:history', batchHistoryActionSchema.parse(data)));
  handle('profile:save', data => rpc('profile:save', saveExportProfileSchema.parse(data)));
  handle('profile:delete', id => rpc('profile:delete', { id: z.string().uuid().parse(id) }));
  handle('export:history', id => rpc('export:history', { id: z.string().uuid().parse(id) }));
  handle('library:backup', () => exclusive(async () => {
    if (!root) throw new Error('Open a library first');
    const choice = await dialog.showOpenDialog(win, { title: 'Choose a folder for the library backup', buttonLabel: 'Back up here', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    return rpc('backup', { parent: choice.filePaths[0] });
  }));
  handle('processing:restart', () => exclusive(async () => {
    if (shutdownRequested) throw new Error('Field Kit is closing');
    if (!workerAvailable) { await worker?.terminate().catch(() => {}); startWorker(); if (root) return rpc('open', { root, create: false }); }
    return rpc('state');
  }));
  handle('library:choose', create => exclusive(async () => { z.boolean().parse(create); const picked = await dialog.showOpenDialog(win, { title: create ? 'Choose an empty folder for your new library' : 'Open a Field Kit library folder', properties: ['openDirectory', 'createDirectory'] }); if (picked.canceled) return null; return openLibrary(picked.filePaths[0], create); }));
  handle('library:import', args => exclusive(async () => { const v = z.object({ folder: z.boolean(), collection: z.string().uuid().optional() }).strict().parse(args); if (!root) throw new Error('Open a library first'); const picked = await dialog.showOpenDialog(win, { title: v.folder ? 'Import a folder (including subfolders)' : 'Import photographs and recordings', properties: v.folder ? ['openDirectory'] : ['openFile', 'multiSelections'], filters: v.folder ? [] : [{ name: 'Photographs and recordings', extensions: ['jpg', 'jpeg', 'png', 'webp', 'wav', 'mp3', 'flac', 'ogg', 'm4a'] }, { name: 'All files', extensions: ['*'] }] }); if (picked.canceled) return null; return rpc('import', { paths: picked.filePaths, collection: v.collection }); }));
  handle('library:drop', args => exclusive(() => { const v = z.object({ paths: z.array(z.string().min(1).max(32768).refine(p => path.isAbsolute(p))).min(1).max(10000), collection: z.string().uuid().optional() }).strict().parse(args); return rpc('import', v); }));
  handle('asset:update', args => rpc('update', metadataSchema.parse(args)));
  handle('asset:save', args => rpc('save', recipeRequest.parse(args)));
  handle('asset:render', args => rpc('render', recipeRequest.parse(args)));
  handle('collection:save', args => rpc('collection', z.object({ name: z.string().trim().min(1).max(100), id: z.string().uuid().optional() }).strict().parse(args)));
  handle('pack:export', args => exclusive(async () => {
    const options = exportSchema.parse(args);
    if (options.format === 'folder') {
      const picked = await dialog.showOpenDialog(win, { title: `Create “${options.folderName}” inside this folder`, buttonLabel: 'Export here', properties: ['openDirectory', 'createDirectory'] });
      if (picked.canceled || !picked.filePaths[0]) return null;
      return rpc('export', { options, destination: path.join(picked.filePaths[0], options.folderName!) });
    }
    const picked = await dialog.showSaveDialog(win, { title: 'Export asset pack to a new ZIP', defaultPath: 'Field Kit Pack.zip', filters: [{ name: 'ZIP asset pack', extensions: ['zip'] }], properties: ['showOverwriteConfirmation', 'createDirectory'] });
    if (picked.canceled || !picked.filePath) return null;
    return rpc('export', { options, destination: picked.filePath });
  }));
  ipcMain.on('job:cancel', event => { sender(event); if (workerAvailable) worker.postMessage({ action: 'cancel' }); });
  ipcMain.on('window:close-ready', (event, ready) => { sender(event); closeReady = ready === true; });
  ipcMain.on('window:close-response', (event, message) => {
    sender(event);
    const result = z.object({ id: z.string().uuid(), decision: z.enum(['wait', 'cancel', 'close']) }).strict().safeParse(message);
    if (!result.success || result.data.id !== closeRequest) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined; }
    if (result.data.decision === 'cancel') closeRequest = '';
    else if (result.data.decision === 'close') shutdown();
  });
  let startupError = '';
  try { const saved = JSON.parse(await fs.readFile(preference(), 'utf8')); if (typeof saved.library === 'string') await openLibrary(saved.library, false); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') startupError = 'Your last library could not be opened. Choose Open library to locate it again.'; }
  await win.loadURL('fieldkit://app/index.html');
  if (startupError) await dialog.showMessageBox(win, { type: 'info', message: startupError });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  requestClose();
});
