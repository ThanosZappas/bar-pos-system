import { useEffect, useState } from 'preact/hooks';
import { collection, type Bytes, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '../firebase';
import { listen } from './live';

/**
 * Profile pictures and icons, PINs and phones (functions/src/avatars.ts, pins.ts, devices.ts).
 * All changes go through Cloud Functions.
 */

function call(name: 'setIcon' | 'resetPin' | 'unlockPin' | 'removeDevice', data: Record<string, unknown>) {
  return httpsCallable(firebase!.functions, name)(data);
}

/** Every uploaded picture, uid → data: URL. */
export function usePhotos(): Map<string, string> {
  const [photos, setPhotos] = useState(new Map<string, string>());
  useEffect(
    () =>
      listen(collection(firebase!.db, 'avatars'), (snap) =>
        setPhotos(
          new Map(
            snap.docs.flatMap((d) => {
              const photo = d.get('photo') as Bytes | undefined;
              return photo ? [[d.id, `data:${d.get('type') ?? 'image/jpeg'};base64,${photo.toBase64()}`] as [string, string]] : [];
            }),
          ),
        ),
      ),
    [],
  );
  return photos;
}

export const setIcon = (uid: string, icon: string) => call('setIcon', { uid, icon });
export const uploadPhoto = (uid: string, base64: string) => call('setIcon', { uid, photo: base64 });
export const removePhoto = (uid: string) => call('setIcon', { uid, photo: null });
export const resetPin = (uid: string) => call('resetPin', { uid });
export const unlockPin = (uid: string) => call('unlockPin', { uid });

export interface Phone {
  id: string;
  name: string;
  profiles: string[];
  lastUsedMs: number | null;
}

/** Phones where staff sign in with a PIN, most recently used first. */
export function usePhones(): Phone[] {
  const [phones, setPhones] = useState<Phone[]>([]);
  useEffect(
    () =>
      listen(collection(firebase!.db, 'devices'), (snap) =>
        setPhones(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: (d.get('name') as string | undefined) ?? '',
              profiles: (d.get('profiles') as string[] | undefined) ?? [],
              lastUsedMs: (d.get('lastUsedAt') as Timestamp | undefined)?.toMillis() ?? null,
            }))
            .sort((a, b) => (b.lastUsedMs ?? 0) - (a.lastUsedMs ?? 0)),
        ),
      ),
    [],
  );
  return phones;
}

export const removePhone = (id: string) => call('removeDevice', { deviceId: id });
