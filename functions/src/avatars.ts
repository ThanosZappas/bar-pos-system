import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseIcon } from './icons.js';
import { asData, audit, loadUser, requireAdmin, type Deps } from './users.js';

/**
 * Profile icon or uploaded picture. Each person sets their own; the admin sets anyone's.
 * Pictures are small JPEG/PNG/WebP files (the apps crop and shrink them to 256×256 first) kept in
 * avatars/{uid} as bytes, so no Cloud Storage bucket is needed. users/{uid}.photoVersion says
 * when the picture last changed, so phones download it again only then.
 */

export const MAX_PHOTO_BYTES = 100 * 1024;

const SIGNATURES: { type: string; matches: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** A base64 picture: decoded, size-checked and recognised by its first bytes. */
export function parsePhoto(raw: unknown): { bytes: Buffer; type: string } {
  if (typeof raw !== 'string' || raw.length === 0) throw new HttpsError('invalid-argument', 'Missing picture.');
  if (raw.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4) throw new HttpsError('invalid-argument', 'The picture is too large.', { reason: 'photoTooLarge' });
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new HttpsError('invalid-argument', 'The picture is too large.', { reason: 'photoTooLarge' });
  const type = SIGNATURES.find((s) => s.matches(bytes))?.type;
  if (!type) throw new HttpsError('invalid-argument', 'Use a JPEG, PNG or WebP picture.', { reason: 'photoType' });
  return { bytes, type };
}

/**
 * `{ uid?, icon }` sets an icon (and drops any picture); `{ uid?, photo: base64 }` uploads a
 * picture; `{ uid?, photo: null }` removes it, back to the icon. Without uid: the caller's own.
 */
export async function setIcon(deps: Deps, callerUid: string | undefined, raw: unknown): Promise<void> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = asData(raw);
  const uid = typeof data.uid === 'string' && data.uid !== '' ? data.uid : callerUid;
  if (uid !== callerUid) {
    await requireAdmin(deps, callerUid);
  } else {
    const me = await loadUser(deps, callerUid);
    if (!me || me.deleted || !me.active) throw new HttpsError('permission-denied', 'This account is deactivated.');
  }
  const target = await loadUser(deps, uid);
  if (!target || target.deleted) throw new HttpsError('not-found', 'User not found.');

  const userRef = deps.db.doc(`users/${uid}`);
  const avatarRef = deps.db.doc(`avatars/${uid}`);
  const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: callerUid };
  if ('photo' in data && data.photo !== null) {
    const { bytes, type } = parsePhoto(data.photo);
    await avatarRef.set({ photo: bytes, type, ...stamp });
    await userRef.update({ photoVersion: Date.now(), ...stamp });
    await audit(deps, 'user.photo', callerUid, uid, { bytes: bytes.length });
  } else if ('photo' in data) {
    await avatarRef.delete();
    await userRef.update({ photoVersion: FieldValue.delete(), ...stamp });
    await audit(deps, 'user.photo', callerUid, uid, { removed: true });
  } else if ('icon' in data) {
    const icon = parseIcon(data.icon);
    await avatarRef.delete();
    await userRef.update({ icon, photoVersion: FieldValue.delete(), ...stamp });
    await audit(deps, 'user.icon', callerUid, uid, { icon });
  } else {
    throw new HttpsError('invalid-argument', 'Nothing to change.');
  }
}
