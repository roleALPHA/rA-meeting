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
    "url": "https://ai.organization.example/v1/chat/completions",
    "resource": "api://ORGANIZATION-AI-APPLICATION-ID",
    "permissionResource": "Organization AI",
    "scope": "access_as_user",
    "model": "organization-model"
  },
  "roleAlpha": {
    "url": "https://rolealpha.organization.example/mcp",
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

**AI contract:** Chat Completions with `model`, `messages`, and `response_format: {"type":"json_object"}`; the response is read from `choices[0].message.content`. The integration supports transcript analysis, proposal forming, and objection integration. Model responses are validated. Objections, consent, and decisions remain human responsibilities.

**MCP write contract:** Streamable HTTP, using `create_meeting` or an explicitly mapped `create_*` tool with `tenant_uuid`, `name`, `custom_id`, and `data`. The app checks advertised tools and the shared schema before writing. The expected confirmation is `{"draft_created":true,"draftId":"…","entityUuid":"…","status":"draft"}`. An uncertain response locks the outcome; writes are not retried automatically. Closing a tab during export can leave a `sending` status. After five minutes, the interface permits documented manual reconciliation.

## Build the package

```sh
npm ci
npm run spfx:install
npm test
npm run build
```

Root tools use Node.js 24. SPFx 1.23.2 builds with the separate project-local Node.js 22 installation. These are development tools, not a server runtime required for installation. React is pinned to SPFx-supported version 17.0.1. Increase the version in `spfx/package.json` before distributing an update; the build derives package and solution versions from it.

Output: `dist/rolealpha-meetings.sppkg`. `includeClientSideAssets` packages the code for app catalog hosting. A build check excludes server modules and test/demo code from the browser package.

`npm run dev` starts a static browser demonstration with simulated SharePoint. It displays a preview notice and keeps changes in memory only until reload.

The project uses the [rA Meetings Internal Collaboration License 1.0](../LICENSE.md), effective 16 September 2026. The package script also copies the license to `dist/LICENSE.md`; include it with the installation package. Preserve applicable third-party notices when distributing artifacts.

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

## Onboarding wizard

The SPFx host supports explicitly selected sites on the same HTTPS host as the current site. SPHttpClient handles authentication and request digests. Foreign origins and invalid site paths are rejected. Setup runs only while the browser is open.

New sites use `SPSiteManager/create` with `STS#3`, a team site without a Microsoft 365 group. Status is checked before creation. Setup does not create Teams, group memberships, or API consents. User permissions and organizational policies constrain what it can do. Prepare sensitivity labels and special site templates through Microsoft administration, then choose an existing site in the wizard. Reference: [Microsoft site creation REST API](https://learn.microsoft.com/en-us/sharepoint/dev/apis/site-creation-rest).

The optional landing page is prepared as a draft containing the custom SPFx web part through the SharePoint SitePages interface. The Graph sitePage API does not support arbitrary custom web parts. Existing pages are not overwritten. A `setup/landing` record stores the created page ID for retries. An interruption between page creation and that record can leave an empty draft, which is not automatically deleted. An administrator reviews and publishes the page. Implementation reference: [PnPjs client-side pages](https://github.com/pnp/pnpjs/blob/version-4/packages/sp/clientside-pages/types.ts).

The storage test creates a record without business content, reads it, and removes its index entry. As with other deletions, the small content file remains subject to retention. Retrying setup reuses existing lists and templates. The selected language applies to starter templates not yet created; terminology remains a personal preference.

Tenant acceptance must cover new and existing sites, blocked site creation, changed permissions, SPFx component availability at the target site, page drafts and publication, interruption/recovery, and actual Teams tab configuration.
