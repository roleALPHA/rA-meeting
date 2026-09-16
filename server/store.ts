import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import type { Meeting } from '../shared/model.js';
import { AppError } from '../shared/model.js';
import { seedTemplates } from './templates.js';

export type Job = { id: string; tenant: string; meeting: string; kind: string; attempts: number };
/** Identical repository contract for managed PostgreSQL and development-only SQLite. */
export class Store {
  private sqlite?: DatabaseSync;
  private pool?: Pool;
  readonly external: boolean;
  constructor(location: string, pool?: Pool) {
    this.external = /^postgres(?:ql)?:\/\//.test(location);
    if (this.external) this.pool = pool ?? new Pool({ connectionString: location, max: 10, connectionTimeoutMillis: 10_000 });
    else { if (location !== ':memory:') mkdirSync(dirname(location), { recursive: true }); this.sqlite = new DatabaseSync(location); this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;'); }
  }
  private async query(sql: string, values: (string | number | null)[] = []): Promise<{ rows: Record<string, unknown>[]; changes: number }> {
    if (this.pool) { let i = 0; const result = await this.pool.query(sql.replace(/\?/g, () => `$${++i}`), values); return { rows: result.rows, changes: result.rowCount ?? 0 }; }
    if (/^\s*SELECT/i.test(sql) || /RETURNING/i.test(sql)) { const rows = this.sqlite!.prepare(sql).all(...values) as Record<string, unknown>[]; return { rows, changes: rows.length }; }
    const r = this.sqlite!.prepare(sql).run(...values); return { rows: [], changes: Number(r.changes) };
  }
  async initialize() {
    await this.query('CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(tenant,kind,id))');
    await this.query("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, meeting TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, available BIGINT NOT NULL DEFAULT 0, error TEXT)");
    await this.query('CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status,available)');
    // No global startup reset: another replica could be processing a job or export.
    // Graph jobs are reclaimed after their lease; remote writes stay locked until reconciliation.
  }
  async list<T>(tenant: string, kind: string): Promise<T[]> {
    const r = await this.query('SELECT body FROM records WHERE tenant=? AND kind=?', [tenant, kind]); return r.rows.map(r => JSON.parse(r.body as string));
  }
  async get<T>(tenant: string, kind: string, id: string): Promise<T> {
    const r = await this.query('SELECT body FROM records WHERE tenant=? AND kind=? AND id=?', [tenant, kind, id]);
    if (!r.rows.length) throw new AppError(404, 'Eintrag nicht gefunden.'); return JSON.parse(r.rows[0].body as string);
  }
  async save(tenant: string, kind: string, id: string, version: number, body: unknown, expected?: number) {
    if (expected === undefined) {
      const r = await this.query('INSERT INTO records(tenant,kind,id,version,body) VALUES(?,?,?,?,?) ON CONFLICT(tenant,kind,id) DO NOTHING', [tenant, kind, id, version, JSON.stringify(body)]);
      if (!r.changes) throw new AppError(409, 'Dieser Eintrag existiert bereits.');
    } else {
      const r = await this.query('UPDATE records SET body=?, version=? WHERE tenant=? AND kind=? AND id=? AND version=?', [JSON.stringify(body), version, tenant, kind, id, expected]);
      if (!r.changes) throw new AppError(409, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.');
    }
  }
  async delete(tenant: string, kind: string, id: string, expected: number) {
    const result = await this.query('DELETE FROM records WHERE tenant=? AND kind=? AND id=? AND version=?', [tenant, kind, id, expected]);
    if (!result.changes) throw new AppError(409, 'Dieser Eintrag wurde inzwischen geändert. Bitte neu laden.');
  }
  async seed(tenant: string, language = 'de') {
    const templates = seedTemplates(language);
    // One SQL statement inserts marker and templates atomically, safe across replicas.
    const records = [{ kind: 'initialized', id: 'seed', body: '{}' }, ...templates.map((t, index) => ({ kind: 'template', id: `seed-${index + 1}`, body: JSON.stringify({ ...t, id: ['5d7507e5-b513-48f5-8de0-001000000001', '5d7507e5-b513-48f5-8de0-001000000002', '5d7507e5-b513-48f5-8de0-001000000003'][index] }) }))];
    for (const record of records.slice(1)) record.id = JSON.parse(record.body).id;
    const values = records.flatMap(r => [tenant, r.kind, r.id, 1, r.body]);
    // SQLite cannot use a VALUES table with named columns portably; SELECT UNION works in both.
    const rows = records.map((_, i) => i === 0 ? 'SELECT ? AS tenant, ? AS kind, ? AS id, CAST(? AS INTEGER) AS version, ? AS body' : 'SELECT ?,?,?,CAST(? AS INTEGER),?').join(' UNION ALL ');
    await this.query(`INSERT INTO records(tenant,kind,id,version,body) SELECT source.tenant,source.kind,source.id,source.version,source.body FROM (${rows}) AS source WHERE NOT EXISTS (SELECT 1 FROM records WHERE tenant=? AND kind='initialized') ON CONFLICT(tenant,kind,id) DO NOTHING`, [...values, tenant]);
  }
  async enqueue(id: string, tenant: string, meeting: string, kind: string, payload: unknown) { await this.query('INSERT INTO jobs(id,tenant,meeting,kind,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING', [id, tenant, meeting, kind, JSON.stringify(payload)]); }
  async claimJob(): Promise<Job | undefined> {
    // Atomic compare-and-set claim, with a 5 minute lease for safe Graph/analysis retries.
    const now = Date.now();
    const result = await this.query("UPDATE jobs SET status='running', attempts=attempts+1, available=? WHERE id=(SELECT id FROM jobs WHERE (status='pending' OR status='running') AND available<=? ORDER BY available LIMIT 1) AND (status='pending' OR status='running') AND available<=? RETURNING id,tenant,meeting,kind,attempts", [now + 300_000, now, now]);
    return result.rows[0] as Job | undefined;
  }
  async finishJob(id: string) { await this.query("UPDATE jobs SET status='done',error=NULL WHERE id=?", [id]); }
  async failJob(job: Job, error: string) {
    const failed = job.attempts >= 8;
    await this.query('UPDATE jobs SET status=?,available=?,error=? WHERE id=?', [failed ? 'failed' : 'pending', Date.now() + Math.min(3600_000, 30_000 * 2 ** job.attempts), error, job.id]); return failed;
  }
  async close() { this.sqlite?.close(); await this.pool?.end(); }
}
