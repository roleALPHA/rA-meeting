import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { SharePointRestStore } from '../shared/storage/sharepoint-rest.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import type { Bootstrap, Meeting } from '../shared/model.js';

const webUrl = 'https://customer.sharepoint.com/sites/circle';
const other = '55555555-5555-4555-8555-555555555555';
const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Anna>We agree to hire.\n';

function hostFor(sp: ReturnType<typeof fakeSharePoint>, userId = user): BrowserHost {
  return {
    tenantId: tenant,
    userId,
    userName: userId === user ? 'Anna' : 'Ben',
    webUrl,
    isTeams: false,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => 'delegated-test',
  };
}

async function createMeeting(api: Awaited<ReturnType<typeof createBrowserApi>>, title = 'Weekly') {
  const data = await api.request<Bootstrap>('/bootstrap');
  const template = data.templates.find(t => t.category === 'tactical')!;
  return api.request<Meeting>('/meetings', { title, circle: 'Circle', templateId: template.id });
}

function payloadOf(sp: ReturnType<typeof fakeSharePoint>, key: string) {
  const row = [...sp.records.values()].find(r => r.RecordKey === key);
  return row ? (sp.files.get(String(row.PayloadId)) as Record<string, unknown>) : undefined;
}

test('transcripts are stored as separate records and the overview never downloads them', async () => {
  const sp = fakeSharePoint();
  const api = await createBrowserApi(hostFor(sp));
  let m = await createMeeting(api);
  m = await api.request<Meeting>(`/meetings/${m.id}/transcript`, { revision: m.revision, text: vtt });
  assert.equal(m.transcript.length, 1);
  assert.equal(m.transcriptSegments, 1);

  const stored = payloadOf(sp, `meeting:${m.id}`)!;
  assert.deepEqual(stored.transcript, [], 'meeting payload holds no segments');
  assert.equal(stored.transcriptSegments, 1);
  const transcriptKey = `transcript:${m.id}.${m.transcriptHash}`;
  assert.deepEqual((payloadOf(sp, transcriptKey) as { segments: unknown }).segments, m.transcript);

  assert.deepEqual((await api.request<Meeting>(`/meetings/${m.id}`)).transcript, m.transcript);

  const transcriptPayload = String([...sp.records.values()].find(r => r.RecordKey === transcriptKey)!.PayloadId);
  const before = sp.calls.length;
  const data = await api.request<Bootstrap>('/bootstrap');
  assert.ok(!('transcript' in data.meetings[0]));
  assert.equal(data.meetings[0].transcriptSegments, 1);
  assert.ok(!sp.calls.slice(before).some(c => c.path.includes(transcriptPayload)));

  // Saving again does not rewrite the unchanged transcript record.
  const recordsBefore = [...sp.records.values()].filter(r => r.RecordKind === 'transcript').length;
  const filesBefore = sp.files.size;
  m = await api.request<Meeting>(`/meetings/${m.id}/command`, { revision: m.revision, type: 'start' });
  assert.equal([...sp.records.values()].filter(r => r.RecordKind === 'transcript').length, recordsBefore);
  assert.equal(sp.files.size, filesBefore + 1, 'only the meeting snapshot is added');
  assert.equal(m.transcript.length, 1);
});

test('meetings with an inline transcript stay readable and move it to a record on their next save', async () => {
  const sp = fakeSharePoint();
  const api = await createBrowserApi(hostFor(sp));
  const created = await createMeeting(api);
  const store = new SharePointRestStore(tenant, webUrl, sp.request);
  await store.initialize();
  const segments = [{ id: 's1', start: '00:00:01.000', end: '00:00:02.000', speaker: 'Anna', text: 'Legacy' }];
  const legacy = { ...created, revision: 2, transcript: segments, transcriptHash: 'legacy-hash' };
  delete (legacy as Partial<Meeting>).transcriptSegments;
  await store.save(tenant, 'meeting', created.id, 2, legacy, 1);

  let m = await api.request<Meeting>(`/meetings/${created.id}`);
  assert.deepEqual(m.transcript, segments);
  m = await api.request<Meeting>(`/meetings/${m.id}/command`, { revision: m.revision, type: 'start' });
  assert.deepEqual(payloadOf(sp, `meeting:${m.id}`)!.transcript, []);
  assert.ok(payloadOf(sp, `transcript:${m.id}.legacy-hash`));
  assert.deepEqual((await api.request<Meeting>(`/meetings/${m.id}`)).transcript, segments);
});

function graphEvent(id: string, iCalUId: string, subject = 'Weekly') {
  return {
    id,
    subject,
    iCalUId,
    type: 'singleInstance',
    start: { dateTime: '2026-09-20T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-20T10:00:00.0000000', timeZone: 'UTC' },
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' },
  };
}

test('an event can be linked to one meeting only, across attendees; other editors can refresh it', async t => {
  const sp = fakeSharePoint();
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let subject = 'Weekly';
  const graphCalls: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    graphCalls.push(url.pathname);
    if (url.pathname === `/v1.0/users/${user}/events/anna-copy`)
      return Response.json(graphEvent('anna-copy', 'ical-1', subject));
    if (url.pathname === `/v1.0/users/${other}/events/ben-copy`) return Response.json(graphEvent('ben-copy', 'ical-1'));
    if (url.pathname === `/v1.0/users/${other}/calendarView`)
      return Response.json({ value: [graphEvent('unrelated', 'ical-9'), graphEvent('ben-copy', 'ical-1', subject)] });
    return new Response('{}', { status: 404 });
  };
  const anna = await createBrowserApi(hostFor(sp));
  const ben = await createBrowserApi(hostFor(sp, other));
  let first = await createMeeting(anna, 'First');
  let second = await createMeeting(anna, 'Second');

  first = await anna.request<Meeting>(`/meetings/${first.id}/calendar-link`, {
    revision: first.revision,
    eventId: 'anna-copy',
  });
  assert.equal(first.calendar?.iCalUId, 'ical-1');
  assert.equal(first.calendar?.linkedBy, user);
  assert.ok([...sp.records.values()].some(r => r.RecordKind === 'calendar-claim'));

  await assert.rejects(
    anna.request(`/meetings/${second.id}/calendar-link`, { revision: second.revision, eventId: 'anna-copy' }),
    /bereits mit einem Meeting/,
  );
  second = await ben.request<Meeting>(`/meetings/${second.id}`);
  await assert.rejects(
    ben.request(`/meetings/${second.id}/calendar-link`, { revision: second.revision, eventId: 'ben-copy' }),
    /bereits mit einem Meeting/,
  );

  subject = 'Weekly (moved)';
  first = await ben.request<Meeting>(`/meetings/${first.id}/calendar-link`, {
    revision: first.revision,
    eventId: 'ignored',
  });
  assert.equal(first.calendar?.title, 'Weekly (moved)');
  assert.equal(first.calendar?.eventId, 'anna-copy', 'the linking person keeps their event ID');
  assert.equal(first.calendar?.linkedBy, user);
  assert.ok(graphCalls.includes(`/v1.0/users/${other}/calendarView`));
});

test('links from earlier versions get iCalUId and a claim once, when the linking person opens the app', async t => {
  const sp = fakeSharePoint();
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let graphCalls = 0;
  globalThis.fetch = async input => {
    graphCalls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, `/v1.0/users/${user}/events/legacy-copy`);
    return Response.json(graphEvent('legacy-copy', 'ical-legacy'));
  };
  const setup = await createBrowserApi(hostFor(sp));
  const created = await createMeeting(setup);
  const store = new SharePointRestStore(tenant, webUrl, sp.request);
  await store.initialize();
  const legacyCalendar = {
    eventId: 'legacy-copy',
    organizerId: user,
    title: 'Weekly',
    start: '2026-09-20T09:00:00.000Z',
    end: '2026-09-20T10:00:00.000Z',
    cancelled: false,
    occurrence: false,
    seriesMasterId: null,
    joinUrl: null,
    webUrl: null,
    syncedAt: '2026-09-01T00:00:00.000Z',
  };
  await store.save(tenant, 'meeting', created.id, 2, { ...created, revision: 2, calendar: legacyCalendar }, 1);
  // Simulate a workspace from before the upgrade: no completed backfill yet.
  await store.delete(tenant, 'initialized', 'migration-calendar-claims', 1);

  // Another editor cannot complete the link and does not block it.
  const ben = await createBrowserApi(hostFor(sp, other));
  await ben.request<Bootstrap>('/bootstrap');
  assert.equal(graphCalls, 0);
  assert.ok(!payloadOf(sp, 'initialized:migration-calendar-claims'));

  const anna = await createBrowserApi(hostFor(sp));
  const data = await anna.request<Bootstrap>('/bootstrap');
  assert.equal(graphCalls, 1);
  assert.equal(data.meetings[0].calendar?.iCalUId, 'ical-legacy');
  assert.equal(data.meetings[0].revision, 3, 'overview reflects the saved backfill');
  assert.ok(payloadOf(sp, 'initialized:migration-calendar-claims'));
  await anna.request<Bootstrap>('/bootstrap');
  assert.equal(graphCalls, 1, 'backfill runs only once');
});

test('a failed index update recycles the uploaded content file; file names identify record and version', async () => {
  const sp = fakeSharePoint();
  const store = new SharePointRestStore(tenant, webUrl, sp.request);
  await store.initialize();
  await store.save(tenant, 'meeting', 'one', 1, { text: 'first' });
  assert.match([...sp.fileMeta.values()][0].name, /^meeting__one__v1__[0-9a-f-]{36}\.json$/);
  const files = sp.files.size;
  sp.state.failIndexWrite = true;
  await assert.rejects(store.save(tenant, 'meeting', 'one', 2, { text: 'second' }, 1));
  sp.state.failIndexWrite = false;
  assert.equal(sp.files.size, files);
  assert.equal(sp.recycled.length, 1);
  assert.deepEqual(await store.get(tenant, 'meeting', 'one'), { text: 'first' });
  await assert.rejects(store.save(tenant, 'meeting', 'bad id', 1, {}), /Datensatzkennung/);
});
