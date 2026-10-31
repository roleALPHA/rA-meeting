import { z } from 'zod';

/** Graph permissions the package requests; the build writes them into package-solution.json. */
export const graphScopes = ['Calendars.Read', 'OnlineMeetings.ReadWrite', 'OnlineMeetingTranscript.Read.All'] as const;

/**
 * The SharePoint client principal SPFx requests third-party tokens with, from the page context. Absent outside
 * SharePoint, for example in the local preview.
 */
export type ConsentClient = { authority: string; clientId: string };

const consentClient = z.object({ authority: z.url({ protocol: /^https$/ }), clientId: z.guid() });

/** Turns `api://x` + `access_as_user` into the scope URI Entra expects; a full scope URI stays as it is. */
function scopeUri(resource: string, scope: string) {
  return scope.includes('://') ? scope : `${resource.trim().replace(/\/+$/, '')}/${scope.trim()}`;
}

/**
 * Microsoft's admin consent dialog for delegated permissions of the SharePoint client principal. An Entra
 * administrator opens the link, confirms the permissions, and Microsoft returns to the SPFx reply page, which is
 * then closed. Nothing comes back to the app; "Test connection" shows whether the grant is in place. Like approvals
 * under API access, the grant applies to every SharePoint Framework solution in the tenant.
 */
export function adminConsentUrl(
  client: ConsentClient | undefined,
  tenantId: string,
  webUrl: string,
  resource: string,
  scopes: readonly string[],
): string | null {
  const valid = consentClient.safeParse(client);
  if (!valid.success || !z.guid().safeParse(tenantId).success) return null;
  if (!resource.trim() || !scopes.length || scopes.some(scope => !scope.trim() || /\s/.test(scope.trim()))) return null;
  const url = new URL(`${valid.data.authority.replace(/\/+$/, '')}/${encodeURIComponent(tenantId)}/v2.0/adminconsent`);
  url.searchParams.set('client_id', valid.data.clientId);
  url.searchParams.set('scope', scopes.map(scope => scopeUri(resource, scope)).join(' '));
  url.searchParams.set('redirect_uri', `${new URL(webUrl).origin}/_forms/spfxsinglesignon.aspx`);
  // Scopes are space-separated; encode the space as %20 like Microsoft's examples, not as the form-style '+'.
  url.search = url.searchParams.toString().replace(/\+/g, '%20');
  return url.href;
}

export const graphResource = 'https://graph.microsoft.com';
export const graphConsentUrl = (client: ConsentClient | undefined, tenantId: string, webUrl: string) =>
  adminConsentUrl(client, tenantId, webUrl, graphResource, graphScopes);
