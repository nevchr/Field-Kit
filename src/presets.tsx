import { useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { Modal } from './dialog';
import { applyPreset, imageRecipeSchema, audioRecipeSchema, type Preset, type ImageRecipe, type AudioRecipe } from './shared';

export type PresetProps = { presets: Preset[]; onPresetSaved: (preset: Preset) => void; onPresetDeleted: (id: string) => void };
export function PresetBar<T extends ImageRecipe | AudioRecipe>({ kind, recipe, change, presets, onPresetSaved, onPresetDeleted }: PresetProps & { kind: 'image' | 'audio'; recipe: T; change: (recipe: T) => void }) {
  const [selected, setSelected] = useState(''), [modal, setModal] = useState<'save' | 'delete' | null>(null), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const available = presets.filter(p => p.kind === kind), preset = available.find(p => p.id === selected);
  const valid = (kind === 'image' ? imageRecipeSchema : audioRecipeSchema).safeParse(recipe).success;
  const description = kind === 'image' ? 'Saves light, color, edge blend and output size. Each photograph keeps its crop and orientation.' : 'Saves level, fades, normalization, crossfade and channels. Each recording keeps its trim; fades and crossfade shorten to fit.';
  const close = () => { if (!busy) { setModal(null); setError(''); } };
  return <div className="preset-section">
    <div className="preset-bar"><select aria-label={kind === 'image' ? 'Texture preset' : 'Sound preset'} value={preset ? selected : ''} onChange={e => setSelected(e.target.value)}><option value="">{available.length ? 'Choose a preset…' : 'No saved presets'}</option>{available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button disabled={!preset || !valid} onClick={() => { try { change(applyPreset(preset!, recipe) as T); setError(''); } catch (e) { setError((e as Error).message); } }}>Apply</button>
      <button className="icon" disabled={!valid} aria-label="Save current settings as preset" title="Save current settings as preset" onClick={() => { setName(''); setError(''); setModal('save'); }}><BookmarkPlus size={17}/></button>
      <button className="icon" disabled={!preset} aria-label="Delete selected preset" title="Delete selected preset" onClick={() => { setError(''); setModal('delete'); }}><Trash2 size={16}/></button>
    </div>
    {error && !modal && <p className="form-error" role="alert">{error}</p>}
    {modal && <Modal title={modal === 'save' ? 'Save processing preset' : 'Delete preset?'} close={close}>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try {
        if (modal === 'save') { if (!name.trim()) throw new Error('Enter a preset name.'); const saved = await window.fieldKit.savePreset({ name, kind, recipe }); onPresetSaved(saved); setSelected(saved.id); }
        else if (preset) { await window.fieldKit.deletePreset(preset.id); onPresetDeleted(preset.id); setSelected(''); }
        setModal(null);
      } catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); } }}>
        {modal === 'save' ? <><p>{description}</p><label>Preset name<input required autoFocus maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label><p className="muted">Available to every material of this type in this library.</p></> : <p>Delete “{preset?.name}”? Materials that used it keep their current settings.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" onClick={close} disabled={busy}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : modal === 'save' ? 'Save preset' : 'Delete preset'}</button></div>
      </form>
    </Modal>}
  </div>;
}
