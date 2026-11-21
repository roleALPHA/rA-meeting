import { z } from 'zod';
import { AppError } from '../../shared/model';
import type { MessageId } from '../../shared/i18n';
import { roleAlphaEndpoint, type BrowserHost, type Endpoint, type RoleAlphaTarget } from './host';
import { setupRoleAlpha, type RoleAlphaOrganisation } from './rolealpha';

/**
 * Where the app finds roleALPHA, without a list of its own.
 *
 * The package ships roleALPHA's installation (client/browser/rolealpha-environment.ts). A tenant administrator can
 * point every user at another installation with the SharePoint tenant property `rolealphaSessions`, a JSON object
 * `{ "url", "resource", "scope", "appUrl" }` (docs/technical-deployment.md). Only administrators can set tenant
 * properties; everybody can read them.
 *
 * The organisation is found by the token exchange itself. With several, the user picks one once; the choice is a
 * convenience kept in browser storage per user and endpoint. roleALPHA checks every call against the user's own
 * account, so a stale or edited choice can only fail, never grant access.
 */
export const TENANT_PROPERTY = 'rolealphaSessions';

const storageValue = z.looseObject({ Value: z.string().max(2000).nullish() });

/** The tenant property, or the shipped installation when there is none. A broken value is an error, not a fallback. */
export async function roleAlphaEndpointFor(host: BrowserHost): Promise<Endpoint> {
  let raw: string | null | undefined;
  try {
    const response = await host.sharepoint(`/web/GetStorageEntity('${TENANT_PROPERTY}')`);
    raw = response.ok ? storageValue.parse(await response.json()).Value : null;
  } catch {
    // Reading the property needs nothing but the page's own SharePoint session; without it the default applies.
    raw = null;
  }
  if (!raw) return roleAlphaEndpoint.parse({});
  try {
    return roleAlphaEndpoint.parse(JSON.parse(raw));
  } catch {
    throw new AppError(500, 'error.rolealpha.tenantPropertyInvalid', { name: TENANT_PROPERTY });
  }
}

const memoryKey = (host: BrowserHost, endpoint: Endpoint) =>
  `ra-sessions-organisation:${host.tenantId}:${host.userId}:${endpoint.url}`;

function remembered(host: BrowserHost, endpoint: Endpoint) {
  try {
    const value = host.storage?.getItem(memoryKey(host, endpoint));
    return value && z.guid().safeParse(value).success ? value : null;
  } catch {
    return null;
  }
}

function remember(host: BrowserHost, endpoint: Endpoint, tenant: string | null) {
  try {
    if (tenant) host.storage?.setItem(memoryKey(host, endpoint), tenant);
    else host.storage?.removeItem(memoryKey(host, endpoint));
  } catch {
    /* Browser storage may be disabled; the user picks again next time. */
  }
}

export type ConnectionState =
  | { status: 'connected'; organisation: RoleAlphaOrganisation | null }
  | { status: 'choose'; organisations: RoleAlphaOrganisation[] }
  | { status: 'unavailable'; error: MessageId };

/** Finds the organisation and sets `host.roleAlpha`; everything the panel does with roleALPHA needs it. */
export async function connect(host: BrowserHost, chosen?: string): Promise<ConnectionState> {
  const endpoint = await roleAlphaEndpointFor(host);
  const tenant = chosen ?? remembered(host, endpoint);
  if (tenant && !chosen) {
    host.roleAlpha = { ...endpoint, tenant } satisfies RoleAlphaTarget;
    return { status: 'connected', organisation: null };
  }
  try {
    const setup = await setupRoleAlpha(host, endpoint, tenant ?? undefined);
    if (setup.status === 'choose') return { status: 'choose', organisations: setup.organisations };
    if (setup.status === 'tenantRequired') return { status: 'unavailable', error: 'error.rolealpha.releaseTooOld' };
    host.roleAlpha = { ...endpoint, tenant: setup.organisation.uuid };
    remember(host, endpoint, setup.organisation.uuid);
    return { status: 'connected', organisation: setup.organisation };
  } catch (error) {
    if (error instanceof AppError) return { status: 'unavailable', error: error.id };
    throw error;
  }
}

/** Forgets the chosen organisation, for "switch organisation" and after roleALPHA refused it. */
export async function forgetOrganisation(host: BrowserHost) {
  remember(host, await roleAlphaEndpointFor(host), null);
  host.roleAlpha = null;
}
