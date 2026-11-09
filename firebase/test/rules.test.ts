import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-negroni',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('milestone 1 baseline', () => {
  it('denies unauthenticated reads', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'menuItems/x')));
  });
  it('denies authenticated writes', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('u1').firestore(), 'menuItems/x'), { name: 'x' }));
  });
});
