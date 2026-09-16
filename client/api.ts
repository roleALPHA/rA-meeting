import type { AppApi } from './browser/runtime';
import { language, t } from './i18n';
import { app, authentication } from '@microsoft/teams-js';
let teams = false;
export async function initializeTeams() {
  if (window.self === window.top && !new URLSearchParams(location.search).has('teams')) return false;
  try { await Promise.race([app.initialize(), new Promise((_, reject) => setTimeout(() => reject(new Error('Teams timeout')), 5000))]); teams = true; return true; } catch { return false; }
}
export async function request<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const authMode = (window as Window & { authMode?: string }).authMode;
  const token = authMode === 'entra' && teams ? await authentication.getAuthToken() : null;
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : method, headers: { 'Accept-Language': language(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 204) return undefined as T;
  const result = await response.json(); if (!response.ok) throw new Error(t(result.error || "") || `HTTP ${response.status}`); return result as T;
}

export const legacyApi: AppApi = { workspace: false, request, initializeTeams };
