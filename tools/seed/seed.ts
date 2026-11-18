// Usage:
//   node seed.ts --emulator              (Auth + Firestore emulators, project demo-negroni)
//   node seed.ts --project <projectId>   (real project; GOOGLE_APPLICATION_CREDENTIALS=<service-account key .json>)
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { CREDENTIALS_FILE, seedUsers, validateSeedUsers } from './users.ts';
import { seedMenu, seedSettings, seedTables } from './catalog.ts';

const args = process.argv.slice(2);
const emulator = args.includes('--emulator');
const projectFlag = args.indexOf('--project');
const projectId = emulator ? 'demo-negroni' : projectFlag >= 0 ? args[projectFlag + 1] : undefined;
if (!projectId) {
  console.error('Pass --emulator or --project <projectId>.');
  process.exit(1);
}
if (emulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

let users: unknown;
try {
  users = JSON.parse(readFileSync(new URL(CREDENTIALS_FILE, import.meta.url), 'utf8')).users;
} catch {
  console.error(`Cannot read ${CREDENTIALS_FILE}. Create it with: npm --prefix tools/seed run init-credentials`);
  process.exit(1);
}
const problems = validateSeedUsers(users);
if (problems.length) {
  console.error(`${CREDENTIALS_FILE} is invalid:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

console.log(`Seeding project "${projectId}"${emulator ? ' (emulators)' : ''}...`);
const app = initializeApp({ projectId });
const result = await seedUsers(getAuth(app), getFirestore(app), users as Parameters<typeof seedUsers>[2]);
console.log(`Users created: ${result.created.join(', ') || 'none'}`);
console.log(`Users already present (left unchanged): ${result.existing.join(', ') || 'none'}`);

const menu = JSON.parse(readFileSync(new URL('menu/menu.json', import.meta.url), 'utf8'));
const added = await seedMenu(getFirestore(app), menu.sections);
console.log(`Menu added: ${added.sections} sections, ${added.categories} categories, ${added.items} items (existing ones left unchanged)`);
console.log(`Tables added: ${await seedTables(getFirestore(app))}`);
console.log(`Settings: ${(await seedSettings(getFirestore(app))) ? 'created' : 'already present (left unchanged)'}`);
