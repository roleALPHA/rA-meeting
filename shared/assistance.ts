import { z } from 'zod';
export const languages = ['de', 'en', 'fr', 'es'] as const;
export const assistanceInput = z
  .object({
    mode: z.enum(['proposal', 'integration']),
    agendaId: z.string().uuid(),
    proposal: z.string().trim().max(12000).default(''),
    context: z.string().trim().max(12000).default(''),
    objections: z.string().trim().max(12000).default(''),
    language: z.enum(languages).default('de'),
  })
  .strict();
export const assistanceResult = z
  .object({
    proposal: z.string().trim().min(1).max(12000),
    rationale: z.string().max(4000),
    questions: z.array(z.string().max(1000)).max(8),
    objectionResponses: z
      .array(z.object({ objection: z.string().max(2000), suggestion: z.string().max(3000) }).strict())
      .max(20),
  })
  .strict();
export type AssistanceInput = z.infer<typeof assistanceInput>;
export type AssistanceResult = z.infer<typeof assistanceResult>;
