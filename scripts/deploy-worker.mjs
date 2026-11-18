// Deploys the Cloudflare Worker (worker/) for this Firebase project: the project id comes from
// .firebaserc (committed), so it is never typed by hand.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const project = existsSync('.firebaserc') ? JSON.parse(readFileSync('.firebaserc', 'utf8')).projects?.default : undefined;
if (!project) {
  console.error('.firebaserc is missing: it names the Firebase project (README "First-time setup").');
  process.exit(1);
}
execFileSync('npx', ['wrangler', 'deploy', '--config', 'worker/wrangler.jsonc', '--var', `FIREBASE_PROJECT_ID:${project}`], { stdio: 'inherit' });
