// Usage: node app/scripts/vapid.mjs <secrets env file>  — prints the public key only.
import { webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', keys.publicKey));
const pub = Buffer.from(raw).toString('base64url');
writeFileSync(process.argv[2], `VAPID_PUBLIC_KEY=${pub}\nVAPID_SUBJECT=https://github.com/Gubanchuk/Family_App\nVAPID_PRIVATE_JWK=${JSON.stringify(jwk)}\n`, { mode: 0o600 });
console.log(pub);
