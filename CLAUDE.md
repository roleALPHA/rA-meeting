# rA Meetings (roleALPHA Sessions)

A Teams meeting side panel (SPFx) and a Microsoft 365 Copilot agent that bring governance outcomes of meetings into roleALPHA. All app logic runs in the browser; meeting outcomes live in roleALPHA as drafts in one scenario per meeting. SharePoint only hosts the package.

## Architecture constraints (mandatory)

- **No own backend.** Do not add servers, proxies, databases, bots, Power Automate flows, Azure Functions, or background services — not even as an optional fallback. The side panel runs in the browser (SPFx); the Copilot agent is a declarative agent that calls roleALPHA's MCP endpoint itself.
- **No data store of our own.** Meeting outcomes are roleALPHA drafts in the meeting's scenario. The app stores nothing in SharePoint; browser storage holds only per-user conveniences (language, chosen organisation).
- **Only two outbound interfaces are allowed:**
  1. Microsoft Graph with the signed-in user's delegated permissions (`client/browser/consent.ts`), and the host page's own SharePoint REST for the tenant property `rolealphaSessions`.
  2. roleALPHA: its MCP address and, on the same origin, the token endpoint that exchanges the delegated Entra token (`client/browser/rolealpha.ts`). rALPH, reached through `ask_ralph`, is the only AI. No other roleALPHA address and no other AI service.
- **Delegated tokens only.** No API keys, client secrets, or other credentials in browser code, configuration, or storage. The Copilot agent authenticates through a per-tenant OAuth configuration in Microsoft's token store, never with a secret in the package.
- **Reading is safe, writing is confirmed.** Tools used for reading must be annotated read-only; drafts are created only for proposals the user confirmed, and only roleALPHA approves them.
- Check every new dependency, endpoint, or data flow against these rules. If a service cannot be called directly from the browser (for example because of CORS or token audience), do not work around it with a proxy; document it as unsupported and raise it instead. The contract with roleALPHA's tools is `shared/meeting.ts`; a change there needs the matching change in rA-app.

## Development

- Node.js 24 for the root toolchain; SPFx packaging uses the project-local Node.js 22 (`npm run spfx:install`).
- `npm run check` (TypeScript, ESLint, Prettier), `npm test` (node test runner with simulated roleALPHA and Microsoft Graph, `tests/helpers/fake-services.ts`), `npm run dev` (local preview at http://127.0.0.1:4310; `?width=320` shows the side panel width, `?meeting=0` the app outside a meeting), `npm run build` (produces `dist/rolealpha-meetings.sppkg`), `npm run agent:package -- --reference-id <id>` (the Copilot agent package).
- After adding or upgrading a runtime dependency, run the full `npm run build`. The SPFx toolchain compiles the generated browser bundle again with its own TypeScript settings, which can fail even when `npm test` and `npm run check` pass. `spfx/tsconfig.json` targets ES2017 for this reason.
- User-facing texts and error messages use message IDs (`t('area.name')`, `assert(cond, 'error.area.name', status)`). Add every new ID to `shared/locales/de.ts` and to `en.ts`, `fr.ts` and `es.ts`; the compiler rejects missing translations and `tests/i18n.test.ts` rejects unused IDs. Content from roleALPHA and rALPH is not translated.
- New dependencies must pass the licence policy: run `npm run licenses:write` and commit `THIRD-PARTY-LICENSES.md`.
- Commit with `git commit -s`; CI rejects pull requests with commits that lack a DCO sign-off. Workflows follow `docs/ci-conventions.md` (actions pinned to commit SHAs, minimal permissions).
- Visual design follows roleALPHA's corporate design (rA-app). Brand values live only in `client/brand.css`; `client/style.css` derives tokens from them. No raw colours in `style.css` or client code (`tests/brand.test.ts`, ESLint). Status colours (`--status-*`) mean state only, category tiles use data colours, selection uses `--selection`, dashed borders mean "not there yet". Every screen must work in the light, dark and contrast themes (`npm run dev`, `?theme=dark|contrast`).
- Repository documentation is maintained in English.
