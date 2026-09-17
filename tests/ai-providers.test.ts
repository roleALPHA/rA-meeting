import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedDestination, customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { completeTask } from '../client/browser/ai/provider.js';
import { analysisOutputSchema, type AiTask } from '../shared/ai.js';
import { tenant, user } from './helpers/sharepoint-rest.js';

const task: AiTask = {
  name: 'analysis',
  instructions: 'Extract outcomes.',
  data: { transcript: [{ id: 's1', text: 'We decided to hire.' }] },
  outputSchema: analysisOutputSchema,
};
const output = { outcomes: [] };

function hostWith(ai: unknown) {
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Member',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: async () => new Response(null, { status: 500 }),
    token: async resource => {
      tokens.push(resource);
      return 'delegated-test';
    },
    settings: customerSettingsSchema.parse({ ai }),
  };
  return { host, tokens };
}

function mockFetch(t: { after: (fn: () => void) => void }, handler: (url: string, init: RequestInit) => Response) {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  return calls;
}

test('AI settings keep legacy configurations, apply provider defaults and reject secrets', () => {
  const endpoint = { resource: 'api://ai', permissionResource: 'AI', scope: 'access_as_user' };
  const legacy = customerSettingsSchema.parse({ ai: { ...endpoint, url: 'https://ai.example/chat', model: 'gpt' } });
  assert.equal(legacy.ai?.provider, 'openai-compatible');
  const copilot = customerSettingsSchema.parse({
    ai: { provider: 'copilot', resource: 'api://workiq', permissionResource: 'Work IQ' },
  });
  assert.equal(copilot.ai?.provider === 'copilot' && copilot.ai.url, 'https://workiq.svc.cloud.microsoft/rest');
  assert.equal(copilot.ai?.scope, 'WorkIQAgent.Ask');
  const claude = customerSettingsSchema.parse({
    ai: {
      provider: 'claude-foundry',
      url: 'https://example-resource.services.ai.azure.com/anthropic',
      permissionResource: 'Azure AI Services',
      scope: 'user_impersonation',
    },
  });
  assert.equal(claude.ai?.resource, 'https://ai.azure.com');
  assert.equal(claude.ai?.provider === 'claude-foundry' && claude.ai.model, 'claude-opus-5');
  for (const ai of [
    { provider: 'copilot', resource: 'api://workiq', permissionResource: 'Work IQ', apiKey: 'secret' },
    { provider: 'claude-foundry', url: 'https://x.services.ai.azure.com/anthropic?api-key=secret', ...endpoint },
    { provider: 'unknown', url: 'https://ai.example', ...endpoint },
  ])
    assert.equal(customerSettingsSchema.safeParse({ ai }).success, false);
});

test('prefix destinations allow only paths below the configured endpoint', () => {
  const base = 'https://example-resource.services.ai.azure.com/anthropic';
  assert.ok(allowedDestination(`${base}/v1/messages`, base, 'prefix'));
  assert.ok(allowedDestination(base, base, 'exact'));
  assert.ok(!allowedDestination(`${base}/v1/messages`, base, 'exact'));
  assert.ok(!allowedDestination(`${base}-evil/v1/messages`, base, 'prefix'));
  assert.ok(!allowedDestination('https://attacker.invalid/anthropic/v1/messages', base, 'prefix'));
  assert.ok(!allowedDestination(`${base}/../other`, base, 'prefix'));
  assert.ok(!allowedDestination('https://user:pw@example-resource.services.ai.azure.com/anthropic/x', base, 'prefix'));
});

test('Copilot receives data as context with web grounding off; fenced JSON, labels and citations are returned', async t => {
  const { host, tokens } = hostWith({ provider: 'copilot', resource: 'api://workiq', permissionResource: 'Work IQ' });
  const calls = mockFetch(t, url => {
    if (url.endsWith('/conversations')) return Response.json({ id: 'conv-1', messages: [] });
    return Response.json({
      id: 'conv-1',
      messages: [
        { text: 'prompt echo' },
        {
          text: '```json\n' + JSON.stringify(output) + '\n```',
          sensitivityLabel: { sensitivityLabelId: 'label-1', displayName: 'Confidential' },
          attributions: [
            { attributionType: 'annotation', attributionSource: 'model', seeMoreWebUrl: 'https://people' },
            {
              attributionType: 'citation',
              attributionSource: 'grounding',
              seeMoreWebUrl: 'https://customer.sharepoint.com/doc.docx',
            },
          ],
        },
      ],
    });
  });
  const completion = await completeTask(host, task);
  assert.deepEqual(completion.output, output);
  assert.equal(completion.provider, 'copilot');
  assert.equal(completion.sensitivityLabel, 'Confidential');
  assert.deepEqual(completion.groundingReferences, ['https://customer.sharepoint.com/doc.docx']);
  assert.deepEqual(
    calls.map(c => c.url),
    [
      'https://workiq.svc.cloud.microsoft/rest/conversations',
      'https://workiq.svc.cloud.microsoft/rest/conversations/conv-1/chat',
    ],
  );
  const chat = JSON.parse(String(calls[1].init.body));
  assert.equal(chat.contextualResources.webContext.isWebEnabled, false);
  assert.match(chat.message.text, /Extract outcomes\./);
  assert.match(chat.message.text, /JSON Schema/);
  assert.ok(!chat.message.text.includes('We decided to hire.'), 'data is sent as context, not as the prompt');
  assert.match(chat.additionalContext[0].text, /^Part 1 of 1:\n/);
  assert.ok(chat.additionalContext[0].text.includes('We decided to hire.'));
  assert.ok(calls.every(c => new Headers(c.init.headers).get('Authorization') === 'Bearer delegated-test'));
  assert.ok(calls.every(c => c.init.redirect === 'error' && c.init.credentials === 'omit'));
  assert.ok(tokens.every(r => r === 'api://workiq'));
});

test('Copilot gets exactly one correction request; oversized input is never sent', async t => {
  const { host } = hostWith({ provider: 'copilot', resource: 'api://workiq', permissionResource: 'Work IQ' });
  let chats = 0;
  const calls = mockFetch(t, url => {
    if (url.endsWith('/conversations')) return Response.json({ id: 'conv-2', messages: [] });
    chats++;
    return Response.json({ id: 'conv-2', messages: [{ text: 'Here is a summary instead of JSON.' }] });
  });
  await assert.rejects(completeTask(host, task), /kein gültiges JSON/);
  assert.equal(chats, 2);
  assert.match(JSON.parse(String(calls[2].init.body)).message.text, /not a valid JSON object/);

  const small = hostWith({
    provider: 'copilot',
    resource: 'api://workiq',
    permissionResource: 'Work IQ',
    maxInputChars: 1000,
  });
  const before = calls.length;
  await assert.rejects(completeTask(small.host, { ...task, data: 'x'.repeat(2000) }), /zu groß/);
  assert.equal(calls.length, before);
});

function sse(text: string, stopReason: string) {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  const body = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

test('Claude on Foundry uses the deployment, structured output and the delegated Entra ID token', async t => {
  const { host, tokens } = hostWith({
    provider: 'claude-foundry',
    url: 'https://example-resource.services.ai.azure.com/anthropic',
    permissionResource: 'Azure AI Services',
    scope: 'user_impersonation',
    model: 'claude-opus-5-meetings',
  });
  let stopReason = 'end_turn';
  const calls = mockFetch(t, () => sse(JSON.stringify(output), stopReason));
  const completion = await completeTask(host, task);
  assert.deepEqual(completion.output, output);
  assert.equal(completion.provider, 'claude-foundry');
  assert.equal(calls[0].url, 'https://example-resource.services.ai.azure.com/anthropic/v1/messages');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, 'claude-opus-5-meetings');
  assert.equal(body.system, 'Extract outcomes.');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config.format, { type: 'json_schema', schema: analysisOutputSchema });
  assert.deepEqual(JSON.parse(body.messages[0].content), task.data);
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer delegated-test');
  assert.equal(new Headers(calls[0].init.headers).get('x-api-key'), null);
  assert.ok(tokens.length > 0 && tokens.every(r => r === 'https://ai.azure.com'));

  stopReason = 'refusal';
  await assert.rejects(completeTask(host, task), /abgelehnt/);
  stopReason = 'max_tokens';
  await assert.rejects(completeTask(host, task), /zu lang/);
});
