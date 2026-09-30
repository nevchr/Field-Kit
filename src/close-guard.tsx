import { useEffect, useRef, useState } from 'react';
import { Modal } from './dialog';
import { recipeSaves } from './recipe-saves';

type Props = { detailsDirty: boolean; invalidRecipe: boolean; operation: boolean; libraryBusy?: boolean; save: () => Promise<void> };
export function CloseGuard(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [request, setRequest] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const finish = async (id: string, discard = false) => {
    setRequest(id); setBusy(true); setError('');
    let timer: number | undefined;
    try {
      window.fieldKit.cancel();
      if (!discard) await Promise.race([latest.current.save(), new Promise<never>((_resolve, reject) => { timer = window.setTimeout(() => reject(new Error('Saving is taking longer than expected. Wait and retry, or keep working')), 8000); })]);
      window.fieldKit.respondToClose(id, 'close');
    } catch (error) { setError(String((error as Error).message).replace(/^Error invoking remote method '[^']+': Error: /, '')); setBusy(false); }
    finally { if (timer) clearTimeout(timer); }
  };
  useEffect(() => window.fieldKit.onCloseRequest(id => {
    window.fieldKit.respondToClose(id, 'wait');
    const state = latest.current;
    if (state.detailsDirty || state.invalidRecipe || state.operation || state.libraryBusy || recipeSaves.getSnapshot().failed.length) { setError(''); setRequest(id); }
    else void finish(id);
  }), []);
  const cancel = () => { if (!busy) { window.fieldKit.respondToClose(request, 'cancel'); setRequest(''); setError(''); } };
  if (!request) return null;
  const dirty = props.detailsDirty || props.invalidRecipe || !!recipeSaves.getSnapshot().failed.length;
  return <Modal title="Close Field Kit?" close={cancel}>
    {busy ? <p role="status">Saving changes and stopping processing…</p> : <>
      {props.detailsDirty && <p>Your material details have unsaved changes.</p>}
      {!!recipeSaves.getSnapshot().failed.length && <p>Some recipe changes have not been saved. Save and close will retry them.</p>}
      {props.invalidRecipe && <p>The current recipe has invalid fields. Keep working to correct them, or discard those unsaved controls.</p>}
      {props.operation && <p>Closing cancels the current import, export or backup, or batch preparation. Completed imports, saved batches and existing packs stay intact.</p>}
      {props.libraryBusy && <p>A library change is being saved. Closing waits for it to finish.</p>}
      {!dirty && !props.operation && !props.libraryBusy && <p>Finish saving and close Field Kit.</p>}
    </>}
    {error && <p className="form-error" role="alert">Could not save: {error}. Your window is still open.</p>}
    {error && !dirty && <p>Closing without waiting may leave recent changes unsaved.</p>}
    <div className="dialog-actions close-actions"><button disabled={busy} onClick={cancel}>Keep working</button>{(dirty || error) && <button disabled={busy} onClick={() => void finish(request, true)}>{dirty ? 'Discard and close' : 'Close without waiting'}</button>}<button className="primary" disabled={busy || props.invalidRecipe} onClick={() => void finish(request)}>{dirty ? 'Save and close' : 'Close Field Kit'}</button></div>
  </Modal>;
}
