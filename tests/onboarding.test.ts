import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCalendar,
  createWorkspaceSite,
  hostForWorkspace,
  newSiteStatus,
  selectWorkspace,
  setupWorkspace,
  workspaceUrl,
  meetingsWebPartId,
} from '../client/browser/onboarding.js';
import { connectionSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import { rememberWorkspace, withRememberedWorkspace } from '../client/browser/workspace-memory.js';
const url = 'https://customer.sharepoint.com/sites/circle';
function fixture() {
  const sp = fakeSharePoint();
  const host: BrowserHost = {
    webUrl: url,
    tenantId: tenant,
    userId: user,
    userName: 'Owner',
    isTeams: false,
    settings: connectionSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => {
      throw new Error('No tokens required for onboarding');
    },
  };
  return { sp, host };
}

test('onboarding provisions empty workspace, resumes without duplicate templates, and checks persistence', async () => {
  const { sp, host } = fixture();
  sp.state.ready = false;
  const steps: string[] = [];
  await setupWorkspace(host, 'fr', false, step => steps.push(step));
  assert.equal(sp.calls.filter(c => c.path === '/web/lists' && c.method === 'POST').length, 2);
  assert.equal([...sp.records.values()].filter(r => r.RecordKind === 'template').length, 3);
  assert.equal([...sp.records.values()].filter(r => r.RecordKind === 'setup-check').length, 0);
  await setupWorkspace(host, 'en', false, () => {});
  assert.equal(sp.calls.filter(c => c.path === '/web/lists' && c.method === 'POST').length, 2);
  assert.equal([...sp.records.values()].filter(r => r.RecordKind === 'template').length, 3);
  assert.equal(steps.length, 3);
  assert.ok(sp.calls.every(c => !(/roleassign|breakrole|group|permission/i.test(c.path) && c.method !== 'GET')));
  sp.state.provision = false;
  const before = sp.calls.filter(c => c.method !== 'GET').length;
  await assert.rejects(
    setupWorkspace(host, 'de', false, () => {}),
    /Websitebesitzer/,
  );
  assert.equal(sp.calls.filter(c => c.method !== 'GET').length, before);
});

test('workspace selection restricts origins and new site creation uses status, user identity and no group creation', async () => {
  const { host } = fixture();
  for (const bad of [
    'http://customer.sharepoint.com/sites/a',
    'https://evil.example/sites/a',
    'https://user:secret@customer.sharepoint.com/sites/a',
    'https://customer.sharepoint.com/sites/a?x=1',
    'https://customer.sharepoint.com/sites/a/SitePages/Home.aspx',
    'https://customer.sharepoint.com/sites/%2fescape',
  ])
    assert.throws(() => workspaceUrl(bad, url));
  let status = 0;
  const calls: { site: string; path: string; body?: unknown }[] = [];
  host.sharepointAt = async (site, path, init) => {
    calls.push({ site, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ SiteStatus: status, SiteUrl: site });
  };
  await createWorkspaceSite(host, {
    url: 'https://customer.sharepoint.com/sites/new-team',
    title: 'Team',
    language: 'es',
  });
  const request = calls[1].body as { request: Record<string, unknown> };
  assert.equal(request.request.WebTemplate, 'STS#3');
  assert.equal(request.request.Lcid, 3082);
  assert.equal(request.request.Owner, undefined);
  assert.equal(request.request.ShareByEmailEnabled, false);
  status = 1;
  await assert.rejects(
    createWorkspaceSite(host, { url: 'https://customer.sharepoint.com/sites/new-team', title: 'Team', language: 'es' }),
    /existiert bereits/,
  );
  assert.equal(calls.filter(c => c.path.endsWith('/create')).length, 1);
  assert.equal((await newSiteStatus(host, 'https://customer.sharepoint.com/sites/new-team')).SiteStatus, 1);
  const target = hostForWorkspace(host, 'https://customer.sharepoint.com/sites/new-team');
  await target.sharepoint('/web?$select=Title');
  assert.equal(calls.at(-1)?.site, target.webUrl);
  assert.throws(() => hostForWorkspace(host, 'https://other.example/sites/new'));
});

test('landing page resumes its own draft and never overwrites an existing page or publishes automatically', async () => {
  const { host, sp } = fixture();
  let creates = 0,
    saves = 0,
    fail = true;
  let canvas = '';
  const extra: string[] = [];
  host.sharepoint = async (path, init) => {
    extra.push(path);
    if (path.startsWith('/web/lists?$filter=BaseTemplate'))
      return Response.json({ value: [{ Id: 'pages', RootFolder: { ServerRelativeUrl: '/sites/circle/SitePages' } }] });
    if (path.includes('GetFileByServerRelativePath')) return new Response(null, { status: 404 });
    if (path === '/sitepages/pages') {
      creates++;
      return Response.json({ Id: 42, Url: '/sites/circle/SitePages/Draft.aspx' });
    }
    if (path === '/sitepages/pages(42)')
      return Response.json({
        CanvasContent1: canvas,
        Url: '/sites/circle/SitePages/rA-Meetings.aspx',
        IsPageCheckedOutToCurrentUser: true,
      });
    if (path.endsWith('/savepage')) {
      saves++;
      if (fail) {
        fail = false;
        return new Response(null, { status: 503 });
      }
      canvas = JSON.parse(String(init?.body)).CanvasContent1;
      return Response.json(true);
    }
    return sp.request(path, init);
  };
  await assert.rejects(
    setupWorkspace(host, 'de', true, () => {}),
    /503/,
  );
  const result = await setupWorkspace(host, 'de', true, () => {});
  assert.equal(creates, 1);
  assert.equal(saves, 3);
  assert.equal(result.pageUrl, url + '/SitePages/rA-Meetings.aspx');
  const [control] = JSON.parse(canvas) as {
    webPartId: string;
    webPartData: { properties: { workspaceUrl: string } };
  }[];
  assert.equal(control.webPartId, meetingsWebPartId);
  assert.equal(control.webPartData.properties.workspaceUrl, url);
  assert.ok(extra.every(p => !p.includes('publish') && !p.includes('WelcomePage')));
  await setupWorkspace(host, 'de', true, () => {});
  assert.equal(creates, 1);
  assert.equal(saves, 3);
  const second = fixture();
  const original = second.host.sharepoint;
  second.host.sharepoint = async (path, init) => {
    if (path.startsWith('/web/lists?$filter=BaseTemplate'))
      return Response.json({ value: [{ Id: 'pages', RootFolder: { ServerRelativeUrl: '/sites/circle/SitePages' } }] });
    if (path.includes('GetFileByServerRelativePath')) return Response.json({ Exists: true });
    assert.notEqual(path, '/sitepages/pages');
    return original(path, init);
  };
  await assert.rejects(
    setupWorkspace(second.host, 'de', true, () => {}),
    /nicht überschrieben/,
  );
});

test('the wizard opens an existing workspace for members and offers setup only to those who may run it', async () => {
  const { sp, host } = fixture();
  sp.state.provision = false;
  sp.state.owner = false;
  assert.deepEqual(await selectWorkspace(host), { ready: true, canSetUp: false });
  sp.state.ready = false;
  await assert.rejects(selectWorkspace(host), /Websitebesitzer/);
  sp.state.provision = true;
  assert.deepEqual(await selectWorkspace(host), { ready: false, canSetUp: true });
  assert.ok(sp.calls.every(c => c.method === 'GET'));
});

test('a host without a configured site starts in the workspace this user opened last', () => {
  const { host } = fixture();
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => void values.set(k, v),
    removeItem: (k: string) => void values.delete(k),
  } as Storage;
  const root: BrowserHost = {
    ...host,
    webUrl: 'https://customer.sharepoint.com',
    rememberWorkspace: true,
    sharepointAt: async () => new Response('{}'),
  };
  assert.equal(withRememberedWorkspace(root, storage), root);
  rememberWorkspace(root, url, storage);
  assert.equal(withRememberedWorkspace(root, storage).webUrl, url);
  // Pages and channel tabs name their workspace and neither read nor write the memory.
  const page = { ...root, rememberWorkspace: false };
  assert.equal(withRememberedWorkspace(page, storage), page);
  rememberWorkspace(page, 'https://customer.sharepoint.com/sites/other', storage);
  assert.equal(withRememberedWorkspace(root, storage).webUrl, url);
  // Another user in the same browser has a memory of their own.
  assert.equal(
    withRememberedWorkspace({ ...root, userId: '33333333-3333-4333-8333-333333333333' }, storage).webUrl,
    root.webUrl,
  );
  // An address that is no longer acceptable is dropped instead of retried.
  rememberWorkspace(root, 'https://evil.example/sites/circle', storage);
  assert.equal(withRememberedWorkspace(root, storage), root);
  assert.equal(values.size, 0);
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
  } as unknown as Storage;
  assert.equal(withRememberedWorkspace(root, blocked), root);
});

test('the calendar test makes the meeting view request and names a mixed-up account', async t => {
  const { host } = fixture();
  const calendarHost = { ...host, token: async () => 'token' };
  let me = user;
  let status = 200;
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const urls: string[] = [];
  globalThis.fetch = async input => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(target);
    if (target.includes('/me?')) return Response.json({ id: me, userPrincipalName: 'other@customer.example' });
    return status === 200 ? Response.json({ value: [] }) : new Response('{}', { status });
  };
  await checkCalendar(calendarHost);
  assert.ok(urls.some(u => u.includes(`/users/${user}/calendarView?`)));
  status = 404;
  await assert.rejects(checkCalendar(calendarHost), /Exchange-Online-Postfach/);
  me = '33333333-3333-4333-8333-333333333333';
  await assert.rejects(checkCalendar(calendarHost), /other@customer\.example.*Owner/);
});
