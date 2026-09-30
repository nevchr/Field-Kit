import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), latestClose = useRef(close); latestClose.current = close;
  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    const dismiss = (event: Event) => { event.preventDefault(); latestClose.current(); };
    dialog.addEventListener('cancel', dismiss);
    return () => { dialog.removeEventListener('cancel', dismiss); dialog.close(); };
  }, []);
  return <dialog ref={ref} aria-label={title}><header><h2>{title}</h2><button className="icon" onClick={close} aria-label="Close dialog"><X size={19}/></button></header>{children}</dialog>;
}
