import { z } from 'zod';
import { assert, AppError } from '../../../shared/model';
import { event } from '../../../shared/domain';
import { entityPlan, meetingPlan, prepareExport } from '../integrations';
import type { MeetingAction } from './types';

/** Exports approved outcomes, either as one meeting record or as a single configured entity. */
const send =
  (entity: boolean): MeetingAction =>
  async ({ host, actor, get, save }, { body }, m, id) => {
    const ids = entity
      ? [z.string().uuid().parse(body.outcomeId)]
      : z.array(z.string().uuid()).min(1).max(100).parse(body.ids);
    assert(new Set(ids).size === ids.length, 'Doppelte Ergebnis-IDs.');
    const outputs = m.outcomes.filter(o => ids.includes(o.id));
    assert(outputs.length === ids.length, 'Ergebnis fehlt.');
    const plan = entity ? entityPlan(host, m, outputs[0]) : meetingPlan(host, m, outputs);
    if (entity)
      assert(
        JSON.stringify(body.plan) === JSON.stringify(plan),
        'Exportvorschau hat sich geändert. Erneut prüfen.',
        409,
      );
    const target = host.settings.roleAlpha;
    assert(target, 'roleALPHA ist nicht verbunden.', 503);
    const connection = await prepareExport(host, plan, target);
    try {
      outputs.forEach(o => {
        o.export = { state: 'sending', startedAt: new Date().toISOString() };
      });
      event(m, actor, 'export.started', plan.label);
      await save(m);
      try {
        const receipt = await connection.send();
        const current = await get(id, true);
        current.outcomes
          .filter(o => ids.includes(o.id))
          .forEach(o => {
            o.export = { state: 'draft_created', draftId: receipt.draftId, entityUuid: receipt.entityUuid };
          });
        event(current, actor, 'export.completed', receipt.draftId);
        return await save(current);
      } catch {
        // The remote draft may exist although the response was lost: block automatic retries.
        const current = await get(id, true);
        current.outcomes
          .filter(o => ids.includes(o.id))
          .forEach(o => {
            o.export = { state: 'uncertain' };
          });
        event(current, actor, 'export.uncertain', 'Exportantwort unklar; automatische Wiederholung gesperrt.');
        await save(current);
        throw new AppError(502, 'Export nicht eindeutig bestätigt. Prüfe den Entwurfsbereich in roleALPHA.');
      }
    } finally {
      await connection.close().catch(() => {});
    }
  };

export const exportActions: Record<string, MeetingAction> = {
  'entity-preview': async ({ host }, { body }, m) => {
    const output = m.outcomes.find(o => o.id === body.outcomeId);
    assert(output, 'Ergebnis fehlt.');
    return entityPlan(host, m, output);
  },
  export: send(false),
  'export-entity': send(true),
  'export-reconcile': async ({ actor, save }, { body }, m) => {
    const ids = z.array(z.string().uuid()).min(1).parse(body.ids);
    const note = z.string().trim().min(10).max(1000).parse(body.note);
    const resolution = z.enum(['created', 'not-created']).parse(body.resolution);
    const outputs = m.outcomes.filter(o => ids.includes(o.id));
    assert(
      outputs.length === ids.length &&
        outputs.every(
          o =>
            o.export?.state === 'uncertain' ||
            (o.export?.state === 'sending' && Date.now() - Date.parse(o.export.startedAt || '') > 300_000),
        ),
      'Nur unklare Exporte können abgeglichen werden.',
    );
    outputs.forEach(o => {
      o.export =
        resolution === 'created'
          ? { state: 'draft_created', draftId: z.string().min(1).max(200).parse(body.draftId) }
          : undefined;
    });
    event(m, actor, 'export.reconciled', `${resolution}: ${note}`);
    return save(m);
  },
};
