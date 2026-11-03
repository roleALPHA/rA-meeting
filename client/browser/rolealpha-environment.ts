/**
 * The roleALPHA installations rA Meetings can talk to. Every customer of an installation uses the same values, so the
 * package ships them instead of asking (rA-app `doc/ENTRA-TAUSCH.md`). Another installation, such as QA, has its own
 * Entra app registration and gets its own entry here; nothing else in the code names a roleALPHA address.
 */
export const roleAlphaEnvironments = {
  production: {
    /** Streamable HTTP. The token endpoint is derived from its origin (client/browser/rolealpha.ts). */
    mcpUrl: 'https://rolealpha.app/api/mcp',
    /** Entra app registration "roleALPHA" in roleALPHA's directory, multi-tenant. */
    clientId: '4bd22250-d811-4905-97a4-cb2bf69f98fa',
    resource: 'api://4bd22250-d811-4905-97a4-cb2bf69f98fa',
    scope: 'access_as_user',
    /** Reply address SharePoint uses when it creates the app in a customer directory (webApiPermissionRequests). */
    replyUrl: 'https://rolealpha.app/',
    /** The web application that draft links open in. */
    appUrl: 'https://rolealpha.app',
  },
} as const;

export const roleAlphaEnvironment = roleAlphaEnvironments.production;
