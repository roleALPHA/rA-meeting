import type { Language } from '../../shared/i18n';
import { assert } from '../../shared/model';
import { proposal, ralphAnswer, ralphEntity, type Circle, type RalphReply } from '../../shared/meeting';
import type { BrowserHost } from './host';
import type { RoleAlphaSession } from './tools';

export const ASK_RALPH = 'ask_ralph';

/** Link into the roleALPHA application for an entity. */
export function entityLink(host: BrowserHost, uuid: string) {
  const url = new URL('/graph', host.roleAlpha!.appUrl);
  url.searchParams.set('anchor', uuid);
  return url.href;
}

/**
 * Asks rALPH on roleALPHA's server: roleALPHA's model, skills and the organisation's data, under the user's roleALPHA
 * permissions. Nothing goes to any other AI service. With `proposals`, rALPH also returns proposals for drafts;
 * creating them is a separate step the user confirms.
 */
export async function askRalph(
  session: RoleAlphaSession,
  host: BrowserHost,
  input: { question: string; context?: string; language: Language; proposals?: boolean },
): Promise<RalphReply> {
  const args: Record<string, unknown> = {
    question: input.question,
    context: input.context || undefined,
    // rALPH answers in German or English; the other interface languages get English.
    locale: input.language === 'de' ? 'de' : 'en',
  };
  if (input.proposals) {
    // An older roleALPHA without proposals answers in text only; the panel must not pretend otherwise.
    const tool = await session.tool(ASK_RALPH);
    assert(
      tool && 'proposals' in ((tool.inputSchema.properties ?? {}) as object),
      'error.ralph.proposalsUnsupported',
      501,
    );
    args.proposals = true;
  }
  // rALPH stops its own turn after 120 seconds.
  const raw = await session.call(ASK_RALPH, args, {
    read: true,
    optional: ['context', 'locale'],
    timeout: 130_000,
    limit: 300_000,
  });
  const parsed = ralphAnswer.safeParse(raw);
  assert(parsed.success, 'error.rolealpha.toolIncompatible', 502);
  const entities = parsed.data.entities.flatMap(item => {
    const entity = ralphEntity.safeParse(item);
    return entity.success ? [{ name: entity.data.name, url: entityLink(host, entity.data.uuid) }] : [];
  });
  const proposals = parsed.data.proposals.flatMap(item => {
    const checked = proposal.safeParse(item);
    return checked.success ? [checked.data] : [];
  });
  assert(parsed.data.answer || proposals.length, 'error.ralph.noAnswer', 502);
  return { answer: parsed.data.answer, entities, proposals };
}

/** What rALPH needs to know about the meeting, in the language of the answer. */
export function meetingContext(language: Language, meetingTitle: string, circle: Circle | null | undefined) {
  const de = language === 'de';
  const lines = [
    de ? `Teams-Meeting: ${meetingTitle || '(ohne Titel)'}` : `Teams meeting: ${meetingTitle || '(untitled)'}`,
  ];
  if (circle) lines.push(de ? `Kreis: ${circle.name} (${circle.uuid})` : `Circle: ${circle.name} (${circle.uuid})`);
  return lines.join('\n');
}

/** The request for proposals: what was agreed on one agenda item, turned into governance changes. */
export function proposalQuestion(language: Language, topic: string, note: string) {
  const de = language === 'de';
  const head = de
    ? 'Ein Meeting hat zu einem Agendapunkt Folgendes festgehalten. Schlage die Governance-Änderungen, die daraus folgen, als Entwürfe vor (propose_entity, propose_relationship). Bestehende Einträge änderst du, statt sie doppelt anzulegen. Erfinde nichts, was nicht in der Notiz steht.'
    : 'A meeting recorded the following for one agenda item. Propose the governance changes that follow from it as drafts (propose_entity, propose_relationship). Change existing entries instead of creating duplicates. Do not invent anything the note does not say.';
  const parts = [head];
  if (topic) parts.push((de ? 'Agendapunkt: ' : 'Agenda item: ') + topic);
  parts.push((de ? 'Notiz:\n' : 'Note:\n') + note);
  return parts.join('\n\n');
}
