import { randomBytes } from 'node:crypto';
import { assert, type Meeting, type Actor } from '../shared/model.js';
import { config } from './config.js';
import type { Repository as Store } from '../shared/storage/repository.js';
import { addOutcome, event, saveMeeting, setTranscript } from './domain.js';
import { parseTranscript } from './transcript.js';
import { analyze } from './analysis.js';
let cachedToken: { token: string; until: number } | undefined;
async function token() {
  assert(config.authMode === 'entra' && config.clientSecret, 'Microsoft Graph ist nicht konfiguriert.', 503);
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.token;
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, { method: 'POST', signal: AbortSignal.timeout(15_000), body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }) });
  assert(response.ok, 'Microsoft-Graph-Anmeldung fehlgeschlagen.', 502);
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 }; return data.access_token;
}
export async function graph(path: string, init: RequestInit = {}) {
  assert(path.startsWith('/') && !path.startsWith('//'), 'Ungültiger Graph-Pfad.');
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init.headers } });
  assert(response.ok, `Microsoft Graph: HTTP ${response.status}. Berechtigungen und Meeting-ID prüfen.`, 502); return response;
}
export async function subscribe(m: Meeting) {
  assert(m.graph, 'Meeting ist nicht mit Teams verknüpft.');
  const clientState = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 50 * 60_000).toISOString();
  const response = await graph('/subscriptions', { method: 'POST', body: JSON.stringify({ changeType: 'created', notificationUrl: `${config.publicUrl}/api/graph/notifications`, lifecycleNotificationUrl: `${config.publicUrl}/api/graph/lifecycle`, resource: `communications/onlineMeetings/${m.graph.onlineMeetingId}/transcripts`, includeResourceData: false, expirationDateTime: expiresAt, clientState }) });
  const subscription = await response.json() as { id: string; expirationDateTime: string };
  return { ...m.graph, clientState, subscriptionId: subscription.id, expiresAt: subscription.expirationDateTime };
}
export async function fetchTranscript(m: Meeting) {
  assert(!m.calendar?.occurrence, 'Bei Serienterminen das Transkript dieser Durchführung manuell importieren; automatische Zuordnung wird noch nicht unterstützt.', 409);
  assert(m.graph, 'Meeting ist nicht mit Teams verknüpft.');
  const prefix = `/users/${encodeURIComponent(m.graph.organizerId)}/onlineMeetings/${encodeURIComponent(m.graph.onlineMeetingId)}/transcripts`;
  let path: string | null = prefix;
  const entries: { id: string; createdDateTime?: string }[] = [];
  while (path) {
    const data = await (await graph(path)).json() as { value: { id: string; createdDateTime?: string }[]; '@odata.nextLink'?: string };
    entries.push(...data.value);
    const nextLink = data['@odata.nextLink'];
    if (nextLink) { const u = new URL(nextLink); assert(u.origin === 'https://graph.microsoft.com' && u.pathname.startsWith('/v1.0/'), 'Ungültige Graph-Folgeseite.'); path = u.pathname.slice('/v1.0'.length) + u.search; } else path = null;
    assert(entries.length <= 100, 'Zu viele Transkriptteile.');
  }
  assert(entries.length, 'Noch kein Transkript verfügbar.', 409);
  // Include every transcription session, including stop/restart in the same meeting.
  entries.sort((a, b) => String(a.createdDateTime).localeCompare(String(b.createdDateTime)) || a.id.localeCompare(b.id));
  const all = [];
  for (const entry of entries) {
    const raw = await (await graph(`${prefix}/${encodeURIComponent(entry.id)}/content?$format=text/vtt`, { headers: { Accept: 'text/vtt' } })).text();
    all.push(...parseTranscript(raw).map(s => ({ ...s, id: `${entry.id}:${s.id}` })));
  }
  return all;
}
export function startGraphWorker(store: Store) {
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      if (config.authMode !== 'entra' || !config.clientSecret) return;
      const actor: Actor = { id: 'graph-worker', name: 'Microsoft Graph', tenantId: config.tenantId, admin: true };
      for (const m of (await store.list<Meeting>(config.tenantId, 'meeting')).filter(m => m.graph?.subscriptionId)) {
        if (m.status === 'completed' && Date.now() - Date.parse(m.events.find(e => e.type === 'completed')?.at || m.updatedAt) > 24 * 3600_000) continue;
        if (Date.parse(m.graph!.expiresAt || '') - Date.now() < 15 * 60_000) {
          try {
            if (Date.parse(m.graph!.expiresAt || '') <= Date.now()) {
              const link = await subscribe(m);
              const current = await store.get<Meeting>(config.tenantId, 'meeting', m.id); current.graph = link; await saveMeeting(store, actor, current, current.revision);
            } else {
              const expiry = new Date(Date.now() + 50 * 60_000).toISOString();
              const response = await graph(`/subscriptions/${encodeURIComponent(m.graph!.subscriptionId!)}`, { method: 'PATCH', body: JSON.stringify({ expirationDateTime: expiry }) });
              const data = await response.json() as { expirationDateTime: string };
              const current = await store.get<Meeting>(config.tenantId, 'meeting', m.id); current.graph!.expiresAt = data.expirationDateTime; await saveMeeting(store, actor, current, current.revision);
            }
          } catch { /* Persist a recovery job; the UI exposes manual resubscription. */ await store.enqueue(`recover:${m.id}:${Math.floor(Date.now() / 3600_000)}`, actor.tenantId, m.id, 'graph', {}); }
        }
      }
      const job = await store.claimJob();
      if (!job) return;
      try {
        const meeting = await store.get<Meeting>(job.tenant, 'meeting', job.meeting);
        if (job.kind === 'analysis') {
          if (!config.autoAnalysis) { await store.finishJob(job.id); return; }
          if (meeting.transcriptHash !== meeting.analyzedHash) {
            const outputs = await analyze(meeting, config.language);
            for (const output of outputs) addOutcome(meeting, actor, output, 'ai');
            meeting.analyzedHash = meeting.transcriptHash;
            event(meeting, actor, 'analysis.completed', `${outputs.length} Ergebnisvorschläge automatisch extrahiert.`);
            await saveMeeting(store, actor, meeting, meeting.revision);
          }
        } else {
          const segments = await fetchTranscript(meeting);
          const current = await store.get<Meeting>(job.tenant, 'meeting', job.meeting);
          if (setTranscript(current, actor, segments)) await saveMeeting(store, actor, current, current.revision);
          if (config.autoAnalysis && config.aiUrl && config.aiModel) await store.enqueue(`analysis:${current.id}:${current.transcriptHash}`, job.tenant, current.id, 'analysis', {});
        }
        await store.finishJob(job.id);
      } catch (error) {
        const failed = await store.failJob(job, error instanceof Error ? error.message : 'Import oder Analyse fehlgeschlagen.');
        if (failed) { const current = await store.get<Meeting>(job.tenant, 'meeting', job.meeting); event(current, actor, `${job.kind}.failed`, job.kind === 'analysis' ? 'Automatische KI-Auswertung fehlgeschlagen. Manuell erneut auswerten.' : 'Automatischer Transkriptimport fehlgeschlagen. Manuell erneut laden.'); await saveMeeting(store, actor, current, current.revision); }
      }
    } finally { running = false; }
  };
  const timer = setInterval(() => { void tick().catch(() => console.error('Graph worker failed; will retry on next tick.')); }, 30_000);
  timer.unref(); return () => clearInterval(timer);
}
