import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminConsentUrl, graphConsentUrl, spfxClientId } from '../client/browser/consent.js';
import { tenant } from './helpers/sharepoint-rest.js';

const client = { authority: 'https://login.microsoftonline.com/' };
const webUrl = 'https://customer.sharepoint.com/sites/circle';

test('admin consent link asks Microsoft for the scope on the SPFx app', () => {
  const url = new URL(adminConsentUrl(client, tenant, webUrl, 'api://rolealpha/', ['access_as_user'])!);
  assert.equal(url.origin + url.pathname, `https://login.microsoftonline.com/${tenant}/v2.0/adminconsent`);
  // Microsoft's "SharePoint Online Web Client Extensibility", the same in every tenant (AADSTS700038 with the page
  // context's empty spfx3rdPartyServicePrincipalId).
  assert.equal(spfxClientId, '08e18876-6177-487e-b8b5-cf950c1e598c');
  assert.equal(url.searchParams.get('client_id'), spfxClientId);
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
  assert.equal(adminConsentUrl(client, tenant, webUrl, ' ', ['access_as_user']), null);
  assert.equal(adminConsentUrl(client, tenant, webUrl, 'api://x', ['']), null);
  assert.equal(adminConsentUrl(client, tenant, webUrl, 'api://x', ['a b']), null);
});
