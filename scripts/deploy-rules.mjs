// Publishes firebase/firestore.rules with the service-account key, through the Firebase Rules API
// (the key may not enable Google APIs, which `firebase deploy` insists on checking first):
//   node scripts/deploy-rules.mjs ~/negroni-service-account.json
// firestore.indexes.json is empty (every query is single-field), so there are no indexes to send.
import { readFileSync } from 'node:fs';
import { GoogleAccess, GoogleApiError } from '../worker/lib/google/access.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/deploy-rules.mjs <service-account key .json>   (run npm run build:worker first)');
  process.exit(1);
}
const key = JSON.parse(readFileSync(file, 'utf8'));
const project = key.project_id;
const google = new GoogleAccess({ projectId: project, serviceAccount: { clientEmail: key.client_email, privateKey: key.private_key } });
const api = `https://firebaserules.googleapis.com/v1/projects/${project}`;

const ruleset = await google.request(`${api}/rulesets`, false, {
  body: { source: { files: [{ name: 'firestore.rules', content: readFileSync('firebase/firestore.rules', 'utf8') }] } },
});
const release = { name: `projects/${project}/releases/cloud.firestore`, rulesetName: ruleset.name };
try {
  await google.request(`${api}/releases/cloud.firestore`, false, { method: 'PATCH', body: { release } });
} catch (e) {
  if (!(e instanceof GoogleApiError && e.httpStatus === 404)) throw e;
  await google.request(`${api}/releases`, false, { body: release });
}
console.log(`Firestore rules published to ${project} (${ruleset.name.split('/').pop()}).`);
