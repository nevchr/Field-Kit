import { useEffect, useRef, useState } from 'react';
import { type Asset, type Collection, metadataSchema } from './shared';

type Form = { name: string; tags: string; notes: string; collections: string[] };
const formFor = (asset: Asset): Form => ({ name: asset.name, tags: asset.tags.join(', '), notes: asset.notes, collections: asset.collections });
type Props = { asset: Asset; collections: Collection[]; saved: (asset: Asset) => void; onDirty: (dirty: boolean) => void; onSaveReady: (save: (() => Promise<void>) | null) => void };

export function Details({ asset, collections, saved, onDirty, onSaveReady }: Props) {
  const [form, setForm] = useState(() => formFor(asset)), [saving, setSaving] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const pending = useRef<Promise<void> | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(formFor(asset));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const change = (patch: Partial<Form>) => { setForm(previous => ({ ...previous, ...patch })); setError(''); setStatus(''); };
  const save = (): Promise<void> => {
    if (pending.current) return pending.current;
    const task = (async () => {
      try {
        setError('');
        const tags = [...new Set(form.tags.split(',').map(tag => tag.trim()).filter(Boolean))];
        if (!form.name.trim()) throw new Error('Enter a material name.');
        if (tags.length > 30) throw new Error('Use no more than 30 tags.');
        if (tags.some(tag => tag.length > 60)) throw new Error('Keep each tag to 60 characters or fewer.');
        const data = metadataSchema.parse({ id: asset.id, ...form, tags });
        setSaving(true);
        const result = await window.fieldKit.updateAsset(data);
        saved(result); setForm(formFor(result)); setStatus('Details saved');
      } catch (error) { setError(String((error as Error).message).replace(/^Error invoking remote method '[^']+': Error: /, '')); throw error; }
      finally { setSaving(false); }
    })();
    pending.current = task;
    void task.finally(() => { pending.current = null; }).catch(() => {});
    return task;
  };
  useEffect(() => { onSaveReady(save); return () => onSaveReady(null); }, [form, asset, saved, onSaveReady]);
  return <form className="details" onSubmit={event => { event.preventDefault(); void save().catch(() => {}); }}>
    <label>Material name<input required disabled={saving} maxLength={160} value={form.name} onChange={event => change({ name: event.target.value })}/></label>
    <label>Tags <span className="muted">separate with commas</span><input disabled={saving} value={form.tags} onChange={event => change({ tags: event.target.value })} placeholder="stone, weathered, exterior"/></label>
    <label>Private notes<textarea disabled={saving} maxLength={10000} value={form.notes} onChange={event => change({ notes: event.target.value })} placeholder="Where you found it, what you might make…"/></label>
    <fieldset><legend>Collections</legend>{collections.map(collection => <label className="check-label" key={collection.id}><input disabled={saving} type="checkbox" checked={form.collections.includes(collection.id)} onChange={event => change({ collections: event.target.checked ? [...form.collections, collection.id] : form.collections.filter(id => id !== collection.id) })}/>{collection.name}</label>)}{!collections.length && <p className="muted">Add a collection using the + in the sidebar.</p>}</fieldset>
    <div className="detail-facts"><span>Original format<strong>{asset.info.format}</strong></span><span>File size<strong>{((asset.info.bytes || 0) / 1048576).toFixed(2)} MB</strong></span><span>{asset.kind === 'image' ? 'Dimensions' : 'Duration'}<strong>{asset.kind === 'image' ? `${asset.info.width} × ${asset.info.height}` : `${asset.info.duration?.toFixed(3)} seconds`}</strong></span><span>Imported<strong>{new Date(asset.created).toLocaleDateString()}</strong></span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="save-details"><button className="primary" disabled={saving} type="submit">{saving ? 'Saving details…' : 'Save details'}</button><span role="status">{dirty ? 'Unsaved changes' : status}</span></div>
  </form>;
}
