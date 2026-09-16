import { config } from './config.js';
import { AppError } from '../shared/model.js';
let cached: { token: string; expires: number } | undefined;
export async function sharepointGraph(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Graph path');
  if (!cached || cached.expires < Date.now()) {
    const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, { method: 'POST', signal: AbortSignal.timeout(20_000), body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }) });
    if (!response.ok) throw new AppError(503, 'SharePoint-Anmeldung fehlgeschlagen.');
    const result = await response.json() as { access_token: string; expires_in: number };
    cached = { token: result.access_token, expires: Date.now() + (result.expires_in - 120) * 1000 };
  }
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${cached.token}`, ...init.headers } });
  if (response.status === 302 && path.endsWith('/content') && (!init.method || init.method === 'GET')) {
    const target = new URL(response.headers.get('location') || '');
    // Never forward bearer to the preauthenticated download URL or an unrelated origin.
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.sharepoint.com')) throw new AppError(502, 'Ungültige SharePoint-Downloadadresse.');
    return fetch(target, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  }
  return response;
}
