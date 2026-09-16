import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { AppError, assert, type Meeting, type Template, type Tension } from '../shared/model.js';
import type { Repository as Store } from '../shared/storage/repository.js';
import { authenticate } from './auth.js';
import { config, integrationStatus } from './config.js';
import { addOutcome, canRead, command, createMeeting, event, getMeeting, saveMeeting, saveTemplate, setTranscript } from './domain.js';
import { parseTranscript } from './transcript.js';
import { assist } from './assistance.js';
import { assistanceInput } from '../shared/assistance.js';
import { analyze } from './analysis.js';
import { entityPlan, connectEntityExport, sendMeetingDraft } from './mcp.js';
import { fetchTranscript, subscribe } from './graph.js';
import { canReadTension, saveTension, attachTension } from './tensions.js';
import { calendarEntries, calendarEntry } from './calendar.js';
const revision = z.number().int().positive();
export function publicMeeting(m: Meeting): Meeting {
  if (!m.graph) return m;
  const { clientState: _secret, ...graph } = m.graph;
  return { ...m, graph };
}
function sameSecret(a: unknown, b: string | undefined) { if (typeof a !== 'string' || typeof b !== 'string') return false; const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
export function createApp(store: Store) {
  const app = express(); app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.cloud.microsoft https://*.office.com https://*.microsoft365.com"); next(); });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  // Graph requires its validationToken echoed as plaintext before authentication.
  for (const route of ['/api/graph/notifications', '/api/graph/lifecycle']) app.post(route, express.json({ limit: '256kb' }), async (req, res) => {
    if (typeof req.query.validationToken === 'string') return void res.type('text/plain').send(req.query.validationToken);
    if (!Array.isArray(req.body?.value)) return void res.status(400).json({ error: 'Ungültige Benachrichtigung.' });
    const meetings = await store.list<Meeting>(config.tenantId, 'meeting');
    for (const n of req.body.value) {
      const m = meetings.find(m => m.graph?.subscriptionId === n.subscriptionId);
      if (!m || !sameSecret(n.clientState, m.graph?.clientState)) continue;
      // Never fetch arbitrary resource URLs from a webhook payload.
      await store.enqueue(`graph:${m.id}:${String(n.resourceData?.id || n.resource || n.lifecycleEvent || 'available')}:${Math.floor(Date.now() / 60_000)}`, config.tenantId, m.id, 'graph', {});
    }
    res.sendStatus(202);
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/config', (_req, res) => res.json({ authMode: config.authMode }));
  app.use('/api', (req, _res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== config.publicUrl && !(config.authMode === 'local' && ['http://localhost:' + config.port, 'http://127.0.0.1:' + config.port].includes(origin))) return next(new AppError(403, 'Anfrage von unbekannter Herkunft.'));
    next();
  });
  app.use('/api', express.json({ limit: '2mb' }), authenticate);
  app.get('/api/bootstrap', async (req, res) => {
    await store.seed(req.actor.tenantId, config.language);
    res.json({ tensions: (await store.list<Tension>(req.actor.tenantId, 'tension')).filter(t => canReadTension(t, req.actor)), actor: req.actor, templates: await store.list<Template>(req.actor.tenantId, 'template'), meetings: (await store.list<Meeting>(req.actor.tenantId, 'meeting')).filter(m => canRead(m, req.actor)).map(publicMeeting), integrations: integrationStatus() });
  });
  app.get('/api/calendar', async (req, res) => {
    const organizer = z.string().uuid().parse(req.query.organizerId || req.actor.id);
    assert(req.actor.admin || organizer === req.actor.id, 'Kein Zugriff auf diesen Kalender.', 403);
    res.json(await calendarEntries(organizer));
  });
  app.post('/api/meetings/:id/calendar-link', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    assert(m.status !== 'completed', 'Abgeschlossene Meetings behalten ihre Terminzuordnung.');
    const organizer = z.string().uuid().parse(req.body.organizerId); assert(req.actor.admin || organizer === req.actor.id, 'Kein Zugriff auf diesen Kalender.', 403);
    const eventId = z.string().min(1).max(2000).parse(req.body.eventId);
    assert(!m.calendar || (m.calendar.organizerId === organizer && m.calendar.eventId === eventId), 'Bestehende Terminzuordnung kann nicht umgebogen werden.', 409);
    const linked = await calendarEntry(organizer, eventId);
    assert(!linked.cancelled || m.calendar, 'Ein abgesagter Termin kann nicht neu verbunden werden.');
    const others = await store.list<Meeting>(req.actor.tenantId, 'meeting');
    assert(!others.some(other => other.id !== m.id && other.calendar?.eventId === eventId && other.calendar.organizerId === organizer), 'Dieser Termin ist bereits mit einem Meeting verbunden.', 409);
    m.calendar = linked; m.scheduledAt = linked.start;
    event(m, req.actor, 'calendar.linked', linked.cancelled ? 'Kalendertermin wurde abgesagt.' : `Kalendertermin abgeglichen: ${linked.title}`);
    res.json(publicMeeting(await saveMeeting(store, req.actor, m, m.revision)));
  });
  app.post('/api/tensions', async (req, res) => res.status(201).json(await saveTension(store, req.actor, req.body)));
  app.put('/api/tensions/:id', async (req, res) => res.json(await saveTension(store, req.actor, req.body, String(req.params.id), revision.parse(req.body.version))));
  app.post('/api/tensions/:id/attach', async (req, res) => res.json(publicMeeting(await attachTension(store, req.actor, String(req.params.id), z.string().uuid().parse(req.body.meetingId), z.string().uuid().parse(req.body.stepId), revision.parse(req.body.revision)))));
  app.post('/api/meetings/:id/entity-preview', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const output = m.outcomes.find(o => o.id === req.body.outcomeId); assert(output, 'Ergebnis fehlt.');
    res.json(entityPlan(m, output));
  });
  app.post('/api/meetings/:id/export-entity', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const output = m.outcomes.find(o => o.id === req.body.outcomeId); assert(output, 'Ergebnis fehlt.');
    const plan = entityPlan(m, output);
    assert(JSON.stringify(req.body.plan) === JSON.stringify(plan), 'Exportvorschau hat sich geändert. Erneut prüfen.', 409);
    const connection = await connectEntityExport(plan);
    try {
      output.export = { state: 'sending', startedAt: new Date().toISOString() };
      event(m, req.actor, 'entity.export.started', `${plan.label}: ${output.title}`);
      await saveMeeting(store, req.actor, m, m.revision);
      try {
        const receipt = await connection.send();
        const current = await getMeeting(store, req.actor, m.id, true); const result = current.outcomes.find(o => o.id === output.id)!;
        result.export = { state: 'draft_created', draftId: receipt.draftId, entityUuid: receipt.entityUuid };
        event(current, req.actor, 'entity.export.completed', `${plan.label}: Entwurf ${receipt.draftId}`);
        res.json(publicMeeting(await saveMeeting(store, req.actor, current, current.revision)));
      } catch {
        const current = await getMeeting(store, req.actor, m.id, true); current.outcomes.find(o => o.id === output.id)!.export = { state: 'uncertain', message: 'In roleALPHA prüfen, bevor erneut übertragen wird.' };
        event(current, req.actor, 'entity.export.uncertain', `${plan.label}: keine eindeutige Antwort.`);
        await saveMeeting(store, req.actor, current, current.revision);
        res.status(502).json({ error: 'Entitätsexport nicht eindeutig bestätigt. In roleALPHA prüfen.' });
      }
    } finally { await connection.close().catch(() => {}); }
  });
  app.post('/api/templates', async (req, res) => res.status(201).json(await saveTemplate(store, req.actor, req.body)));
  app.put('/api/templates/:id', async (req, res) => res.json(await saveTemplate(store, req.actor, req.body, String(req.params.id), revision.parse(req.body.version))));
  app.delete('/api/templates/:id', async (req, res) => { assert(req.actor.admin, 'Nur Administratoren dürfen Templates löschen.', 403); await store.delete(req.actor.tenantId, 'template', String(req.params.id), revision.parse(req.body.version)); res.sendStatus(204); });
  app.post('/api/meetings', async (req, res) => res.status(201).json(publicMeeting(await createMeeting(store, req.actor, req.body))));
  app.get('/api/meetings/:id', async (req, res) => res.json(publicMeeting(await getMeeting(store, req.actor, String(req.params.id)))));
  app.post('/api/meetings/:id/command', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); const rev = revision.parse(req.body.revision);
    assert(m.revision === rev, 'Meeting wurde inzwischen geändert. Bitte neu laden.', 409); command(m, req.actor, req.body);
    res.json(publicMeeting(await saveMeeting(store, req.actor, m, rev)));
  });
  app.post('/api/meetings/:id/transcript', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); const rev = revision.parse(req.body.revision); assert(m.revision === rev, 'Meeting wurde inzwischen geändert.', 409);
    const changed = setTranscript(m, req.actor, parseTranscript(z.string().max(1_000_000).parse(req.body.text)));
    res.json(publicMeeting(changed ? await saveMeeting(store, req.actor, m, rev) : m));
  });
  app.post('/api/meetings/:id/assist', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true);
    assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const input = assistanceInput.parse(req.body.input);
    const suggestion = await assist(m, input);
    // Read-only generation: no proposal, phase, approval or export is changed by a model.
    res.json({ revision: m.revision, suggestion });
  });
  app.post('/api/meetings/:id/analyze', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const results = await analyze(m, z.enum(['de', 'en', 'fr', 'es']).default('de').parse(req.body.language));
    for (const output of results) addOutcome(m, req.actor, output, 'ai');
    m.analyzedHash = m.transcriptHash; event(m, req.actor, 'analysis.completed', `${results.length} Ergebnisvorschläge extrahiert.`);
    res.json(publicMeeting(await saveMeeting(store, req.actor, m, m.revision)));
  });
  app.post('/api/meetings/:id/export', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    assert(integrationStatus().mcp, 'roleALPHA ist nicht verbunden.', 503);
    const ids = z.array(z.string().uuid()).min(1).max(100).parse(req.body.ids);
    assert(new Set(ids).size === ids.length, 'Doppelte Ergebnis-IDs.');
    const outputs = m.outcomes.filter(o => ids.includes(o.id)); assert(outputs.length === ids.length, 'Ergebnis fehlt.');
    assert(outputs.every(o => o.status === 'approved' && !o.export), 'Nur bestätigte, noch nicht exportierte Ergebnisse sind zulässig.', 409);
    for (const o of outputs) o.export = { state: 'sending', startedAt: new Date().toISOString() };
    event(m, req.actor, 'export.started', `${outputs.length} Ergebnisse werden als Meeting-Entwurf übertragen.`);
    await saveMeeting(store, req.actor, m, m.revision);
    try {
      const receipt = await sendMeetingDraft(m, outputs);
      const current = await getMeeting(store, req.actor, m.id, true);
      for (const o of current.outcomes.filter(o => ids.includes(o.id))) o.export = { state: 'draft_created', draftId: receipt.draftId, entityUuid: receipt.entityUuid };
      event(current, req.actor, 'export.completed', `roleALPHA-Entwurf ${receipt.draftId} angelegt; Freigabe in roleALPHA ausstehend.`);
      res.json(publicMeeting(await saveMeeting(store, req.actor, current, current.revision)));
    } catch {
      const current = await getMeeting(store, req.actor, m.id, true);
      for (const o of current.outcomes.filter(o => ids.includes(o.id))) o.export = { state: 'uncertain', message: 'Keine eindeutige Bestätigung. Vor Wiederholung in roleALPHA prüfen.' };
      event(current, req.actor, 'export.uncertain', 'Exportantwort unklar; automatische Wiederholung gesperrt.');
      res.status(502).json({ error: 'Export nicht eindeutig bestätigt. Prüfe den Entwurfsbereich in roleALPHA.', meeting: publicMeeting(await saveMeeting(store, req.actor, current, current.revision)) });
    }
  });
  app.post('/api/meetings/:id/export-reconcile', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const ids = z.array(z.string().uuid()).min(1).parse(req.body.ids); const note = z.string().trim().min(10).max(1000).parse(req.body.note);
    const resolution = z.enum(['not-created', 'created']).parse(req.body.resolution);
    const outputs = m.outcomes.filter(o => ids.includes(o.id)); assert(outputs.length === ids.length && outputs.every(o => o.export?.state === 'uncertain' || (o.export?.state === 'sending' && Date.now() - Date.parse(o.export.startedAt || '') > 300_000)), 'Nur unklare Exporte können abgeglichen werden.');
    for (const o of outputs) o.export = resolution === 'created' ? { state: 'draft_created', draftId: z.string().uuid().parse(req.body.draftId) } : undefined;
    event(m, req.actor, 'export.reconciled', `${resolution}: ${note}`); res.json(publicMeeting(await saveMeeting(store, req.actor, m, m.revision)));
  });
  app.post('/api/meetings/:id/graph-link', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const organizerId = z.string().uuid().parse(req.body.organizerId);
    assert(req.actor.admin || organizerId === req.actor.id, 'Nur Administratoren können Meetings anderer Organisatoren anbinden.', 403);
    const link = { organizerId, onlineMeetingId: z.string().min(1).max(1000).regex(/^[A-Za-z0-9_+=\-/]+$/).parse(req.body.onlineMeetingId) };
    assert(!m.graph || (m.graph.organizerId === link.organizerId && m.graph.onlineMeetingId === link.onlineMeetingId), 'Eine bestehende Teams-Verknüpfung kann nicht umgebogen werden.', 409);
    // Save the link before asynchronous subscription creation so a concurrent meeting edit cannot lose it.
    m.graph = { ...m.graph, ...link }; await saveMeeting(store, req.actor, m, m.revision);
    const linked = await subscribe(m); const current = await getMeeting(store, req.actor, m.id, true); current.graph = linked;
    event(current, req.actor, 'graph.linked', 'Teams-Transkriptbenachrichtigungen eingerichtet.');
    await store.enqueue(`initial:${current.id}:${Date.now()}`, req.actor.tenantId, current.id, 'graph', {});
    res.json(publicMeeting(await saveMeeting(store, req.actor, current, current.revision)));
  });
  app.post('/api/meetings/:id/graph-fetch', async (req, res) => {
    const m = await getMeeting(store, req.actor, String(req.params.id), true); assert(m.revision === revision.parse(req.body.revision), 'Meeting wurde inzwischen geändert.', 409);
    const segments = await fetchTranscript(m); const current = await getMeeting(store, req.actor, m.id, true);
    if (setTranscript(current, req.actor, segments)) await saveMeeting(store, req.actor, current, current.revision);
    if (config.autoAnalysis && integrationStatus().ai) await store.enqueue(`analysis:${current.id}:${current.transcriptHash}`, req.actor.tenantId, current.id, 'analysis', {});
    res.json(publicMeeting(current));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) return void res.status(400).json({ error: 'Bitte die markierten Eingaben prüfen.', fields: error.issues.map(i => i.path.join('.')) });
    if (error instanceof AppError) return void res.status(error.status).json({ error: error.message });
    console.error(error instanceof Error ? error.message : 'Request failed');
    res.status(500).json({ error: 'Die Aktion konnte nicht abgeschlossen werden. Es wurde kein Erfolg bestätigt.' });
  });
  return app;
}
