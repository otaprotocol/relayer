import { NextRequest } from 'next/server';
import { POST } from './route';
import { decryptField } from '@actioncodes/relayer/utils/secure';
import redis, { getKey } from '@actioncodes/relayer/utils/redis';
import { sha256 } from 'js-sha256';
import { ActionCode } from '@actioncodes/protocol';

// Mock dependencies
jest.mock('@actioncodes/relayer/utils/redis', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        set: jest.fn(),
    },
    getKey: jest.fn((key: string) => `test:${key}`),
}));

jest.mock('@actioncodes/relayer/utils/secure', () => ({
    decryptField: jest.fn(),
}));

jest.mock('@actioncodes/relayer/protocol/protocol', () => ({
    __esModule: true,
    default: {
        getConfig: () => ({ codeTTL: 120000 }), // 2 minutes
    },
}));

jest.mock('@actioncodes/protocol', () => ({
    ...jest.requireActual('@actioncodes/protocol'),
    ActionCode: {
        fromEncoded: jest.fn(),
    },
}));

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockDecryptField = decryptField as jest.MockedFunction<typeof decryptField>;
const mockActionCodeFromEncoded = ActionCode.fromEncoded as jest.MockedFunction<typeof ActionCode.fromEncoded>;

describe('POST /api/resolve', () => {
    const validCode = '12345678';
    const validCodeHash = sha256(validCode);
    const now = Date.now();
    const timestamp = now - 60000; // 1 minute ago
    const expiresAt = timestamp + 120000; // 2 minutes from timestamp

    const createMockActionCode = (overrides: any = {}) => ({
        timestamp: timestamp,
        pubkey: '9uVPTajxpMMvR9AKqgSFS2AyybWanvEjnrvFfFehw',
        chain: 'solana',
        prefix: 'DEFAULT',
        signature: 'dummy-signature', // <-- Add this line
        metadata: {
            description: 'Test action code',
            params: { test: 'value' },
        },
        ...overrides,
    });

    const createMockRequest = (body: any): NextRequest => {
        return {
            json: jest.fn().mockResolvedValue(body),
        } as any;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(now);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('✅ Core Functionality Tests', () => {
        it('1. Valid code returns decrypted ActionCode with all fields', async () => {
            const mockActionCode = createMockActionCode();
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(mockActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toMatchObject({
                codeHash: validCodeHash,
                timestamp: timestamp,
                expiresAt: expiresAt,
                remainingInSeconds: 60, // 1 minute remaining
                status: 'active',
                pubkey: mockActionCode.pubkey,
                chain: mockActionCode.chain,
                prefix: mockActionCode.prefix,
                metadata: mockActionCode.metadata,
            });
            expect(mockRedis.get).toHaveBeenCalledWith(getKey(validCodeHash));
        });

        it('2. Attached transaction is returned if present', async () => {
            const transaction = {
                transaction: 'test-transaction-data',
                txSignature: 'test-signature',
                txType: 'transfer',
            };
            const mockActionCode = createMockActionCode({ transaction });
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(mockActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.transaction).toEqual(transaction);
        });

        it('3. Returns correct status field for different scenarios', async () => {
            // Test fresh code (pending status)
            const freshTimestamp = now - 1000; // 1 second ago
            const freshActionCode = createMockActionCode({ timestamp: freshTimestamp });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(freshActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('active'); // Should be active since it's not expired

            // Test expired code
            const expiredTimestamp = now - 180000; // 3 minutes ago (expired)
            const expiredActionCode = createMockActionCode({ timestamp: expiredTimestamp });

            mockActionCodeFromEncoded.mockReturnValue(expiredActionCode);

            const expiredResponse = await POST(request);
            const expiredData = await expiredResponse.json();

            expect(expiredResponse.status).toBe(200);
            expect(expiredData.status).toBe('expired');
            expect(expiredData.remainingInSeconds).toBe(0);
        });
    });

    describe('🔒 Security & Validation Tests', () => {
        it('4. Invalid or malformed code input', async () => {
            const invalidCodes = [
                '', // Empty
                '123', // Too short
                '123456789012345678901', // Too long (21 chars)
                '1234567a', // Non-numeric
            ];

            for (const invalidCode of invalidCodes) {
                const request = createMockRequest({ code: invalidCode });
                const response = await POST(request);
                const data = await response.json();

                expect(response.status).toBe(400);
                expect(data.code).toBe('INVALID_PAYLOAD');
            }
        });

        it('5. Wrong code returns 404', async () => {
            const wrongCode = '87654321';
            const wrongCodeHash = sha256(wrongCode);

            mockRedis.get.mockResolvedValue(null);

            const request = createMockRequest({ code: wrongCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.code).toBe('CODE_NOT_FOUND');
            expect(data.message).toBe('Code not found or expired');
            expect(mockRedis.get).toHaveBeenCalledWith(getKey(wrongCodeHash));
        });

        it('6. Code present but decryption fails', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockImplementation(() => {
                throw new Error('Decryption failed');
            });

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.code).toBe('INVALID_PAYLOAD');
            expect(data.message).toBe('Invalid code provided for decryption');
        });
    });

    describe('🕒 Timing & Expiry Tests', () => {
        it('7. Expired code returns status = expired', async () => {
            const expiredTimestamp = now - 180000; // 3 minutes ago (expired)
            const expiredActionCode = createMockActionCode({ timestamp: expiredTimestamp });
            const expiredExpiresAt = expiredTimestamp + 120000;

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(expiredActionCode));

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('expired');
            expect(data.remainingInSeconds).toBe(0);
            expect(data.expiresAt).toBe(expiredExpiresAt);
        });

        it('8. Code close to expiry returns low remaining time', async () => {
            const nearExpiryTimestamp = now - 110000; // 10 seconds from expiry
            const nearExpiryActionCode = createMockActionCode({ timestamp: nearExpiryTimestamp });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(nearExpiryActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.remainingInSeconds).toBe(10);
            expect(data.status).toBe('active');
        });
    });

    describe('🧪 Edge Cases', () => {
        it('9. Decrypted ActionCode missing required fields', async () => {
            const incompleteActionCode = {
                // Missing required fields like timestamp, pubkey, chain
                metadata: { description: 'test' },
            } as any; // Use any to bypass type checking for this test

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(incompleteActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400); // Should fail validation due to missing required fields
            expect(data.code).toBe('INVALID_PAYLOAD');
        });

        it('10. Code resolves successfully but has no metadata', async () => {
            const actionCodeWithoutMeta = createMockActionCode({ metadata: undefined });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(actionCodeWithoutMeta);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.metadata).toBeUndefined();
        });

        it('11. Code resolves but transaction is not attached yet', async () => {
            const actionCodeWithoutTransaction = createMockActionCode({ transaction: undefined });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(actionCodeWithoutTransaction);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.transaction).toBeUndefined();
            expect(data.status).toBe('active');
        });

        it('12. Invalid JSON in request body', async () => {
            const request = {
                json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
            } as any;

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.code).toBe('INVALID_PAYLOAD');
            expect(data.message).toBe('Invalid JSON in request body');
        });

        it('13. Malformed decrypted data (not JSON)', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('invalid-json-data');
            mockActionCodeFromEncoded.mockImplementation(() => {
                throw new Error('Invalid encoded data');
            });

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.code).toBe('INVALID_PAYLOAD');
            expect(data.message).toBe('Invalid code provided for decryption');
        });

        it('14. Decrypted data is not an object', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue('string-value' as any); // Return string instead of object

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.code).toBe('INVALID_PAYLOAD');
            expect(data.message).toBe('Invalid action code format');
        });
    });

    describe('📦 Optional / Bonus Tests', () => {
        it('15. Multiple requests to same code return consistent output', async () => {
            const mockActionCode = createMockActionCode();
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(mockActionCode);

            const request = createMockRequest({ code: validCode });

            // First request
            const response1 = await POST(request);
            const data1 = await response1.json();

            // Second request
            const response2 = await POST(request);
            const data2 = await response2.json();

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(data1).toEqual(data2); // Should be identical
            expect(mockRedis.get).toHaveBeenCalledTimes(2);
        });

        it('16. Hash in response matches derived hash from code', async () => {
            const mockActionCode = createMockActionCode();
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(mockActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.codeHash).toBe(sha256(validCode));
        });

        it('17. Edge case: exactly at expiry time', async () => {
            const exactExpiryTimestamp = now - 120000; // Exactly 2 minutes ago
            const exactExpiryActionCode = createMockActionCode({ timestamp: exactExpiryTimestamp });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('decrypted-encoded-data');
            mockActionCodeFromEncoded.mockReturnValue(exactExpiryActionCode);

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('expired');
            expect(data.remainingInSeconds).toBe(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown errors gracefully', async () => {
            mockRedis.get.mockImplementation(() => {
                throw new Error('Redis connection failed');
            });

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.code).toBe('UNKNOWN_ERROR');
            expect(data.message).toBe('Unknown error');
        });

        it('should preserve ActionCodesRelayerError status codes', async () => {
            const { ActionCodesRelayerError } = require('@actioncodes/relayer/utils/error');

            mockRedis.get.mockImplementation(() => {
                throw new ActionCodesRelayerError('CODE_EXPIRED', 'Code expired', 410);
            });

            const request = createMockRequest({ code: validCode });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(410);
            expect(data.code).toBe('CODE_EXPIRED');
            expect(data.message).toBe('Code expired');
        });
    });
}); 