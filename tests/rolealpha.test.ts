import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleAlphaFetch, roleAlphaToken, tokenEndpoint } from '../client/browser/rolealpha.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';

const url = 'https://rolealpha.example/api/mcp';
/** A fresh tenant per test, because an exchanged token is cached per user, workspace and endpoint. */
function fixture(workspace = crypto.randomUUID()) {
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: workspace,
    userId: user,
    userName: 'Member',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: fakeSharePoint().request,
    token: async resource => {
      tokens.push(resource);
      return 'entra-token';
    },
    settings: customerSettingsSchema.parse({
      roleAlpha: {
        url,
        resource: 'api://rolealpha',
        permissionResource: 'roleALPHA',
        scope: 'access_as_user',
        tenant,
      },
    }),
  };
  return { host, tokens };
}

test('the delegated Microsoft token is exchanged at the endpoint of the same origin', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, tokens } = fixture();
  const bodies: URLSearchParams[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://rolealpha.example/api/auth/oauth/token');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    bodies.push(new URLSearchParams(String(init?.body)));
    return Response.json({ access_token: `token-${bodies.length}`, token_type: 'Bearer', expires_in: 300 });
  };
  assert.equal(tokenEndpoint(url), 'https://rolealpha.example/api/auth/oauth/token');
  assert.equal(await roleAlphaToken(host), 'token-1');
  // A valid token is reused; only `force` asks for a new one.
  assert.equal(await roleAlphaToken(host), 'token-1');
  assert.equal(await roleAlphaToken(host, true), 'token-2');
  assert.deepEqual(
    bodies.map(b => [b.get('grant_type'), b.get('subject_token'), b.get('tenant_uuid'), b.get('resource')]),
    [
      ['urn:ietf:params:oauth:grant-type:token-exchange', 'entra-token', tenant, url],
      ['urn:ietf:params:oauth:grant-type:token-exchange', 'entra-token', tenant, url],
    ],
  );
  assert.deepEqual(tokens, ['api://rolealpha', 'api://rolealpha']);
});

test('an expired exchange is repeated once; other destinations are refused', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host } = fixture();
  let exchanges = 0;
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target === tokenEndpoint(url)) {
      exchanges++;
      return Response.json({ access_token: `token-${exchanges}`, expires_in: 300 });
    }
    seen.push(String(new Headers(init?.headers).get('Authorization')));
    return new Response(null, { status: seen.length === 1 ? 401 : 204 });
  };
  const call = roleAlphaFetch(host);
  assert.equal((await call(url, { method: 'POST' })).status, 204);
  assert.deepEqual(seen, ['Bearer token-1', 'Bearer token-2']);
  assert.equal(exchanges, 2);
  await assert.rejects(call('https://attacker.example/api/mcp'), /roleALPHA/);
  assert.equal(seen.length, 2);
});

test('roleALPHA’s refusals are shown as what an administrator can act on', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const cases: [number, string, RegExp][] = [
    [403, 'access_denied', /widerrufen|freigeschaltet/],
    [400, 'invalid_grant', /mit Microsoft verknüpft/],
    [400, 'invalid_request', /Anmeldung bei roleALPHA/],
    [500, 'server_error', /Anmeldung bei roleALPHA/],
  ];
  for (const [status, code, expected] of cases) {
    globalThis.fetch = async () => Response.json({ error: code }, { status });
    await assert.rejects(roleAlphaToken(fixture().host), expected);
  }
  // A malformed answer is not a token either.
  globalThis.fetch = async () => Response.json({ token_type: 'Bearer' });
  await assert.rejects(roleAlphaToken(fixture().host), /Anmeldung bei roleALPHA/);
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  await assert.rejects(roleAlphaToken(fixture().host), /Anmeldung bei roleALPHA/);
});
