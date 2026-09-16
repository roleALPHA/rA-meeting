import { AppError, assert } from '../model.js';
import type { Repository, Job } from './repository.js';
import { seedTemplates } from '../templates.js';
export type GraphRequest = (path: string, init?: RequestInit) => Promise<Response>;
export type SharePointSettings = { tenantId: string; siteId: string; listId: string; driveId: string };
type Head = { id: string; eTag: string; fields: { RecordKey: string; RecordKind: string; RecordId: string; RecordVersion: number; PayloadId: string } };
type StoredJob = Job & { version: number; status: 'pending' | 'running' | 'done' | 'failed'; available: number; error?: string; payload: unknown };
const esc = (s: string) => s.replace(/'/g, "''");
const enc = encodeURIComponent;
/** SharePoint list = CAS index; document library = immutable JSON snapshots. No SQL or disk. */
export class SharePointStore implements Repository {
  readonly external = true;
  private prefix: string;
  constructor(readonly settings: SharePointSettings, private request: GraphRequest) {
    this.prefix = `/sites/${enc(settings.siteId)}/lists/${enc(settings.listId)}`;
  }
  private tenant(tenant: string) { assert(tenant === this.settings.tenantId, 'Mandant oder Berechtigung ungültig.', 403); }
  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.request(path, init);
    if (r.status === 409 || r.status === 412) throw new AppError(409, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.');
    if (r.status === 404) throw new AppError(404, 'Eintrag nicht gefunden.');
    if (r.status === 403) throw new AppError(403, 'Keine Berechtigung für diesen SharePoint-Arbeitsbereich.');
    assert(r.ok, 'SharePoint ist nicht verfügbar. Bitte erneut versuchen.', 502);
    return r.status === 204 ? undefined as T : await r.json() as T;
  }
  private async heads(filter: string): Promise<Head[]> {
    let path: string | undefined = `${this.prefix}/items?$expand=fields&$filter=${enc(filter)}&$top=200`;
    const heads: Head[] = [];
    while (path) {
      const page: { value: Head[]; '@odata.nextLink'?: string } = await this.json(path);
      heads.push(...page.value);
      const next: string | undefined = page['@odata.nextLink'];
      if (!next) break;
      const url = new URL(next, 'https://graph.microsoft.com');
      assert(url.origin === 'https://graph.microsoft.com' && url.pathname.startsWith(`/v1.0${this.prefix}/items`), 'Ungültige SharePoint-Folgeseite.', 502);
      path = url.pathname.slice('/v1.0'.length) + url.search;
    }
    return heads;
  }
  private async head(kind: string, id: string) { return (await this.heads(`fields/RecordKey eq '${esc(kind + ':' + id)}'`))[0]; }
  private async payload<T>(head: Head): Promise<T> {
    // /content redirects to a Microsoft pre-auth URL; GraphRequest must handle it without forwarding bearer.
    return this.json<T>(`/drives/${enc(this.settings.driveId)}/items/${enc(head.fields.PayloadId)}/content`);
  }
  async initialize() {
    const columns = await this.json<{ value: { name: string; indexed?: boolean; enforceUniqueValues?: boolean }[] }>(`${this.prefix}/columns`);
    assert(['RecordKey', 'RecordKind', 'RecordId', 'RecordVersion', 'PayloadId'].every(name => columns.value.some(c => c.name === name)), 'SharePoint-Arbeitsbereich ist noch nicht eingerichtet.', 503);
    assert(columns.value.some(c => c.name === 'RecordKey' && c.indexed && c.enforceUniqueValues), 'SharePoint benötigt einen eindeutigen RecordKey-Index.', 503);
    assert(columns.value.some(c => c.name === 'RecordKind' && c.indexed), 'SharePoint benötigt einen RecordKind-Index.', 503);
    const drive = await this.json<{ value: { id: string }[] }>(`/sites/${enc(this.settings.siteId)}/drives?$select=id`);
    // Membership checked below with list of site drives (never allow a drive from another site).
    assert(drive.value.some(d => d.id === this.settings.driveId), 'Dokumentbibliothek gehört nicht zum SharePoint-Arbeitsbereich.', 503);
  }
  async list<T>(tenant: string, kind: string): Promise<T[]> {
    this.tenant(tenant); const heads = await this.heads(`fields/RecordKind eq '${esc(kind)}'`);
    const results: T[] = [];
    for (let i = 0; i < heads.length; i += 6) results.push(...await Promise.all(heads.slice(i, i + 6).map(h => this.payload<T>(h))));
    return results;
  }
  async get<T>(tenant: string, kind: string, id: string): Promise<T> {
    this.tenant(tenant); const h = await this.head(kind, id); assert(h, 'Eintrag nicht gefunden.', 404); return this.payload<T>(h);
  }
  async save(tenant: string, kind: string, id: string, version: number, body: unknown, expected?: number) {
    this.tenant(tenant); const old = await this.head(kind, id);
    assert(expected === undefined ? !old : old && Number(old.fields.RecordVersion) === expected, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.', 409);
    assert(!old || old.eTag, 'SharePoint hat keine Versionskennung geliefert.', 502);
    const serialized = JSON.stringify(body); assert(new TextEncoder().encode(serialized).length < 20_000_000, 'Datensatz ist zu groß.', 413);
    const file = await this.json<{ id: string }>(`/drives/${enc(this.settings.driveId)}/root:/${enc(`${kind}-${id}-${crypto.randomUUID()}.json`)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: serialized });
    const fields = { Title: `${kind}:${id}`, RecordKey: `${kind}:${id}`, RecordKind: kind, RecordId: id, RecordVersion: version, PayloadId: file.id };
    // Never delete the immutable snapshot on an ambiguous network failure: the CAS may have committed.
    // Unreferenced snapshots are safe and can be removed by a separate retention policy.
    if (old) await this.json(`${this.prefix}/items/${enc(old.id)}/fields`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': old.eTag }, body: JSON.stringify(fields) });
    else await this.json(`${this.prefix}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  }
  async delete(tenant: string, kind: string, id: string, expected: number) {
    this.tenant(tenant); const old = await this.head(kind, id);
    assert(old && Number(old.fields.RecordVersion) === expected && old.eTag, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.', 409);
    await this.json(`${this.prefix}/items/${enc(old.id)}`, { method: 'DELETE', headers: { 'If-Match': old.eTag } });
  }
  async seed(tenant: string, language = 'de') {
    this.tenant(tenant); if (await this.head('initialized', 'seed')) return;
    const templates = seedTemplates(language);
    for (let index = 0; index < templates.length; index++) {
      const t = { ...templates[index], id: `5d7507e5-b513-48f5-8de0-00100000000${index + 1}` };
      try { if (!await this.head('template', t.id)) await this.save(tenant, 'template', t.id, 1, t); } catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
    }
    try { await this.save(tenant, 'initialized', 'seed', 1, {}); } catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
  }
  async enqueue(id: string, tenant: string, meeting: string, kind: string, payload: unknown) {
    this.tenant(tenant);
    // Job identifiers can be long Graph IDs. Store a stable SHA-256 key, not the raw key in a filename.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    const key = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    try { await this.save(tenant, 'job', key, 1, { id: key, tenant, meeting, kind, payload, version: 1, attempts: 0, available: 0, status: 'pending' }); } catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
  }
  async claimJob(): Promise<Job | undefined> {
    const jobs = (await this.list<StoredJob>(this.settings.tenantId, 'job')).filter(j => ['pending', 'running'].includes(j.status) && j.available <= Date.now()).sort((a, b) => a.available - b.available);
    for (const j of jobs) {
      const next = { ...j, version: j.version + 1, attempts: j.attempts + 1, available: Date.now() + 300_000, status: 'running' };
      try { await this.save(j.tenant, 'job', j.id, next.version, next, j.version); return next; } catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
    }
  }
  async finishJob(id: string) { const j = await this.get<StoredJob>(this.settings.tenantId, 'job', id); await this.save(j.tenant, 'job', id, j.version + 1, { ...j, version: j.version + 1, status: 'done' }, j.version); }
  async failJob(job: Job, error: string) { const j = await this.get<StoredJob>(job.tenant, 'job', job.id); const failed = j.attempts >= 8; await this.save(j.tenant, 'job', j.id, j.version + 1, { ...j, version: j.version + 1, status: failed ? 'failed' : 'pending', available: Date.now() + Math.min(3600_000, 30_000 * 2 ** j.attempts), error }, j.version); return failed; }
  async close() { /* No process-local connection or disk state. */ }
}
