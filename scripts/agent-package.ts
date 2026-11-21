import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { roleAlphaEnvironment } from '../client/browser/rolealpha-environment';
import { developer, meetingsComponentId, zip } from './teams-package';

/**
 * The Microsoft 365 Copilot agent "roleALPHA Sessions" as its own Teams app package, for people with a Copilot
 * licence. It talks to roleALPHA's MCP endpoint directly; there is no server of ours in between.
 *
 * It is a separate package from the SharePoint one: SharePoint deploys the SPFx Teams app, and an agent with an
 * OAuth connection needs a per-tenant authentication configuration anyway. Each tenant registers roleALPHA in the
 * Microsoft Enterprise token store (dynamic client registration or OAuth, docs/customer-deployment.md) and builds the
 * package with the reference ID it gets:
 *
 *   npm run agent:package -- --reference-id <id> [--mcp-url https://…/api/mcp]
 *
 * Formats: Microsoft 365 app manifest 1.19, declarative agent v1.6, API and MCP plugin manifest v2.4.
 */

export const agentAppId = '6f0e2a58-7c1b-4d1e-9a43-3b5a2f8c9d10';

/** The roleALPHA tools the agent may use; everything else roleALPHA offers stays out of reach. */
export const agentTools = {
  list_my_meeting_scenarios: 'Lists the user’s open meeting scenarios in roleALPHA.',
  open_meeting_scenario: 'Finds or starts the roleALPHA scenario of a meeting and sets its circle.',
  search_roles: 'Searches roles and circles in roleALPHA.',
  search_organigramms: 'Searches org units in roleALPHA.',
  describe_entity_type: 'Describes the fields of a roleALPHA entity type.',
  ask_ralph: 'Asks rALPH, roleALPHA’s assistant; with proposals=true it returns proposals for drafts.',
  create_entity_draft: 'Creates a draft for a new roleALPHA entry in a scenario.',
  update_entity_draft: 'Creates a draft that changes an existing roleALPHA entry.',
  create_relationship_draft: 'Creates a draft for a relationship between two entries.',
  submit_meeting_scenario: 'Submits the meeting scenario for decision with the meeting participants.',
} as const;

export function pluginManifest(mcpUrl: string, referenceId: string) {
  const names = Object.keys(agentTools);
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json',
    schema_version: 'v2.4',
    name_for_human: 'roleALPHA',
    namespace: 'roleALPHA',
    description_for_human: 'Governance drafts and rALPH answers from roleALPHA',
    description_for_model:
      'roleALPHA holds the organisation’s roles, circles, policies and accountabilities. Use it to find circles, ' +
      'ask rALPH for governance proposals, and create drafts in the scenario of a Teams meeting.',
    privacy_policy_url: developer.privacyUrl,
    legal_info_url: developer.termsOfUseUrl,
    functions: Object.entries(agentTools).map(([name, description]) => ({ name, description })),
    runtimes: [
      {
        type: 'RemoteMCPServer',
        auth: { type: 'OAuthPluginVault', reference_id: referenceId },
        run_for_functions: names,
        spec: { url: mcpUrl },
      },
    ],
  };
}

export function agentManifest(instructions: string) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json',
    version: 'v1.6',
    name: 'roleALPHA Sessions',
    description:
      'Turns the governance outcomes of a Teams meeting into roleALPHA drafts with rALPH, roleALPHA’s assistant.',
    instructions,
    // The meeting's notes, recap and transcript are what the agent reads.
    capabilities: [{ name: 'Meetings' }],
    conversation_starters: [
      { title: 'Ergebnisse übernehmen', text: 'Mach aus den Ergebnissen dieses Meetings Entwürfe in roleALPHA.' },
      { title: 'Capture outcomes', text: 'Turn the outcomes of this meeting into roleALPHA drafts.' },
      { title: 'Offene Meetings', text: 'Welche meiner Meetings haben noch offene Entwürfe in roleALPHA?' },
    ],
    actions: [{ id: 'rolealpha', file: 'ai-plugin.json' }],
  };
}

export function appManifest(version: string) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
    manifestVersion: '1.19',
    id: agentAppId,
    version,
    developer,
    name: { short: 'roleALPHA Sessions Agent', full: 'roleALPHA Sessions for Microsoft 365 Copilot' },
    description: {
      short: 'Meeting outcomes into roleALPHA drafts, with rALPH',
      full:
        'A Microsoft 365 Copilot agent that reads the outcomes of a Teams meeting, asks rALPH, roleALPHA’s ' +
        'assistant, for governance proposals and, after your confirmation, creates them as drafts in one ' +
        'roleALPHA scenario per meeting. Needs a Microsoft 365 Copilot licence and a roleALPHA account.',
    },
    icons: { outline: 'outline.png', color: 'color.png' },
    accentColor: '#072A26',
    copilotAgents: { declarativeAgents: [{ id: 'rolealphaSessions', file: 'declarativeAgent.json' }] },
  };
}

export async function agentPackage(options: { referenceId: string; mcpUrl: string; version: string }) {
  if (!/^[\w.-]{1,200}$/.test(options.referenceId)) throw new Error('A valid --reference-id is required.');
  const url = new URL(options.mcpUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('--mcp-url must be an HTTPS address without credentials or query.');
  const instructions = await readFile('agent/instructions.md', 'utf8');
  if (instructions.length > 8000) throw new Error('Agent instructions exceed 8,000 characters.');
  const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2));
  return zip([
    { name: 'manifest.json', data: json(appManifest(options.version)) },
    { name: 'declarativeAgent.json', data: json(agentManifest(instructions)) },
    { name: 'ai-plugin.json', data: json(pluginManifest(url.href, options.referenceId)) },
    { name: 'color.png', data: await readFile(`spfx/teams/${meetingsComponentId}_color.png`) },
    { name: 'outline.png', data: await readFile(`spfx/teams/${meetingsComponentId}_outline.png`) },
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: { 'reference-id': { type: 'string' }, 'mcp-url': { type: 'string' } },
  });
  const { version } = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  const data = await agentPackage({
    referenceId: values['reference-id'] ?? '',
    mcpUrl: values['mcp-url'] ?? roleAlphaEnvironment.mcpUrl,
    version,
  });
  await mkdir('dist', { recursive: true });
  await writeFile('dist/rolealpha-sessions-agent.zip', data);
  console.log('Copilot agent package: dist/rolealpha-sessions-agent.zip');
}
