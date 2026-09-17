import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import type { Bootstrap, Meeting } from '../shared/model.js';

type Preview = { parts: { id: string }[]; excluded: number; window: { start: string; end: string } };

test('series transcripts are attributed by time window, previewed and imported only after confirmation', async t => {
  const sp = fakeSharePoint();
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const joinUrl = 'https://teams.microsoft.com/l/meetup-join/series';
  let parts = [
    { id: 'last-week', createdDateTime: '2026-09-13T09:02:00Z', endDateTime: '2026-09-13T09:55:00Z' },
    { id: 'part-2', createdDateTime: '2026-09-20T09:40:00Z', endDateTime: '2026-09-20T10:05:00Z' },
    { id: 'part-1', createdDateTime: '2026-09-20T08:55:00Z', endDateTime: '2026-09-20T09:35:00Z' },
  ];
  const contents: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname);
    if (path === `/v1.0/users/${user}/events/occurrence-copy`)
      return Response.json({
        id: 'occurrence-copy',
        subject: 'Weekly',
        iCalUId: 'ical-occurrence',
        type: 'occurrence',
        seriesMasterId: 'series',
        originalStart: '2026-09-20T09:00:00Z',
        start: { dateTime: '2026-09-20T09:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-20T10:00:00.0000000', timeZone: 'UTC' },
        onlineMeeting: { joinUrl },
      });
    if (path === '/v1.0/me/onlineMeetings') return Response.json({ value: [{ id: 'online-1' }] });
    if (path === '/v1.0/me/onlineMeetings/online-1/transcripts') return Response.json({ value: parts });
    const content = /^\/v1\.0\/me\/onlineMeetings\/online-1\/transcripts\/([^/]+)\/content$/.exec(path);
    if (content) {
      contents.push(content[1]);
      return new Response(`WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Anna>Text of ${content[1]}\n`);
    }
    return new Response('{}', { status: 404 });
  };
  const api = await createBrowserApi({
    tenantId: tenant,
    userId: user,
    userName: 'Anna',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: true,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => 'delegated-test',
  });
  const data = await api.request<Bootstrap>('/bootstrap');
  const template = data.templates.find(x => x.category === 'tactical')!;
  let m = await api.request<Meeting>('/meetings', { title: 'Weekly', circle: 'Circle', templateId: template.id });
  m = await api.request<Meeting>(`/meetings/${m.id}/calendar-link`, {
    revision: m.revision,
    eventId: 'occurrence-copy',
  });
  assert.equal(m.calendar?.occurrence, true);

  const preview = await api.request<Preview>(`/meetings/${m.id}/graph-preview`, { revision: m.revision });
  assert.deepEqual(
    preview.parts.map(p => p.id),
    ['part-1', 'part-2'],
  );
  assert.equal(preview.excluded, 1);
  assert.equal(preview.window.start, '2026-09-20T08:30:00.000Z');
  assert.equal(contents.length, 0, 'preview downloads no transcript content');

  await assert.rejects(
    api.request(`/meetings/${m.id}/graph-fetch`, { revision: m.revision, partIds: ['part-1', 'last-week'] }),
    /Transkriptauswahl hat sich geändert/,
  );
  assert.equal(contents.length, 0);

  m = await api.request<Meeting>(`/meetings/${m.id}/graph-fetch`, {
    revision: m.revision,
    partIds: ['part-1', 'part-2'],
  });
  assert.deepEqual(contents, ['part-1', 'part-2']);
  assert.deepEqual(
    m.transcript.map(s => s.text),
    ['Text of part-1', 'Text of part-2'],
  );

  parts = [parts[0]];
  const empty = await api.request<Preview>(`/meetings/${m.id}/graph-preview`, { revision: m.revision });
  assert.equal(empty.parts.length, 0);
  assert.equal(empty.excluded, 1);
});
