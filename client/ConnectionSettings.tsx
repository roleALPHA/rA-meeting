import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, WandSparkles } from 'lucide-react';
import { AppError, outputLabels, outputTypes, type OutputType } from '../shared/model';
import type { MessageId } from '../shared/i18n';
import { connectionSettingsSchema, type AiProviderName, type ConnectionSettings } from './browser/host';
import type { ConnectionPart, ConnectionsState } from './browser/connections';
import { errorText, t as tr } from './i18n';
import { aiProviderLabels } from './labels';
import { Button } from './ui';
import { useApi } from './api-context';

export type ConnectionsApi = {
  load: () => Promise<ConnectionsState>;
  save: (settings: ConnectionSettings, version: number) => Promise<ConnectionsState>;
  test: (part: ConnectionPart, settings: ConnectionSettings) => Promise<MessageId>;
};

type AiDraft = {
  provider: AiProviderName | '';
  url: string;
  resource: string;
  scope: string;
  model: string;
  fallbackModel: string;
  maxInputChars?: number;
};
type RoleAlphaDraft = {
  enabled: boolean;
  url: string;
  resource: string;
  scope: string;
  tenant: string;
  createTool: string;
  meeting: boolean;
  entities: Partial<Record<OutputType, { entityType: string; label: string }>>;
  governanceTool: string;
  draftsTool: string;
  draftsAppUrl: string;
};

/** Prefilled values per provider; they match the schema defaults in host.ts. */
const aiDefaults: Record<AiProviderName, Omit<AiDraft, 'provider'>> = {
  copilot: {
    url: 'https://workiq.svc.cloud.microsoft/rest',
    resource: '',
    scope: 'WorkIQAgent.Ask',
    model: '',
    fallbackModel: '',
  },
  'claude-foundry': {
    url: '',
    resource: 'https://ai.azure.com',
    scope: 'user_impersonation',
    model: 'claude-opus-5',
    fallbackModel: '',
  },
  'openai-compatible': { url: '', resource: '', scope: 'access_as_user', model: '', fallbackModel: '' },
};

function aiDraft(settings: ConnectionSettings['ai']): AiDraft {
  if (!settings) return { provider: '', url: '', resource: '', scope: '', model: '', fallbackModel: '' };
  return {
    provider: settings.provider,
    url: settings.url,
    resource: settings.resource,
    scope: settings.scope,
    model: 'model' in settings ? settings.model : '',
    fallbackModel: 'fallbackModel' in settings ? (settings.fallbackModel ?? '') : '',
    maxInputChars: 'maxInputChars' in settings ? settings.maxInputChars : undefined,
  };
}

function roleAlphaDraft(settings: ConnectionSettings['roleAlpha']): RoleAlphaDraft {
  return {
    enabled: !!settings,
    url: settings?.url ?? '',
    resource: settings?.resource ?? '',
    scope: settings?.scope ?? 'access_as_user',
    tenant: settings?.tenant ?? '',
    createTool: settings?.createTool ?? 'create_entity_draft',
    meeting: settings?.meeting ?? false,
    entities: settings?.entities ?? {},
    governanceTool: settings?.governance?.searchTool ?? '',
    draftsTool: settings?.drafts?.searchTool ?? '',
    draftsAppUrl: settings?.drafts?.appUrl ?? '',
  };
}

/** Empty optional fields are left out, so the schema's defaults apply. */
const filled = (value: string) => (value.trim() ? value.trim() : undefined);

function toSettings(ai: AiDraft, roleAlpha: RoleAlphaDraft) {
  return connectionSettingsSchema.safeParse({
    ai: ai.provider
      ? {
          provider: ai.provider,
          url: filled(ai.url),
          resource: filled(ai.resource),
          scope: filled(ai.scope),
          ...(ai.provider === 'copilot' ? { maxInputChars: ai.maxInputChars } : { model: filled(ai.model) }),
          ...(ai.provider === 'claude-foundry' ? { fallbackModel: filled(ai.fallbackModel) ?? null } : {}),
        }
      : null,
    roleAlpha: roleAlpha.enabled
      ? {
          url: filled(roleAlpha.url),
          resource: filled(roleAlpha.resource),
          scope: filled(roleAlpha.scope),
          tenant: filled(roleAlpha.tenant),
          createTool: filled(roleAlpha.createTool),
          meeting: roleAlpha.meeting,
          entities: roleAlpha.entities,
          governance: filled(roleAlpha.governanceTool) ? { searchTool: roleAlpha.governanceTool.trim() } : null,
          drafts:
            filled(roleAlpha.draftsTool) || filled(roleAlpha.draftsAppUrl)
              ? { searchTool: filled(roleAlpha.draftsTool), appUrl: filled(roleAlpha.draftsAppUrl) }
              : null,
        }
      : null,
  });
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: MessageId;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{tr(label)}</span>
      <input value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

/** Numbered inline instructions; the values the owner entered are filled into the text. */
type Step = readonly [MessageId, Record<string, string>?];
function Guide({ steps }: { steps: readonly Step[] }) {
  return (
    <details className="guide">
      <summary>{tr('connections.guide')}</summary>
      <ol>
        {steps.map(([id, params]) => (
          <li key={id}>{tr(id, params)}</li>
        ))}
      </ol>
    </details>
  );
}

const grantSteps = (resource: string, scope: string): Step[] => [
  ['connections.guide.grant1'],
  ['connections.guide.grant2', { resource: resource || '…' }],
  ['connections.guide.grant3', { scope: scope || '…' }],
  ['connections.guide.grant4'],
];

/** Provider prerequisites before the shared Entra steps. */
const aiSteps: Record<AiProviderName, (origin: string) => Step[]> = {
  copilot: () => [['connections.guide.copilot1'], ['connections.guide.copilot2']],
  'claude-foundry': () => [
    ['connections.guide.foundry1'],
    ['connections.guide.foundry2'],
    ['connections.guide.foundry3'],
  ],
  'openai-compatible': origin => [['connections.guide.openai1', { origin }]],
};

type Result = { tone: 'success' | 'error'; text: string };

/**
 * AI and roleALPHA connections of the workspace, for site owners. Used in the setup wizard and on the Connections
 * page. Testing uses the values as entered; nothing is stored until "Save".
 */
export function ConnectionSettings({ api, origin }: { api: ConnectionsApi; origin: string }) {
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [ai, setAi] = useState<AiDraft>(aiDraft(null));
  const [roleAlpha, setRoleAlpha] = useState<RoleAlphaDraft>(roleAlphaDraft(null));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Partial<Record<ConnectionPart | 'save', Result>>>({});
  const [tested, setTested] = useState<Record<ConnectionPart, boolean>>({ ai: false, roleAlpha: false });
  const apply = (loaded: ConnectionsState) => {
    setState(loaded);
    setAi(aiDraft(loaded.settings.ai));
    setRoleAlpha(roleAlphaDraft(loaded.settings.roleAlpha));
  };
  useEffect(() => {
    api
      .load()
      .then(apply)
      .catch((e: unknown) => setResults({ save: { tone: 'error', text: errorText(e) } }));
  }, [api]);
  const changeAi = (patch: Partial<AiDraft>) => {
    setAi(current => ({ ...current, ...patch }));
    setTested(current => ({ ...current, ai: false }));
  };
  const changeRoleAlpha = (patch: Partial<RoleAlphaDraft>) => {
    setRoleAlpha(current => ({ ...current, ...patch }));
    setTested(current => ({ ...current, roleAlpha: false }));
  };
  const parsed = () => {
    const result = toSettings(ai, roleAlpha);
    if (result.success) return result.data;
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', ');
    throw new AppError(400, 'connections.checkFields', { fields });
  };
  const act = async (key: ConnectionPart | 'save', action: () => Promise<Result>) => {
    setBusy(true);
    setResults(current => ({ ...current, [key]: undefined }));
    try {
      const result = await action();
      setResults(current => ({ ...current, [key]: result }));
    } catch (e) {
      setResults(current => ({ ...current, [key]: { tone: 'error', text: errorText(e) } }));
    } finally {
      setBusy(false);
    }
  };
  const test = (part: ConnectionPart) =>
    act(part, async () => {
      const message = await api.test(part, parsed());
      setTested(current => ({ ...current, [part]: true }));
      return { tone: 'success', text: tr(message) };
    });
  const save = () =>
    act('save', async () => {
      const settings = parsed();
      apply(await api.save(settings, state!.version));
      const untested = (settings.ai && !tested.ai) || (settings.roleAlpha && !tested.roleAlpha);
      return { tone: 'success', text: tr(untested ? 'connections.savedUntested' : 'connections.saved') };
    });
  const resultLine = (key: ConnectionPart | 'save') => {
    const result = results[key];
    return (
      result && (
        <p role={result.tone === 'error' ? 'alert' : 'status'} className={`notice ${result.tone}`}>
          {result.text}
        </p>
      )
    );
  };
  if (!state) return resultLine('save') || <p role="status">{tr('connections.loading')}</p>;
  const entitiesOn = outputTypes.filter(type => roleAlpha.entities[type]);
  return (
    <div className="connection-settings">
      <p className="notice">{tr('connections.ownersDecide')}</p>
      {state.protection === 'unprotected' && (
        <p role="alert" className="notice">
          {tr('connections.unprotected')}
        </p>
      )}
      {state.invalid && (
        <p role="alert" className="notice">
          {tr('connections.invalidStored')}
        </p>
      )}
      <div className="settings-grid">
        <section className="integration-card">
          <div className="connection-icon">
            <WandSparkles size={22} />
          </div>
          <h2>{tr('app.aiAnalysis')}</h2>
          <label className="field">
            <span>{tr('connections.aiProvider')}</span>
            <select
              value={ai.provider}
              disabled={busy}
              onChange={e => {
                const provider = e.target.value as AiProviderName | '';
                changeAi(provider ? { provider, ...aiDefaults[provider] } : { provider });
              }}
            >
              <option value="">{tr('connections.noAi')}</option>
              {(Object.keys(aiDefaults) as AiProviderName[]).map(provider => (
                <option key={provider} value={provider}>
                  {tr(aiProviderLabels[provider])}
                </option>
              ))}
            </select>
          </label>
          {ai.provider && (
            <>
              <Field
                label="connections.url"
                value={ai.url}
                disabled={busy}
                placeholder={
                  ai.provider === 'claude-foundry'
                    ? 'https://…services.ai.azure.com/anthropic'
                    : ai.provider === 'openai-compatible'
                      ? 'https://…/v1/chat/completions'
                      : undefined
                }
                onChange={url => changeAi({ url })}
              />
              <Field
                label="connections.resource"
                value={ai.resource}
                disabled={busy}
                placeholder="api://…"
                onChange={resource => changeAi({ resource })}
              />
              <Field
                label="connections.scope"
                value={ai.scope}
                disabled={busy}
                onChange={scope => changeAi({ scope })}
              />
              {ai.provider !== 'copilot' && (
                <Field
                  label={ai.provider === 'claude-foundry' ? 'connections.deployment' : 'connections.model'}
                  value={ai.model}
                  disabled={busy}
                  onChange={model => changeAi({ model })}
                />
              )}
              {ai.provider === 'claude-foundry' && (
                <Field
                  label="connections.fallbackDeployment"
                  value={ai.fallbackModel}
                  disabled={busy}
                  onChange={fallbackModel => changeAi({ fallbackModel })}
                />
              )}
              <Guide steps={[...aiSteps[ai.provider](origin), ...grantSteps(ai.resource, ai.scope)]} />
              <Button disabled={busy} onClick={() => void test('ai')}>
                {tr('connections.test')}
              </Button>
              {resultLine('ai')}
            </>
          )}
        </section>
        <section className="integration-card">
          <div className="connection-icon">
            <Send size={22} />
          </div>
          <h2>roleALPHA</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={roleAlpha.enabled}
              disabled={busy}
              onChange={e => changeRoleAlpha({ enabled: e.target.checked })}
            />
            {tr('connections.connectRolealpha')}
          </label>
          {roleAlpha.enabled && (
            <>
              <Field
                label="connections.mcpUrl"
                value={roleAlpha.url}
                disabled={busy}
                placeholder="https://…/api/mcp"
                onChange={url => changeRoleAlpha({ url })}
              />
              <Field
                label="connections.resource"
                value={roleAlpha.resource}
                disabled={busy}
                placeholder="api://…"
                onChange={resource => changeRoleAlpha({ resource })}
              />
              <Field
                label="connections.scope"
                value={roleAlpha.scope}
                disabled={busy}
                onChange={scope => changeRoleAlpha({ scope })}
              />
              <Field
                label="connections.tenant"
                value={roleAlpha.tenant}
                disabled={busy}
                placeholder="00000000-0000-0000-0000-000000000000"
                onChange={tenant => changeRoleAlpha({ tenant })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={roleAlpha.meeting}
                  disabled={busy}
                  onChange={e => changeRoleAlpha({ meeting: e.target.checked })}
                />
                {tr('connections.sendMeeting')}
              </label>
              <fieldset className="entity-types">
                <legend>{tr('connections.entities')}</legend>
                {outputTypes.map(type => {
                  const entity = roleAlpha.entities[type];
                  return (
                    <div key={type} className="entity-type">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!entity}
                          disabled={busy}
                          onChange={e => {
                            const entities = { ...roleAlpha.entities };
                            if (e.target.checked) entities[type] = { entityType: type, label: tr(outputLabels[type]) };
                            else delete entities[type];
                            changeRoleAlpha({ entities });
                          }}
                        />
                        {tr(outputLabels[type])}
                      </label>
                      {entity && (
                        <input
                          aria-label={tr('connections.entityType', { type: tr(outputLabels[type]) })}
                          value={entity.entityType}
                          disabled={busy}
                          onChange={e =>
                            changeRoleAlpha({
                              entities: { ...roleAlpha.entities, [type]: { ...entity, entityType: e.target.value } },
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </fieldset>
              {(roleAlpha.meeting || entitiesOn.length > 0) && (
                <Field
                  label="connections.createTool"
                  value={roleAlpha.createTool}
                  disabled={busy}
                  onChange={createTool => changeRoleAlpha({ createTool })}
                />
              )}
              <Field
                label="connections.governanceTool"
                value={roleAlpha.governanceTool}
                disabled={busy}
                placeholder="search_…"
                onChange={governanceTool => changeRoleAlpha({ governanceTool })}
              />
              <Field
                label="connections.draftsTool"
                value={roleAlpha.draftsTool}
                disabled={busy}
                placeholder="search_…"
                onChange={draftsTool => changeRoleAlpha({ draftsTool })}
              />
              {filled(roleAlpha.draftsTool) && (
                <Field
                  label="connections.draftsAppUrl"
                  value={roleAlpha.draftsAppUrl}
                  disabled={busy}
                  placeholder="https://…"
                  onChange={draftsAppUrl => changeRoleAlpha({ draftsAppUrl })}
                />
              )}
              <Guide
                steps={[
                  ['connections.guide.rolealpha1', { origin }],
                  ['connections.guide.rolealpha2'],
                  ...grantSteps(roleAlpha.resource, roleAlpha.scope),
                  ['connections.guide.rolealpha3'],
                ]}
              />
              <Button disabled={busy} onClick={() => void test('roleAlpha')}>
                {tr('connections.test')}
              </Button>
              {resultLine('roleAlpha')}
            </>
          )}
        </section>
      </div>
      <Button className="primary" disabled={busy} onClick={() => void save()}>
        {tr('settings.save')}
      </Button>
      {resultLine('save')}
    </div>
  );
}

/** The Connections page's variant: the same form through the app's routes. `saved` reloads the page data. */
export function WorkspaceConnections({ saved }: { saved: () => Promise<unknown> }) {
  const { request } = useApi();
  const reload = useRef(saved);
  reload.current = saved;
  const api = useMemo<ConnectionsApi>(
    () => ({
      load: () => request<ConnectionsState>('/connections'),
      save: async (settings, version) => {
        const state = await request<ConnectionsState>('/connections', { settings, version }, 'PUT');
        await reload.current();
        return state;
      },
      test: async (part, settings) =>
        (await request<{ result: MessageId }>('/connections/test', { part, settings })).result,
    }),
    [request],
  );
  // The page and every service the app calls share the SharePoint origin, also inside Teams.
  return <ConnectionSettings api={api} origin={window.location.origin} />;
}
