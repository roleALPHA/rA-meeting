import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { description, meetingsComponentId, teamsManifest, zip } from './teams-package.ts';

const webPart = path => JSON.parse(readFileSync(path, 'utf8'));

test('one Teams app carries the personal app, the channel and chat tab and the meeting tab', () => {
  const manifest = teamsManifest('1.2.3');
  assert.equal(manifest.id, meetingsComponentId);
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.developer.name, 'roleALPHA GmbH');
  assert.ok(manifest.name.short.length <= 30 && description.short.length <= 80 && description.full.length <= 4000);
  const [personal] = manifest.staticTabs;
  const [tab] = manifest.configurableTabs;
  assert.deepEqual(personal.scopes, ['personal']);
  assert.deepEqual(tab.scopes, ['team', 'groupchat']);
  assert.ok(
    ['channelTab', 'meetingChatTab', 'meetingDetailsTab', 'meetingSidePanel'].every(c => tab.context.includes(c)),
  );
  for (const url of [personal.contentUrl, tab.configurationUrl]) {
    assert.match(url, /^https:\/\/\{teamSiteDomain\}/);
    assert.ok(url.includes(`componentId=${meetingsComponentId}`));
  }
  // Channel tabs live in the team's site, not in the tenant root.
  assert.ok(tab.configurationUrl.startsWith('https://{teamSiteDomain}{teamSitePath}/_layouts/15/TeamsLogon.aspx'));
});

test('the web part behind the app is a Teams tab and personal app; the meeting web part stays in SharePoint', () => {
  // The meeting web part used to be a Teams app of its own and was offered in channels, where saving it failed with
  // HTTP 500. Meeting contexts come from the Teams manifest: SPFx rejects TeamsMeetingApp next to TeamsTab.
  const meetings = webPart('spfx/src/webparts/meetings/MeetingsWebPart.manifest.json');
  assert.equal(meetings.id, meetingsComponentId);
  for (const host of ['TeamsTab', 'TeamsPersonalApp']) assert.ok(meetings.supportedHosts.includes(host));
  const meetingTab = webPart('spfx/src/webparts/meetingTab/MeetingTabWebPart.manifest.json');
  assert.ok(meetingTab.supportedHosts.every(host => !host.startsWith('Teams')));
});

test('the package is a valid ZIP archive with the files as given', () => {
  const files = [
    { name: 'manifest.json', data: Buffer.from('{"a":1}') },
    { name: 'icon.png', data: Buffer.from([0, 1, 2, 255]) },
  ];
  const archive = zip(files);
  assert.deepEqual(zip(files), archive);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), files.length);
  let entry = archive.readUInt32LE(end + 16);
  for (const file of files) {
    assert.equal(archive.readUInt32LE(entry), 0x02014b50);
    const nameLength = archive.readUInt16LE(entry + 28);
    assert.equal(archive.subarray(entry + 46, entry + 46 + nameLength).toString(), file.name);
    const at = archive.readUInt32LE(entry + 42);
    assert.equal(archive.readUInt32LE(at), 0x04034b50);
    const start = at + 30 + archive.readUInt16LE(at + 26);
    assert.deepEqual(archive.subarray(start, start + file.data.length), file.data);
    assert.equal(archive.readUInt32LE(entry + 16), crc32(file.data));
    entry += 46 + nameLength;
  }
});
