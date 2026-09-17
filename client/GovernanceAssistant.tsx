import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { useApi } from './api-context';
import { t as tr, errorText, language } from './i18n';
import type { GovernanceReply } from '../shared/governance';
import { AiProvenance } from './ui';
export function GovernanceAssistant({ enabled }: { enabled: boolean }) {
  const { request } = useApi();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<GovernanceReply | null>(null);
  const [error, setError] = useState('');
  return (
    <section className="assistant-panel">
      <h2>{tr('app.askGovernance')}</h2>
      <p>{tr('governance.answerQuestionsAboutRoles')}</p>
      <p className="small muted">{tr('governance.questionSentRolealphaRetrieved')}</p>
      {!enabled && <p className="notice">{tr('governance.governanceQuestionsRequireAi')}</p>}
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (busy || !enabled) return;
          setBusy(true);
          setError('');
          setReply(null);
          try {
            setReply(await request<GovernanceReply>('/governance/ask', { question, language: language() }));
          } catch (error) {
            setError(errorText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>{tr('governance.governanceQuestion')}</span>
          <textarea
            rows={4}
            minLength={3}
            maxLength={4000}
            required
            disabled={busy}
            value={question}
            placeholder={tr('governance.whichRoleResponsibleDecision')}
            onChange={e => {
              setQuestion(e.target.value);
              setReply(null);
              setError('');
            }}
          />
        </label>
        <button className="button primary" disabled={!enabled || busy || question.trim().length < 3}>
          <WandSparkles size={16} />
          {tr(busy ? 'governance.checkingGovernance' : 'governance.checkGovernance')}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {reply && (
        <div aria-live="polite">
          <h3>{tr('governance.answerSources')}</h3>
          <AiProvenance provider={reply.aiProvider} sensitivityLabel={reply.sensitivityLabel} />
          <p className="notice">{tr('governance.answerConsidersOnlyRetrieved')}</p>
          {!reply.statements.length && <p>{tr('governance.sufficientlySupportedAnswerFound')}</p>}
          {reply.statements.map((s, i) => (
            <div className="result-card" key={i}>
              <p className="preserve">{s.text}</p>
              <p className="small">
                {s.sourceIds
                  .map(id => {
                    const source = reply.sources.find(s => s.id === id)!;
                    return `${source.title} (${id})`;
                  })
                  .join(' · ')}
              </p>
            </div>
          ))}
          {reply.limitations.length > 0 && (
            <>
              <h4>{tr('assistant.openQuestions')}</h4>
              <ul>
                {reply.limitations.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <h4>{tr('governance.retrievedGovernanceSources')}</h4>
          <p className="small muted">{new Date(reply.retrievedAt).toLocaleString(language())}</p>
          {reply.sources.map(source => (
            <details key={source.id}>
              <summary>
                {source.title} · {source.id}
              </summary>
              <p className="preserve">{source.content}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
