import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { Store } from '../server/store.js';
import { createMeeting, saveMeeting } from '../server/domain.js';
import type { Template } from '../shared/model.js';

test('external PostgreSQL SQL contract: initialize, seed once, save, conflict and queue', async () => {
  // Real PostgreSQL engine compiled to WASM, in memory; no cloud database or filesystem.
  const db = new PGlite();
  const pool = { query: async (sql: string, values: unknown[]) => { const result = await db.query(sql, values); return { rows: result.rows, rowCount: result.affectedRows }; }, end: () => db.close() } as unknown as Pool;
  const store = new Store('postgresql://unused', pool); await store.initialize(); await store.seed('customer');
  assert.equal(store.external, true);
  const templates = await store.list<Template>('customer', 'template'); assert.equal(templates.length, 3);
  await store.seed('customer'); assert.equal((await store.list('customer', 'template')).length, 3);
  const actor = { id: 'owner', name: 'Owner', tenantId: 'customer', admin: true };
  const meeting = await createMeeting(store, actor, { templateId: templates[0].id, title: 'Customer test', circle: 'Team' });
  await saveMeeting(store, actor, meeting, 1); await assert.rejects(saveMeeting(store, actor, meeting, 1), /inzwischen geändert/);
  await store.enqueue('job', 'customer', meeting.id, 'analysis', {}); await store.enqueue('job', 'customer', meeting.id, 'analysis', {});
  const job = await store.claimJob(); assert.equal(job?.attempts, 1); assert.equal(await store.claimJob(), undefined);
  await store.finishJob('job'); assert.equal(await store.claimJob(), undefined);
  await store.delete('customer', 'template', templates[0].id, 1); await store.seed('customer'); assert.equal((await store.list('customer', 'template')).length, 2);
  await store.close();
});
