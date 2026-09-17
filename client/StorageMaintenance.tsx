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
      <h2>{tr('maintenance.cleanUpStorage')}</h2>
      <p>{tr('maintenance.findsContentFilesInterrupted')}</p>
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
        {tr('maintenance.findOrphanedFiles')}
      </Button>
      {orphans && (
        <p className="connection-status">
          {orphans.length} {tr('maintenance.files')} · {(size / 1024).toFixed(1)} KB
        </p>
      )}
      {orphans && orphans.length > 0 && (
        <>
          <label className="check">
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />
            {tr('maintenance.iWantMoveThese')}
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
            {tr('maintenance.moveRecycleBin')}
          </Button>
        </>
      )}
      {recycled !== null && (
        <p className="notice">
          {recycled} {tr('maintenance.filesMovedRecycleBin')}
        </p>
      )}
    </section>
  );
}
