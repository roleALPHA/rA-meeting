# Install roleALPHA Meetings: step-by-step administrator guide

This guide walks you through a first installation in your Microsoft 365 environment. You do not need programming experience or command-line tools. You install a prepared package using Microsoft's administration screens.

roleALPHA Meetings runs within SharePoint and Microsoft Teams. Meetings, templates, tensions or agenda items, and outcomes are stored in your organization's SharePoint site. You do not need an application server, a database installation, or Power Automate.

After package deployment, an onboarding wizard helps select the site and create storage and starter templates. With sufficient permissions, it can also create a new site. The wizard appears when opening an unconfigured workspace. You can reopen it through **Connections** using the setup wizard action.

Complete steps 1–6 to use the app in SharePoint. Steps 7–9 add calendar access and Teams. Step 10 covers optional AI and roleALPHA Governance integration.

This guide uses English screen labels. Microsoft may change menu names. Guide date: 16 September 2026. Deployment has not yet been accepted in a real Microsoft 365 environment; complete step 11 before general release.

## 1. Prepare the package and administrator access

1. Save the supplied **rolealpha-meetings.sppkg** file on your computer. The `.sppkg` extension identifies a SharePoint installation package. Do not unzip it. In the project, the build places it in `dist/`.
2. Have your Microsoft 365 administrator account ready. Use your organization's work account.
3. Identify who has permission for each task below. Different people may perform different steps.

| Task | Required access |
| --- | --- |
| Deploy the SharePoint package | SharePoint administration and access to the organization-wide app catalog |
| Provision storage in a site | Site owner with permission to manage lists |
| Approve Microsoft Graph access | Global administration for Microsoft API approval |
| Make apps available to Teams users | Teams administration |

4. Arrange an initial test with a small group. Test accounts need SharePoint access and, for the Teams steps, Teams access.
5. Record who will manage site permissions and data retention.

**Check:** You have the package and an authorized person for each task. If an administration screen is unavailable, ask the responsible administrator to perform that step.

## 2. Choose a SharePoint workspace site

A **workspace** is the SharePoint site where a group shares its meeting data.

1. Open SharePoint from the Microsoft 365 app menu.
2. Open the intended group's site. For an existing Teams team, you can open its SharePoint site from the channel's files area using **Open in SharePoint**.
3. To create a new workspace, you can later choose the new-site option in onboarding. First open the app on an existing site using step 5, or through the personal Teams app enabled in step 8. Uploading the package alone does not launch the app. Alternatively, have an administrator create a site through **SharePoint admin center → Active sites → Create**, especially if your organization requires specific templates or sensitivity labels.
4. Copy the site's address, for example `https://yourorganization.sharepoint.com/sites/MeetingTeam`. Use the site address without a page or file suffix such as `/SitePages/Home.aspx`.
5. On the site, open **Settings (gear icon) → Site permissions**. Review owners, members, visitors, and any additional sharing.
6. Grant editing access only to people who should jointly edit meetings, templates, and content. The app requires permission to add, edit, and delete items for editing. Readers can view content.

Everyone with access to stored content can also read transcripts and historical versions. A Teams meeting's attendee list does not limit this access. Use a separate site with restricted permissions for confidential groups.

**Check:** You have recorded the site address and deliberately chosen who can access it.

## 3. Open the SharePoint app catalog

The **app catalog** is your organization's central location for additional SharePoint apps. It is different from the workspace site in step 2.

1. Open the [Microsoft 365 admin center](https://admin.microsoft.com/) and sign in.
2. If necessary, select **Show all**, then **Admin centers → SharePoint**.
3. Open **More features**.
4. Under **Apps**, select **Open**.
5. You should see **Manage apps**. If prompted to create an app catalog first, have the SharePoint administrator complete that setup and reopen this screen. Do not substitute an additional site-level app catalog.

**Check:** The app management screen offers **Upload**. See [Microsoft's app catalog guide](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog).

## 4. Upload and enable the package

1. Select **Upload**, then choose `rolealpha-meetings.sppkg`.
2. Read the activation dialog. If the app already exists, confirm that you intend to update it; see “Install later updates” below.
3. For this deployment, select **Enable this app and add it to all sites**. This makes the component available across the organization. It does not automatically create meeting data or share workspace data with other sites. If your organization does not allow this availability, arrange a restricted deployment with your SharePoint administrator before proceeding.
4. Confirm with **Enable app** or **Add**. You can skip adding to Teams here; step 8 covers it.
5. Close the dialog and inspect the app entry. Its technical package name may be `rolealpha-meetings-client-side-solution`.

**Check:** The package is enabled without a deployment error. A notice about additional API permissions is not itself an installation failure; step 7 addresses those permissions.

## 5. Display the app on a SharePoint page

A **web part** is a component placed on a SharePoint page.

1. Open the workspace site from step 2.
2. Select **New → Page**, create a blank page, and name it **Meetings**, for example. You can instead edit an existing suitable page.
3. In the page content, select the **plus sign** to add a web part.
4. Search for and select **roleALPHA Meetings**. Use the plural “Meetings” for the workspace overview. The similarly named “roleALPHA Meeting” component is intended for an individual meeting tab.
5. Open the web part's properties using its edit icon.
6. Leave **SharePoint site URL** empty to use the current site. To use another site, enter its full address. It must use the same SharePoint host, such as `yourorganization.sharepoint.com`.
7. Leave **Meeting** set to **All meetings**.
8. Select **Publish** or **Republish**.

**Check:** roleALPHA Meetings appears on the published page. A request to set up the workspace is expected on first use.

## 6. Complete onboarding

1. Open the app as a site owner. An unconfigured workspace displays the welcome screen. For an existing workspace, open **Connections** and choose the setup wizard action.
2. Choose the option to use an existing SharePoint site. Enter the address from step 2 and select the site-check action. The app checks reachability and permissions before creating content.
3. If you need a new workspace instead, choose the option to create a SharePoint site. Enter a name and a short address name containing letters, numbers, and hyphens. Review the displayed address and create the site. If creation remains in progress, check its status again shortly. This creates a standalone team site, not a Microsoft Team. Your signed-in account becomes the owner. Organizational policies still apply. Ask your SharePoint administrator to investigate if creation fails.
4. On the access/settings review screen, open the site-permissions link in a new tab. Review people and groups. Make any required changes in SharePoint, then return to the wizard. The wizard does not change access rights itself.
5. At the top of the app, choose the language for new starter templates and, if preferred, **Agenda** instead of **Tensions**. Existing templates are not translated or overwritten. Display preferences are personal to your browser.
6. Keep the landing-page option selected if you want the wizard to prepare a dedicated app page. It does not replace the site's home page or overwrite an unrelated existing page with the same filename. You can disable this option for a Teams-only workspace.
7. Confirm that you have reviewed the authorized audience, then start workspace setup.
8. Wait for the workspace-ready confirmation. The app creates storage and starter templates, then performs a write/read test. If an error occurs, previously created components remain. Go back, resolve the cause, and run setup again. Do not begin troubleshooting by deleting the created lists.
9. If you requested a landing page, open the review-and-publish link. Review the page in SharePoint and select **Publish**. Share the link with the group only afterwards. Any organizational page approval requirement still applies.
10. Optionally test calendar access. Complete step 7 if permissions are missing. Missing optional connections do not prevent basic meeting use. “Configured” does not replace actual AI or roleALPHA function tests.
11. Open the workspace. Under **Templates**, verify that three starter templates exist. Create a test meeting from **Meetings** and reload the page. The meeting must remain available.

**Check:** Open **Settings → Site contents** on the selected site and find:

| Name | Purpose |
| --- | --- |
| `rA Meetings Browser Index` | Index of stored records |
| `rA Meetings Browser Data` | Content and historical versions |
| `rA-Meetings.aspx` in the pages library, if requested | Prepared landing page containing the app |

Do not rename the storage areas. After switching sites, the current app URL includes the workspace selection. Prefer the published landing page for a lasting entry point. In Teams, also enter the selected site address in the tab configuration.

## 7. Optional: approve calendar and Teams transcript access

Skip this step if you initially want to create meetings manually and import transcript files.

**Microsoft Graph** is the interface used to retrieve Microsoft calendar events and transcripts. Approval enables access on behalf of signed-in users; it does not automatically grant access to other people's calendars or meetings.

1. Reopen the **SharePoint admin center**.
2. Select **Advanced → API access**.
3. Have the administrator authorized to approve Microsoft API access review these package requests:

| Requested permission | Purpose |
| --- | --- |
| `Calendars.Read` | Display and link the user's own calendar events |
| `OnlineMeetings.ReadWrite` | Locate the linked Teams meeting and, if enabled under **Connections → Teams recording and transcription**, set its transcription and recording option |
| `OnlineMeetingTranscript.Read.All` | Read available transcripts accessible to the user |

4. Approve required requests individually. Already approved entries do not require approval again.
5. Reopen the app with an ordinary test account. Link an rA meeting to one of that account's nonrecurring Teams events.
6. After a test meeting with an actual transcript, try retrieving it under the transcript/analysis tab. Teams licensing, meeting policy, and user access must permit transcription and retrieval.

**Check:** Calendar events appear and an accessible transcript can be retrieved. “Configured” alone does not confirm access. For recurring events, check that the import preview lists only the parts recorded during the linked occurrence; otherwise import that occurrence's VTT or TXT file manually.

These approvals apply to the shared SharePoint authentication component, not exclusively to this web part. See [Microsoft's API approval guidance](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/use-aadhttpclient).

**Tenant-wide effect:** SharePoint grants approved permissions to the shared *SharePoint Online Client Extensibility Web Application Principal*. Every SharePoint Framework solution in the tenant can then request tokens with these permissions for the signed-in user, including `OnlineMeetingTranscript.Read.All` and any approved AI or roleALPHA scopes. Before approving:

- Restrict who can add solutions to the app catalog and review which solutions are deployed.
- Approve only the permissions of features you use.
- Review approved API access regularly and remove entries that are no longer needed.

## 8. Optional: make the apps available in Teams

1. Return to **Manage apps** in the SharePoint app catalog.
2. Select the roleALPHA package.
3. Select **Add to Teams**, called **Sync to Teams** in older interfaces.
4. Wait for confirmation. Microsoft generates the Teams app entries; do not upload the `.sppkg` directly to Teams.
5. Open the [Teams admin center](https://admin.teams.microsoft.com/).
6. Under **Teams apps → Manage apps**, find **roleALPHA Meetings** and **roleALPHA Meeting**.
7. Check that both apps are allowed and available to your test users. Depending on your organization's management model, assignment may be configured directly on the app or through app permission policies. Have the Teams administrator configure this where necessary.
8. Reopen Teams with a test account and search for **roleALPHA** in its apps area.

**Check:** The approved apps are visible to the test user. Publication and policy propagation may take time. See [Microsoft's Teams deployment guide](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/deployment-spfx-teams-solutions).

## 9. Optional: open a workspace or meeting in Teams

### Workspace in a channel

1. Open the intended Teams channel.
2. Use **+ / Add a tab** to add **roleALPHA Meetings**.
3. In **SharePoint site URL**, enter the workspace address from step 2. Use the same workspace to see the meetings already created.
4. Leave **Meeting** set to **All meetings** and save.
5. Open the new tab.

**Check:** The test meeting from step 6 appears. An empty overview may indicate a different selected site.

### Individual meeting in a Teams event

1. First create the desired meeting in roleALPHA Meetings.
2. Open a scheduled Teams event that you may edit. If newly created, save and reopen it first.
3. Add **roleALPHA Meeting** using the event's add-app or add-tab action. Availability depends on the meeting type and Teams policies.
4. Enter the same **SharePoint site URL**.
5. In **Meeting**, select the previously created meeting by name. If the list is empty, wait for the workspace to load and reopen the configuration panel.
6. Save and test the tab with another authorized person.

**Check:** The tab opens the selected meeting. Linking a calendar event does not automatically add this tab. Attending the event does not grant SharePoint permissions.

## 10. Optional: enable AI and roleALPHA Governance

The meeting app works without these connections. Both are disabled in the default package.

1. Decide whether to use AI assistance, transfers to roleALPHA Governance, or both.
   For AI, choose one provider: **Microsoft 365 Copilot** (default; requires Work IQ and Copilot usage billing), **Claude via Microsoft Foundry** (requires a Foundry resource, a Claude deployment, and the Foundry User role for app users), or an organization-operated **OpenAI-compatible** endpoint. The [technical guide](technical-deployment.md#ai-providers) lists prerequisites and limits.
2. Ask the person responsible for your roleALPHA deployment for a configured installation package. End users do not enter server addresses or keys. Connections cannot currently be activated solely from the app's **Connections** page.
3. Confirm which services will receive data and where they process it. If content must never pass through roleALPHA-operated infrastructure, a centrally operated roleALPHA service is not an appropriate endpoint; the organization-controlled deployment must meet that requirement.
4. Integration operators must enable Microsoft-account authentication and direct browser access. See the [technical guide](technical-deployment.md). A service accepting only a secret API key is not compatible with this deployment mode.
5. Install the configured package as described under “Install later updates” and approve any additional API requests.
6. Inspect **Connections**, then test each enabled function using test data. Generate an AI suggestion, review it, and only then transfer an approved outcome to roleALPHA.
7. Check in roleALPHA that the expected draft exists.
8. For governance questions, also have the roleALPHA search integration and appropriate read access configured. Draft creation alone is insufficient.
9. Open the governance assistant from the navigation or within a meeting. Ask about a known role or rule and start the governance check.
10. Compare the answer and expandable original sources with roleALPHA's existing governance. Also test a question without relevant sources; the app must not present an unsupported answer as established governance.

Governance assistance uses only the approved roleALPHA read tool and does not change roles or rules. The question goes to roleALPHA; the question and retrieved sources go to the approved AI service. Meeting content and transcripts are not automatically included. The meeting app does not persist these questions and answers. Connected services have their own logging and retention settings.

**Check:** Each actual test action succeeds. Governance integration is specifically for roleALPHA; MCP is its transport protocol, not a choice of arbitrary providers.

If an export response is uncertain, first check whether the draft already exists in roleALPHA. Do not retry without checking. Following an interrupted transfer, the app may allow manual reconciliation after five minutes.

## 11. Verify using ordinary user accounts

Complete these checks before sharing the app with the full group:

- [ ] An editor can create a meeting and reopen it after reloading.
- [ ] A second authorized user sees the same meeting in the same workspace.
- [ ] A read-only user can view content but cannot edit it.
- [ ] A user without site access cannot access meeting data.
- [ ] An editor can change templates.
- [ ] German, English, French, Spanish, and Tensions/Agenda terminology work.
- [ ] Every enabled integration has actually been tested: Teams tab, calendar, transcript retrieval, AI, and roleALPHA transfer.
- [ ] Responsibility for permissions, retention, and recovery is documented.

**Check:** Share the page link or Teams tab with the intended group only after successful verification.

## Troubleshooting

| Observation | Next step |
| --- | --- |
| Apps or API access is missing | Check the account and administrator role; complete app catalog setup in step 3 if needed. |
| Web part is missing | Check app activation and site availability in the catalog, then reopen the page. |
| Workspace setup is unavailable | Check the site URL and sign in as an owner who can manage lists. |
| Access denied | Check access to the site and both storage areas. Teams membership alone may be insufficient. |
| Meetings appear in SharePoint but not Teams | Compare the configured site addresses. |
| App is missing in Teams | Review synchronization, app approval, and user assignment in step 8. |
| Calendar or transcript is unavailable | Review API approval, account, meeting type, and transcript availability in step 7. |
| Concurrent editing causes a conflict | Save unsaved text elsewhere, load the latest version, and reapply the change. |
| AI or roleALPHA fails despite being configured | Give the integration administrator the time and error message; have authentication and browser access checked. Do not send secret keys in messages. |

## Ongoing operation and retention

The app processes data while it is in use. Calendar retrieval, transcript imports, AI calls, and transfers are explicitly started. There is no automatic background processing after the tab closes. Power Automate is neither required nor installed.

Set retention and recovery rules for **both** storage areas from step 6. Historical content files are kept and are not cleaned up automatically. Deleting a record in the interface therefore does not permanently erase every historical copy. Test restoration of the index and library together.

A save that fails after uploading its content file moves that file to the SharePoint recycle bin. Files left by interrupted saves (for example a closed tab or lost connection) can be removed by a site owner under **Connections → Clean up storage**. Only files that no entry references, that belong to an existing entry, and that are older than 24 hours are offered; earlier versions, files of deleted entries, and files from app versions before this feature are never included. Files are moved to the recycle bin and can be restored there.

Meeting transcripts are stored as separate entries. Meetings saved by earlier versions keep their transcript inline until they are next saved.

Data from an older prototype is not automatically migrated. Plan any transfer with the responsible people, accounting for shared read access in the new workspace.

## Install later updates

1. Obtain a new package with an increased version number and a description of changes.
2. Confirm that your backup procedure can restore the existing storage areas.
3. Upload the package to the same app catalog and confirm replacement.
4. Review and approve any new API permission requests.
5. Repeat **Add to Teams / Sync to Teams** and check the result.
6. Reopen the app and repeat relevant checks from step 11.

Do not delete or recreate the workspace for a normal package update. Package creation and integration configuration are described in the [technical guide](technical-deployment.md); end users do not perform those development tasks.
