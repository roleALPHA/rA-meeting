import type { BrowserHost } from './host';
import { hostForWorkspace } from './onboarding';

/**
 * The workspace a host without a configured site opened last. Teams starts the personal app on the tenant's root
 * site and drops the address the app keeps the selection in, so without this every start ends in the setup wizard.
 * A per-user convenience in browser storage: it may be missing, and the app works without it.
 */
const key = (host: Pick<BrowserHost, 'tenantId' | 'userId'>) => `ra-meetings-workspace:${host.tenantId}:${host.userId}`;

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function rememberWorkspace(host: BrowserHost, url: string | null, storage = browserStorage()) {
  if (!host.rememberWorkspace) return;
  try {
    if (url) storage?.setItem(key(host), url);
    else storage?.removeItem(key(host));
  } catch {
    // Blocked storage only costs the convenience.
  }
}

/** The host for the remembered workspace, or the host itself when there is none or it is no longer valid. */
export function withRememberedWorkspace(host: BrowserHost, storage = browserStorage()): BrowserHost {
  if (!host.rememberWorkspace) return host;
  let url: string | null;
  try {
    url = storage?.getItem(key(host)) ?? null;
  } catch {
    return host;
  }
  if (!url || url === host.webUrl) return host;
  try {
    return hostForWorkspace(host, url);
  } catch {
    rememberWorkspace(host, null, storage);
    return host;
  }
}
