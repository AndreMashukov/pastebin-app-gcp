import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { jsonError } from '@pastebingcp/http';
import { registerCommandRoutes } from './command.js';
import { registerTriggerRoutes } from './trigger.js';

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';

const app = new Hono<{ Variables: { uid: string } }>();

app.get('/', (c) => c.json({
  service: process.env.SERVICE_NAME ?? 'author-bff',
  status: 'ok',
}));

app.get('/info', (c) => c.json({
  service: process.env.SERVICE_NAME ?? 'author-bff',
  project: projectId,
  region: process.env.GCP_REGION ?? 'unknown',
  node: process.version,
  env: process.env.ENV ?? 'dev',
}));

app.get('/health', (c) => c.json({ ok: true, service: 'author-bff' }));

registerCommandRoutes(app);
registerTriggerRoutes(app);

app.onError((err, c) => jsonError(err));

const port = Number(process.env.PORT ?? 8080);
console.log(`listening on :${port}`);
serve({ fetch: app.fetch, port });
