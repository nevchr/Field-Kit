import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Modal } from './dialog';
import { mediaUrl, type Asset, type Collection } from './shared';

export function TrashConfirmation({ count, close, move }: { count: number; close: () => void; move: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title="Move to Trash?" close={() => { if (!busy) close(); }}><p>Move {count} {count === 1 ? 'material' : 'materials'} out of your library view? Selected materials outside the current filter are included.</p><p>Current valid edits and details will be saved first. Originals, recipes, favorites and collections stay intact. Restore them from Trash whenever you want.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions"><button disabled={busy} onClick={close}>Keep materials</button><button className="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await move(); close(); } catch (e) { setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); } }}><Trash2 size={16}/>{busy ? 'Moving…' : 'Move to Trash'}</button></div>
  </Modal>;
}

export function TrashDetails({ asset, collections, restore, busy }: { asset: Asset; collections: Collection[]; restore: () => void; busy: boolean }) {
  return <div className="trash-details"><span className="eyebrow">IN TRASH</span><h2>{asset.name}</h2>
    {asset.kind === 'image' ? <img className="trash-original" src={mediaUrl(asset.original)} alt={`Original ${asset.name} in Trash`}/> : <div className="trash-recording"><p>Original recording</p><audio controls preload="metadata" src={mediaUrl(asset.original)} aria-label="Original recording in Trash"/></div>}
    <p>Moved to Trash {new Date(asset.trashedAt!).toLocaleString()}.</p><p>Restore this material to continue editing. Its saved recipe, tags, notes, favorites and collection membership are preserved.</p>
    <dl><dt>Tags</dt><dd>{asset.tags.join(', ') || 'None'}</dd><dt>Collections</dt><dd>{collections.filter(c => asset.collections.includes(c.id)).map(c => c.name).join(', ') || 'None'}</dd>{asset.notes && <><dt>Private notes</dt><dd className="trash-notes">{asset.notes}</dd></>}</dl>
    <button className="primary" disabled={busy} onClick={restore}><RotateCcw size={16}/> Restore material</button><small>Trash keeps files on disk and is included in library backups.</small>
  </div>;
}
