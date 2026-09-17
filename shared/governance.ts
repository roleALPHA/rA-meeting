import { z } from 'zod';
import { languages } from './assistance';
export const governanceQuestion = z
  .object({ question: z.string().trim().min(3).max(4000), language: z.enum(languages).default('de') })
  .strict();
export const governanceSources = z
  .object({
    sources: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
            title: z.string().trim().min(1).max(300),
            content: z.string().trim().min(1).max(12000),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const governanceAnswer = z
  .object({
    statements: z
      .array(
        z.object({ text: z.string().trim().min(1).max(4000), sourceIds: z.array(z.string()).min(1).max(12) }).strict(),
      )
      .max(12),
    limitations: z.array(z.string().max(1000)).max(5),
  })
  .strict();
export type GovernanceReply = z.infer<typeof governanceAnswer> &
  z.infer<typeof governanceSources> & { retrievedAt: string };
