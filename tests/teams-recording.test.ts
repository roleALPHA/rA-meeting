import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import type { Bootstrap, Meeting, WorkspaceSettings } from '../shared/model.js';

const other = '55555555-5555-4555-8555-555555555555';
const joinUrl = 'https://teams.microsoft.com/l/meetup-join/weekly';

function hostFor(sp: ReturnType<typeof fakeSharePoint>): BrowserHost {
  return {
    tenantId: tenant,
    userId: user,
    userName: 'Anna',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => 'delegated-test',
  };
}

test('site owners choose the Teams recording setting; others can only read it', async () => {
  const sp = fakeSharePoint();
  const api = await createBrowserApi(hostFor(sp));
  let data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.settings.teamsRecording, 'off');
  assert.equal(data.canManageWorkspace, true);

  const saved = await api.request<WorkspaceSettings>(
    '/settings',
    { teamsRecording: 'allow-transcription', version: 0 },
    'PUT',
  );
  assert.equal(saved.version, 1);
  await assert.rejects(api.request('/settings', { teamsRecording: 'off', version: 0 }, 'PUT'), /geändert/);
  await assert.rejects(api.request('/settings', { teamsRecording: 'always', version: 1 }, 'PUT'));
  await api.request('/settings', { teamsRecording: 'record-and-transcribe', version: 1 }, 'PUT');

  sp.state.provision = false;
  data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.settings.teamsRecording, 'record-and-transcribe');
  assert.equal(data.canManageWorkspace, false);
  await assert.rejects(api.request('/settings', { teamsRecording: 'off', version: 2 }, 'PUT'), /Websitebesitzer/);
});

test('linking applies the setting as organizer and records why it was not applied otherwise', async t => {
  const sp = fakeSharePoint();
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let organizer = user;
  let patchStatus = 200;
  const patches: unknown[] = [];
  const graphPaths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    graphPaths.push(url.pathname);
    if (url.pathname.startsWith(`/v1.0/users/${user}/events/`))
      return Response.json({
        id: decodeURIComponent(url.pathname.split('/').pop()!),
        subject: 'Weekly',
        iCalUId: `ical-${url.pathname.split('/').pop()}`,
        type: 'singleInstance',
        start: { dateTime: '2026-09-20T09:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-20T10:00:00.0000000', timeZone: 'UTC' },
        onlineMeeting: { joinUrl },
      });
    if (url.pathname === '/v1.0/me/onlineMeetings')
      return Response.json({
        value: [{ id: 'online-1', participants: { organizer: { identity: { user: { id: organizer } } } } }],
      });
    if (url.pathname === '/v1.0/me/onlineMeetings/online-1' && init?.method === 'PATCH') {
      patches.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: patchStatus });
    }
    return new Response('{}', { status: 404 });
  };
  const api = await createBrowserApi(hostFor(sp));
  const data = await api.request<Bootstrap>('/bootstrap');
  const template = data.templates.find(x => x.category === 'tactical')!;
  const link = async (eventId: string) => {
    const m = await api.request<Meeting>('/meetings', { title: eventId, circle: 'Circle', templateId: template.id });
    return api.request<Meeting>(`/meetings/${m.id}/calendar-link`, { revision: m.revision, eventId });
  };

  let m = await link('off');
  assert.equal(m.calendar?.teamsRecording, undefined);
  assert.ok(!graphPaths.some(p => p.includes('onlineMeetings')), 'setting off: meeting options untouched');

  await api.request('/settings', { teamsRecording: 'record-and-transcribe', version: 0 }, 'PUT');
  m = await link('record');
  assert.equal(m.calendar?.teamsRecording?.result, 'applied');
  assert.deepEqual(patches.at(-1), { allowTranscription: true, recordAutomatically: true });

  await api.request('/settings', { teamsRecording: 'allow-transcription', version: 1 }, 'PUT');
  m = await link('allow');
  assert.deepEqual(patches.at(-1), { allowTranscription: true, recordAutomatically: false });

  organizer = other;
  const patchCount = patches.length;
  m = await link('attendee');
  assert.equal(m.calendar?.teamsRecording?.result, 'not-organizer');
  assert.equal(patches.length, patchCount);
  assert.equal(m.calendar?.eventId, 'attendee', 'the link itself is saved');

  organizer = user;
  patchStatus = 403;
  m = await link('denied');
  assert.equal(m.calendar?.teamsRecording?.result, 'failed');
  assert.ok(m.events.some(e => e.type === 'teams.recording'));
});
