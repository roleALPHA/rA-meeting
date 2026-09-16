import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { assert, type Meeting, type Outcome } from '../shared/model.js';
import { config } from './config.js';

export function exportPayload(meeting: Meeting, outputs: Outcome[]) {
  assert(outputs.length > 0 && outputs.every(o => o.status === 'approved'), 'Nur bestätigte Ergebnisse können exportiert werden.');
  return {
    tenant_uuid: config.rolealphaTenant,
    name: `${meeting.title} · Ergebnisse`,
    custom_id: `ra-meeting:${meeting.id}:${outputs.map(o => o.id).sort().join(',')}`,
    data: {
      schemaVersion: 'ra-meeting/1', meetingId: meeting.id, circle: meeting.circle, circleId: meeting.circleId,
      template: { id: meeting.template.id, name: meeting.template.name, version: meeting.template.version },
      meetingStatus: meeting.status, createdAt: meeting.createdAt,
      outcomes: outputs.map(({ export: _export, ...o }) => ({ ...o, evidenceSegments: meeting.transcript.filter(s => o.evidence.includes(s.id)) })),
    },
  };
}
export const receiptSchema = z.object({ draft_created: z.literal(true), draftId: z.string().min(1), entityUuid: z.string().min(1), status: z.literal('draft') });
export async function sendMeetingDraft(meeting: Meeting, outputs: Outcome[]) {
  assert(config.mcpUrl && config.mcpToken && config.rolealphaTenant, 'roleALPHA ist nicht verbunden.', 503);
  const client = new Client({ name: 'ra-meeting', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), { requestInit: { headers: { Authorization: `Bearer ${config.mcpToken}` }, redirect: 'error' } });
  try {
    await client.connect(transport, { timeout: 15_000 });
    const result = await client.callTool({ name: 'create_meeting', arguments: exportPayload(meeting, outputs) }, undefined, { timeout: 30_000 });
    assert(!result.isError, 'roleALPHA hat den Export nicht bestätigt.', 502);
    const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
    const value = result.structuredContent ?? (text && 'text' in text ? JSON.parse(String(text.text)) : null);
    return receiptSchema.parse(value);
  } finally { await client.close().catch(() => {}); }
}

/** Explicit administrator routing, never an LLM-selected server or tool. */
export function entityPlan(meeting: Meeting, output: Outcome) {
  assert(output.status === 'approved' && !output.export, 'Nur bestätigte, nicht exportierte Ergebnisse können übertragen werden.', 409);
  assert(!output.targetId, 'Dieser Adapter legt neue Entitäten an; Änderungen an bestehenden Objekten sind nicht konfiguriert.');
  const route = config.entityRoutes[output.type];
  assert(route && config.mcpToken && config.rolealphaTenant, 'Für diesen Ergebnistyp ist kein MCP-Ziel konfiguriert.', 503);
  return { destination: route.url, tool: route.tool, label: route.label, arguments: {
    tenant_uuid: config.rolealphaTenant, name: output.title, custom_id: `ra-meeting:${meeting.id}:${output.id}`,
    data: { ...output.data, raMeeting: { meetingId: meeting.id, outcomeId: output.id, circle: meeting.circle, circleId: meeting.circleId, description: output.description, owner: output.owner, dueDate: output.dueDate, approvedBy: output.approvedBy, approvedAt: output.approvedAt, evidence: meeting.transcript.filter(s => output.evidence.includes(s.id)) } },
  } };
}
export async function connectEntityExport(plan: ReturnType<typeof entityPlan>) {
  const client = new Client({ name: 'ra-meeting', version: '0.1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(plan.destination), { requestInit: { headers: { Authorization: `Bearer ${config.mcpToken}` }, redirect: 'error' } }), { timeout: 15_000 });
    let cursor: string | undefined; let found;
    do { const page = await client.listTools(cursor ? { cursor } : {}); found = page.tools.find(t => t.name === plan.tool); cursor = page.nextCursor; } while (!found && cursor);
    assert(found, 'Das konfigurierte MCP-Tool wird vom Zielserver nicht angeboten.', 502);
    const schema = found.inputSchema;
    const properties = schema.properties as Record<string, { type?: string; enum?: unknown[] }> | undefined;
    assert(properties && ['tenant_uuid', 'name', 'custom_id', 'data'].every(k => k in properties), 'MCP-Tool unterstützt den roleALPHA-Erstellvertrag nicht.', 502);
    assert((schema.required || []).every(k => k in plan.arguments), 'Das MCP-Tool verlangt zusätzliche Pflichtfelder. Adapter erforderlich.', 502);
    assert(['tenant_uuid', 'name', 'custom_id'].every(k => properties[k].type === 'string') && properties.data.type === 'object', 'MCP-Parameter haben ein nicht unterstütztes Schema.', 502);
    return { close: () => client.close(), send: async () => {
      const result = await client.callTool({ name: plan.tool, arguments: plan.arguments }, undefined, { timeout: 30_000 });
      assert(!result.isError, 'roleALPHA hat den Entwurf nicht bestätigt.', 502);
      const content = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
      return receiptSchema.parse(result.structuredContent ?? (content && 'text' in content ? JSON.parse(String(content.text)) : null));
    } };
  } catch (error) { await client.close().catch(() => {}); throw error; }
}
