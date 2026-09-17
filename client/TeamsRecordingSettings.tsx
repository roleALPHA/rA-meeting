import { useState } from 'react';
import { Video } from 'lucide-react';
import type { TeamsRecordingMode, WorkspaceSettings } from '../shared/model';
import { useApi } from './api-context';
import { t as tr } from './i18n';
import { Button } from './ui';

const options = {
  off: 'settings.teamsRecording.off',
  'allow-transcription': 'settings.teamsRecording.allowTranscription',
  'record-and-transcribe': 'settings.teamsRecording.recordAndTranscribe',
} as const;

/** Workspace setting for the Teams meeting option applied when events are linked. */
export function TeamsRecordingSettings({
  settings,
  canManage,
  busy,
  run,
  reload,
}: {
  settings: WorkspaceSettings;
  canManage: boolean;
  busy: boolean;
  run: (task: () => Promise<void>) => void;
  reload: () => Promise<unknown>;
}) {
  const { request } = useApi();
  const [mode, setMode] = useState<TeamsRecordingMode>(settings.teamsRecording);
  return (
    <section className="integration-card">
      <div className="connection-icon">
        <Video size={22} />
      </div>
      <h2>{tr('settings.teamsRecording.title')}</h2>
      <p>{tr('settings.teamsRecording.description')}</p>
      <label className="field">
        <span>{tr('settings.teamsRecording.title')}</span>
        <select
          value={mode}
          disabled={!canManage || busy}
          onChange={e => setMode(e.target.value as TeamsRecordingMode)}
        >
          {Object.entries(options).map(([value, label]) => (
            <option key={value} value={value}>
              {tr(label)}
            </option>
          ))}
        </select>
      </label>
      {mode === 'record-and-transcribe' && <p className="notice">{tr('settings.teamsRecording.recordNotice')}</p>}
      {canManage ? (
        <Button
          className="primary"
          disabled={busy || mode === settings.teamsRecording}
          onClick={() =>
            run(async () => {
              await request('/settings', { teamsRecording: mode, version: settings.version }, 'PUT');
              await reload();
            })
          }
        >
          {tr('settings.save')}
        </Button>
      ) : (
        <p className="small muted">{tr('settings.teamsRecording.ownersOnly')}</p>
      )}
    </section>
  );
}
