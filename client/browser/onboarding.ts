import type { MessageId } from '../../shared/i18n';
import { assert, AppError } from '../../shared/model';
import {
  provisionWorkspace,
  recordListTitle,
  SharePointRestStore,
  spJson,
  workspaceAccess,
} from '../../shared/storage/sharepoint-rest';
import { graph, type BrowserHost } from './host';
import { calendarEntries } from '../../shared/calendar';
import type { Language } from '../../shared/i18n';
export const meetingsWebPartId = 'd7391660-3f52-4e4b-b95f-7a71e4c5092e';
export function workspaceUrl(value: string, current: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'error.onboarding.enterValidSharepointSite');
  }
  assert(
    url.protocol === 'https:' &&
      url.origin === new URL(current).origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !/%|\\|\.{2}|'/.test(url.pathname) &&
      !url.pathname.toLowerCase().includes('/_') &&
      !/\.aspx\/?$/i.test(url.pathname),
    'error.onboarding.selectSiteSameSharepoint',
  );
  return url.href.replace(/\/$/, '');
}
export function hostForWorkspace(host: BrowserHost, url: string): BrowserHost {
  const normalized = workspaceUrl(url, host.webUrl);
  assert(normalized === host.webUrl || host.sharepointAt, 'error.onboarding.hostDoesSupportSwitching');
  return {
    ...host,
    webUrl: normalized,
    initialMeeting: normalized === host.webUrl ? host.initialMeeting : undefined,
    sharepoint: (path, init) =>
      host.sharepointAt ? host.sharepointAt(normalized, path, init) : host.sharepoint(path, init),
  };
}
const headers = { 'Content-Type': 'application/json;odata=nometadata' };
/** The address must be the site itself, not a library or page below it. */
async function siteWeb(host: BrowserHost) {
  const web = await spJson<{ Title: string; Url: string }>(host.sharepoint, '/web?$select=Title,Url');
  assert(
    workspaceUrl(web.Url, host.webUrl).toLowerCase() === host.webUrl.toLowerCase(),
    'error.onboarding.enterValidSharepointSite',
  );
  return web;
}
export async function inspectWorkspace(host: BrowserHost) {
  const web = await siteWeb(host);
  const access = await workspaceAccess(host.sharepoint);
  assert(access.provision && access.write, 'error.onboarding.siteOwnerPermissionsRequired', 403);
  return { title: web.Title, url: host.webUrl };
}
/** True when the site already holds the workspace storage. */
export async function workspaceReady(host: BrowserHost) {
  try {
    await new SharePointRestStore(host.tenantId, host.webUrl, host.sharepoint).initialize();
    return true;
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 503)) return false;
    throw e;
  }
}
export type SiteChoice = { url: string; title: string; workspace: boolean };
type SearchResult = {
  PrimaryQueryResult?: {
    RelevantResults?: { Table?: { Rows?: { Cells: { Key: string; Value: string | null }[] }[] } };
  };
};
async function search(host: BrowserHost, query: string, properties: string) {
  const params = new URLSearchParams({
    querytext: `'${query}'`,
    selectproperties: `'${properties}'`,
    rowlimit: '200',
    trimduplicates: 'false',
  });
  const result = await spJson<SearchResult>(host.sharepoint, `/search/query?${params}`);
  return (result.PrimaryQueryResult?.RelevantResults?.Table?.Rows ?? []).map(row =>
    Object.fromEntries(row.Cells.map(cell => [cell.Key, cell.Value ?? ''])),
  );
}
/**
 * Sites the user can see, found with SharePoint search under the user's own permissions; sites that already hold a
 * workspace come first. Search lags behind by a few minutes, so a new workspace may be missing; the address can
 * always be entered by hand.
 */
export async function listSites(host: BrowserHost): Promise<SiteChoice[]> {
  const [sites, lists] = await Promise.all([
    search(host, 'contentclass:STS_Site', 'Title,Path'),
    search(host, `contentclass:STS_List_GenericList Title:"${recordListTitle}"`, 'Title,SPWebUrl,Path'),
  ]);
  const found = new Map<string, SiteChoice>();
  const add = (url: string, title: string, workspace: boolean) => {
    let normalized: string;
    try {
      normalized = workspaceUrl(url, host.webUrl);
    } catch {
      return;
    }
    const key = normalized.toLowerCase();
    const known = found.get(key);
    found.set(key, {
      url: normalized,
      title: known?.title || title || normalized,
      workspace: workspace || !!known?.workspace,
    });
  };
  for (const site of sites) add(site.Path, site.Title, false);
  // List results usually leave SPWebUrl empty; the site is the list's path without /Lists/<name>/<view>.aspx.
  for (const list of lists)
    if (list.Title === recordListTitle)
      add(list.SPWebUrl || list.Path.replace(/\/Lists\/[^/]+\/[^/]*$/i, ''), '', true);
  return [...found.values()].sort(
    (a, b) => Number(b.workspace) - Number(a.workspace) || a.title.localeCompare(b.title),
  );
}
/**
 * Checks the site the wizard selects. A site that already holds a workspace opens for everyone who can read it;
 * setting one up, or running setup again, needs the rights inspectWorkspace checks.
 */
export async function selectWorkspace(host: BrowserHost) {
  await siteWeb(host);
  const ready = await workspaceReady(host);
  const access = await workspaceAccess(host.sharepoint);
  const canSetUp = access.provision && access.write;
  assert(ready || canSetUp, 'error.onboarding.siteOwnerPermissionsRequired', 403);
  return { ready, canSetUp };
}
/**
 * The wizard's calendar test. SharePoint names the user the app stores and links for; Graph answers for whoever the
 * token belongs to. In a browser signed in to several accounts the two can differ, so the test compares them and
 * then makes the request the meeting view makes.
 */
export async function checkCalendar(host: BrowserHost) {
  const me = (await (await graph(host, '/me?$select=id,userPrincipalName')).json()) as {
    id?: string;
    userPrincipalName?: string;
  };
  assert(me.id?.toLowerCase() === host.userId.toLowerCase(), 'error.graph.otherAccount', 409, {
    account: me.userPrincipalName ?? '?',
    user: host.userName,
  });
  await calendarEntries(host.userId, (path, init) => graph(host, path, init));
}
async function siteManager(host: BrowserHost, path: string, init?: RequestInit) {
  assert(host.sharepointAt, 'error.onboarding.hostDoesSupportSite');
  return spJson<{ SiteStatus: number; SiteUrl?: string }>((p, i) => host.sharepointAt!(host.webUrl, p, i), path, init);
}
export async function newSiteStatus(host: BrowserHost, url: string) {
  const normalized = workspaceUrl(url, host.webUrl);
  return siteManager(host, `/SPSiteManager/status?url='${encodeURIComponent(normalized)}'`);
}
export async function createWorkspaceSite(
  host: BrowserHost,
  input: { url: string; title: string; language: Language },
) {
  const url = workspaceUrl(input.url, host.webUrl);
  assert(
    /^\/(sites|teams)\/[a-z0-9][a-z0-9-]{1,62}$/i.test(new URL(url).pathname),
    'error.onboarding.useShortNameLetters',
  );
  assert(input.title.trim().length > 0 && input.title.length <= 100, 'error.onboarding.enterSiteName');
  const status = await newSiteStatus(host, url);
  assert(status.SiteStatus === 0, 'error.onboarding.siteExistsBeingCreated', 409);
  return siteManager(host, '/SPSiteManager/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      request: {
        Title: input.title.trim(),
        Url: url,
        Lcid: { de: 1031, en: 1033, fr: 1036, es: 3082 }[input.language],
        WebTemplate: 'STS#3',
        ShareByEmailEnabled: false,
        Description: 'rA Meetings',
      },
    }),
  });
}
// Page creation uses SharePoint SitePages, which supports custom SPFx controls.
// Microsoft Graph's sitePage API does not support arbitrary custom webparts.
export async function provisionLandingPage(host: BrowserHost, store: SharePointRestStore) {
  let marker: { pageId: number; url: string } | undefined;
  try {
    marker = await store.get(host.tenantId, 'setup', 'landing');
  } catch (e) {
    if (!(e instanceof AppError && e.status === 404)) throw e;
  }
  const list = await spJson<{ value: { Id: string; RootFolder: { ServerRelativeUrl: string } }[] }>(
    host.sharepoint,
    '/web/lists?$filter=BaseTemplate eq 119&$select=Id,RootFolder/ServerRelativeUrl&$expand=RootFolder',
  );
  assert(list.value.length === 1, 'error.onboarding.sharepointPagesLibraryUnavailable');
  const root = list.value[0].RootFolder.ServerRelativeUrl;
  const base = new URL(host.webUrl);
  const target = new URL(root + '/rA-Meetings.aspx', base.origin);
  assert(
    target.origin === base.origin &&
      target.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/') &&
      !/[%'\\]/.test(root),
    'error.onboarding.sharepointPagesLibraryUnavailable',
  );
  if (!marker) {
    // Never overwrite a manually created page. A resumed wizard uses its own saved page ID.
    const existing = await host.sharepoint(
      `/web/GetFileByServerRelativePath(decodedurl='${root}/rA-Meetings.aspx')?$select=Exists`,
    );
    assert(existing.status === 404, 'error.onboarding.entryPageAlreadyExists', 409);
    const page = await spJson<{ Id: number; Url: string }>(host.sharepoint, '/sitepages/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ PageLayoutType: 'Article', PromotedState: 0 }),
    });
    assert(Number.isInteger(page.Id) && page.Id > 0, 'error.onboarding.couldCreateEntryPage');
    marker = { pageId: page.Id, url: target.href };
    await store.save(host.tenantId, 'setup', 'landing', 1, marker);
  }
  assert(
    Number.isInteger(marker.pageId) && marker.pageId > 0 && marker.url === target.href,
    'error.onboarding.couldCreateEntryPage',
  );
  const path = `/sitepages/pages(${marker.pageId})`;
  const page = await spJson<{ CanvasContent1?: string; Url?: string; IsPageCheckedOutToCurrentUser?: boolean }>(
    host.sharepoint,
    path,
  );
  let controls: { controlType: number; webPartId?: string; webPartData?: { properties?: { workspaceUrl?: string } } }[];
  try {
    controls = JSON.parse(page.CanvasContent1 || '[]');
  } catch {
    throw new AppError(409, 'error.onboarding.entryPageWasChanged');
  }
  assert(Array.isArray(controls), 'error.onboarding.entryPageWasChanged', 409);
  const content = controls.filter(c => c.controlType !== 0);
  const checkPageUrl = (value?: string) => {
    assert(value, 'error.onboarding.couldCreateEntryPage');
    const actual = new URL(value, host.webUrl + '/');
    assert(actual.href === marker!.url, 'error.onboarding.couldCreateEntryPage');
    return actual.href;
  };
  if (
    content.length === 1 &&
    content[0].webPartId === meetingsWebPartId &&
    content[0].webPartData?.properties?.workspaceUrl === host.webUrl
  )
    return checkPageUrl(page.Url);
  assert(content.length === 0, 'error.onboarding.entryPageWasChanged', 409);
  if (!page.IsPageCheckedOutToCurrentUser) await spJson(host.sharepoint, path + '/checkoutpage', { method: 'POST' });
  const instanceId = crypto.randomUUID();
  const canvas = [
    {
      controlType: 3,
      id: instanceId,
      position: { zoneIndex: 1, sectionIndex: 1, controlIndex: 1, sectionFactor: 12, layoutIndex: 1 },
      webPartId: meetingsWebPartId,
      webPartData: {
        id: meetingsWebPartId,
        instanceId,
        title: 'rA Meetings',
        description: 'roleALPHA Meetings',
        dataVersion: '1.0',
        properties: { workspaceUrl: host.webUrl, meetingId: '' },
        serverProcessedContent: { htmlStrings: {}, searchablePlainTexts: {}, imageSources: {}, links: {} },
      },
    },
    { controlType: 0, pageSettingsSlice: { isDefaultDescription: true, isDefaultThumbnail: true } },
  ];
  // First save fixes the file name; second sets the display title. No homepage replacement.
  await spJson(host.sharepoint, path + '/savepage', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Title: 'rA-Meetings',
      CanvasContent1: JSON.stringify(canvas),
      LayoutWebpartsContent: '[]',
      Description: 'rA Meetings',
    }),
  });
  await spJson(host.sharepoint, path + '/savepage', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Title: 'rA Meetings',
      CanvasContent1: JSON.stringify(canvas),
      LayoutWebpartsContent: '[]',
      Description: 'rA Meetings',
    }),
  });
  const saved = await spJson<{ Url: string }>(host.sharepoint, path);
  return checkPageUrl(saved.Url);
}
export async function setupWorkspace(
  host: BrowserHost,
  language: Language,
  createPage: boolean,
  progress: (step: MessageId) => void,
) {
  await inspectWorkspace(host);
  progress('onboarding.settingUpStorage');
  await provisionWorkspace(host.sharepoint);
  const store = new SharePointRestStore(host.tenantId, host.webUrl, host.sharepoint);
  await store.initialize();
  progress('onboarding.settingUpStarterTemplates');
  await store.seed(host.tenantId, language);
  let pageUrl: string | undefined;
  if (createPage) {
    progress('onboarding.preparingEntryPage');
    pageUrl = await provisionLandingPage(host, store);
  }
  progress('onboarding.testingWritesReads');
  const id = crypto.randomUUID();
  await store.save(host.tenantId, 'setup-check', id, 1, { id });
  const check = await store.get<{ id: string }>(host.tenantId, 'setup-check', id);
  assert(check.id === id, 'error.onboarding.storageTestFailed');
  await store.delete(host.tenantId, 'setup-check', id, 1);
  return { pageUrl };
}
