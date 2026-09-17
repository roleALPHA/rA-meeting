import { useState } from 'react';
import { WandSparkles, X } from 'lucide-react';
import type { Meeting, AgendaItem } from '../shared/model';
import type { AssistanceInput, AssistanceResult } from '../shared/assistance';
import { useApi } from './api-context';
import { t as tr, language } from './i18n';
import { AiProvenance } from './ui';
import type { aiProviderLabels } from './labels';

type AiInfo = { provider: keyof typeof aiProviderLabels; sensitivityLabel: string | null };
export function Assistant({
  meeting,
  item,
  enabled,
  busy,
  run,
  update,
}: {
  meeting: Meeting;
  item: AgendaItem;
  enabled: boolean;
  busy: boolean;
  run: (f: () => Promise<void>) => void;
  update: (m: Meeting) => void;
}) {
  const { request } = useApi();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistanceInput['mode']>('proposal');
  const [proposal, setProposal] = useState(item.proposal || '');
  const [context, setContext] = useState('');
  const [objections, setObjections] = useState(item.objections || '');
  const [result, setResult] = useState<AssistanceResult | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [revision, setRevision] = useState(meeting.revision);
  const stale = revision !== meeting.revision;
  const edit = (setter: (v: string) => void, value: string) => {
    setter(value);
    setResult(null);
  };
  return (
    <section className="assistant">
      <button
        className="button"
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          setRevision(meeting.revision);
          setProposal(item.proposal || '');
          setObjections(item.objections || '');
          setResult(null);
        }}
      >
        <WandSparkles size={16} />
        {tr('assistant.proposalObjections')}
      </button>
      {open && (
        <div className="assistant-panel">
          <div className="row">
            <h4>{tr('assistant.aiFacilitationAssistant')}</h4>
            <button className="button icon" aria-label={tr('assistant.close')} onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <p className="small muted">{tr('assistant.aiSuggestsWordingPeople')}</p>
          {!enabled && <p className="notice">{tr('assistant.aiConnectedYetCan')}</p>}
          <label className="field">
            <span>{tr('assistant.help')}</span>
            <select
              value={mode}
              onChange={e => {
                setMode(e.target.value as AssistanceInput['mode']);
                setResult(null);
              }}
            >
              <option value="proposal">{tr('assistant.proposalForming')}</option>
              <option value="integration">{tr('assistant.objectionIntegration')}</option>
            </select>
          </label>
          <label className="field">
            <span>{tr('assistant.needContext')}</span>
            <textarea maxLength={12000} rows={3} value={context} onChange={e => edit(setContext, e.target.value)} />
          </label>
          <label className="field">
            <span>{tr('assistant.proposalDraft')}</span>
            <textarea maxLength={12000} rows={5} value={proposal} onChange={e => edit(setProposal, e.target.value)} />
          </label>
          <label className="field">
            <span>{tr('assistant.objectionsOnePerParagraph')}</span>
            <textarea
              maxLength={12000}
              rows={3}
              value={objections}
              onChange={e => edit(setObjections, e.target.value)}
            />
          </label>
          <p className="small muted">{tr('assistant.onlyAgendaItemStep')}</p>
          <button
            className="button"
            disabled={busy || !enabled || stale || (mode === 'integration' && (!proposal.trim() || !objections.trim()))}
            onClick={() =>
              run(async () => {
                const reply = await request<{ revision: number; suggestion: AssistanceResult; ai: AiInfo }>(
                  `/meetings/${meeting.id}/assist`,
                  {
                    revision: meeting.revision,
                    input: { mode, agendaId: item.id, proposal, context, objections, language: language() },
                  },
                );
                setResult(reply.suggestion);
                setAi(reply.ai);
                setRevision(reply.revision);
              })
            }
          >
            <WandSparkles size={16} />
            {tr('assistant.suggestWording')}
          </button>
          {result && (
            <div className="result-card">
              <h4>{tr('assistant.aiSuggestionYetAdopted')}</h4>
              <AiProvenance provider={ai?.provider} sensitivityLabel={ai?.sensitivityLabel} />
              <p className="preserve">{result.proposal}</p>
              <p>{result.rationale}</p>
              {result.objectionResponses.map((r, i) => (
                <div key={i}>
                  <strong>{r.objection}</strong>
                  <p>{r.suggestion}</p>
                </div>
              ))}
              {result.questions.length > 0 && (
                <>
                  <h4>{tr('assistant.openQuestions')}</h4>
                  <ul>
                    {result.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              <button
                className="button"
                disabled={busy || stale}
                onClick={() => {
                  setProposal(result.proposal);
                  setResult(null);
                }}
              >
                {tr('assistant.copyIntoInputField')}
              </button>
            </div>
          )}
          {stale && <p role="alert">{tr('assistant.meetingHasChangedClose')}</p>}
          <button
            className="button primary"
            disabled={busy || stale || !proposal.trim()}
            onClick={() =>
              run(async () => {
                update(
                  await request<Meeting>(`/meetings/${meeting.id}/command`, {
                    type: 'agenda.proposal',
                    revision,
                    id: item.id,
                    proposal,
                    objections,
                  }),
                );
                setOpen(false);
              })
            }
          >
            {tr('assistant.saveReviewedProposalDraft')}
          </button>
          <p className="small muted">{tr('assistant.savingRecordsDraftDoes')}</p>
        </div>
      )}
    </section>
  );
}
