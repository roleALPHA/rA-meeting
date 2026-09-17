# Technical deployment guide

This guide is for package builders and operators of optional integrations. To install a prepared package, follow the [step-by-step administrator guide](customer-deployment.md).

## AI and roleALPHA without a proxy

Both integrations are optional. Services must support **direct browser requests with CORS** and **delegated Microsoft Entra authentication**. Services accepting only secret API keys or service-account bearer tokens need changes before they are compatible. The app provides no hidden proxy and does not ask end users for keys.

Use services controlled by your organization. Verify ownership, region, and processing arrangements; a URL alone cannot establish data sovereignty. A central roleALPHA SaaS endpoint would not satisfy a requirement to keep data off roleALPHA-operated infrastructure. Use the appropriate organization-controlled roleALPHA deployment for MCP.

Governance integration is specifically for roleALPHA. MCP is its protocol, not an arbitrary provider setting. One roleALPHA endpoint handles meeting records and all enabled entity types. Per-entity endpoints and generic MCP configuration are rejected. Administrators must verify the service's identity; an address alone does not prove it.

The package builder configures nonsecret endpoints in `spfx/customer.config.json`. The default package has **no AI or MCP targets**. Example configuration, containing no real credentials:

```json
{
  "language": "en",
  "ai": {
    "provider": "copilot",
    "resource": "WORK-IQ-APPLICATION-ID-URI",
    "permissionResource": "WORK-IQ-APPLICATION-DISPLAY-NAME"
  },
  "roleAlpha": {
    "url": "https://rolealpha.organization.example/api/mcp",
    "resource": "api://ORGANIZATION-ROLEALPHA-APPLICATION-ID",
    "permissionResource": "roleALPHA Governance",
    "scope": "access_as_user",
    "tenant": "11111111-1111-4111-8111-111111111111",
    "meeting": false,
    "entities": {
      "risk": {
        "tool": "create_risk",
        "label": "Risk"
      }
    }
  }
}
```

`resource` is the service's Entra audience. `permissionResource` is its application display name in Entra; `scope` is its approved delegated scope. The build includes these permissions in the package's Microsoft 365 approval requests. Approve them under API access after deployment. Each service must validate audience, tenant, scope, and user permissions itself. SPFx approvals apply to the shared SharePoint client principal, not exclusively to this web part.

Services must allow CORS from the actual SharePoint origins. For MCP, allow `Authorization`, `Content-Type`, `Mcp-Session-Id`, `MCP-Protocol-Version`, and the required HTTP methods, and expose `Mcp-Session-Id`. Check permissions separately for guest and cross-tenant sign-ins. Missing approval, CORS, or network access produces an error; there is no fallback through the manufacturer's infrastructure.

**MCP write contract:** Streamable HTTP, using `create_meeting` or an explicitly mapped `create_*` tool with `tenant_uuid`, `name`, `custom_id`, and `data`. The app checks advertised tools and the shared schema before writing. The expected confirmation is `{"draft_created":true,"draftId":"…","entityUuid":"…","status":"draft"}`. An uncertain response locks the outcome; writes are not retried automatically. Closing a tab during export can leave a `sending` status. After five minutes, the interface permits documented manual reconciliation.

## Security model and trust boundary

SharePoint permissions are the only enforced access boundary. The app runs entirely in the browser with the signed-in user's permissions; there is no server component that could enforce rules independently.

- Readers of the workspace site can read all stored content, including transcripts and historical versions.
- Editors can change stored content directly through SharePoint, bypassing the app. Rules the app applies (allowed outcome types per step, approval before transfer, immutable transferred outcomes, evidence references) guide users but are not security controls.
- The meeting view runs a consistency check and shows a notice when stored data deviates from these rules, for example after direct editing. This check can detect inconsistencies; it cannot prevent or reliably detect deliberate manipulation.
- Enforcing such rules against editors would require a server-side component, which is deliberately not part of this product. Use separately permissioned sites and SharePoint auditing where this matters.

Approved API permissions are granted to the shared SharePoint Online Client Extensibility Web Application Principal and are therefore available to every SharePoint Framework solution in the tenant (see the [administrator guide](customer-deployment.md)). The build prints the permissions a package requests.

## AI providers

`ai.provider` selects one AI service. All providers receive the same tasks (transcript analysis, proposal forming, objection integration, governance answers), and every answer passes the same validation: unknown steps, outcome types, transcript segments, or governance source IDs are rejected, and nothing is approved automatically. The interface shows which provider produced a suggestion.

### Microsoft 365 Copilot (default)

Uses the Microsoft 365 Copilot Chat API (Work IQ) with the delegated permission `WorkIQAgent.Ask`.

```json
"ai": {
  "provider": "copilot",
  "url": "https://workiq.svc.cloud.microsoft/rest",
  "resource": "WORK-IQ-APPLICATION-ID-URI",
  "permissionResource": "WORK-IQ-APPLICATION-DISPLAY-NAME",
  "scope": "WorkIQAgent.Ask",
  "maxInputChars": 200000
}
```

`url` and `scope` default to the values shown. Prerequisites: Work IQ enabled for the tenant, Copilot usage billing (Copilot Credits), and approval of the requested permission.

Behavior and limits to review before enabling:

- **No enforced JSON.** The app sends the output schema with the instructions, parses the answer, asks once for a corrected answer, and otherwise discards it.
- **Tenant grounding.** Web grounding is switched off for every request. Copilot can still draw on other tenant content the user can access (for example mail or files). For governance questions, answers citing such content are discarded. For analysis and proposals, only outcomes linked to real transcript segments are accepted, but wording can still be influenced.
- **Sensitivity labels.** If Copilot labels its answer, the interface shows the label before a suggestion is accepted, and transcript analysis records it in the meeting history.
- **Conversation history.** Each task creates a new Copilot conversation in the user's context. Check your Copilot retention settings.
- **Size.** Data is sent as additional context in parts. `maxInputChars` limits the total request size; set it to the limits verified for your tenant.

### Claude via Microsoft Foundry

Uses a Claude deployment in your Microsoft Foundry resource with Microsoft Entra ID authentication. No API key is used.

```json
"ai": {
  "provider": "claude-foundry",
  "url": "https://YOUR-RESOURCE.services.ai.azure.com/anthropic",
  "resource": "https://ai.azure.com",
  "permissionResource": "FOUNDRY-APPLICATION-DISPLAY-NAME",
  "scope": "user_impersonation",
  "model": "claude-opus-5",
  "fallbackModel": null
}
```

`model` is the Foundry **deployment name** (default `claude-opus-5`). Prerequisites: Entra ID authentication enabled on the Foundry resource and the **Foundry User** role (or Cognitive Services User) for all app users, ideally through a group. Prefer the **Hosted on Azure** deployment option so prompts and completions remain within Azure.

Requests use the Messages API with adaptive thinking and structured output (`output_config.format` with a JSON schema; beta on Foundry). If the model declines a request, nothing is applied. Set `fallbackModel` to another deployment name to retry declined requests there.

### OpenAI-compatible endpoint

For an organization-operated Chat Completions endpoint (for example Azure OpenAI with Entra ID). Configurations without `provider` are read as this provider.

```json
"ai": {
  "provider": "openai-compatible",
  "url": "https://ai.organization.example/v1/chat/completions",
  "resource": "api://ORGANIZATION-AI-APPLICATION-ID",
  "permissionResource": "Organization AI",
  "scope": "access_as_user",
  "model": "organization-model"
}
```

Contract: `model`, `messages`, and `response_format: {"type":"json_object"}`; the response is read from `choices[0].message.content`.

### Tenant verification before go-live

The adapters are tested against simulated responses only. Before enabling a provider, verify in the target tenant from a SharePoint page:

- [ ] The service accepts browser requests from the SharePoint origin (CORS).
- [ ] The SPFx token provider issues a token for the configured `resource`, and the permission appears under **API access** with the configured `permissionResource` and `scope`.
- [ ] Copilot: Work IQ is enabled, a test conversation works with web grounding disabled, and a long transcript stays within the request limits.
- [ ] Claude: the deployment name, structured output, and the RBAC assignment work for an ordinary user.
- [ ] Each enabled function works with test data: transcript analysis, proposal forming, and a governance question.
- [ ] Teams recording setting: as organizer, link an Outlook-created Teams event and check in the Teams meeting options that transcription and, if selected, automatic recording are set; check that transcription starts as expected under your policies.

If a service cannot be called directly from the browser, it is not supported. Do not add a proxy; the app must run without infrastructure outside the Microsoft 365 tenant apart from the configured AI service and roleALPHA.

## Build the package

```sh
npm ci
npm run spfx:install
npm test
npm run build
```

Root tools use Node.js 24. SPFx 1.23.2 builds with the separate project-local Node.js 22 installation. These are development tools, not a server runtime required for installation. React is pinned to SPFx-supported version 17.0.1. Increase the version in `spfx/package.json` before distributing an update; the build derives package and solution versions from it.

Output: `dist/rolealpha-meetings.sppkg`. `includeClientSideAssets` packages the code, fonts and icons for app catalog hosting. A build check excludes server modules and test/demo code from the browser package.

`npm run dev` starts a static browser demonstration with simulated SharePoint. It displays a preview notice and keeps changes in memory only until reload.

The project uses the [rA Meetings Internal Collaboration License 1.0](../LICENSE.md), effective 16 September 2026. The package script also copies the license to `dist/LICENSE.md`; include it with the installation package. Preserve applicable third-party notices when distributing artifacts.

## Visual design and themes

The interface follows roleALPHA's corporate design as defined in rA-app: the five brand colours Ink, Paper, Bottle, Amber and Rust, IBM Plex Sans and Mono with Instrument Serif for page titles, and the roleALPHA icon. `client/brand.css` holds the brand values and nothing else; `client/style.css` derives every colour, surface and border from them. `tests/brand.test.ts` and an ESLint rule reject raw colour values elsewhere.

- **Fonts ship in the package.** The eight `.woff2` files (about 170 KB) are emitted as separate files into ClientSideAssets and served from the tenant; no font service is contacted. Browsers ignore `@font-face` inside the web part's shadow root, so the app registers these rules once on the page in a `style[data-ra-fonts]` element. It contains `@font-face` rules only, with `rA`-prefixed family names that do not collide with the page's own fonts. All other styles stay inside the shadow root.
- **Themes.** In Teams the app follows the client theme — default, dark and high contrast — and switches when the user changes it. On SharePoint pages it stays light. Windows high-contrast mode (forced colours) is respected in every host.
- **Icons.** The web parts carry the roleALPHA icon in the SharePoint toolbox, and `spfx/teams/` provides the colour and outline icons Microsoft uses when the package is made available in Teams.

## Governance questions: roleALPHA read contract

In addition to an AI target, set the optional `roleAlpha.governance` property to `{ "searchTool": "search_governance" }`. The name is an example: configure the actual verified search tool from the roleALPHA installation. Without this configuration, governance assistance remains disabled. Compatibility with a production roleALPHA read tool has not yet been verified.

The adapter expects an explicitly read-only search operation at the same roleALPHA endpoint. There is no additional MCP address or model-selected tool. The configured name must start with `search_`. Its `tools/list` declaration must expose `readOnlyHint: true`, `destructiveHint: false`, and parameters `tenant_uuid` (string), `query` (string), and `limit` (number or integer). Additional required parameters are unsupported. Annotations do not replace service-side authorization: roleALPHA must enforce the signed-in user's read access and tenant boundaries, and the operation must actually be read-only.

The call supplies the configured roleALPHA tenant ID, the user's question, and `limit: 12`. Return `structuredContent` or JSON in an MCP text block:

```json
{
  "sources": [
    {
      "id": "role-finance",
      "title": "Finance role",
      "content": "Original governance text relevant to the question ..."
    }
  ]
}
```

Source IDs must be unique. The adapter accepts at most twelve sources with up to 12,000 content characters each. Sources must contain existing governance, not model summaries represented as original text. If roleALPHA uses another response format, adapt the integration to its actual contract; arbitrary JSON is not silently accepted as a source.

AI receives only the question and retrieved sources. Its answer contains statements with source IDs and limitations. Unknown source IDs are rejected; empty search results trigger no AI call. Validating source IDs cannot establish whether a statement correctly follows from its source. The interface therefore shows original text and explains the limited search scope. This feature does not change governance or write meeting records. SharePoint readers may ask questions; roleALPHA enforces its own permissions independently.

Acceptance testing must cover the real search contract, user and tenant isolation, unanswerable questions, source comparison, delegated sign-in, and browser CORS. Questions and answers stay in the open interface; no new SharePoint storage or vector database is created. Configure AI and roleALPHA service logging separately according to organizational requirements.

## Attaching roleALPHA drafts: read contract

Set the optional `roleAlpha.drafts` property to `{ "searchTool": "search_my_drafts", "appUrl": "https://rolealpha.organization.example" }`. The tool name is an example and must start with `search_`; `appUrl` is the roleALPHA web application. Without this configuration, editors cannot attach drafts to tensions. Compatibility with a production roleALPHA tool has not yet been verified.

The tool runs at the same roleALPHA MCP endpoint with the signed-in user's delegated token. Its `tools/list` declaration must expose `readOnlyHint: true`, `destructiveHint: false`, and parameters `query` (string) and `limit` (number or integer). If it declares `tenant_uuid` (string), the configured tenant is passed; a tool that takes the tenant from the token may omit it. Additional required parameters are unsupported. The app never passes a user ID: **roleALPHA must return only the signed-in user's own drafts** and enforce tenant and permission checks itself.

The call supplies the search text (possibly empty) and `limit: 20`. Return `structuredContent` or JSON in an MCP text block:

```json
{
  "drafts": [
    {
      "draftId": "0b6f…",
      "title": "Finance role change",
      "entityType": "role",
      "status": "draft",
      "url": "https://rolealpha.organization.example/drafts?draft=0b6f…"
    }
  ]
}
```

At most 20 drafts; unknown fields are rejected. A result of exactly `{ "error": "…" }` is reported as a failed search, as is an MCP result with `isError`. Every `url` must be HTTPS on the origin of `appUrl`, otherwise the whole result is rejected; the same check applies when a tension is saved. The URL must open the draft directly for a signed-in user. The tension stores only `draftId`, `title`, `entityType`, and `url`; draft content stays in roleALPHA, and the link opens in a new tab without passing tokens.

Acceptance testing must cover: only own drafts are returned, tenant isolation, the deeplink opening the draft, delegated sign-in, and browser CORS from the SharePoint origins.

## Onboarding wizard

The SPFx host supports explicitly selected sites on the same HTTPS host as the current site. SPHttpClient handles authentication and request digests. Foreign origins and invalid site paths are rejected. Setup runs only while the browser is open.

New sites use `SPSiteManager/create` with `STS#3`, a team site without a Microsoft 365 group. Status is checked before creation. Setup does not create Teams, group memberships, or API consents. User permissions and organizational policies constrain what it can do. Prepare sensitivity labels and special site templates through Microsoft administration, then choose an existing site in the wizard. Reference: [Microsoft site creation REST API](https://learn.microsoft.com/en-us/sharepoint/dev/apis/site-creation-rest).

The optional landing page is prepared as a draft containing the custom SPFx web part through the SharePoint SitePages interface. The Graph sitePage API does not support arbitrary custom web parts. Existing pages are not overwritten. A `setup/landing` record stores the created page ID for retries. An interruption between page creation and that record can leave an empty draft, which is not automatically deleted. An administrator reviews and publishes the page. Implementation reference: [PnPjs client-side pages](https://github.com/pnp/pnpjs/blob/version-4/packages/sp/clientside-pages/types.ts).

The storage test creates a record without business content, reads it, and removes its index entry. As with other deletions, the small content file remains subject to retention. Retrying setup reuses existing lists and templates. The selected language applies to starter templates not yet created; terminology remains a personal preference.

Tenant acceptance must cover new and existing sites, blocked site creation, changed permissions, SPFx component availability at the target site, page drafts and publication, interruption/recovery, and actual Teams tab configuration.
