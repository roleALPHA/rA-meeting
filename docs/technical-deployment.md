# Technical deployment guide

This guide is for package builders and operators. To install a prepared package, follow the [step-by-step administrator guide](customer-deployment.md).

## Architecture

roleALPHA Sessions has two front ends and no server of its own:

- **The meeting side panel**, an SPFx web part that Teams shows as a meeting tab and side panel. It runs in the user's browser. It reads the meeting chat through Microsoft Graph, talks to roleALPHA's MCP endpoint, and posts a summary into the meeting chat.
- **The roleALPHA Sessions agent** for Microsoft 365 Copilot, a declarative agent whose only action is roleALPHA's MCP endpoint. It reads the meeting's Loop notes and recap through Copilot.

Both write into the same place: **one roleALPHA scenario per meeting**, holding the drafts that came out of it. Nothing is stored in SharePoint; SharePoint only hosts the package. Browser storage holds only conveniences per user: the interface language and the chosen roleALPHA organisation.

rALPH, roleALPHA's assistant, is the only AI. It answers on roleALPHA's server with roleALPHA's model, skills and the organisation's data, under the user's roleALPHA permissions. No other AI service is configured or called.

| Interface | Used for | Credential |
| --- | --- | --- |
| Microsoft Graph | Meeting chat: topic (`GET /chats/{id}`), members' e-mail addresses (`GET /chats/{id}/members`), posting the summary (`POST /chats/{id}/messages`) | Delegated: `Chat.ReadBasic`, `ChatMember.Read`, `ChatMessage.Send` |
| SharePoint REST of the host page | The tenant property `rolealphaSessions` (`GET /_api/web/GetStorageEntity('rolealphaSessions')`) | The page's own session |
| roleALPHA MCP endpoint and its token endpoint | Circles, rALPH, scenario, drafts, submission | Delegated Entra token exchanged for a short-lived roleALPHA token |

## Connecting to roleALPHA

**The installation ships with the package.** The package contains roleALPHA's address and Entra app (`client/browser/rolealpha-environment.ts`). A tenant administrator can point every user at another installation, such as a QA system, with the SharePoint **tenant property** `rolealphaSessions`. Only SharePoint administrators can set tenant properties; every user can read them:

```powershell
Set-PnPStorageEntity -Key rolealphaSessions -Scope Tenant `
  -Value '{"url":"https://qa.rolealpha.app/api/mcp","resource":"api://…","scope":"access_as_user","appUrl":"https://qa.rolealpha.app"}'
```

All four fields are optional and default to the shipped installation. The address must be HTTPS without credentials or key-like query parameters. A property that does not parse is an error, not a silent fallback.

**The organisation is found by the exchange.** The first exchange is sent **without** `tenant_uuid`. roleALPHA answers with a working token and the organisation's `tenant_uuid` when the user has one organisation, or with a token of scope `rolealpha:organisation-select` when there are several; the app then calls `list_my_organisations` and the user picks one. The app remembers the choice in browser storage per user and endpoint and sends it with every later exchange. A stale or edited value can only make roleALPHA refuse the call; it cannot grant access. A roleALPHA release that still requires `tenant_uuid` refuses the first exchange with `invalid_request`; the panel then says that roleALPHA needs an update. Contract: rA-app `doc/ENTRA-TAUSCH.md`.

**Sign-in: the delegated Microsoft token is exchanged.** roleALPHA's MCP endpoint does not accept Microsoft tokens. Before each call, the app exchanges the signed-in user's delegated Entra token for a short-lived roleALPHA token (RFC 8693) at `POST <origin of url>/api/auth/oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, the Entra token as `subject_token`, the organisation as `tenant_uuid`, and the MCP address as `resource`. The token endpoint is derived from the endpoint's origin; it is the only second address of this integration, and it is never configured separately. The token lives in memory until it expires and is never stored; roleALPHA issues no refresh token deliberately. A rejected call is retried once with a freshly exchanged token.

This requires on the roleALPHA side (**Settings → AI → External applications**): the **External AI applications** switch on, and under **Microsoft 365 integrations** the customer's Entra directory ID and the allowed addresses (the SharePoint origin and `https://teams.microsoft.com`); and **each user having signed in on rolealpha.app with "Sign in with Microsoft" at least once** — the exchange identifies the person by the Microsoft object ID. Access is granted and revoked per user under connected applications in roleALPHA. The app shows roleALPHA's refusals as: `400 invalid_grant` — account not linked or inactive, sign in with Microsoft on rolealpha.app once; `403 access_denied` — the switch is off or the access was revoked; `400 invalid_target` — the address in the tenant property is not roleALPHA's MCP endpoint.

**roleALPHA's permission is requested by the package.** `webApiPermissionRequests` contains `{ "resource": "roleALPHA", "scope": "access_as_user", "appId": "4bd22250-d811-4905-97a4-cb2bf69f98fa", "replyUrl": "https://rolealpha.app/" }` (generated by `scripts/build-browser.ts`). With `appId` and `replyUrl` (SPFx 1.15.2 and later) SharePoint creates the roleALPHA app in the customer's directory when a SharePoint administrator approves the request under **SharePoint admin center → Advanced → API access**. Another installation set through the tenant property needs its own grant, as described next.

`resource` is the service's Entra audience (application ID URI); `scope` is its delegated permission. A roleALPHA installation other than the shipped one is not requested by the package and does not appear under **API access**. An Entra administrator grants it once to the app SPFx requests third-party tokens with: since 2025 Microsoft's first-party app *SharePoint Online Web Client Extensibility*, app ID `08e18876-6177-487e-b8b5-cf950c1e598c` in every tenant. The Entra admin center has no screen for its permissions, so the form offers, next to **Test connection**, a **Grant consent** link: Microsoft's v2.0 `adminconsent` endpoint with that `client_id` (`client/browser/consent.ts`), the scope URI `resource/scope`, and the SPFx reply page `<origin>/_forms/spfxsinglesignon.aspx` as `redirect_uri`; the authority comes from the page context's `aadInstanceUrl`. The page context's `spfx3rdPartyServicePrincipalId` is not used: it is the empty GUID on tenants with the new app, and Entra rejects such a link (AADSTS700038). The side panel offers the same link for the package's Graph permissions and roleALPHA's scope when they are missing, as an alternative to **API access**. Without the link, the [administrator guide](customer-deployment.md#4-approve-the-permissions) has a Microsoft Graph PowerShell script that creates or extends the `oauth2PermissionGrant` (`AllPrincipals`) from the SPFx app to the service. The consent is recorded by Entra; nothing returns to the app. Each service must validate audience, tenant, scope, and user permissions itself. The grant applies to every SharePoint Framework solution in the tenant, not exclusively to this web part.

Services must allow CORS from the actual SharePoint origins. For MCP, allow `Authorization`, `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version`, and the required HTTP methods, and expose `Mcp-Session-Id`. Check permissions separately for guest and cross-tenant sign-ins. Missing approval, CORS, or network access produces an error; there is no fallback through the manufacturer's infrastructure.

Services must allow CORS from the actual SharePoint origins and from Teams. For MCP, allow `Authorization`, `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version`, and the required HTTP methods, and expose `Mcp-Session-Id`. Missing approval, CORS, or network access produces an error; there is no fallback through the manufacturer's infrastructure.

## roleALPHA contract

The side panel and the agent use roleALPHA's external MCP endpoint (Streamable HTTP). The shapes the app relies on are in `shared/meeting.ts`; `tests/helpers/fake-services.ts` simulates them. Tools are looked up in `tools/list` on every session:

- A tool used for **reading** must be annotated `readOnlyHint: true` and `destructiveHint: false`, or the app never calls it.
- Every argument the app sends must be declared by the tool, apart from a few optional ones (`title`, `start`, `context`, `locale`), and every argument the tool requires must be present. So a changed contract fails before anything is sent.
- `tenant_uuid` and `organisation` are passed only to a tool that declares them; roleALPHA's public endpoint takes the organisation from the token.
- roleALPHA reports some failures as `{"error": "…"}` in the result; the app shows that reason to the user.

| Tool | Kind | Arguments | Result the app reads |
| --- | --- | --- | --- |
| `list_my_organisations` | read | – | `{ organisationen: [{ uuid, name }] }` |
| `search_roles`, `search_organigramms` | read | `query`, `limit: 20` | `{ roles: [{ uuid, name }] }`, `{ organigramms: [{ uuid, name }] }` |
| `open_meeting_scenario` | write | `meeting_ref`, `title`, `start`, `circle_uuid?`, `create` | The meeting's **open** scenario `{ scenarioId, name, status, meetingRef, circle: { uuid, name }, drafts: [{ draftId, entityType, action, status, entityUuid, name }], url }`, or `{ scenario: null }` with `create: false` |
| `list_my_meeting_scenarios` | read | – | `{ scenarios: [scenario] }` |
| `ask_ralph` | read | `question`, `context?`, `locale?` (`de`/`en`), `proposals?` | `{ answer, entities: [{ name, uuid }], proposals: [proposal] }` |
| `describe_entity_type` | read | `entity_type` | `{ entityType, requiredFields, fields: [{ name, type, required, allowedValues, label }] }` |
| `create_entity_draft` | write | `entity_type`, `name`, `data`, `custom_id`, `scenario_id` | `{ draft_created: true, draftId, entityUuid }` |
| `update_entity_draft` | write | `entity_uuid`, `name`, `fields` (changed fields only), `scenario_id` | as above |
| `create_relationship_draft` | write | `source_uuid`, `target_uuid`, `rel_type_id`, `scenario_id` | as above |
| `submit_meeting_scenario` | write | `scenario_id`, `participants` (e-mail addresses) | `{ published: [{ draftId, name }], submitted: { scenarioId, approvalMode, voters } \| null, unmatchedParticipants: [email], url }` |

**The meeting reference** is `teams-chat:<chat ID>` for the side panel. A recurring series shares one chat; roleALPHA keeps one *open* scenario per reference, and after a submission the next occurrence starts a new one. The agent uses `copilot:<title>:<date>` when the side panel has not started a scenario.

**Proposals** have the shape of rA-app `server/ai/tools/propose.ts`: `{ kind: "entity", action: "create" | "update", entityType, entityUuid?, name, fields, ref?, rationale }` or `{ kind: "relationship", relTypeId, relTypeName, sourceUuid | sourceRef, targetUuid | targetRef, sourceLabel, targetLabel, rationale }`. Entries that do not fit are dropped one by one. A relationship may point at a planned entity by `ref`; the panel creates planned entities first and replaces the `ref` with the `entityUuid` roleALPHA returned. An `ask_ralph` without the `proposals` parameter is an older roleALPHA release; the panel says so instead of answering in text only.

**Submission** belongs to roleALPHA. Drafts of modules whose approval mode is *Liberal* are published directly; the rest is submitted for decision. Where a module allows a meeting to set the voters, the participants (matched to roleALPHA accounts by e-mail) vote instead of the graph-computed affected persons; participants without an account are reported back and cannot vote. Quorum and veto stay roleALPHA's rules. The submitter must have created the scenario or be a tenant administrator.

`ask_ralph` accepts at most 4,000 characters of question and 8,000 of context and 30 questions per person and hour; the panel keeps a note to 3,500 characters. Reading a whole transcript is not part of this version.

## The side panel

The web part reads the Teams context once at start (`chat.id`, `page.frameContext`) and has no settings of its own; the property pane Teams shows when the tab is added has nothing to configure. In a meeting chat it shows, in this order:

1. The organisation choice, if the user has several.
2. The circle search, until the meeting's scenario exists. Choosing a circle calls `open_meeting_scenario` with `create: true`.
3. **Record an outcome:** agenda item and note; **Proposals from rALPH** calls `ask_ralph` with `proposals: true`, the meeting title and the circle as context. Each proposal shows rALPH's reason and editable fields from `describe_entity_type` (a new entry shows its required fields, a change only what it changes). The checked proposals become drafts with `scenario_id` and a `custom_id` of the form `ra-sessions:<meeting reference>:<random>`.
4. **Ask rALPH:** a free question with the meeting and circle as context.
5. **Drafts from this meeting**, from the scenario, and **Submit for decision**, which reads the chat members through Graph and calls `submit_meeting_scenario`. The result is shown, and the user can edit and send a summary with a link to the scenario into the meeting chat. Only links into the roleALPHA application are accepted there.

rALPH's output is marked as AI-generated with a link to report harmful content. Outside a meeting (a SharePoint page, the personal app) the app explains how to add it to a meeting and lists the user's open meeting scenarios.

## The Copilot agent

`npm run agent:package -- --reference-id <id> [--mcp-url <address>]` writes `dist/rolealpha-sessions-agent.zip`, a Microsoft 365 app package (manifest 1.19) with a declarative agent (`declarativeAgent.json`, schema v1.6, capability `Meetings`) and an API and MCP plugin (`ai-plugin.json`, schema v2.4) whose runtime is `RemoteMCPServer` at roleALPHA's MCP address. The plugin lists exactly the tools in the table above in `functions` and `run_for_functions`; everything else roleALPHA offers stays out of the agent's reach. The instructions are in `agent/instructions.md` (at most 8,000 characters): find the meeting, read its notes, ask rALPH for proposals, create drafts only after the user confirmed the list, submit only on request.

Authentication is `OAuthPluginVault`: the `reference_id` points at an authentication configuration in Microsoft's Enterprise token store that each tenant creates once, with dynamic client registration against roleALPHA or a static OAuth client, and Copilot's redirect `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`. No secret is in the package. The agent is a separate package from the SharePoint one because the SPFx Teams app cannot carry this per-tenant configuration.

## Security model and trust boundary

- **roleALPHA decides.** The app never approves anything. Drafts are proposals until people decide in roleALPHA; roleALPHA enforces tenant, visibility and permissions for every call with the user's own account.
- **Reading cannot write.** Read tools must be annotated read-only and non-destructive. rALPH's proposals are data; a draft is created only for a proposal the user left checked and adopted.
- **Untrusted content.** Meeting notes, rALPH's answers and roleALPHA's results are untrusted input. They are rendered as text, never as HTML; the chat summary is escaped and may only link into the roleALPHA application.
- **Participants come from Graph.** The submission sends the meeting chat's members. Someone who can submit could in principle send a different list; roleALPHA limits submission to the scenario's creator or an administrator, records the list in its audit, and only accounts of the organisation can vote.
- **Tokens.** Tokens are requested only for Microsoft Graph and roleALPHA's audience, held in memory, and sent only to the exact configured MCP address and its token endpoint.

Approved API permissions are granted to Microsoft's shared SPFx app *SharePoint Online Web Client Extensibility* and are therefore available to every SharePoint Framework solution in the tenant (see the [administrator guide](customer-deployment.md)). The build prints the permissions a package requests.

## Build the package

```sh
npm ci
npm run spfx:install
npm test
npm run build
```

Root tools use Node.js 24. SPFx 1.24.0 builds with the separate project-local Node.js 22 installation. These are development tools, not a server runtime required for installation. React is pinned to SPFx-supported version 17.0.1. Increase the version in `spfx/package.json` before distributing an update; the build derives package and solution versions from it.

Output: `dist/rolealpha-meetings.sppkg`. `includeClientSideAssets` packages the code, fonts and icons for app catalog hosting. A build check excludes server modules and test/demo code from the browser package.

`npm run dev` starts a browser demonstration in which Teams, Microsoft Graph and roleALPHA are simulated (`tests/helpers/fake-services.ts`); nothing leaves the browser. `?width=320` shows the side panel width, `?theme=dark|contrast` the Teams themes, `?meeting=0` the app outside a meeting.

The project uses the [rA Meetings Internal Collaboration License 1.0](../LICENSE.md), effective 16 September 2026. The package script also copies the license to `dist/LICENSE.md`; include it with the installation package. Preserve applicable third-party notices when distributing artifacts.

## Visual design and themes

The interface follows roleALPHA's corporate design after the rebranding of 10/2026 (Figma styleguide "roleALPHA-Brand", implemented the same way in rA-app): Tiefgrün and Creme as text and surface, Anthrazit as the dark surface, Mint as the only accent, the styleguide's function colours for success, warning and error, IBM Plex Sans and Mono with Manrope for headings, and the flat roleALPHA signet. `client/brand.css` holds the brand values and nothing else; `client/style.css` derives every colour, surface and border from them. `tests/brand.test.ts` and an ESLint rule reject raw colour values elsewhere.

- **Fonts ship in the package.** The eight `.woff2` files (about 170 KB) are emitted as separate files into ClientSideAssets and served from the tenant; no font service is contacted. Browsers ignore `@font-face` inside the web part's shadow root, so the app registers these rules once on the page in a `style[data-ra-fonts]` element. It contains `@font-face` rules only, with `rA`-prefixed family names that do not collide with the page's own fonts. All other styles stay inside the shadow root.
- **Themes.** In Teams the app follows the client theme — default, dark and high contrast — and switches when the user changes it. On SharePoint pages it stays light. Windows high-contrast mode (forced colours) is respected in every host.
- **Side panel.** Teams gives the meeting side panel about 320 px. Everything stacks in one column; proposals that do not exist yet have a dashed border.
- **Icons.** The web parts carry the roleALPHA app icon (Creme signet on a Tiefgrün tile) in the SharePoint toolbox, and `spfx/teams/` provides the colour and outline icons Microsoft uses when the package is made available in Teams. Origin and regeneration: `client/assets/brand/README.md`.
