import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import worker, { type Env } from './index.js';

/**
 * Runs the Worker in Node on this laptop for scripts/try-on-phone.sh (lighter than Cloudflare's
 * local runtime), against the Auth and Firestore emulators. Never deployed.
 */
const port = Number(process.env.PORT ?? 8787);
const env: Env = {
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'demo-negroni',
  PIN_PEPPER: process.env.PIN_PEPPER,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099',
};

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', async () => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
}).listen(port, '127.0.0.1', () => console.log(`Worker ready on http://127.0.0.1:${port}`));
