import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { SharePointRestStore, type OrphanFile } from '../shared/storage/sharepoint-rest.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';

const webUrl = 'https://customer.sharepoint.com/sites/circle';
const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

test('only unreferenced files of interrupted or superseded writes older than a day are orphans', async () => {
  const sp = fakeSharePoint();
  const store = new SharePointRestStore(tenant, webUrl, sp.request);
  await store.initialize();
  await store.save(tenant, 'meeting', 'one', 1, { v: 1 });
  await store.save(tenant, 'meeting', 'one', 2, { v: 2 }, 1);
  await store.save(tenant, 'meeting', 'deleted', 1, { v: 1 });
  await store.delete(tenant, 'meeting', 'deleted', 1);
  const add = (name: string, created: string) => {
    const id = crypto.randomUUID();
    sp.files.set(id, {});
    sp.fileMeta.set(id, { name, created });
    return id;
  };
  const interrupted = add(`meeting__one__v3__${crypto.randomUUID()}.json`, dayAgo(2));
  const lostRace = add(`meeting__one__v2__${crypto.randomUUID()}.json`, dayAgo(2));
  add(`meeting__one__v3__${crypto.randomUUID()}.json`, dayAgo(0.5)); // may still be in progress
  add(`${crypto.randomUUID()}.json`, dayAgo(30)); // named by an earlier version
  add(`meeting__deleted__v2__${crypto.randomUUID()}.json`, dayAgo(2)); // record deleted: retention decides
  for (const [id, meta] of sp.fileMeta)
    if (meta.name.startsWith('meeting__one__v1__')) sp.fileMeta.set(id, { ...meta, created: dayAgo(3) });

  const orphans = await store.findOrphans(tenant);
  assert.deepEqual(orphans.map(o => o.id).sort(), [interrupted, lostRace].sort());
  assert.ok(orphans.every(o => o.size > 0 && o.name.startsWith('meeting__one__')));
  assert.deepEqual(await store.get(tenant, 'meeting', 'one'), { v: 2 }, 'history and current payload untouched');

  const unrelated = crypto.randomUUID();
  assert.equal(await store.recycleOrphans(tenant, [interrupted, unrelated]), 1);
  assert.deepEqual(sp.recycled, [interrupted]);
});

test('storage cleanup is limited to site owners and recycles only confirmed orphans', async () => {
  const sp = fakeSharePoint();
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Owner',
    webUrl,
    isTeams: false,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => 'delegated-test',
  };
  const api = await createBrowserApi(host);
  const store = new SharePointRestStore(tenant, webUrl, sp.request);
  await store.initialize();
  await store.save(tenant, 'meeting', 'one', 1, { v: 1 });
  const orphan = crypto.randomUUID();
  sp.files.set(orphan, {});
  sp.fileMeta.set(orphan, { name: `meeting__one__v2__${crypto.randomUUID()}.json`, created: dayAgo(2) });

  const found = await api.request<OrphanFile[]>('/maintenance/orphans');
  assert.deepEqual(
    found.map(o => o.id),
    [orphan],
  );
  sp.state.provision = false;
  await assert.rejects(api.request('/maintenance/orphans'), /Websitebesitzer/);
  await assert.rejects(api.request('/maintenance/orphans', { ids: [orphan] }), /Websitebesitzer/);
  assert.equal(sp.recycled.length, 0);
  sp.state.provision = true;
  assert.deepEqual(await api.request('/maintenance/orphans', { ids: [orphan] }), { recycled: 1 });
  assert.deepEqual(sp.recycled, [orphan]);
});
