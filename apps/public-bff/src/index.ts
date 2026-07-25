import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { jsonError } from '@pastebingcp/http';
import { registerCommandRoutes } from './command.js';
import { registerListenerRoutes } from './listener.js';

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';

const app = new Hono();

app.get('/', (c) => c.json({
  service: process.env.SERVICE_NAME ?? 'public-bff',
  status: 'ok',
}));

app.get('/info', (c) => c.json({
  service: process.env.SERVICE_NAME ?? 'public-bff',
  project: projectId,
  region: process.env.GCP_REGION ?? 'unknown',
  node: process.version,
  env: process.env.ENV ?? 'dev',
}));

app.get('/health', (c) => c.json({ ok: true, service: 'public-bff' }));

registerCommandRoutes(app);
registerListenerRoutes(app);

app.onError((err, c) => jsonError(err));

const port = Number(process.env.PORT ?? 8080);
console.log(`listening on :${port}`);
serve({ fetch: app.fetch, port });
