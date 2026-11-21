# Install roleALPHA Sessions: step-by-step administrator guide

This guide walks you through a first installation in your Microsoft 365 environment. You install a prepared package with Microsoft's administration screens; no programming or command line is needed, except for the optional PowerShell alternatives.

roleALPHA Sessions is a side panel for Microsoft Teams meetings. It records the governance outcomes of a meeting as drafts in **roleALPHA**, where people decide on them. The app has no server of its own and stores nothing in SharePoint: the meeting's outcomes live in roleALPHA, one scenario per meeting. SharePoint only hosts the package. rALPH, roleALPHA's assistant, is the only AI it uses.

This guide uses English screen labels. Microsoft may change menu names. Guide date: 21 November 2026. Deployment has not yet been accepted in a real Microsoft 365 environment; complete step 8 before general release.

## Quick start

1. **roleALPHA administrator:** allow external applications for your Microsoft directory (step 1).
2. **SharePoint administrator:** upload `rolealpha-meetings.sppkg` to the app catalog, enable it for all sites and add it to Teams (steps 2–3).
3. **SharePoint or Entra administrator:** approve the package's API access requests (step 4).
4. **Teams administrator:** allow **roleALPHA Sessions** for your users (step 5).
5. **Organiser:** add the app to a Teams meeting and open it as a side panel (step 6).

## 1. Prepare roleALPHA

| Task | Who |
| --- | --- |
| Enable external applications in roleALPHA | roleALPHA administrator |
| Deploy the SharePoint package | SharePoint administrator with access to the app catalog |
| Approve Microsoft Graph and roleALPHA access | Administrator who may approve API access in Entra |
| Make the app available in Teams | Teams administrator |

1. In roleALPHA, open **Settings → AI → External applications** and turn on **External AI applications**.
2. Under **Microsoft 365 integrations**, enter your Microsoft directory (tenant) ID and the allowed addresses: your SharePoint address (for example `https://yourorganization.sharepoint.com`) and `https://teams.microsoft.com`.
3. Decide how meeting outcomes are approved. Under **Settings → Data & structure → Approval**, each module has an approval mode. Drafts of modules set to **Liberal** take effect as soon as a meeting submits them. For modules with **Consent** or **Consensus**, you can allow **a meeting to set the voters**: then the meeting's participants vote instead of the affected persons roleALPHA computes, so a long absence does not block a change.
4. **Each person** who uses the app signs in once on rolealpha.app with **Sign in with Microsoft**. Otherwise the app reports that the account is not linked.

roleALPHA Sessions needs a roleALPHA release that offers the meeting tools (`open_meeting_scenario`, `submit_meeting_scenario`, proposals from `ask_ralph`). An older release shows which tool is missing.

**Check:** External applications are on and your directory is listed.

## 2. Open the SharePoint app catalog

The **app catalog** is your organization's central location for additional SharePoint apps. 

1. Open the [Microsoft 365 admin center](https://admin.microsoft.com/) and sign in.
2. If necessary, select **Show all**, then **Admin centers → SharePoint**.
3. Open **More features**.
4. Under **Apps**, select **Open**.
5. You should see **Manage apps**. If the organization has no app catalog yet, SharePoint creates it now and shows “Creating the site for storing apps”; this happens once and takes a few minutes. If you are instead prompted to create an app catalog, have the SharePoint administrator complete that setup and reopen this screen. Do not substitute an additional site-level app catalog.

**Check:** The app management screen offers **Upload**. See [Microsoft's app catalog guide](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog).

## 3. Upload and enable the package

1. Select **Upload**, then choose `rolealpha-meetings.sppkg`.
2. Read the activation dialog. If the app already exists, confirm that you intend to update it; see “Install later updates” below.
3. Select **Enable this app and add it to all sites**. The app has to be available on every site because Teams opens it in the context of the meeting.
4. Confirm with **Enable app** or **Add**. If the dialog offers **Add to Teams**, select it; step 5 then only needs the check in the Teams admin center.
5. Close the dialog and inspect the app entry. Its technical package name may be `rolealpha-meetings-client-side-solution`.
6. The package requests API access: three Microsoft Graph permissions for the meeting chat and **roleALPHA / access_as_user**. They appear as pending requests under **SharePoint admin center → Advanced → API access**; step 4 approves them.

**Check:** The package is enabled without a deployment error. A notice about additional API permissions is not itself an installation failure; step 4 addresses those permissions.

## 4. Approve the permissions

The app reads the meeting chat and posts the result there, always as the signed-in user. It also signs in to roleALPHA with the user's Microsoft account.

1. Open the **SharePoint admin center → Advanced → API access**.
2. Approve the package's pending requests:

| Requested permission | Purpose |
| --- | --- |
| Microsoft Graph `Chat.ReadBasic` | Read the meeting chat's name, which names the meeting in roleALPHA |
| Microsoft Graph `ChatMember.Read` | Read the participants' e-mail addresses, who vote on the outcomes |
| Microsoft Graph `ChatMessage.Send` | Post the summary into the meeting chat, only when the user sends it |
| roleALPHA `access_as_user` | Sign in to roleALPHA with the user's Microsoft account; this also creates the roleALPHA app in your directory |

Alternatively, when a permission is missing, the app shows a **Grant consent** link that opens Microsoft's consent dialog for the same permissions; an administrator confirms it and closes the tab.

**Tenant-wide effect:** SharePoint grants approved permissions to Microsoft's shared app *SharePoint Online Web Client Extensibility* (app ID `08e18876-6177-487e-b8b5-cf950c1e598c`, the same in every tenant). Every SharePoint Framework solution in the tenant can then request tokens with these permissions for the signed-in user. Restrict who can add solutions to the app catalog and review approved API access regularly.

Without the admin center and the link, an Entra administrator can create the grant with Microsoft Graph PowerShell. Replace the values with the resource and scope; for Microsoft Graph the resource is `https://graph.microsoft.com`:

   ```powershell
   $resource = 'api://4bd22250-d811-4905-97a4-cb2bf69f98fa'   # roleALPHA
   $scope = 'access_as_user'
   Connect-MgGraph -Scopes 'Application.Read.All', 'DelegatedPermissionGrant.ReadWrite.All'
   $spfx = Get-MgServicePrincipal -Filter "appId eq '08e18876-6177-487e-b8b5-cf950c1e598c'"
   $api = Get-MgServicePrincipal -Filter "servicePrincipalNames/any(n:n eq '$resource')"
   $grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($spfx.Id)' and resourceId eq '$($api.Id)' and consentType eq 'AllPrincipals'"
   if ($grant) {
     $scopes = (@($grant.Scope -split ' ') + $scope | Where-Object { $_ } | Select-Object -Unique) -join ' '
     Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope $scopes
   } else {
     New-MgOauth2PermissionGrant -ClientId $spfx.Id -ConsentType AllPrincipals -ResourceId $api.Id -Scope $scope
   }
   ```


**Check:** The four requests are approved.

## 5. Make the app available in Teams

1. Return to **Manage apps** in the SharePoint app catalog.
2. Select the roleALPHA package.
3. Select **Add to Teams**, called **Sync to Teams** in older interfaces.
4. Wait for confirmation. The package carries its own Teams app, **roleALPHA Sessions**, which SharePoint deploys to the Teams store; do not upload the `.sppkg` directly to Teams. The app works as a meeting tab and side panel; the personal app explains how to use it.
5. Open the [Teams admin center](https://admin.teams.microsoft.com/).
6. Under **Teams apps → Manage apps**, find **roleALPHA Sessions**. Versions before 0.1.13 also created a second app, **roleALPHA Meeting**; block or delete it there.
7. Check that the app is allowed and available to your test users. Depending on your organization's management model, assignment may be configured directly on the app or through app permission policies. Have the Teams administrator configure this where necessary.
8. Reopen Teams with a test account and search for **roleALPHA** in its apps area.

**Check:** The app is visible to the test user. Publication and policy propagation may take time. See [Microsoft's Teams deployment guide](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/deployment-spfx-teams-solutions).

## 6. Use it in a meeting

1. In Teams, open a meeting invitation you organise (calendar → the meeting → **Edit**), select **+** next to the tabs, and add **roleALPHA Sessions**. Save the tab; there is nothing to configure.
2. During the meeting, open **roleALPHA Sessions** from the meeting's toolbar. It opens as a side panel.
3. Choose the circle or team the meeting is for. roleALPHA starts one scenario for the meeting.
4. For each agenda item of the Loop meeting notes, the note-taker writes down what was agreed and selects **Proposals from rALPH**. Check and edit the proposals, then adopt them as drafts.
5. At the end, select **Submit for decision**. Liberal drafts take effect at once; the rest goes to a vote in roleALPHA. Send the summary to the meeting chat.

A recurring meeting shares one chat. Each occurrence's outcomes form their own scenario: after a submission, the next occurrence starts a new one.

## 7. Optional: another roleALPHA installation

The package talks to roleALPHA's installation at `https://rolealpha.app`. To use another one, for example a QA system, a SharePoint administrator sets the tenant property `rolealphaSessions` with PnP PowerShell:

```powershell
Connect-PnPOnline -Url https://yourorganization-admin.sharepoint.com -Interactive
Set-PnPStorageEntity -Key rolealphaSessions -Scope Tenant `
  -Value '{"url":"https://qa.rolealpha.app/api/mcp","resource":"api://…","scope":"access_as_user","appUrl":"https://qa.rolealpha.app"}'
```

That installation's Entra app needs its own grant (step 4, PowerShell with its resource). Remove the property with `Remove-PnPStorageEntity -Key rolealphaSessions -Scope Tenant` to return to the default.

## Optional: the Copilot agent

People with a **Microsoft 365 Copilot** licence can also use the **roleALPHA Sessions agent** in Copilot and in the meeting chat. It reads the meeting's Loop notes and recap, asks rALPH for proposals and creates the drafts you confirm in the same scenario.

1. **Register roleALPHA for Copilot once.** Create an OAuth authentication configuration for roleALPHA's MCP address `https://rolealpha.app/api/mcp` in Microsoft's Enterprise token store, for example in the Teams Developer Portal under **Tools → OAuth client registration** or with Microsoft 365 Agents Toolkit. roleALPHA supports dynamic client registration; with a static client, register Copilot's redirect `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect` in roleALPHA. Note the configuration's **reference ID**.
2. **Build the package** with that ID: `npm run agent:package -- --reference-id <ID>` (roleALPHA supplies it on request). It writes `rolealpha-sessions-agent.zip`.
3. **Upload it** in the Teams admin center (**Teams apps → Manage apps → Upload new app**) or the Microsoft 365 admin center (**Integrated apps**) and allow it for the people with a Copilot licence.
4. **Use it:** in Copilot, choose **roleALPHA Sessions** and ask, for example, “Turn the outcomes of this meeting into roleALPHA drafts”. The first time, sign in to roleALPHA when Copilot asks.

## 8. Verify using ordinary user accounts

- [ ] In a test meeting, the side panel opens and names the meeting.
- [ ] The circle search shows circles of your organisation; choosing one starts the scenario.
- [ ] rALPH proposes drafts for a note; an adopted proposal appears in roleALPHA in the meeting's scenario.
- [ ] A person without a roleALPHA account gets a clear message instead of data.
- [ ] Submitting publishes drafts of liberal modules and puts the rest to a vote; the participants are notified in roleALPHA.
- [ ] The summary arrives in the meeting chat.
- [ ] German, English, French and Spanish work; the light, dark and high-contrast Teams themes are readable.

## Troubleshooting

| Observation | Next step |
| --- | --- |
| The panel says to open it in a Teams meeting | It was opened outside a meeting chat. Add the tab to the meeting (step 6). |
| “Microsoft Graph refused access” | The Graph permissions of step 4 are missing or not yet effective. |
| roleALPHA access not enabled or revoked | Step 1: external applications and your directory in roleALPHA; the person's access under connected applications. |
| Account not linked | The person signs in once on rolealpha.app with **Sign in with Microsoft**. |
| “roleALPHA does not offer … yet” | Your roleALPHA release lacks the meeting tools. Ask roleALPHA for an update. |
| The tenant property is reported as invalid | Correct or remove `rolealphaSessions` (step 7). |
| A participant cannot vote | They have no roleALPHA account under that e-mail address; the panel lists them after submitting. |

## Upgrading from version 1

Version 2 replaces the SharePoint workspace of version 1 (meetings, templates, tensions, outcome review, AI connections). Its lists `rA Meetings Browser Index`, `rA Meetings Browser Data` and `rA Meetings Connections` stay untouched; version 2 neither reads nor deletes them. Keep or archive them under your retention rules. Pages with the old web part now show the new app. The Graph permissions `Calendars.Read`, `OnlineMeetings.ReadWrite` and `OnlineMeetingTranscript.Read.All` of version 1 are no longer needed; remove them under **API access** if no other solution uses them.

## Install later updates

1. Obtain a new package with an increased version number and a description of changes.
2. Upload it to the same app catalog and confirm replacement.
3. Review and approve any new API permission requests.
4. Repeat **Add to Teams** and check the result.
5. Repeat the relevant checks from step 8.
