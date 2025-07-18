import { Keypair } from '@solana/web3.js';
import { ActionCodesProtocol, CodeGenerator, SolanaAdapter } from '@actioncodes/protocol';
import { encryptField, decryptField } from './secure';
import nacl from 'tweetnacl';

export function signMessage(keypair: Keypair, message: string): Uint8Array {
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached(messageBytes, keypair.secretKey);
}

describe('secure', () => {
    describe('encryptField', () => {
        it('should encrypt a simple string', () => {
            const value = 'hello world';
            const code = 'test-code';
            const encrypted = encryptField(value, code);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).toContain(':');
            expect(encrypted.split(':')).toHaveLength(2);
        });

        it('should encrypt empty string', () => {
            const value = '';
            const code = 'test-code';
            const encrypted = encryptField(value, code);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).toContain(':');
        });

        it('should encrypt special characters', () => {
            const value = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const code = 'test-code';
            const encrypted = encryptField(value, code);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).toContain(':');
        });

        it('should encrypt unicode characters', () => {
            const value = 'Hello 世界 🌍';
            const code = 'test-code';
            const encrypted = encryptField(value, code);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).toContain(':');
        });

        it('should encrypt long strings', () => {
            const value = 'a'.repeat(1000);
            const code = 'test-code';
            const encrypted = encryptField(value, code);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).toContain(':');
        });

        it('should produce different results for same input due to random IV', () => {
            const value = 'hello world';
            const code = 'test-code';
            const encrypted1 = encryptField(value, code);
            const encrypted2 = encryptField(value, code);

            expect(encrypted1).not.toBe(encrypted2);
        });

        it('should handle different codes', () => {
            const value = 'hello world';
            const code1 = 'code1';
            const code2 = 'code2';
            const encrypted1 = encryptField(value, code1);
            const encrypted2 = encryptField(value, code2);

            expect(encrypted1).not.toBe(encrypted2);
        });
    });

    describe('decryptField', () => {
        it('should decrypt an encrypted string correctly', () => {
            const originalValue = 'hello world';
            const code = 'test-code';
            const encrypted = encryptField(originalValue, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(originalValue);
        });

        it('should decrypt empty string', () => {
            const originalValue = '';
            const code = 'test-code';
            const encrypted = encryptField(originalValue, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(originalValue);
        });

        it('should decrypt special characters', () => {
            const originalValue = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const code = 'test-code';
            const encrypted = encryptField(originalValue, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(originalValue);
        });

        it('should decrypt unicode characters', () => {
            const originalValue = 'Hello 世界 🌍';
            const code = 'test-code';
            const encrypted = encryptField(originalValue, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(originalValue);
        });

        it('should decrypt long strings', () => {
            const originalValue = 'a'.repeat(1000);
            const code = 'test-code';
            const encrypted = encryptField(originalValue, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(originalValue);
        });

        it('should handle multiple encrypt/decrypt cycles', () => {
            const originalValue = 'hello world';
            const code = 'test-code';

            let currentValue = originalValue;
            for (let i = 0; i < 5; i++) {
                const encrypted = encryptField(currentValue, code);
                const decrypted = decryptField(encrypted, code);
                expect(decrypted).toBe(currentValue);
                currentValue = encrypted; // Use encrypted as input for next iteration
            }
        });
    });

    describe('encryptField and decryptField integration', () => {
        it('should work with various data types as strings', () => {
            const testCases = [
                'simple text',
                '12345',
                'true',
                'false',
                'null',
                'undefined',
                '0',
                '-1',
                '3.14159',
                '{"key": "value"}',
                '[1, 2, 3]'
            ];

            const code = 'test-code';

            testCases.forEach(testCase => {
                const encrypted = encryptField(testCase, code);
                const decrypted = decryptField(encrypted, code);
                expect(decrypted).toBe(testCase);
            });
        });

        it('should fail decryption with wrong code', () => {
            const originalValue = 'hello world';
            const correctCode = 'correct-code';
            const wrongCode = 'wrong-code';

            const encrypted = encryptField(originalValue, correctCode);

            expect(() => {
                decryptField(encrypted, wrongCode);
            }).toThrow();
        });

        it('should fail decryption with malformed encrypted string', () => {
            const code = 'test-code';

            expect(() => {
                decryptField('invalid-format', code);
            }).toThrow();
        });

        it('should fail decryption with empty encrypted string', () => {
            const code = 'test-code';

            expect(() => {
                decryptField('', code);
            }).toThrow();
        });

        it('should fail decryption with missing IV', () => {
            const code = 'test-code';

            expect(() => {
                decryptField(':encrypteddata', code);
            }).toThrow();
        });

        it('should fail decryption with missing encrypted data', () => {
            const code = 'test-code';

            expect(() => {
                decryptField('ivdata:', code);
            }).toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle very long codes', () => {
            const value = 'hello world';
            const code = 'a'.repeat(1000);
            const encrypted = encryptField(value, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(value);
        });

        it('should handle very short codes', () => {
            const value = 'hello world';
            const code = 'a';
            const encrypted = encryptField(value, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(value);
        });

        it('should handle codes with special characters', () => {
            const value = 'hello world';
            const code = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const encrypted = encryptField(value, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(value);
        });

        it('should handle codes with unicode characters', () => {
            const value = 'hello world';
            const code = '密码123';
            const encrypted = encryptField(value, code);
            const decrypted = decryptField(encrypted, code);

            expect(decrypted).toBe(value);
        });
    });

    describe('Encrypt and decrypt action codes', () => {
        const keypair = Keypair.generate();
        const protocol = new ActionCodesProtocol();
        protocol.registerAdapter(new SolanaAdapter());

        it('should encrypt and decrypt action codes', async () => {
            const code = CodeGenerator.generateCode(keypair.publicKey.toBase58());
            const actionCode = await protocol.createActionCode(keypair.publicKey.toBase58(),
                async (message) => {
                    const signature = signMessage(keypair, message);
                    return Buffer.from(signature).toString('base64');
                }, 'solana')

            const encrypted = encryptField(actionCode.encoded, code.code);
            const decrypted = decryptField(encrypted, code.code);

            // The decrypted value should match the original encoded value
            expect(decrypted).toBe(actionCode.encoded);
        });
    });
});