import type { MessageId } from '../../shared/i18n';
import { assert, AppError } from '../../shared/model';
import { provisionWorkspace, SharePointRestStore, spJson, workspaceAccess } from '../../shared/storage/sharepoint-rest';
import type { BrowserHost } from './host';
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
export async function inspectWorkspace(host: BrowserHost) {
  const web = await spJson<{ Title: string; Url: string }>(host.sharepoint, '/web?$select=Title,Url');
  assert(
    workspaceUrl(web.Url, host.webUrl).toLowerCase() === host.webUrl.toLowerCase(),
    'error.onboarding.enterValidSharepointSite',
  );
  const access = await workspaceAccess(host.sharepoint);
  assert(access.provision && access.write, 'error.onboarding.siteOwnerPermissionsRequired', 403);
  return { title: web.Title, url: host.webUrl };
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
