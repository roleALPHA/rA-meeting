import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError, type Actor } from '../shared/model.js';
import { config } from './config.js';
declare global { namespace Express { interface Request { actor: Actor } } }
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    if (config.authMode === 'local') { req.actor = { id: 'local-user', name: 'Lokale Entwicklung', tenantId: 'local', admin: true }; return next(); }
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new AppError(401, 'Bitte in Microsoft Teams anmelden.');
    jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
    const { payload } = await jwtVerify(token, jwks, { audience: config.audience, issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`, algorithms: ['RS256'] });
    if (payload.tid !== config.tenantId || typeof payload.oid !== 'string' || !String(payload.scp || '').split(' ').includes('access_as_user')) throw new AppError(403, 'Mandant oder Berechtigung ungültig.');
    req.actor = { id: payload.oid, name: String(payload.name || 'Teams-Nutzer'), tenantId: config.tenantId, admin: Array.isArray(payload.roles) && payload.roles.includes('Meeting.Admin') }; next();
  } catch (error) { next(error instanceof AppError ? error : new AppError(401, 'Die Anmeldung ist ungültig oder abgelaufen.')); }
}
