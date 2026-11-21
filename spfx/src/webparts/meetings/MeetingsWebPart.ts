import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { type IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { mount, teamsTheme } from '../../generated/app';
import { fonts } from '../../generated/fonts';

/**
 * roleALPHA Sessions: the meeting side panel in Teams, and the same app on a SharePoint page or as the Teams
 * personal app. It has no settings of its own: the meeting comes from the Teams context, roleALPHA from the shipped
 * address or the tenant property (client/browser/connection.ts).
 */
export default class MeetingsWebPart extends BaseClientSideWebPart<Record<string, never>> {
  private disposeApp?: ReturnType<typeof mount>;

  public render(): void {
    void this.start();
  }

  private async start(): Promise<void> {
    this.disposeApp?.();
    const aad = this.context.pageContext.aadInfo;
    if (!aad) {
      this.domElement.textContent = 'Microsoft 365 sign-in is required.';
      return;
    }
    const webUrl = this.context.pageContext.web.absoluteUrl.replace(/\/$/, '');
    const teams = this.context.sdks.microsoftTeams?.teamsJs;
    let teamsContext: { chatId?: string; frameContext?: string } | null = null;
    let theme: string | undefined;
    if (teams) {
      try {
        const context = await teams.app.getContext();
        teamsContext = { chatId: context.chat?.id, frameContext: context.page.frameContext };
        theme = context.app.theme;
      } catch {
        /* Without a Teams context the app shows how to open it in a meeting. */
      }
    }
    // The app reads exactly one thing from SharePoint: the tenant property that may name another roleALPHA.
    const sharepoint = async (path: string): Promise<Response> => {
      if (path !== "/web/GetStorageEntity('rolealphaSessions')") throw new Error('Invalid SharePoint path');
      const response = await this.context.spHttpClient.get(webUrl + '/_api' + path, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=minimalmetadata', 'odata-version': '3.0' },
      });
      return new Response(response.status === 204 ? null : await response.text(), {
        status: response.status,
        headers: response.headers,
      });
    };
    // The sign-in authority for the consent links; the app itself is Microsoft's SPFx app, the same in every tenant.
    const legacy = this.context.pageContext.legacyPageContext as { aadInstanceUrl?: string };
    this.disposeApp = mount(this.domElement, {
      tenantId: aad.tenantId.toString(),
      userId: aad.userId.toString(),
      userName: this.context.pageContext.user.displayName,
      webUrl,
      isTeams: !!teams,
      teams: teamsContext,
      language: this.language(),
      fonts,
      theme: teamsTheme(theme),
      token: async (resource: string): Promise<string> => {
        const provider = await this.context.aadTokenProviderFactory.getTokenProvider();
        return provider.getToken(resource);
      },
      consent: legacy.aadInstanceUrl ? { authority: legacy.aadInstanceUrl } : undefined,
      sharepoint,
    });
    teams?.app.registerOnThemeChangeHandler(value => this.disposeApp?.setTheme(teamsTheme(value)));
  }

  /** The interface follows the SharePoint UI language until the user picks another one. */
  private language(): 'de' | 'en' | 'fr' | 'es' {
    const code = this.context.pageContext.cultureInfo.currentUICultureName.slice(0, 2).toLowerCase();
    return code === 'en' || code === 'fr' || code === 'es' ? code : 'de';
  }

  protected onDispose(): void {
    this.disposeApp?.();
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    // Teams shows this pane when the tab is added to a meeting; there is nothing to configure, only to save.
    return {
      pages: [
        {
          header: { description: 'roleALPHA Sessions · Microsoft Teams meeting side panel' },
          groups: [],
        },
      ],
    };
  }
}
