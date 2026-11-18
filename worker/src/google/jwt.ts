import { Buffer } from 'node:buffer';

/** JSON Web Tokens with WebCrypto (runs the same on Cloudflare Workers and in Node). */

export const base64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');

export interface Jwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signed: string;
  signature: Uint8Array<ArrayBuffer>;
}

export function decodeJwt(token: string): Jwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a JWT');
  const json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;
  return { header: json(parts[0]!), payload: json(parts[1]!), signed: `${parts[0]}.${parts[1]}`, signature: new Uint8Array(Buffer.from(parts[2]!, 'base64url')) };
}

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const privateKeys = new Map<string, Promise<CryptoKey>>();

function importPrivateKey(pem: string): Promise<CryptoKey> {
  let key = privateKeys.get(pem);
  if (!key) {
    const der = Buffer.from(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''), 'base64');
    key = crypto.subtle.importKey('pkcs8', der, RS256, false, ['sign']);
    privateKeys.set(pem, key);
  }
  return key;
}

/** RS256-signed token, e.g. for Google's OAuth exchange or a Firebase custom token. */
export async function signRs256(payload: Record<string, unknown>, privateKeyPem: string, keyId?: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(keyId && { kid: keyId }) }));
  const body = base64url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(RS256, await importPrivateKey(privateKeyPem), new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
}

/** The Auth emulator accepts unsigned tokens (and only it does). */
export function unsignedJwt(payload: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}.`;
}

export async function verifyRs256(jwt: Jwt, jwk: JsonWebKey): Promise<boolean> {
  const key = await crypto.subtle.importKey('jwk', jwk, RS256, false, ['verify']);
  return crypto.subtle.verify(RS256, key, jwt.signature, new TextEncoder().encode(jwt.signed));
}
