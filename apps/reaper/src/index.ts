import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { jsonError } from '@pastebingcp/http';
import { reap } from './reap.js';

const app = new Hono();

app.get('/', (c) => c.json({
  service: process.env.SERVICE_NAME ?? 'reaper',
  status: 'ok',
}));

app.get('/health', (c) => c.json({ ok: true, service: 'reaper' }));

app.post('/reap', async (c) => {
  try {
    const stats = await reap();
    return c.json({ ok: true, stats });
  } catch (err) {
    console.error('[reaper] cycle failed', String(err));
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.post('/', async (c) => {
  try {
    const stats = await reap();
    return c.json({ ok: true, stats });
  } catch (err) {
    console.error('[reaper] cycle failed', String(err));
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.onError((err, c) => jsonError(err));

const port = Number(process.env.PORT ?? 8080);
console.log(`listening on :${port}`);
serve({ fetch: app.fetch, port });
