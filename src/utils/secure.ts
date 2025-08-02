// Copyright 2025 Trana, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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