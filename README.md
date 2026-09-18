# rA Meetings

**Structure meetings. Understand governance. Prepare decisions together.**

rA Meetings is a **roleALPHA** product for Microsoft Teams and SharePoint. It supports teams from collecting topics through collaborative discussion to traceable outcomes. Configurable meeting templates support Holacracy-inspired processes and other ways of working together.

The app is installed in your organization's Microsoft 365 environment. It requires no dedicated application server or additional SQL database. An optional connection to the **roleALPHA Governance platform** supports questions about existing governance and reviewed transfers of meeting outcomes.

## Features

### Collect topics and prepare meetings

Anyone who can edit the workspace submits tensions or agenda items to an upcoming meeting. They are visible before the meeting, join its agenda when it starts, and are ordered and processed one at a time. Items the meeting does not get to stay open and can be moved to another meeting. Each meeting template decides whether its items are called “Tensions” or “Agenda items”. With a roleALPHA connection, a submitter can attach one of their own roleALPHA drafts, which opens directly from the item.

Link meetings to your own calendar events and open them as Teams tabs. Site owners can choose whether linked Teams meetings allow transcription or are recorded and transcribed automatically. Authorized participants can contribute before the discussion begins. Access follows the SharePoint workspace's permissions.

### Configure your meeting process

Tactical, Governance, and Reflection are provided as starter templates. Create and edit templates in the interface, including:

- Steps and their order.
- Timeboxes and facilitator instructions.
- Optional steps and subphases.
- Allowed outcome types.

Each meeting stores its own template snapshot. Later template changes do not alter existing meetings.

### Form proposals and integrate objections

Optional AI assistance suggests proposal wording, clarification questions, and ways to integrate objections. People review and apply suggestions. AI does not decide whether an objection is valid, an integration is sufficient, or a decision has been made.

### Ask about existing governance

The governance assistant retrieves information through an approved roleALPHA search tool and sends the question and retrieved sources to the configured AI service. Answers include source references and expandable original text. Missing sources are not presented as established governance. Search may be incomplete, and the original governance remains authoritative.

This assistant does not change governance. It requires both AI and a compatible, explicitly approved roleALPHA read integration; a draft-creation connection alone is insufficient.

### Record traceable outcomes

Retrieve transcripts from accessible Teams meetings or import VTT/TXT files. Optional AI analysis proposes outcomes linked to transcript evidence. Users review outcomes before approving or transferring them.

An optional roleALPHA connection can create drafts from approved outcomes, such as meeting records, risks, OKRs, or IT systems. It signs in with the user's Microsoft identity, which roleALPHA exchanges for its own short-lived token. Available entities depend on the configured integration. The tension backlog remains part of rA Meetings, and the app also works without the governance platform.

## Languages

The interface supports **German, English, French, and Spanish**. Users choose their language; the “Tensions” or “Agenda items” wording comes from each meeting's template. Changing language does not automatically translate user-created content. Repository documentation is maintained in English.

## Operation and data

The app is delivered as a **SharePoint Framework (SPFx)** package. Microsoft 365 serves the application files, including fonts and icons, and the app executes in the browser within Teams or SharePoint. In Teams it follows the light, dark and high-contrast themes.

| Component | Processing and storage |
| --- | --- |
| Templates, agenda, meetings, and outcomes | Your organization's SharePoint site |
| Imported transcripts | SharePoint workspace; the original recording is not downloaded by the app |
| Calendar and transcript retrieval | Direct Microsoft Graph requests with the signed-in user's permissions |
| Optional AI | Direct requests to the configured AI service: Microsoft 365 Copilot (default), Claude via Microsoft Foundry, or an OpenAI-compatible endpoint |
| Optional governance connection | Direct MCP requests to the configured roleALPHA endpoint |
| Language | Personal browser preference |

No central roleALPHA proxy, additional application runtime, or Power Automate flow is required. No automatic processing runs after the app closes. Users explicitly start analysis and transfers.

The default package contains no AI or roleALPHA endpoints. Optional services must support Microsoft Entra sign-in and direct browser access. Secret API keys must not be placed in browser configuration.

**Optional services determine additional data flows.** To keep content entirely within your organization's controlled environment, deploy AI and roleALPHA accordingly. A centrally operated service would receive content sent to it. MCP is the protocol for the roleALPHA connection; the app does not offer arbitrary MCP providers.

## Permissions and retention

A workspace is a shared SharePoint site. Readers can access its content, including transcripts and stored historical versions. Editors can collaboratively facilitate meetings and maintain templates. Use separately permissioned sites for confidential groups. A Teams event's attendee list does not replace SharePoint permissions.

The app creates two storage areas:

- `rA Meetings Browser Index`: record and version index.
- `rA Meetings Browser Data`: document library containing stored content.

SharePoint permissions are the only enforced boundary: editors can change stored content directly, bypassing the app's rules. The meeting view flags inconsistent data, but this is not tamper protection. Approved API permissions apply to all SharePoint Framework solutions in the tenant. See the [technical deployment guide](docs/technical-deployment.md#security-model-and-trust-boundary).

Concurrent updates are checked for conflicts. Earlier versions of content files are kept; site owners can move files left by interrupted saves to the recycle bin under **Connections**. Retention, deletion, and recovery must cover both storage areas.

## Installation

Microsoft 365 administrators install the package once. End users do not need development tools.

1. Deploy `rolealpha-meetings.sppkg` in the SharePoint app catalog. Each [GitHub release](https://github.com/roleALPHA/rA-meeting/releases) carries the package together with its third-party notices and an SBOM; a local build writes it to `dist/`.
2. Open the app and complete onboarding: select or create a SharePoint site, check access, and provision storage and starter templates.
3. Review and publish the optional landing page. Approve calendar access, Teams availability, and optional services as needed.
4. Verify the deployment with ordinary user accounts.

Follow the **[step-by-step administrator guide](docs/customer-deployment.md)** from initial sign-in through acceptance checks. Package builders and integration operators should also read the [technical deployment guide](docs/technical-deployment.md). The [product design notes](docs/meeting-product.md) describe behavior and boundaries.

## Implementation status

The project includes a buildable SPFx package and automated tests covering storage, permissions, meeting workflows, translations, and integration contracts.

Deployment in a real Microsoft 365 environment and compatibility with actual roleALPHA read/write interfaces still require acceptance testing. Local simulations do not replace that verification. Teams features depend on licensing, meeting types, and organizational policies. For recurring meetings, transcript parts are attributed to an occurrence by their recording time and imported after confirmation.

## Local development

Root development tools require Node.js 24. SPFx packaging additionally uses a project-local Node.js 22 installation. Neither toolchain is required to use the finished package.

```sh
npm ci
npm run spfx:install
npm run check
npm test
npm run build
```

`npm run check` runs TypeScript, ESLint and Prettier. Commits are signed off (`git commit -s`); see [CONTRIBUTING.md](CONTRIBUTING.md). CI, the licence policy and the release process are described in [docs/ci-conventions.md](docs/ci-conventions.md).

The package is written to `dist/rolealpha-meetings.sppkg`. Optional integration settings are in `spfx/customer.config.json`.

```sh
npm run dev
```

The preview runs at [http://127.0.0.1:4310](http://127.0.0.1:4310). It simulates SharePoint and keeps changes in memory only until reload. No production Microsoft, AI, or roleALPHA service is connected.

## License

rA Meetings is licensed under the **[rA Meetings Internal Collaboration License, version 1.0](LICENSE.md)**, effective **16 September 2026**. Licensor: roleALPHA GmbH, Aschergasse 34, 1130 Vienna, Austria (office@rolealpha.com).

The license permits free internal business use, including collaboration with customers, without third-party distribution of the Software:

| Use | Treatment |
| --- | --- |
| Internal commercial use and internal adaptations | Permitted without a license fee |
| Meetings and projects with invited customers and partners | Permitted within the organization's own collaboration |
| Paid consulting, facilitation, and project services using the app | Permitted; standalone software access is excluded |
| Necessary Microsoft 365 deployment and browser copies | Expressly permitted |
| IT contractors maintaining an organization's deployment | Permitted under limited terms |
| Resale, sublicensing, independent redistribution, or white-label distribution | Not permitted, including free distribution unless an exception applies |
| Standalone hosted software services for third parties | Not permitted |
| Use and sharing of an organization's own meeting outputs | Not restricted by the Software distribution prohibition |

This is a custom source-available license, not an open-source license or an unchanged PolyForm license. No Creative Commons license has been applied to the documentation. The [licensing policy](docs/licensing-policy.md) explains the design and references. Third-party licenses and repository-hosting permissions remain separate. Public repository hosting does not grant a general right to redistribute or sell the Software.
