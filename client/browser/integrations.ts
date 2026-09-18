import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { assert, type Meeting, type Outcome } from '../../shared/model';
import { analysisTask, validateAnalysis } from '../../shared/analysis';
import { assistanceTask } from '../../shared/assistance-task';
import { completeTask } from './ai/provider';
import { assistanceResult, type AssistanceInput } from '../../shared/assistance';
import type { BrowserHost, Endpoint } from './host';
import { connectRoleAlpha, findTool, toolProperties } from './rolealpha';
const receipt = z.object({
  draft_created: z.literal(true),
  draftId: z.string().min(1),
  entityUuid: z.string().min(1),
  status: z.literal('draft'),
});
/** Validated outcome proposals plus provenance of the AI answer. */
export async function analyzeBrowser(host: BrowserHost, m: Meeting, language: 'de' | 'en' | 'fr' | 'es') {
  const completion = await completeTask(host, analysisTask(m, language));
  return { outcomes: validateAnalysis(completion.output, m), completion };
}
export async function assistBrowser(host: BrowserHost, m: Meeting, input: AssistanceInput) {
  const completion = await completeTask(host, assistanceTask(m, input));
  return { suggestion: assistanceResult.parse(completion.output), completion };
}
export type ExportPlan = {
  destination: string;
  tool: string;
  label: string;
  /** `tenant_uuid` is added only for a tool that declares it; roleALPHA's endpoint takes the tenant from the token. */
  arguments: { entity_type: string; name: string; custom_id: string; data: unknown; tenant_uuid?: string };
};
export function entityPlan(host: BrowserHost, m: Meeting, o: Outcome): ExportPlan {
  assert(o.status === 'approved' && !o.export, 'error.integrations.onlyConfirmedUnexportedOutcomes', 409);
  assert(!o.targetId, 'error.integrations.adapterCreatesNewEntities');
  const route = host.settings.roleAlpha?.entities[o.type];
  assert(route && host.settings.roleAlpha, 'error.integrations.mcpDestinationConfiguredOutcome', 503);
  return {
    destination: host.settings.roleAlpha.url,
    tool: host.settings.roleAlpha.createTool,
    label: route.label,
    arguments: {
      entity_type: route.entityType,
      name: o.title,
      custom_id: `ra-meeting:${m.id}:${o.id}`,
      data: {
        ...o.data,
        raMeeting: {
          meetingId: m.id,
          outcomeId: o.id,
          circle: m.circle,
          circleId: m.circleId,
          description: o.description,
          owner: o.owner,
          dueDate: o.dueDate,
          approvedBy: o.approvedBy,
          approvedAt: o.approvedAt,
          evidence: m.transcript.filter(s => o.evidence.includes(s.id)),
        },
      },
    },
  };
}
export function meetingPlan(host: BrowserHost, m: Meeting, outputs: Outcome[]): ExportPlan {
  const settings = host.settings.roleAlpha;
  assert(settings?.meeting, 'error.integrations.rolealphaConnected', 503);
  assert(
    outputs.length && outputs.every(o => o.status === 'approved' && !o.export),
    'error.integrations.onlyConfirmedOutcomesHave',
    409,
  );
  return {
    destination: settings.url,
    tool: settings.createTool,
    label: 'Meeting',
    arguments: {
      entity_type: 'meeting',
      name: m.title,
      custom_id: `ra-meeting:${m.id}:${outputs
        .map(o => o.id)
        .sort()
        .join(',')}`,
      data: {
        schemaVersion: 'ra-meeting/1',
        meetingId: m.id,
        circle: m.circle,
        circleId: m.circleId,
        template: { id: m.template.id, name: m.template.name, version: m.template.version },
        meetingStatus: m.status,
        createdAt: m.createdAt,
        outcomes: outputs.map(({ export: _export, ...o }) => ({
          ...o,
          evidenceSegments: m.transcript.filter(s => o.evidence.includes(s.id)),
        })),
      },
    },
  };
}
/** Explicit delegated-auth transport; never bearer/API keys in properties or persistent storage. */
export async function prepareExport(host: BrowserHost, plan: ExportPlan, target: Endpoint) {
  assert(
    host.settings.roleAlpha &&
      target.url === host.settings.roleAlpha.url &&
      target.resource === host.settings.roleAlpha.resource,
    'error.integrations.rolealphaConnected',
    503,
  );
  assert(plan.destination === target.url, 'error.integrations.exportPreviewHasChanged', 409);
  const client = new Client({ name: 'ra-meeting-spfx', version: '1.0.0' });
  try {
    await connectRoleAlpha(host, client);
    const found = await findTool(client, plan.tool, 'error.integrations.invalidMcpContinuationPage');
    assert(found, 'error.integrations.destinationServerDoesOffer', 502);
    const properties = toolProperties(found);
    const args = properties?.tenant_uuid
      ? { ...plan.arguments, tenant_uuid: host.settings.roleAlpha!.tenant }
      : plan.arguments;
    assert(
      properties &&
        ['entity_type', 'name', 'custom_id'].every(k => properties[k]?.type === 'string') &&
        properties.data?.type === 'object' &&
        (!properties.tenant_uuid || properties.tenant_uuid.type === 'string') &&
        (found.inputSchema.required || []).every(k => k in args),
      'error.integrations.mcpToolDoesSupport',
      502,
    );
    return {
      close: () => client.close(),
      send: async () => {
        const result = await client.callTool({ name: plan.tool, arguments: args }, undefined, {
          timeout: 30_000,
        });
        assert(!result.isError, 'error.integrations.rolealphaDidConfirmDraft', 502);
        const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
        return receipt.parse(
          result.structuredContent ?? (text && 'text' in text ? JSON.parse(String(text.text)) : null),
        );
      },
    };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
