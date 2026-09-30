import { useState } from 'react';
import { Modal } from './dialog';
import { defaultExportSettings, exportFolderNameSchema, type Asset, type ExportSettings, type ExportProfile, type ExportOptions, type ExportHistory } from './shared';
import { planExport } from './export-plan';

export function ExportDialog({ assets, profiles, lastProfile, history, close, saveProfile, deleteProfile, exportPack }: { assets: Asset[]; profiles: ExportProfile[]; lastProfile: string | null; history?: ExportHistory; close: () => void; saveProfile: (profile: Omit<ExportProfile, 'id'> & { id?: string }) => Promise<ExportProfile>; deleteProfile: (id: string) => Promise<void>; exportPack: (options: ExportOptions) => void }) {
  const initial = profiles.find(p => p.id === (history ? history.profileId : lastProfile));
  const [profileId, setProfileId] = useState(initial?.id || ''), [settings, setSettings] = useState<ExportSettings>(history?.settings || initial?.settings || { ...defaultExportSettings });
  const [author, setAuthor] = useState(history?.author ?? initial?.author ?? ''), [attribution, setAttribution] = useState(history?.attribution ?? initial?.attribution ?? '');
  const [format, setFormat] = useState<'zip' | 'folder'>(history?.format || 'zip'), [folderName, setFolderName] = useState(history?.name.replace(/\.zip$/i, '').slice(0, 80) || 'Field Kit Pack');
  const folderValidation = exportFolderNameSchema.safeParse(folderName);
  const [panel, setPanel] = useState<'export' | 'save' | 'update' | 'delete'>('export'), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [previewPage, setPreviewPage] = useState(0);
  const profile = profiles.find(p => p.id === profileId), planned = planExport(assets, settings), pageCount = Math.max(1, Math.ceil(planned.length / 20));
  const set = (patch: Partial<ExportSettings>) => setSettings(old => ({ ...old, ...patch }));
  const choose = (id: string) => { const found = profiles.find(p => p.id === id); setProfileId(id); setSettings(found?.settings || { ...defaultExportSettings }); setAuthor(found?.author || ''); setAttribution(found?.attribution || ''); setError(''); };
  const dismiss = () => { if (!busy) { if (panel !== 'export') { setPanel('export'); setError(''); } else close(); } };
  const title = panel === 'save' ? 'Save export profile' : panel === 'update' ? 'Update export profile' : panel === 'delete' ? 'Delete export profile?' : 'Export asset pack';
  return <Modal title={title} close={dismiss}>
    {panel === 'export' ? <>
      <p>{assets.length} {assets.length === 1 ? 'material' : 'materials'} · processed PNG textures & PCM WAV sounds</p>
      {history && <p className="batch-review">Re-exporting “{history.name}” from {new Date(history.created).toLocaleString()}. The recorded selection, recipes, names, tags and credits are loaded. Current material edits stay intact; you can adjust this pack’s output settings below.</p>}
      <label>Export format<select aria-label="Export format" value={format} onChange={e => setFormat(e.target.value as 'zip' | 'folder')}><option value="zip">ZIP asset pack</option><option value="folder">New asset folder</option></select></label>
      {format === 'folder' && <><label>New folder name<input aria-describedby="export-folder-hint" value={folderName} maxLength={80} onChange={e => setFolderName(e.target.value)} aria-invalid={!folderValidation.success}/></label><p id="export-folder-hint" className="muted">Choose its parent folder next. Field Kit creates this new folder there and never merges into an existing folder.</p>{!folderValidation.success && <p className="form-error" role="alert">{folderValidation.error.issues[0].message}</p>}</>}
      <label>Export profile<select aria-label="Export profile" value={profileId} onChange={e => choose(e.target.value)}><option value="">Custom pack settings</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="profile-actions"><button onClick={() => { setName(profile ? `${profile.name.slice(0, 70)} copy` : ''); setPanel('save'); }}>Save as profile</button><button disabled={!profile} onClick={() => { setName(profile!.name); setPanel('update'); }}>Update profile</button><button disabled={!profile} onClick={() => setPanel('delete')}>Delete profile</button></div>
      <div className="export-options">
        <label>Pack texture size<select aria-label="Pack texture size" value={settings.textureSize} onChange={e => set({ textureSize: e.target.value === 'keep' ? 'keep' : Number(e.target.value) as 512 | 1024 | 2048 })}><option value="keep">Keep each material’s size</option>{[512, 1024, 2048].map(size => <option key={size} value={size}>{size} × {size}</option>)}</select></label>
        <label>Pack sound channels<select aria-label="Pack sound channels" value={settings.channels} onChange={e => set({ channels: e.target.value === 'keep' ? 'keep' : Number(e.target.value) as 1 | 2 })}><option value="keep">Keep each material’s channels</option><option value="1">Mono</option><option value="2">Stereo</option></select></label>
        <label>Pack normalization<select aria-label="Pack normalization" value={settings.normalize} onChange={e => set({ normalize: e.target.value as ExportSettings['normalize'] })}><option value="keep">Keep each material’s setting</option><option value="on">Normalize peak to −1 dBFS</option><option value="off">Keep edited level</option></select></label>
        <label>Filename prefix<input value={settings.prefix} maxLength={40} onChange={e => set({ prefix: e.target.value })} placeholder="forest_"/></label>
        <label>Filename case<select aria-label="Filename case" value={settings.letterCase} onChange={e => set({ letterCase: e.target.value as ExportSettings['letterCase'] })}><option value="keep">Keep case</option><option value="lower">Lowercase</option></select></label>
        <label>Filename spaces<select aria-label="Filename spaces" value={settings.spaces} onChange={e => set({ spaces: e.target.value as ExportSettings['spaces'] })}><option value="keep">Keep spaces</option><option value="dash">Use dashes</option><option value="underscore">Use underscores</option></select></label>
        <label>Filename numbering<select aria-label="Filename numbering" value={settings.numbering} onChange={e => set({ numbering: e.target.value as ExportSettings['numbering'] })}><option value="none">Only resolve duplicate names</option><option value="prefix">Number every file (001-…)</option></select></label>
      </div>
      <p className="muted">These settings affect this pack. Your saved editing recipes stay intact. Sound output remains 48 kHz, 16-bit PCM. Save the profile to reuse changes.</p>
      <label>Author <span className="muted">optional</span><input value={author} maxLength={200} onChange={e => setAuthor(e.target.value)} placeholder="Your name or studio"/></label>
      <label>Attribution <span className="muted">optional</span><textarea value={attribution} maxLength={4000} onChange={e => setAttribution(e.target.value)} placeholder="Credits or source information you want to include"/></label>
      <section className="export-preview" aria-label="Export file preview"><h3>Files in this pack</h3><p>Names below include safe filename cleanup and duplicate-name suffixes. Also included: manifest.json and README.txt.</p><ul>{planned.slice(previewPage * 20, previewPage * 20 + 20).map(item => <li key={item.asset.id}><code>{item.output}</code><small>{item.description}</small></li>)}</ul>
        {pageCount > 1 && <div className="preview-paging"><button disabled={!previewPage} onClick={() => setPreviewPage(p => p - 1)}>Previous files</button><span>Page {previewPage + 1} of {pageCount}</span><button disabled={previewPage + 1 >= pageCount} onClick={() => setPreviewPage(p => p + 1)}>Next files</button></div>}
      </section>
      <p className="muted">Originals, private notes, source paths and camera metadata stay out of the pack. {format === 'zip' ? 'Choose a new ZIP filename in a local folder.' : 'The new folder appears only after every file is ready.'} Successful exports appear in Export history.</p>
      <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" disabled={format === 'folder' && !folderValidation.success} onClick={() => exportPack({ ids: assets.map(a => a.id), author, attribution, settings, format, ...(format === 'folder' ? { folderName: folderValidation.success ? folderValidation.data : folderName } : {}), ...(profileId ? { profileId } : {}), ...(history ? { historyId: history.id } : {}) })}>Choose destination</button></div>
    </> : <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        if (panel === 'delete') { await deleteProfile(profileId); setProfileId(''); }
        else { const saved = await saveProfile({ ...(panel === 'update' ? { id: profileId } : {}), name, settings, author, attribution }); setProfileId(saved.id); }
        setPanel('export');
      } catch (e) { setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(false); }
    }}>
      {panel === 'delete' ? <p>Delete “{profile?.name}”? Your materials, editing recipes and previously exported packs remain intact. The current pack settings remain available until this dialog closes.</p> : <><p>{panel === 'update' ? 'Update the selected profile, including its name, pack settings and credits.' : 'Save the current pack settings and credits as a reusable profile in this library.'}</p><label>Profile name<input required autoFocus value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)}/></label></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={dismiss}>Cancel</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : panel === 'delete' ? 'Delete export profile' : panel === 'update' ? 'Save profile changes' : 'Save profile'}</button></div>
    </form>}
  </Modal>;
}
