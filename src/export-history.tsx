import { useState } from 'react';
import { Modal } from './dialog';
import type { ExportHistorySummary } from './shared';

export function ExportHistoryDialog({ history, close, repeat }: { history: ExportHistorySummary[]; close: () => void; repeat: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  return <Modal title="Export history" close={() => { if (!busy) close(); }}>
    <p>The last twenty successful packs. Export again loads the recorded materials and edits, even if you have changed them since. Every export uses a new destination.</p>
    {!history.length ? <p className="batch-review">No exports yet. Prepare or select materials, then choose Export pack. Completed ZIP and folder exports appear here.</p> : <div className="batch-history export-history">{history.map(record => <article key={record.id}>
      <div><strong>{record.name}</strong><small>{record.count} {record.count === 1 ? 'material' : 'materials'} · {record.format === 'zip' ? 'ZIP' : 'Folder'} · {new Date(record.created).toLocaleString()}</small>{record.unavailable > 0 && <small>{record.unavailable} unavailable. Restore materials from Trash before exporting again.</small>}</div>
      <button disabled={!!busy} aria-label={`Export ${record.name} again`} onClick={async () => { setBusy(record.id); setError(''); try { await repeat(record.id); } catch (e) { setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': Error: /, '')); } finally { setBusy(''); } }}>{busy === record.id ? 'Loading…' : 'Export again'}</button>
    </article>)}</div>}
    <p className="muted">History is private library data and is included in backups. It needs the managed originals; it does not retain extra copies of exported files.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button disabled={!!busy} onClick={close}>Done</button></div>
  </Modal>;
}
