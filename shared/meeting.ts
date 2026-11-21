import { z } from 'zod';

/**
 * The contract with roleALPHA's MCP tools for meeting scenarios (rA-app: `open_meeting_scenario`,
 * `list_my_meeting_scenarios`, `submit_meeting_scenario`, `ask_ralph` with `proposals`). Every schema is loose about
 * extra fields and strict about the ones the app relies on; anything that does not fit is left out or refused.
 */

const name = z.string().trim().min(1).max(300);
const text = (max: number) => z.string().trim().max(max);

export const circle = z.looseObject({ uuid: z.guid(), name });
export type Circle = z.infer<typeof circle>;

export const scenarioDraft = z.looseObject({
  draftId: z.string().min(1).max(200),
  entityType: z.string().min(1).max(100),
  action: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  entityUuid: z.string().max(200).nullish(),
  name: z.string().max(300).nullish(),
});
export type ScenarioDraft = z.infer<typeof scenarioDraft>;

export const scenario = z.looseObject({
  scenarioId: z.string().min(1).max(200),
  name: z.string().max(300).nullish(),
  status: z.string().min(1).max(50),
  meetingRef: z.string().max(500).nullish(),
  start: z.string().max(100).nullish(),
  circle: circle.nullish(),
  drafts: z.array(scenarioDraft).max(500).default([]),
  url: z.url().max(2000).nullish(),
});
export type Scenario = z.infer<typeof scenario>;

/** `open_meeting_scenario` answers `{ scenario: null }` when `create` is false and the meeting has none yet. */
export const noScenario = z.looseObject({ scenario: z.null() });

export const myScenarios = z.looseObject({ scenarios: z.array(scenario).max(200) });

/** One proposal of rALPH, in the shape of rA-app `server/ai/tools/propose.ts`. */
export const entityProposal = z.looseObject({
  kind: z.literal('entity'),
  action: z.enum(['create', 'update']),
  entityType: z.string().trim().min(1).max(100),
  entityUuid: z.guid().nullish(),
  name,
  fields: z.record(z.string(), z.unknown()).default({}),
  ref: z.string().max(200).nullish(),
  rationale: text(4000).default(''),
});
export const relationshipProposal = z.looseObject({
  kind: z.literal('relationship'),
  relTypeId: z.coerce.number().int().positive(),
  relTypeName: z.string().max(200).nullish(),
  sourceUuid: z.guid().nullish(),
  sourceRef: z.string().max(200).nullish(),
  targetUuid: z.guid().nullish(),
  targetRef: z.string().max(200).nullish(),
  sourceLabel: z.string().max(300).nullish(),
  targetLabel: z.string().max(300).nullish(),
  rationale: text(4000).default(''),
});
export const proposal = z.discriminatedUnion('kind', [entityProposal, relationshipProposal]);
export type EntityProposal = z.infer<typeof entityProposal>;
export type RelationshipProposal = z.infer<typeof relationshipProposal>;
export type Proposal = z.infer<typeof proposal>;

/** rA-app `server/ai/tools/ralph-fragen.ts`; entries are checked one by one, so one bad entry drops only itself. */
export const ralphAnswer = z.looseObject({
  answer: z.string().trim().max(20_000).default(''),
  entities: z.array(z.unknown()).max(50).default([]),
  proposals: z.array(z.unknown()).max(50).default([]),
});
export const ralphEntity = z.looseObject({ name, uuid: z.guid() });
export type RalphReply = {
  answer: string;
  /** Links into the roleALPHA application. */
  entities: { name: string; url: string }[];
  proposals: Proposal[];
};

/** Receipts of `create_entity_draft`, `update_entity_draft` and `create_relationship_draft`. */
export const draftReceipt = z.looseObject({
  draft_created: z.literal(true),
  draftId: z.string().min(1).max(200),
  entityUuid: z.string().max(200).nullish(),
});

export const submission = z.looseObject({
  published: z.array(z.looseObject({ draftId: z.string().max(200), name: z.string().max(300).nullish() })).default([]),
  submitted: z
    .looseObject({
      scenarioId: z.string().max(200),
      approvalMode: z.string().max(50),
      voters: z.array(z.looseObject({ name: z.string().max(300).nullish() })).default([]),
    })
    .nullish(),
  unmatchedParticipants: z.array(z.string().max(320)).default([]),
  url: z.url().max(2000).nullish(),
});
export type Submission = z.infer<typeof submission>;

/** One hit of `search_entities`: an existing entry the user may pick and change. */
export const entityHit = z.looseObject({
  uuid: z.guid(),
  name: z.string().trim().min(1).max(300),
  entityType: z.string().max(100).nullish(),
  entityTypeName: z.string().trim().min(1).max(100),
});
export type EntityHit = z.infer<typeof entityHit>;
export const entitySearch = z.looseObject({ entities: z.array(z.unknown()).max(200).default([]) });

/** `get_entity_details`: the entry as the data node stores it; its fields are `descJsonb`. */
export const entityDetails = z.looseObject({
  uuid: z.guid(),
  name: z.string().max(300).nullish(),
  entityTypeName: z.string().trim().min(1).max(100),
  descJsonb: z.record(z.string(), z.unknown()).nullish(),
});
/** An existing entry ready to edit: its current field values and its entity type. */
export type ExistingEntity = {
  uuid: string;
  name: string;
  entityType: string;
  values: Record<string, unknown>;
};

/** Entity type schema as `describe_entity_type` returns it. */
export const entityTypeSchema = z.looseObject({
  entityType: z.string().max(100),
  requiredFields: z.array(z.string()).default([]),
  fields: z
    .array(
      z.looseObject({
        name: z.string().min(1).max(100),
        type: z.string().max(50).default('string'),
        required: z.boolean().default(false),
        allowedValues: z
          .array(z.union([z.string(), z.number()]))
          .max(200)
          .nullish(),
        label: z.string().max(200).nullish(),
        description: z.string().max(1000).nullish(),
      }),
    )
    .max(200)
    .default([]),
});
export type EntityTypeSchema = z.infer<typeof entityTypeSchema>;

/** What the panel captures for one agenda item before rALPH turns it into proposals. */
export const outcomeNote = z
  .object({ topic: text(200).default(''), note: z.string().trim().min(3).max(3500) })
  .strict();
export const ralphQuestion = z.object({ question: z.string().trim().min(3).max(3500) }).strict();
