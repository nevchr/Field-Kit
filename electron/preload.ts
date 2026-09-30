import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Bridge } from '../src/shared';
const bridge: Bridge = {
  getDiagnostics: () => ipcRenderer.invoke('app:diagnostics'),
  copyDiagnostics: text => ipcRenderer.invoke('app:copy-diagnostics', text),
  getState: () => ipcRenderer.invoke('library:state'),
  restartProcessing: () => ipcRenderer.invoke('processing:restart'),
  chooseLibrary: create => ipcRenderer.invoke('library:choose', create),
  importFiles: (folder, collection) => ipcRenderer.invoke('library:import', { folder, collection }),
  importDropped: (files, collection) => ipcRenderer.invoke('library:drop', { paths: files.map(f => webUtils.getPathForFile(f)), collection }),
  updateAsset: data => ipcRenderer.invoke('asset:update', data),
  setFavorite: data => ipcRenderer.invoke('asset:favorite', data),
  setTrash: data => ipcRenderer.invoke('asset:trash', data),
  organizeAssets: data => ipcRenderer.invoke('asset:organize', data),
  savePreset: data => ipcRenderer.invoke('preset:save', data),
  deletePreset: id => ipcRenderer.invoke('preset:delete', id),
  applyBatchPreset: options => ipcRenderer.invoke('preset:batch', options),
  changeBatchHistory: options => ipcRenderer.invoke('batch:history', options),
  saveExportProfile: profile => ipcRenderer.invoke('profile:save', profile),
  deleteExportProfile: id => ipcRenderer.invoke('profile:delete', id),
  getExportHistory: id => ipcRenderer.invoke('export:history', id),
  backupLibrary: () => ipcRenderer.invoke('library:backup'),
  saveRecipe: (id, recipe) => ipcRenderer.invoke('asset:save', { id, recipe }),
  render: (id, recipe) => ipcRenderer.invoke('asset:render', { id, recipe }),
  createCollection: name => ipcRenderer.invoke('collection:save', { name }),
  renameCollection: (id, name) => ipcRenderer.invoke('collection:save', { id, name }),
  exportPack: options => ipcRenderer.invoke('pack:export', options),
  cancel: () => ipcRenderer.send('job:cancel'),
  respondToClose: (id, decision) => ipcRenderer.send('window:close-response', { id, decision }),
  onCloseRequest: fn => { const listener = (_event: unknown, id: string) => fn(id); ipcRenderer.on('window:close-request', listener); ipcRenderer.send('window:close-ready', true); return () => { ipcRenderer.removeListener('window:close-request', listener); ipcRenderer.send('window:close-ready', false); }; },
  onProgress: fn => { const listener = (_event: unknown, p: Parameters<typeof fn>[0]) => fn(p); ipcRenderer.on('job:progress', listener); return () => ipcRenderer.removeListener('job:progress', listener); },
  onProcessingError: fn => { const listener = (_event: unknown, message: string) => fn(message); ipcRenderer.on('processing:error', listener); return () => ipcRenderer.removeListener('processing:error', listener); }
};
contextBridge.exposeInMainWorld('fieldKit', bridge);
