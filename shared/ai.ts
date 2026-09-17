import { outputTypes } from './model.js';

/** JSON Schema subset accepted by every configured provider for structured output. */
export type JsonObjectSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

/**
 * Provider-neutral AI request. Instructions and data stay separate so each adapter can place
 * untrusted data where its API expects context (user message, additional context, ...).
 * Callers always validate the returned value with their own Zod schema.
 */
export type AiTask = {
  name: 'analysis' | 'assistance' | 'governance';
  instructions: string;
  data: unknown;
  outputSchema: JsonObjectSchema;
};

const text = { type: 'string' };
const nullableText = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const textList = { type: 'array', items: text };

export const analysisOutputSchema: JsonObjectSchema = {
  type: 'object',
  properties: {
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepId: text,
          agendaId: nullableText,
          type: { type: 'string', enum: [...outputTypes] },
          title: text,
          description: text,
          owner: nullableText,
          dueDate: nullableText,
          targetId: { type: 'null' },
          data: { type: 'object', properties: {}, required: [], additionalProperties: false },
          evidence: textList,
        },
        required: [
          'stepId',
          'agendaId',
          'type',
          'title',
          'description',
          'owner',
          'dueDate',
          'targetId',
          'data',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['outcomes'],
  additionalProperties: false,
};

export const assistanceOutputSchema: JsonObjectSchema = {
  type: 'object',
  properties: {
    proposal: text,
    rationale: text,
    questions: textList,
    objectionResponses: {
      type: 'array',
      items: {
        type: 'object',
        properties: { objection: text, suggestion: text },
        required: ['objection', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposal', 'rationale', 'questions', 'objectionResponses'],
  additionalProperties: false,
};

export const governanceOutputSchema: JsonObjectSchema = {
  type: 'object',
  properties: {
    statements: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text, sourceIds: textList },
        required: ['text', 'sourceIds'],
        additionalProperties: false,
      },
    },
    limitations: textList,
  },
  required: ['statements', 'limitations'],
  additionalProperties: false,
};
