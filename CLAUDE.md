# rA Meetings

SPFx app for SharePoint and Teams. All logic runs in the browser; data lives in the customer's SharePoint site.

## Architecture constraints (mandatory)

- **No external infrastructure.** The app must run entirely inside the customer's Microsoft 365 tenant: SPFx in the browser, storage in SharePoint, Microsoft Graph with the signed-in user's delegated permissions.
- **No own backend.** Do not add servers, proxies, databases, Power Automate flows, Azure Functions, or background services — not even as an optional fallback.
- **Only two outbound interfaces are allowed:**
  1. The MCP call to the configured roleALPHA endpoint.
  2. The configured AI assistants: Microsoft 365 Copilot (default), Claude via Microsoft Foundry, or an OpenAI-compatible endpoint.
- **Delegated Entra ID tokens only.** No API keys, client secrets, or other credentials in browser code, configuration, or storage.
- Check every new dependency, endpoint, or data flow against these rules. If a service cannot be called directly from the browser (for example because of CORS or token audience), do not work around it with a proxy; document it as unsupported and raise it instead.

## Development

- Node.js 24 for the root toolchain; SPFx packaging uses the project-local Node.js 22 (`npm run spfx:install`).
- `npm run check` (TypeScript), `npm test` (node test runner with a simulated SharePoint), `npm run dev` (local preview at http://127.0.0.1:4310), `npm run build` (produces `dist/rolealpha-meetings.sppkg`).
- After adding or upgrading a runtime dependency, run the full `npm run build`. The SPFx toolchain compiles the generated browser bundle again with its own TypeScript settings, which can fail even when `npm test` and `npm run check` pass. `spfx/tsconfig.json` targets ES2017 for this reason.
- Repository documentation is maintained in English.
