import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agentManifest, agentPackage, agentTools, appManifest, pluginManifest } from './agent-package.ts';

test('the Copilot agent reaches only the meeting tools of roleALPHA, through its MCP endpoint', () => {
  const plugin = pluginManifest('https://rolealpha.app/api/mcp', 'ref-123');
  assert.equal(plugin.schema_version, 'v2.4');
  assert.match(plugin.namespace, /^[A-Za-z0-9]+$/);
  assert.ok(plugin.name_for_human.length <= 20 && plugin.description_for_human.length <= 100);
  const [runtime] = plugin.runtimes;
  assert.equal(runtime.type, 'RemoteMCPServer');
  assert.deepEqual(runtime.auth, { type: 'OAuthPluginVault', reference_id: 'ref-123' });
  assert.equal(runtime.spec.url, 'https://rolealpha.app/api/mcp');
  assert.deepEqual(runtime.run_for_functions, Object.keys(agentTools));
  assert.deepEqual(
    plugin.functions.map(f => f.name),
    Object.keys(agentTools),
  );
  assert.ok(plugin.functions.every(f => /^[A-Za-z0-9_]+$/.test(f.name)));
  // Reading tools and the drafting tools; nothing that deletes or approves.
  assert.ok(Object.keys(agentTools).every(name => !/delete|discard|approve|accept/.test(name)));
});

test('the agent manifest stays within the declarative agent limits and points at the plugin', () => {
  const instructions = readFileSync('agent/instructions.md', 'utf8');
  const agent = agentManifest(instructions);
  assert.equal(agent.version, 'v1.6');
  assert.ok(agent.name.length <= 100 && instructions.length <= 8000);
  assert.deepEqual(agent.actions, [{ id: 'rolealpha', file: 'ai-plugin.json' }]);
  // The instructions name every tool the plugin offers, and the agent never drafts without confirmation.
  for (const name of Object.keys(agentTools)) assert.ok(instructions.includes(name), `${name} is not explained`);
  assert.match(instructions, /explicit confirmation/);
  const app = appManifest('2.0.0');
  assert.equal(app.manifestVersion, '1.19');
  assert.deepEqual(app.copilotAgents.declarativeAgents, [{ id: 'rolealphaSessions', file: 'declarativeAgent.json' }]);
  assert.ok(app.name.short.length <= 30 && app.description.short.length <= 80);
});

test('the package needs a reference ID and an HTTPS endpoint', async () => {
  const zip = await agentPackage({ referenceId: 'ref-123', mcpUrl: 'https://rolealpha.app/api/mcp', version: '2.0.0' });
  for (const name of ['manifest.json', 'declarativeAgent.json', 'ai-plugin.json', 'color.png', 'outline.png'])
    assert.ok(zip.includes(Buffer.from(name)), `${name} missing`);
  await assert.rejects(agentPackage({ referenceId: '', mcpUrl: 'https://rolealpha.app/api/mcp', version: '2.0.0' }));
  await assert.rejects(agentPackage({ referenceId: 'x', mcpUrl: 'http://rolealpha.app/api/mcp', version: '2.0.0' }));
});
