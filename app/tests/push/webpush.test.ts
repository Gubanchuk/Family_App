// @vitest-environment node
import { createDecipheriv, createECDH, hkdfSync, randomBytes, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from '../../../supabase/functions/_shared/webpush';

const info = (label: string, extra = Buffer.alloc(0)) => Buffer.concat([Buffer.from(label, 'utf8'), Buffer.from([0]), extra]);

describe('web push encryption (RFC 8291)', () => {
  it('produces a body the browser can decrypt', async () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const auth = randomBytes(16);
    const text = JSON.stringify({ title: 'Мама просит: Плов', body: 'на ужин сегодня' });
    const body = Buffer.from(await encryptPayload(new TextEncoder().encode(text), b64urlEncode(ua.getPublicKey()), b64urlEncode(auth)));

    const salt = body.subarray(0, 16);
    const rs = body.readUInt32BE(16);
    const idlen = body[20];
    const asPublic = body.subarray(21, 21 + idlen);
    const ciphertext = body.subarray(21 + idlen);
    expect(rs).toBe(4096);
    const ecdh = ua.computeSecret(asPublic);
    const ikm = Buffer.from(hkdfSync('sha256', ecdh, auth, Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), ua.getPublicKey(), asPublic]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: aes128gcm'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, info('Content-Encoding: nonce'), 12));
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    expect(plain.subarray(0, plain.length - 1).toString('utf8')).toBe(text);
  });

  it('signs a VAPID token the push service can verify', async () => {
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
    const pub = b64urlEncode(new Uint8Array(await webcrypto.subtle.exportKey('raw', keys.publicKey)));
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', 'https://github.com/Gubanchuk/Family_App', pub, jwk, 1_800_000_000);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(pub);
    const [h, p, s] = token.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'https://github.com/Gubanchuk/Family_App' });
    const ok = await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
