// Builds the dashboard with web/.env.local and publishes it on Cloudflare Pages (free plan) as
// https://negroni-bar-lab.pages.dev. Needs `npx wrangler login` once (README "First-time setup").
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PROJECT = 'negroni-bar-lab';

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

// The Pages project is created on the first deploy; later runs find it already there.
const create = spawnSync('npx', ['wrangler', 'pages', 'project', 'create', PROJECT, '--production-branch', 'main'], { encoding: 'utf8' });
if (create.status !== 0 && !/already exists|A project with this name already exists/i.test(`${create.stdout}${create.stderr}`)) {
  process.stderr.write(create.stderr || create.stdout);
  process.exit(1);
}
execFileSync('npx', ['wrangler', 'pages', 'deploy', 'web/dist', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], { stdio: 'inherit' });
