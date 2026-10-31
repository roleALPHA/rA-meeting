import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminConsentUrl, graphConsentUrl } from '../client/browser/consent.js';
import { tenant } from './helpers/sharepoint-rest.js';

const client = { authority: 'https://login.microsoftonline.com/', clientId: '4f2c8d1e-6b3a-4c5d-9e8f-0a1b2c3d4e5f' };
const webUrl = 'https://customer.sharepoint.com/sites/circle';

test('admin consent link asks Microsoft for the scope on the SharePoint client principal', () => {
  const url = new URL(adminConsentUrl(client, tenant, webUrl, 'api://rolealpha/', ['access_as_user'])!);
  assert.equal(url.origin + url.pathname, `https://login.microsoftonline.com/${tenant}/v2.0/adminconsent`);
  assert.equal(url.searchParams.get('client_id'), client.clientId);
  assert.equal(url.searchParams.get('scope'), 'api://rolealpha/access_as_user');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://customer.sharepoint.com/_forms/spfxsinglesignon.aspx');
});

test('Graph consent covers every permission the package requests', () => {
  const href = graphConsentUrl(client, tenant, webUrl)!;
  assert.doesNotMatch(href, /\+/);
  const url = new URL(href);
  assert.deepEqual(url.searchParams.get('scope')!.split(' '), [
    'https://graph.microsoft.com/Calendars.Read',
    'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
    'https://graph.microsoft.com/OnlineMeetingTranscript.Read.All',
  ]);
});

test('no consent link without a valid principal or complete values', () => {
  assert.equal(adminConsentUrl(undefined, tenant, webUrl, 'api://x', ['access_as_user']), null);
  assert.equal(
    adminConsentUrl({ ...client, authority: 'http://login.example' }, tenant, webUrl, 'api://x', ['a']),
    null,
  );
  assert.equal(adminConsentUrl({ ...client, clientId: 'nope' }, tenant, webUrl, 'api://x', ['a']), null);
  assert.equal(adminConsentUrl(client, tenant, webUrl, ' ', ['access_as_user']), null);
  assert.equal(adminConsentUrl(client, tenant, webUrl, 'api://x', ['']), null);
  assert.equal(adminConsentUrl(client, tenant, webUrl, 'api://x', ['a b']), null);
});
