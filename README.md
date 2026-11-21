# roleALPHA Sessions

**Governance outcomes from Teams meetings, straight into roleALPHA.**

roleALPHA Sessions (formerly rA Meetings) is a **roleALPHA** product for Microsoft Teams. Teams already brings the meeting itself: the invitation, the Loop meeting notes with their agenda, the chat and the transcript. Agenda items are the tensions. roleALPHA Sessions adds the step that is missing: what a meeting decides about roles, circles, policies and accountabilities becomes a **draft in roleALPHA**, reviewed by people and decided there.

## How it works

1. **Invitation.** Add the roleALPHA Sessions tab to a Teams meeting.
2. **Circle.** In the meeting's side panel, pick the circle or team the meeting is for. roleALPHA starts one **scenario** for the meeting.
3. **Outcomes.** For each agenda item, the note-taker writes down what was agreed. **rALPH**, roleALPHA's assistant with its governance skills, turns the note into proposals: new roles, changed accountabilities, policies, relationships. People check and edit every proposal; the adopted ones become drafts in the meeting's scenario.
4. **Submit.** Drafts in areas roleALPHA approves liberally take effect at once. The others go to a vote in roleALPHA; where an area allows it, the meeting's participants vote, so a long absence of an affected person does not block a change. A summary goes to the meeting chat.
5. **Decision** happens in roleALPHA, with its consent or consensus rules.

People with a **Microsoft 365 Copilot** licence can also use the **roleALPHA Sessions agent** in Copilot: it reads the meeting's Loop notes and recap, asks rALPH for proposals and creates the confirmed drafts in the same scenario.

## Operation and data

| | |
| --- | --- |
| Runs | In the user's browser (SharePoint Framework web part in Teams); the Copilot agent in Microsoft 365 Copilot |
| Server of its own | None |
| Stored where | In roleALPHA: the meeting's scenario and its drafts. Nothing is stored in SharePoint. |
| Talks to | Microsoft Graph (meeting chat: topic, members, posting the summary) and roleALPHA (MCP endpoint and its token endpoint). rALPH is the only AI; no other AI service is used. |
| Sign-in | The signed-in user's delegated Microsoft Entra ID token, exchanged for a short-lived roleALPHA token. No keys or secrets. |
| Needs | A roleALPHA account; administrator consent for the Graph permissions `Chat.ReadBasic`, `ChatMember.Read`, `ChatMessage.Send` and for roleALPHA's `access_as_user`. The agent needs a Copilot licence. |

Administrators find the installation in [docs/customer-deployment.md](docs/customer-deployment.md) and the technical details, including the contract with roleALPHA, in [docs/technical-deployment.md](docs/technical-deployment.md).

## Upgrading from 1.x

Version 2 replaces the SharePoint workspace (meetings, templates, tensions, outcome review) with the meeting side panel. Data of a 1.x workspace stays in its SharePoint lists untouched; version 2 does not read it. The optional AI services of 1.x (Copilot, Claude in Foundry, OpenAI-compatible) are gone: rALPH answers in roleALPHA.

## Implementation status

The package builds and is covered by automated tests against simulated roleALPHA and Microsoft Graph. Version 2 needs these roleALPHA tools, which a roleALPHA release has to provide: `open_meeting_scenario`, `list_my_meeting_scenarios`, `submit_meeting_scenario`, `ask_ralph` with `proposals`, and `scenario_id` on the draft tools ([docs/technical-deployment.md](docs/technical-deployment.md#rolealpha-contract)). Deployment in a real Microsoft 365 environment has not been accepted yet.

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

The package is written to `dist/rolealpha-meetings.sppkg`. It is the same for every customer. The Copilot agent package is built per tenant: `npm run agent:package -- --reference-id <id>` writes `dist/rolealpha-sessions-agent.zip`.

```sh
npm run dev
```

The preview runs at [http://127.0.0.1:4310](http://127.0.0.1:4310). It simulates Teams, Microsoft Graph and roleALPHA in the browser; nothing is sent anywhere. `?width=320` shows the side panel's width, `?theme=dark|contrast` the Teams themes, `?meeting=0` the app outside a meeting.

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
