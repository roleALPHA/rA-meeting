import express from 'express';
import { resolve } from 'node:path';
import { config, validateConfig } from './config.js';
import { Store } from './store.js';
import { SharePointStore } from '../shared/storage/sharepoint.js';
import { sharepointGraph } from './sharepoint-graph.js';
import { createApp } from './app.js';
import { startGraphWorker } from './graph.js';
validateConfig();
const store = config.storage === 'sharepoint' ? new SharePointStore({ tenantId: config.tenantId, siteId: config.sharepointSite, listId: config.sharepointList, driveId: config.sharepointDrive }, sharepointGraph) : new Store(config.database); await store.initialize(); const app = createApp(store);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist/client')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ mode: 'legacy', server: { middlewareMode: true, hmr: { port: config.port + 1 } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const stopWorker = startGraphWorker(store);
const server = app.listen(config.port, config.host, () => console.log(`roleALPHA Meetings: http://${config.host}:${config.port}`));
const stop = () => { stopWorker(); server.close(() => { void store.close().then(() => process.exit(0)); }); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
