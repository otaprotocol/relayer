import { NextRequest } from 'next/server';
import { GET } from './route';
import { decryptField } from '@actioncodes/relayer/utils/secure';
import redis, { getKey } from '@actioncodes/relayer/utils/redis';
import { sha256 } from 'js-sha256';

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

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockDecryptField = decryptField as jest.MockedFunction<typeof decryptField>;

describe('GET /api/status/[code]', () => {
    const validCode = '12345678';
    const validCodeHash = sha256(validCode);
    const now = Date.now();
    const issuedAt = now - 60000; // 1 minute ago
    const expiresAt = issuedAt + 120000; // 2 minutes from issuedAt

    const createMockActionCode = (overrides: any = {}) => ({
        timestamp: issuedAt,
        pubkey: '9uVPTajxpMMvR9AKqhaqgSFS2AyybWanvEjnrvFfFehw',
        chain: 'solana',
        prefix: 'DEFAULT',
        meta: {
            description: 'Test action code',
            params: { test: 'value' },
        },
        ...overrides,
    });

    const createMockRequest = (code: string): NextRequest => {
        return {
            // Mock NextRequest properties as needed
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
        it('1. Valid code returns status information with pending status', async () => {
            const mockActionCode = createMockActionCode();
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue(JSON.stringify(mockActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toMatchObject({
                status: 'pending',
                expiresAt: expiresAt,
                hasTransaction: false,
            });
            expect(data.finalizedSignature).toBeUndefined();
            expect(mockRedis.get).toHaveBeenCalledWith(getKey(validCodeHash));
        });

        it('2. Code with attached transaction returns resolved status', async () => {
            const transaction = {
                transaction: 'test-transaction-data',
                txType: 'transfer',
            };
            const mockActionCode = createMockActionCode({ transaction });
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue(JSON.stringify(mockActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toMatchObject({
                status: 'resolved',
                expiresAt: expiresAt,
                hasTransaction: true,
            });
            expect(data.finalizedSignature).toBeUndefined();
        });

        it('3. Code with finalized transaction returns finalized status', async () => {
            const transaction = {
                transaction: 'test-transaction-data',
                txSignature: 'finalized-signature-123',
                txType: 'transfer',
            };
            const mockActionCode = createMockActionCode({ transaction });
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue(JSON.stringify(mockActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toMatchObject({
                status: 'finalized',
                expiresAt: expiresAt,
                hasTransaction: true,
                finalizedSignature: 'finalized-signature-123',
            });
        });

        it('4. Returns correct hasTransaction flag for different scenarios', async () => {
            // Test with no transaction
            const noTransactionActionCode = createMockActionCode();
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(noTransactionActionCode));

            let response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            let data = await response.json();

            expect(data.hasTransaction).toBe(false);

            // Test with transaction
            const withTransactionActionCode = createMockActionCode({
                transaction: { transaction: 'test-data' }
            });
            mockDecryptField.mockReturnValue(JSON.stringify(withTransactionActionCode));

            response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            data = await response.json();

            expect(data.hasTransaction).toBe(true);
        });
    });

    describe('🔒 Security & Validation Tests', () => {
        it('5. Invalid or malformed code parameter', async () => {
            const invalidCodes = [
                '', // Empty
                '123', // Too short
                '123456789012345678901', // Too long (21 chars)
                '1234567a', // Non-numeric
            ];

            for (const invalidCode of invalidCodes) {
                const response = await GET(createMockRequest(invalidCode), { params: { code: invalidCode } });
                const data = await response.json();

                expect(response.status).toBe(400);
                expect(data).toMatchObject({
                    error: 'Invalid code format',
                    status: 'error',
                });
            }
        });

        it('6. Code not found in Redis returns 404', async () => {
            const wrongCode = '87654321';

            mockRedis.get.mockResolvedValue(null);

            const response = await GET(createMockRequest(wrongCode), { params: { code: wrongCode } });
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data).toMatchObject({
                error: 'Code not found or expired',
                status: 'error',
            });
        });

        it('7. Code present but decryption fails', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockImplementation(() => {
                throw new Error('Decryption failed');
            });

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toMatchObject({
                error: 'Invalid code provided',
                status: 'error',
            });
        });
    });

    describe('🕒 Timing & Expiry Tests', () => {
        it('8. Expired code still returns status information', async () => {
            const expiredTimestamp = now - 180000; // 3 minutes ago (expired)
            const expiredActionCode = createMockActionCode({ timestamp: expiredTimestamp });
            const expiredExpiresAt = expiredTimestamp + 120000;

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(expiredActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.expiresAt).toBe(expiredExpiresAt);
            // Status should still be determined by transaction state, not expiry
            expect(data.status).toBe('pending');
        });

        it('9. Code close to expiry returns correct expiresAt', async () => {
            const nearExpiryTimestamp = now - 110000; // 10 seconds from expiry
            const nearExpiryActionCode = createMockActionCode({ timestamp: nearExpiryTimestamp });
            const nearExpiryExpiresAt = nearExpiryTimestamp + 120000;

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(nearExpiryActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.expiresAt).toBe(nearExpiryExpiresAt);
        });
    });

    describe('🧪 Edge Cases', () => {
        it('10. Decrypted ActionCode missing required fields', async () => {
            const incompleteActionCode = {
                // Missing required fields like timestamp, pubkey, chain
                meta: { description: 'test' },
            };

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(incompleteActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200); // Should still work as we only need basic structure
            expect(data.status).toBe('pending');
        });

        it('11. ActionCode with no metadata still works', async () => {
            const actionCodeWithoutMeta = createMockActionCode({ meta: undefined });

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(actionCodeWithoutMeta));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe('pending');
        });

        it('12. Malformed decrypted data (not JSON)', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('invalid-json-data');

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toMatchObject({
                error: 'Invalid code provided',
                status: 'error',
            });
        });

        it('13. Decrypted data is not an object', async () => {
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue('"string-value"'); // JSON string, not object

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data).toMatchObject({
                error: 'Invalid action code format',
                status: 'error',
            });
        });

        it('14. Transaction object with only txSignature (no transaction)', async () => {
            const transaction = {
                txSignature: 'signature-only',
            };
            const mockActionCode = createMockActionCode({ transaction });
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue(JSON.stringify(mockActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toMatchObject({
                status: 'finalized', // Should be finalized since it has txSignature
                hasTransaction: false, // But no transaction data
                finalizedSignature: 'signature-only',
            });
        });

        it('15. Future-dated timestamp is handled safely', async () => {
            const futureTimestamp = now + 60000; // 1 minute in the future
            const futureActionCode = createMockActionCode({ timestamp: futureTimestamp });
            const futureExpiresAt = futureTimestamp + 120000;

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(futureActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.expiresAt).toBe(futureExpiresAt);
            expect(data.status).toBe('pending'); // Status should still be determined by transaction state
            // Should not crash or behave unexpectedly with future timestamps
        });

        it('16. Corrupted ActionCode with invalid status enum is handled gracefully', async () => {
            const corruptedActionCode = {
                timestamp: issuedAt,
                pubkey: '9uVPTajxpMMvR9AKqhaqgSFS2AyybWanvEjnrvFfFehw',
                chain: 'solana',
                // Corrupted: has an invalid status field that doesn't match our enum
                status: 'corrupted_status_value',
                transaction: {
                    transaction: 'test-data',
                    txSignature: 'test-signature',
                },
            };
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(corruptedActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            // Should ignore the corrupted status field and determine status from transaction state
            expect(data.status).toBe('finalized'); // Based on txSignature presence
            expect(data.hasTransaction).toBe(true);
            expect(data.finalizedSignature).toBe('test-signature');
        });
    });

    describe('📦 Optional / Bonus Tests', () => {
        it('17. Multiple requests to same code return consistent output', async () => {
            const mockActionCode = createMockActionCode();
            const encryptedData = 'encrypted-data';

            mockRedis.get.mockResolvedValue(encryptedData);
            mockDecryptField.mockReturnValue(JSON.stringify(mockActionCode));

            // First request
            const response1 = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data1 = await response1.json();

            // Second request
            const response2 = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data2 = await response2.json();

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(data1).toEqual(data2); // Should be identical
            expect(mockRedis.get).toHaveBeenCalledTimes(2);
        });

        it('18. Status transitions work correctly', async () => {
            // Test pending -> resolved transition
            const pendingActionCode = createMockActionCode();
            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(pendingActionCode));

            let response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            let data = await response.json();
            expect(data.status).toBe('pending');

            // Test resolved state
            const resolvedActionCode = createMockActionCode({
                transaction: { transaction: 'test-data' }
            });
            mockDecryptField.mockReturnValue(JSON.stringify(resolvedActionCode));

            response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            data = await response.json();
            expect(data.status).toBe('resolved');

            // Test finalized state
            const finalizedActionCode = createMockActionCode({
                transaction: { 
                    transaction: 'test-data',
                    txSignature: 'final-signature'
                }
            });
            mockDecryptField.mockReturnValue(JSON.stringify(finalizedActionCode));

            response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            data = await response.json();
            expect(data.status).toBe('finalized');
        });

        it('19. Edge case: exactly at expiry time', async () => {
            const exactExpiryTimestamp = now - 120000; // Exactly 2 minutes ago
            const exactExpiryActionCode = createMockActionCode({ timestamp: exactExpiryTimestamp });
            const exactExpiryExpiresAt = exactExpiryTimestamp + 120000;

            mockRedis.get.mockResolvedValue('encrypted-data');
            mockDecryptField.mockReturnValue(JSON.stringify(exactExpiryActionCode));

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.expiresAt).toBe(exactExpiryExpiresAt);
            expect(data.status).toBe('pending'); // Status based on transaction, not expiry
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown errors gracefully', async () => {
            mockRedis.get.mockImplementation(() => {
                throw new Error('Redis connection failed');
            });

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data).toMatchObject({
                error: 'Unknown error occurred',
                status: 'error',
            });
        });

        it('should preserve ActionCodesRelayerError status codes', async () => {
            const { ActionCodesRelayerError } = require('@actioncodes/relayer/utils/error');

            mockRedis.get.mockImplementation(() => {
                throw new ActionCodesRelayerError('CODE_EXPIRED', 'Code expired', 410);
            });

            const response = await GET(createMockRequest(validCode), { params: { code: validCode } });
            const data = await response.json();

            expect(response.status).toBe(410);
            expect(data).toMatchObject({
                error: 'Code expired',
                status: 'error',
            });
        });
    });
}); 