// Gives the deployed Worker its secrets, read from the Firebase service-account key file (never
// printed, never written into the project):
//   node scripts/set-worker-secrets.mjs ~/negroni-service-account.json
// FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY come from the file. PIN_PEPPER is made once at
// random and never replaced afterwards: a new pepper would make every PIN stop working.
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/set-worker-secrets.mjs <service-account key .json>');
  process.exit(1);
}
const key = JSON.parse(readFileSync(file, 'utf8'));
if (key.type !== 'service_account' || !key.client_email || !key.private_key) {
  console.error(`${file} is not a service-account key (Firebase console → Project settings → Service accounts).`);
  process.exit(1);
}
const config = ['--config', 'worker/wrangler.jsonc'];

function put(name, value) {
  execFileSync('npx', ['wrangler', 'secret', 'put', name, ...config], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}

put('FIREBASE_CLIENT_EMAIL', key.client_email);
put('FIREBASE_PRIVATE_KEY', key.private_key);

const list = spawnSync('npx', ['wrangler', 'secret', 'list', '--format', 'json', ...config], { encoding: 'utf8' });
const existing = list.status === 0 ? JSON.parse(list.stdout).map((s) => s.name) : [];
if (existing.includes('PIN_PEPPER')) console.log('PIN_PEPPER is already set; keeping it.');
else put('PIN_PEPPER', randomBytes(32).toString('base64'));
