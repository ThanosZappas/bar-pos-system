// Builds the dashboard with web/.env.local and publishes it on Cloudflare (free plan) as static
// files served by a Worker (web/wrangler.jsonc): https://negroni-bar-lab.<subdomain>.workers.dev.
// Needs `npx wrangler login` once (README "First-time setup").
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('web/.env.local') ? readFileSync('web/.env.local', 'utf8') : '';
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_API_URL']) {
  if (!new RegExp(`^${key}=.+`, 'm').test(env)) {
    console.error(`web/.env.local has no ${key}. Fill it in from web/.env.example first (README "First-time setup").`);
    process.exit(1);
  }
}
if (/^VITE_USE_EMULATORS=true/m.test(env)) {
  console.error('web/.env.local still says VITE_USE_EMULATORS=true; remove that line for the real dashboard.');
  process.exit(1);
}

execFileSync('npm', ['--prefix', 'web', 'run', 'build'], { stdio: 'inherit' });

execFileSync('npx', ['wrangler', 'deploy', '--config', 'web/wrangler.jsonc'], { stdio: 'inherit' });
