import { useState } from 'react';
import { Modal } from './dialog';
import { applyPreset, type Asset, type Preset, type BatchPresetOptions, type BatchHistorySummary, type Progress } from './shared';

const message = (error: unknown) => String((error as Error).message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');

export function BatchPresets({ assets, presets, visibleCount, close, apply, cancel, progress }: { assets: Asset[]; presets: Preset[]; visibleCount: number; close: () => void; apply: (options: BatchPresetOptions) => Promise<void>; cancel: () => void; progress: Progress | null }) {
  const [imageId, setImageId] = useState(''), [audioId, setAudioId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const image = presets.find(p => p.id === imageId), audio = presets.find(p => p.id === audioId);
  const affected = assets.filter(a => a.kind === 'image' ? image : audio);
  const changed = affected.filter(a => !a.prepared || JSON.stringify(applyPreset((a.kind === 'image' ? image : audio)!, a.recipe)) !== JSON.stringify(a.recipe));
  const picker = (kind: 'image' | 'audio', value: string, set: (id: string) => void) => <label>{kind === 'image' ? 'Texture preset for batch' : 'Sound preset for batch'}<select value={value} disabled={busy} onChange={e => set(e.target.value)}><option value="">Leave {kind === 'image' ? 'textures' : 'sounds'} unchanged</option>{presets.filter(p => p.kind === kind).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  return <Modal title="Apply presets to selected materials" close={() => { if (!busy) close(); }}>
    <p>{assets.length} selected · {assets.filter(a => a.kind === 'image').length} textures · {assets.filter(a => a.kind === 'audio').length} sounds. {assets.length - visibleCount} selected outside the current view.</p>
    {assets.some(a => a.kind === 'image') && picker('image', imageId, setImageId)}
    {assets.some(a => a.kind === 'audio') && picker('audio', audioId, setAudioId)}
    {!presets.length && <p>Save a processing preset in a material’s workbench first.</p>}
    <div className="batch-review" aria-label="Batch review"><strong>{changed.length} to change · {affected.length - changed.length} already match · {assets.length - affected.length} skipped</strong><p>Crops, orientation and trims stay intact. Fades fit each recording. Valid edits and Details save first; the complete batch is prepared before its recipes are saved together.</p>
      {image && <p>Textures: {image.name} · {image.kind === 'image' ? `${image.settings.size} px · brightness ${image.settings.brightness} · contrast ${image.settings.contrast} · saturation ${image.settings.saturation} · edge blend ${image.settings.blend}` : ''}</p>}
      {audio && <p>Sounds: {audio.name} · {audio.kind === 'audio' ? `${audio.settings.channels === 1 ? 'mono' : 'stereo'} · volume ${audio.settings.volume} · ${audio.settings.normalize ? 'normalized' : 'no normalization'} · fades ${audio.settings.fadeIn}/${audio.settings.fadeOut} s · crossfade ${audio.settings.crossfade} s` : ''}</p>}
    </div>
    {assets.length > 1000 && <p className="form-error" role="alert">Choose up to 1,000 materials for one batch.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {busy && <div className="batch-progress" role="status"><strong>{progress?.kind === 'batch' ? progress.label : 'Saving current edits…'}</strong><progress max={progress?.total || 1} value={progress?.kind === 'batch' ? progress.completed : undefined}/><span>{progress?.kind === 'batch' ? `${progress.completed} / ${progress.total}` : 'Preparing the batch'}</span></div>}
    <p className="muted">The last ten batches remain available in Batch history, including after restart.</p>
    <div className="dialog-actions"><button onClick={busy ? cancel : close}>{busy ? 'Cancel batch' : 'Cancel'}</button><button className="primary" disabled={busy || !changed.length || assets.length > 1000} onClick={async () => { setBusy(true); setError(''); try { await apply({ ids: assets.map(a => a.id), ...(imageId ? { imagePresetId: imageId } : {}), ...(audioId ? { audioPresetId: audioId } : {}) }); close(); } catch (e) { setError(message(e) === 'Cancelled' ? 'Batch cancelled. No batch recipes were saved.' : message(e)); } finally { setBusy(false); } }}>{busy ? 'Preparing…' : 'Prepare selected'}</button></div>
  </Modal>;
}

export function BatchHistoryDialog({ history, close, change }: { history: BatchHistorySummary[]; close: () => void; change: (id: string, action: 'undo' | 'redo') => Promise<void> }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  return <Modal title="Batch history" close={() => { if (!busy) close(); }}><p>The last ten completed batches. Undo and redo keep names, tags, notes and collections. A material with newer edits or in Trash must be resolved before its batch can change.</p>
    {!history.length && <p>No completed batches yet. Select materials and use Apply presets.</p>}
    <div className="batch-history">{history.map(item => <article key={item.id}><div><strong>{item.label}</strong><small>{item.count} materials · {new Date(item.created).toLocaleString()} · {item.state === 'applied' ? 'Applied' : 'Undone'}</small></div><button disabled={!!busy} aria-label={`${item.state === 'applied' ? 'Undo' : 'Redo'} batch ${item.label}`} onClick={async () => { setBusy(item.id); setError(''); try { await change(item.id, item.state === 'applied' ? 'undo' : 'redo'); } catch (e) { setError(message(e)); } finally { setBusy(''); } }}>{busy === item.id ? 'Saving…' : item.state === 'applied' ? 'Undo batch' : 'Redo batch'}</button></article>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button disabled={!!busy} onClick={close}>Done</button></div>
  </Modal>;
}
