import { resolve } from 'node:path';
import { z } from 'zod';
import { outputTypes } from '../shared/model.js';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const routeSchema = z.object({ url: z.string().url(), tool: z.string().regex(/^create_[a-z0-9_]+$/), label: z.string().min(1) });
export const config = {
  language: z.enum(['de','en','fr','es']).default('de').parse(process.env.DEFAULT_LANGUAGE),
  storage: process.env.STORAGE_BACKEND || (process.env.NODE_ENV === 'production' ? 'sharepoint' : 'sqlite'),
  sharepointSite: process.env.SHAREPOINT_SITE_ID || '',
  sharepointList: process.env.SHAREPOINT_LIST_ID || '',
  sharepointDrive: process.env.SHAREPOINT_DRIVE_ID || '',
  autoAnalysis: process.env.AUTO_ANALYZE_TRANSCRIPTS === 'true',
  entityRoutes: z.record(z.enum(outputTypes), routeSchema).parse(JSON.parse(process.env.ROLEALPHA_ENTITY_ROUTES || '{}')),
  port: Number(process.env.PORT || 4310), host: process.env.HOST || '127.0.0.1',
  authMode: process.env.AUTH_MODE || 'local', tenantId: process.env.ENTRA_TENANT_ID || 'local',
  clientId: process.env.ENTRA_CLIENT_ID || '', audience: process.env.ENTRA_AUDIENCE || process.env.ENTRA_CLIENT_ID || '',
  clientSecret: process.env.ENTRA_CLIENT_SECRET || '', publicUrl: process.env.PUBLIC_URL || 'http://localhost:4310',
  database: process.env.DATABASE_URL || process.env.DATABASE_PATH || resolve('data/meetings.sqlite'),
  aiUrl: process.env.AI_COMPLETIONS_URL || '', aiKey: process.env.AI_API_KEY || '', aiModel: process.env.AI_MODEL || '', aiAuthHeader: process.env.AI_AUTH_HEADER || 'authorization',
  mcpUrl: process.env.ROLEALPHA_MCP_URL || '', mcpToken: process.env.ROLEALPHA_MCP_TOKEN || '', rolealphaTenant: process.env.ROLEALPHA_TENANT_UUID || '',
};
export function validateConfig() {
  if (!['sharepoint', 'sqlite'].includes(config.storage)) throw new Error('STORAGE_BACKEND must be sharepoint or sqlite');
  if (process.env.NODE_ENV === 'production' && config.storage !== 'sharepoint') throw new Error('Production requires SharePoint persistence.');
  if (config.storage === 'sharepoint' && (!config.sharepointSite || !config.sharepointList || !config.sharepointDrive || config.authMode !== 'entra' || !config.clientSecret)) throw new Error('SharePoint site, list, library and customer Entra authentication are required.');
  if (!['authorization', 'api-key'].includes(config.aiAuthHeader)) throw new Error('AI_AUTH_HEADER must be authorization or api-key');
  if (!['local', 'entra'].includes(config.authMode)) throw new Error('AUTH_MODE must be local or entra');
  if (config.authMode === 'local' && (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(config.host))) throw new Error('Local mode is only allowed on loopback in development. Configure Entra authentication for deployment.');
  if (config.authMode === 'entra' && (!/^[\da-f-]{36}$/i.test(config.tenantId) || !config.clientId || !config.audience)) throw new Error('Entra tenant, client ID and audience are required.');
  if (config.authMode === 'entra' && !config.publicUrl.startsWith('https://')) throw new Error('Entra mode requires PUBLIC_URL=https://…');
  for (const value of [config.aiUrl, config.mcpUrl, ...Object.values(config.entityRoutes).map(r => r.url)].filter(Boolean)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Integration URLs must use HTTPS (HTTP is allowed only for localhost).');
    if (url.username || url.password) throw new Error('Do not put credentials in URLs.');
  }
}
export const integrationStatus = () => ({ autoAnalysis: config.autoAnalysis, entityTypes: config.mcpToken && config.rolealphaTenant ? outputTypes.filter(t => config.entityRoutes[t]) : [], authMode: config.authMode, storage: config.storage === 'sharepoint' ? 'sharepoint' : 'local-sqlite', ai: Boolean(config.aiUrl && config.aiModel), mcp: Boolean(config.mcpUrl && config.mcpToken && config.rolealphaTenant), graph: Boolean(config.authMode === 'entra' && config.clientSecret) });
