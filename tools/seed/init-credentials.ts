// Creates the git-ignored seed-credentials.json with the initial accounts from the brief.
// Refuses to overwrite an existing file. Edit the file afterwards if you want other passwords.
import { existsSync, writeFileSync } from 'node:fs';
import { CREDENTIALS_FILE, defaultSeedUsers, validateSeedUsers } from './users.ts';

const path = new URL(CREDENTIALS_FILE, import.meta.url);
if (existsSync(path)) {
  console.error(`${CREDENTIALS_FILE} already exists; not overwriting.`);
  process.exit(1);
}
const users = defaultSeedUsers();
const problems = validateSeedUsers(users);
if (problems.length) throw new Error(problems.join('\n'));
writeFileSync(path, JSON.stringify({ users }, null, 2) + '\n', { mode: 0o600 });
console.log(`Wrote ${CREDENTIALS_FILE} (${users.length} users). It is git-ignored; keep it off shared drives.`);
