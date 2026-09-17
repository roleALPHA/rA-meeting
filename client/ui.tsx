import { aiProviderLabels } from './labels';
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t as tr } from './i18n';

export function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className={wide ? 'wide' : ''} onCancel={close}>
      <div className="modal-head">
        <h2>{title}</h2>
        <Button className="icon" aria-label={tr('Schließen')} onClick={close}>
          <X size={20} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{tr(label)}</span>
      {children}
    </label>
  );
}
export function AiProvenance({
  provider,
  sensitivityLabel,
}: {
  provider?: keyof typeof aiProviderLabels | null;
  sensitivityLabel?: string | null;
}) {
  return (
    <>
      {provider && (
        <p className="small muted">
          {tr('Erstellt mit')} {tr(aiProviderLabels[provider])}
        </p>
      )}
      {sensitivityLabel && (
        <p className="notice">
          {tr('Die KI-Antwort trägt eine Vertraulichkeitsbezeichnung:')} {sensitivityLabel}.{' '}
          {tr('Prüfe vor dem Übernehmen, ob dieser Inhalt in diesem Arbeitsbereich gespeichert werden darf.')}
        </p>
      )}
    </>
  );
}
