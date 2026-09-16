import { z } from 'zod';

export const outputTypes = ['task', 'project', 'governance', 'policy', 'metric', 'checklist', 'okr', 'risk', 'it_system', 'note'] as const;
export const outputLabels: Record<OutputType, string> = { task: 'Aufgabe', project: 'Projekt', governance: 'Rollenänderung', policy: 'Policy', metric: 'Kennzahl', checklist: 'Checkliste', okr: 'OKR', risk: 'Risiko', it_system: 'IT-System', note: 'Notiz' };
export type OutputType = typeof outputTypes[number];
export const stepKinds = ['check-in', 'checklist', 'metrics', 'projects', 'agenda', 'custom', 'check-out'] as const;
export const stepLabels: Record<typeof stepKinds[number], string> = { 'check-in': 'Check-in', checklist: 'Checklisten', metrics: 'Kennzahlen', projects: 'Projektupdates', agenda: 'Agenda', custom: 'Freier Schritt', 'check-out': 'Check-out' };
const text = z.string().trim().min(1).max(200);
export const stepSchema = z.object({
  id: z.string().uuid(), kind: z.enum(stepKinds), title: text, description: z.string().max(4000).default(''),
  minutes: z.number().int().min(0).max(480).default(5), optional: z.boolean().default(false),
  outputs: z.array(z.enum(outputTypes)).max(outputTypes.length).default([]),
  phases: z.array(text).max(20).default([]),
});
export type Step = z.infer<typeof stepSchema>;
export const templateInput = z.object({ name: text, description: z.string().max(4000).default(''), category: z.enum(['tactical', 'governance', 'custom']), enabled: z.boolean(), steps: z.array(stepSchema).min(1).max(40) }).superRefine((v, ctx) => {
  if (new Set(v.steps.map(s => s.id)).size !== v.steps.length) ctx.addIssue({ code: 'custom', message: 'Schritt-IDs müssen eindeutig sein.' });
});
export type TemplateInput = z.infer<typeof templateInput>;
export type Template = TemplateInput & { id: string; version: number; createdAt: string; updatedAt: string };
export type Actor = { id: string; name: string; tenantId: string; admin: boolean; workspace: 'read' | 'write' };
export type Segment = { id: string; start: string; end: string; speaker: string; text: string };
export const outcomeInput = z.object({
  stepId: z.string().uuid(), agendaId: z.string().uuid().nullable().default(null), type: z.enum(outputTypes), title: text,
  description: z.string().max(12000).default(''), owner: z.string().max(200).nullable().default(null),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  targetId: z.string().uuid().nullable().default(null), data: z.record(z.unknown()).default({}),
  evidence: z.array(z.string()).max(100).default([]),
});
export type OutcomeInput = z.infer<typeof outcomeInput>;
export type Outcome = OutcomeInput & { id: string; source: 'manual' | 'ai'; status: 'proposed' | 'approved' | 'rejected'; approvedBy?: string; approvedAt?: string; export?: { state: 'sending' | 'draft_created' | 'uncertain'; startedAt?: string; draftId?: string; entityUuid?: string; message?: string } };
export type AgendaItem = { proposal?: string; objections?: string; tensionId?: string; id: string; stepId: string; title: string; owner: string; status: 'open' | 'resolved'; phase: number };
export type MeetingEvent = { id: string; at: string; actor: string; type: string; detail: string };
export type CalendarEntry = { eventId: string; organizerId: string; title: string; start: string; end: string; cancelled: boolean; occurrence: boolean; seriesMasterId: string | null; joinUrl: string | null; webUrl: string | null; syncedAt: string };
export type Meeting = {
  calendar?: CalendarEntry;
  id: string; revision: number; title: string; circle: string; circleId: string | null; scheduledAt: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
  template: Template; status: 'scheduled' | 'active' | 'completed'; currentStep: number; stepStartedAt: string | null;
  completedSteps: string[]; notes: Record<string, string>; agenda: AgendaItem[]; outcomes: Outcome[];
  transcript: Segment[]; transcriptHash?: string; analyzedHash?: string; events: MeetingEvent[];
};
export type Tension = { id: string; version: number; title: string; description: string; circle: string; createdBy: string; createdAt: string; updatedAt: string; status: 'open' | 'resolved' };
export type Bootstrap = { tensions: Tension[]; actor: Actor; templates: Template[]; meetings: Meeting[]; integrations: { governance?: boolean; entityTypes: OutputType[]; storage: string; ai: boolean; mcp: boolean; graph: boolean; } };
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function assert(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new AppError(status, message); }
