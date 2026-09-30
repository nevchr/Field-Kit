import { useState } from 'react';
import { Modal } from './dialog';
import { batchSchema, type Asset, type Collection } from './shared';

export function Organize({ ids, collections, close, saved }: { ids: string[]; collections: Collection[]; close: () => void; saved: (assets: Asset[]) => void }) {
  const [tags, setTags] = useState(''), [memberships, setMemberships] = useState<string[]>([]), [mode, setMode] = useState<'add' | 'remove'>('add'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dismiss = () => { if (!busy) close(); };
  return <Modal title="Organize selected materials" close={dismiss}><form onSubmit={async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { const data = batchSchema.parse({ ids, mode, tags: [...new Set(tags.split(',').map(s => s.trim()).filter(Boolean))], collections: memberships }); const assets = await window.fieldKit.organizeAssets(data); saved(assets); close(); }
    catch (e) { const problem = e as Error & { issues?: { message: string }[] }; setError(problem.issues?.[0]?.message || problem.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { setBusy(false); }
  }}><p>{ids.length} selected {ids.length === 1 ? 'material' : 'materials'}, including selections outside the current view.</p>
    <label>Action<select aria-label="Organize action" value={mode} disabled={busy} onChange={e => setMode(e.target.value as typeof mode)}><option value="add">Add tags and collections</option><option value="remove">Remove tags and collections</option></select></label>
    <label>Tags, separated by commas<input aria-label="Batch tags" maxLength={1830} value={tags} disabled={busy} onChange={e => setTags(e.target.value)} placeholder="stone, forest, ambience"/></label>
    <fieldset className="batch-collections" disabled={busy}><legend>Collections</legend>{collections.length ? collections.map(c => <label className="check-label" key={c.id}><input type="checkbox" checked={memberships.includes(c.id)} onChange={e => setMemberships(old => e.target.checked ? [...old, c.id] : old.filter(id => id !== c.id))}/>{c.name}</label>) : <p className="muted">Create a collection in the sidebar to assign materials here.</p>}</fieldset>
    <p className="muted">Only the tags and collections entered here change. Other details and edits stay as they are.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" disabled={busy} onClick={dismiss}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Applying…' : 'Apply to selected'}</button></div>
  </form></Modal>;
}
