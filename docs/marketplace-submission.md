# Submit roleALPHA Sessions to the Microsoft Marketplace

This guide covers the listing in AppSource and the SharePoint Store. The package is submitted as a SharePoint Framework solution; customers install it from their app catalog and add it to Teams with **Add to Teams**. Microsoft offers no Teams-Store-only listing for SharePoint Framework solutions.

Sources, checked on 3 November 2026: [Publish SharePoint Framework applications to the marketplace](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/publish-to-marketplace-overview), [Prepare your SPFx application for publishing](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/publish-to-marketplace-checklist), [Make your solutions available in Microsoft Marketplace](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/submit-to-appsource-via-partner-center) and the [Marketplace certification policies](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies), sections 100, 1140 and 1170.

## Already in the package

| Requirement | Where |
| --- | --- |
| SPFx 1.11 or later | SPFx 1.24 (`spfx/package.json`) |
| Tenant-scoped deployment for Teams (`skipFeatureDeployment: true`) | `scripts/build-browser.ts` |
| No domain isolation (`isDomainIsolated: false`, policy 1170) | `scripts/build-browser.ts` |
| Developer name, website, privacy and terms URLs | `developer` in `scripts/teams-package.ts` |
| Description names every component and dependency (1170.1, 100.4) | `description` in `scripts/teams-package.ts` |
| Name without a bare Teams or SharePoint feature word | roleALPHA Sessions (formerly roleALPHA Meetings) |
| Teams icons 32×32 (outline) and 192×192 (colour) | `spfx/teams/` |
| AI output labelled, with a way to report harmful content (1140.4.1) | `AiProvenance` and `ReportAiContent` in `client/ui.tsx` |
| Light, dark and contrast themes | `client/style.css` |
| No known vulnerabilities in runtime dependencies | `npm audit --omit=dev` in the root and in `spfx/` |

`npm audit` in `spfx/` reports moderate findings in the SPFx build toolchain (eslint, glob, minimatch, deepmerge). They are development dependencies and are not part of the package.

## Before the first submission

### 1. Partner ID and publisher verification

roleALPHA GmbH has a Partner Center account. The `mpnId` field still holds the placeholder `Undefined-1.24.0`; Microsoft does not require it, but recommends it.

1. In Partner Center, check that the account is enrolled in the **Microsoft Marketplace** program (**Settings → Account settings → Programs**). A free listing needs no tax or payout profile.
2. Copy the Partner ID (formerly MPN ID) from **Account settings → Identifiers**. Use the ID of the location that publishes the offer.
3. Replace `mpnId: 'Undefined-1.24.0'` in `scripts/build-browser.ts` with that ID. The build regenerates `spfx/config/package-solution.json` from it. Run `npm run build` and commit both files.
4. Verify the publisher of roleALPHA's Entra app (`4bd22250-d811-4905-97a4-cb2bf69f98fa`, `client/browser/rolealpha-environment.ts`): in the Entra admin center of roleALPHA's directory, **App registrations → roleALPHA → Branding & properties → Publisher verification**, enter the same Partner ID. Customers then see roleALPHA GmbH as a verified publisher when they approve the package's `access_as_user` request.

The package requests that scope for a multi-tenant app. Microsoft states that client IDs managed through Partner Center offers may be used in production only once the offer is published.

### 2. Accept the package in a real tenant

Microsoft tests exactly this. Run the acceptance in [customer-deployment.md](customer-deployment.md), step 11, and also check:

- Upload to the tenant app catalog without errors, both for all sites and for a single site.
- A non-root site collection (Microsoft reviews on a non-root modern site).
- **Add to Teams**: the personal app, a tab in a standard, a shared and a private channel, a group chat and a meeting.
- Edge, Chrome and Firefox on Windows; the app loads within 10 seconds and shows progress for longer operations.
- First launch without configuration leads into the setup wizard; no prompt appears without a user action.
- Every link (privacy, terms, support, consent) opens an existing page.

### 3. Privacy statement

`https://rolealpha.com/legal/datenschutz` must cover this app: which Microsoft Graph data it reads (calendar events, online meetings, transcripts), that data stays in the customer's SharePoint site, which AI services a workspace can connect and what is sent to them, and what the roleALPHA connection sends.

## Partner Center offer

In [Partner Center](https://partner.microsoft.com/dashboard/v2/marketplace-offers/overview), create a new offer of the type **SharePoint solution** under **Marketplace offers** and upload `dist/rolealpha-meetings.sppkg` from the release. The file name is technical and stays unchanged.

- **Name:** roleALPHA Sessions, the same on every surface (1140.1.1).
- **Summary** (at most 100 characters) and **description:** start from `description` in `scripts/teams-package.ts`. State the audience, the components, the prerequisites and every dependency: administrator consent for Microsoft Graph and for roleALPHA's `access_as_user`, Microsoft 365 Copilot licence or the organisation's own Foundry or OpenAI-compatible endpoint for AI, a roleALPHA account for governance questions and drafts.
- **AI:** describe what the AI does before customers install the app (100.1.3, 1140.4.1): it suggests wording for proposals and objections and answers governance questions from retrieved sources; people make every decision; results show their provider and a report link to support@rolealpha.com. Support must act on reports promptly.
- **Links:** privacy, terms of use, support and documentation (README and [customer-deployment.md](customer-deployment.md) or a public copy).
- **Screenshots:** with captions, without advertising, showing the real app.

### Notes for certification (policy 1170.5)

- The full set-up path from [customer-deployment.md](customer-deployment.md), quick start and steps 1–11.
- An end-to-end functional document or a demo video link (ads switched off).
- Test accounts or a configured test tenant that remain valid while the app is listed (1140.4.1) and need no action from roleALPHA before testing: a site owner and a member, a workspace with templates and meetings, a calendar event with a Teams meeting and a transcript, a connected AI service and a roleALPHA test account.
- The justification for each requested permission (1170.2):

| Permission (delegated) | Why |
| --- | --- |
| Microsoft Graph `Calendars.Read` | Links a meeting to its calendar event and reads its time, subject and attendees (`shared/calendar.ts`). |
| Microsoft Graph `OnlineMeetings.ReadWrite` | Finds the Teams meeting of an event and, if the organiser chooses, allows transcription or automatic recording (`client/browser/routes/teams.ts`). |
| Microsoft Graph `OnlineMeetingTranscript.Read.All` | Reads the transcript of a meeting the signed-in user organised, so that outcomes can be prepared from it (`client/browser/routes/meetings.ts`). Delegated: only meetings the user can already access. |
| roleALPHA `access_as_user` | Signs the user in to roleALPHA with their Microsoft identity for governance questions and drafts (`client/browser/rolealpha.ts`). No API key or secret. |

- The embedded Teams package: the `.sppkg` carries its own Teams manifest (`scripts/teams-package.ts`) so that the package installs one Teams app instead of one per web part. Its `validDomains` are the ones SharePoint generates for SPFx Teams apps; ask the review team in advance whether that is accepted.
- The name: the app was called roleALPHA Meetings up to version 0.1.17 and was renamed because the checklist rejects feature words such as "Meeting" in names.

Microsoft validates SPFx submissions within about 24 hours. The status is shown on the offer's **Product overview**; **Attention needed** with **View report** lists what to change before resubmitting. A certified offer usually appears in the Marketplace within an hour.

### Publisher attestation

Complete **Publisher Attestation** in Partner Center (policy 1140.6), under **App Compliance** in the Microsoft 365 and Copilot section; it covers the Teams part of the package.

## Updates

Every new package version goes through certification again. Keep `description`, the Partner Center listing and the permission justifications in step with the code.
