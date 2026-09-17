import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { OrphanFile } from '../shared/storage/sharepoint-rest';
import { useApi } from './api-context';
import { t as tr } from './i18n';
import { Button } from './ui';

/** Lets site owners move unreferenced content files from interrupted writes to the recycle bin. */
export function StorageMaintenance({ busy, run }: { busy: boolean; run: (task: () => Promise<void>) => void }) {
  const { request } = useApi();
  const [orphans, setOrphans] = useState<OrphanFile[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [recycled, setRecycled] = useState<number | null>(null);
  const size = (orphans ?? []).reduce((n, o) => n + o.size, 0);
  return (
    <section className="integration-card">
      <div className="connection-icon">
        <Trash2 size={22} />
      </div>
      <h2>{tr('Speicher bereinigen')}</h2>
      <p>
        {tr(
          'Findet Inhaltsdateien aus abgebrochenen oder überholten Speichervorgängen, auf die kein Eintrag mehr verweist. Frühere Versionen bleiben erhalten. Nur für Websitebesitzer.',
        )}
      </p>
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            setConfirm(false);
            setRecycled(null);
            setOrphans(await request<OrphanFile[]>('/maintenance/orphans'));
          })
        }
      >
        {tr('Verwaiste Dateien suchen')}
      </Button>
      {orphans && (
        <p className="connection-status">
          {orphans.length} {tr('Dateien')} · {(size / 1024).toFixed(1)} KB
        </p>
      )}
      {orphans && orphans.length > 0 && (
        <>
          <label className="check">
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />
            {tr('Ich möchte diese Dateien in den SharePoint-Papierkorb verschieben.')}
          </label>
          <Button
            className="danger"
            disabled={busy || !confirm}
            onClick={() =>
              run(async () => {
                const result = await request<{ recycled: number }>('/maintenance/orphans', {
                  ids: orphans.map(o => o.id),
                });
                setRecycled(result.recycled);
                setOrphans(null);
                setConfirm(false);
              })
            }
          >
            {tr('In den Papierkorb verschieben')}
          </Button>
        </>
      )}
      {recycled !== null && (
        <p className="notice">
          {recycled} {tr('Dateien in den Papierkorb verschoben. Sie lassen sich dort wiederherstellen.')}
        </p>
      )}
    </section>
  );
}
