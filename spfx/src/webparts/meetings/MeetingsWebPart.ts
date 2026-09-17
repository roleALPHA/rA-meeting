import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField,
  PropertyPaneDropdown,
} from '@microsoft/sp-property-pane';
import { mount, settings } from '../../generated/app';
interface Properties {
  workspaceUrl?: string;
  meetingId?: string;
}
export default class MeetingsWebPart extends BaseClientSideWebPart<Properties> {
  private meetings: { id: string; title: string }[] = [];
  private disposeApp?: () => void;
  public render(): void {
    this.disposeApp?.();
    const current = new URL(this.context.pageContext.web.absoluteUrl);
    let selected: URL;
    try {
      selected = new URL(
        new URLSearchParams(window.location.search).get('raWorkspace') || this.properties.workspaceUrl || current.href,
      );
    } catch {
      this.domElement.textContent = 'Select a valid SharePoint site URL.';
      return;
    }
    if (
      selected.protocol !== 'https:' ||
      selected.origin !== current.origin ||
      selected.username ||
      selected.password ||
      selected.search ||
      selected.hash
    ) {
      this.domElement.textContent = 'Select a SharePoint workspace in this tenant.';
      return;
    }
    const webUrl = selected.href.replace(/\/$/, '');
    const sharepointAt = async (target: string, path: string, init: RequestInit = {}): Promise<Response> => {
      const site = new URL(target);
      if (
        site.protocol !== 'https:' ||
        site.origin !== current.origin ||
        site.username ||
        site.password ||
        site.search ||
        site.hash ||
        /[%\\']/.test(site.pathname)
      )
        throw new Error('Invalid SharePoint site');
      if (
        !/^\/(web(?:[/?(]|$)|sitepages\/pages(?:[(/]|$)|SPSiteManager\/(?:create$|status\?))/.test(path) ||
        path.includes('\\') ||
        path.includes('..')
      )
        throw new Error('Invalid SharePoint path');
      const headers: Record<string, string> = { Accept: 'application/json;odata=minimalmetadata', 'odata-version': '' };
      new Headers(init.headers).forEach((value, key) => {
        headers[key] = value;
      });
      const response = await this.context.spHttpClient.fetch(
        site.href.replace(/\/$/, '') + '/_api' + path,
        SPHttpClient.configurations.v1,
        { method: init.method || 'GET', headers, body: init.body as string | undefined },
      );
      const text = await response.text();
      return new Response(response.status === 204 ? null : text, {
        status: response.status,
        headers: response.headers,
      });
    };
    const aad = this.context.pageContext.aadInfo;
    if (!aad) {
      this.domElement.textContent = 'Microsoft 365 sign-in is required.';
      return;
    }
    this.disposeApp = mount(this.domElement, {
      tenantId: aad.tenantId.toString(),
      userId: aad.userId.toString(),
      userName: this.context.pageContext.user.displayName,
      webUrl,
      isTeams: !!this.context.sdks.microsoftTeams,
      initialMeeting: this.properties.meetingId,
      settings,
      onMeetingsChanged: (meetings: { id: string; title: string }[]): void => {
        this.meetings = meetings;
        this.context.propertyPane.refresh();
      },
      token: async (resource: string): Promise<string> => {
        const provider = await this.context.aadTokenProviderFactory.getTokenProvider();
        return provider.getToken(resource);
      },
      sharepointAt,
      sharepoint: (path: string, init?: RequestInit): Promise<Response> => sharepointAt(webUrl, path, init),
    });
  }
  protected onDispose(): void {
    this.disposeApp?.();
  }
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: 'Microsoft 365 · roleALPHA Meetings' },
          groups: [
            {
              groupName: 'Workspace / Arbeitsbereich',
              groupFields: [
                PropertyPaneTextField('workspaceUrl', {
                  label: 'SharePoint site URL (optional; defaults to this site)',
                }),
                PropertyPaneDropdown('meetingId', {
                  label: 'Meeting',
                  options: [
                    { key: '', text: 'All meetings / Alle Meetings' },
                    ...this.meetings.map(m => ({ key: m.id, text: m.title })),
                  ],
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
