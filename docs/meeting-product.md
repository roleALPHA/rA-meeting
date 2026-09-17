# Product design: tension → meeting → reviewed outcomes

## Organizational control and simple operation

The production app is an SPFx extension for SharePoint and Teams. Logic runs in the browser; data lives in a SharePoint index list and document library in the organization's tenant. The meeting app has no application server, SQL database, or background runtime. To keep processing within the organization's control, optional AI and roleALPHA services must be operated accordingly and support direct delegated browser access. No manufacturer proxy is included.

A workspace is shared. SharePoint permissions govern reading and collaborative editing, including access to transcripts and historical content. Use separately permissioned sites for confidential circles. All editors can facilitate meetings and update agendas and templates. Initial setup requires appropriate SharePoint administration or site-owner permissions.

The interface supports German, English, French, and Spanish. Dates, times, and manual AI requests follow the chosen language. User input, stored templates, and historical original text are not automatically translated. Starter-template language is selected during setup. Language and terminology are personal browser preferences; meeting content is not stored in localStorage.

Users can display the backlog as “Tensions” or “Agenda.” Titles, prompts, and actions adapt while record IDs and relationships remain unchanged.

## Standard workflow without Power Automate

1. Link an existing Outlook/Teams event to an rA meeting.
2. Authorized editors contribute tensions before or during the event.
3. Work through the agenda and record outcomes.
4. Explicitly import or retrieve a transcript and start analysis.
5. Review proposed outcomes, including sources, wording, type, and responsibility.
6. Explicitly transfer approved outcomes to the configured roleALPHA endpoint.
7. Complete any additional draft approval required in roleALPHA.

Power Automate is a possible future optional extension for reminders and background work. It is not included or required and must not replace user confirmation. The browser app does nothing after its tab closes; analysis and exports are explicitly initiated.

## Tension backlog

roleALPHA Governance has no tension backlog. The meeting app maintains it as `tension` records in the organization's SharePoint index, with JSON content in its document library.

Each tension has a title, description, circle/team, creator, version, and status. Visibility follows workspace permissions. Tensions exist independently of meetings. An agenda item can reference one through `tensionId`, and multiple meetings can address the same tension. Outcomes can be traced through their agenda item to the tension. Completing an agenda item or exporting an outcome does not automatically resolve the tension. An authorized editor explicitly confirms completion.

Editors can contribute before and during meetings. Sharing and access management take place in SharePoint, not through manually entered participant IDs.

## Calendar

Outlook is the source of truth for event time and joining links. rA Meetings maintains the corresponding meeting content. The browser app supports:

- Finding existing events from yesterday through the next 30 days, with a maximum of 200 results and a visible truncation notice.
- Linking an individual event or a specific recurring-event occurrence.
- Manually refreshing the link, displaying cancellation, and opening Teams/Outlook links.

It does not send invitations, change events, or synchronize calendars automatically. Calendar linking does not install a Teams tab. Add that tab separately and configure its meeting selection. Joining a call does not itself create or open an rA meeting. Entries can be prepared before the event. Future automatic Teams-context detection or attendee import would require separate authorization design.

Each link stores the event's `iCalUId`, which is identical for all attendees and unique per occurrence. A claim record keyed by it prevents two meetings from linking the same event, even when different attendees link it from their own calendars. Other editors can refresh a link from the copy of the event in their own calendar.

Recurring occurrences share one online meeting. Transcript retrieval therefore reads the event's current times and selects transcript parts that started between 30 minutes before the start and 30 minutes after the end. The user sees the selected parts with their times and confirms the import; parts of other occurrences are excluded. If no part matches, import the VTT or TXT file manually. Attribution relies on transcript timestamps and should be checked during acceptance testing.

## Outcomes and MCP

Outcome types are independent of meeting type: task, project, role, policy, metric, checklist, OKR, risk, IT system, and note. Templates define allowed types for each step. One tension can lead to several outcomes.

Two export modes are supported:

1. **Meeting record:** `create_meeting` receives approved outcomes and sources.
2. **Individual entity:** an explicitly configured outcome type maps to an advertised compatible `create_*` tool at the roleALPHA MCP endpoint.

Configure the optional connection under `roleAlpha` in `spfx/customer.config.json`. All entity types use the same endpoint; `entities` maps each type to its approved tool name. See the [technical deployment guide](technical-deployment.md).

OKR and IT-system mappings also require explicit configuration. Tool names are not guessed. Before writing, the app verifies that the tool is available and supports the common creation contract: `tenant_uuid`, `name`, `custom_id`, and `data`. Incompatible schemas are rejected. Integration operators must additionally verify the entity-specific business schema; this check is not complete JSON Schema validation of every field.

The browser displays a preview. On confirmation, it rechecks the meeting revision and exact export plan. AI cannot choose tools or endpoints. Outcome and remote draft IDs are recorded; an uncertain response blocks retries until documented reconciliation.

Description, responsibility, sources, and approval metadata are sent under `data.raMeeting`. `outcome.data` can contain further business attributes. Schema-driven forms for specific risk, OKR, or IT-system fields are not yet available. The destination entity's name is populated. Updating or deleting existing entities is not implemented; this would require target mapping, change comparison, and conflict handling.

These integration details belong in deployment configuration rather than the end-user meeting flow.

## Without roleALPHA integration

The connection is optional. Backlog, templates, calendar links with Microsoft approval, meeting flow, transcript import, optional AI analysis, and outcome review remain available without MCP settings. Approved outcomes remain in the meeting app. Export is never mandatory, and starting the app or analyzing a transcript does not trigger MCP requests. Export actions are hidden when no destination is configured.

## Proposal forming and objection integration

During a meeting, facilitators can request a proposal based on an open agenda item's needs and context, or refine an existing proposal using stated objections. Clarifying questions, reasoning, and integration ideas appear as an unapproved preview. Facilitators may edit or accept wording and save it as a draft. AI does not determine objection validity or consent. Saved wording is not an approved outcome; review and optional MCP export remain separate steps.

## Governance questions

With both AI and an approved roleALPHA read tool, users can ask questions about existing governance. Answers show original sources for comparison. The assistant does not modify governance or persist its questions and answers in meeting storage. Service-side access control and logging remain the responsibility of the connected systems. See the [read contract and acceptance criteria](technical-deployment.md#governance-questions-rolealpha-read-contract).
