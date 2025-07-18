import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { sha256 } from 'js-sha256';

function deriveKey(code: string): Buffer {
    return Buffer.from(sha256(code), 'hex'); // 32 bytes
}

export function encryptField(value: string, code: string): string {
    const iv = randomBytes(16);
    const key = deriveKey(code);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(value);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptField(encrypted: string, code: string): string {
    const [ivHex, encryptedHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedBuf = Buffer.from(encryptedHex, 'hex');
    const key = deriveKey(code);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedBuf);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}