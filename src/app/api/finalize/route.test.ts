import { NextRequest } from 'next/server';
import { POST } from './route';
import { ActionCodesRelayerError } from '@actioncodes/relayer/utils/error';
import { sha256 } from 'js-sha256';
import { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { CODE_TTL } from '@actioncodes/relayer/config/constants';
import bs58 from 'bs58';

// Mock dependencies
jest.mock('@actioncodes/relayer/utils/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
  },
  getKey: jest.fn((hash: string) => `actioncode:${hash}`),
}));

jest.mock('@actioncodes/relayer/utils/secure', () => ({
  __esModule: true,
  decryptField: jest.fn(),
  encryptField: jest.fn(),
}));

jest.mock('@actioncodes/relayer/protocol/protocol', () => ({
  __esModule: true,
  default: {
    getConfig: jest.fn(() => ({ codeTTL: CODE_TTL })),
    getChainAdapter: jest.fn(),
  },
  solanaConnection: {
    getTransaction: jest.fn(),
  },
}));

jest.mock('@actioncodes/protocol', () => ({
  ...jest.requireActual('@actioncodes/protocol'),
  CodeGenerator: {
    ...jest.requireActual('@actioncodes/protocol').CodeGenerator,
    validateCodeFormat: jest.fn().mockReturnValue(true),
  },
  ActionCode: {
    fromEncoded: jest.fn().mockImplementation((encoded) => ({
      code: '12345678',
      pubkey: '11111111111111111111111111111112',
      timestamp: Date.now() - 60000, // 1 minute ago
      chain: 'solana',
      prefix: 'DEFAULT',
      signature: 'test-signature',
      status: 'resolved',
      expiresAt: Date.now() + 240000, // 4 minutes from now
      transaction: {
        transaction: 'base64-transaction-data',
        txType: 'transfer',
      },
      meta: {
        description: 'Test action code',
        params: { test: 'value' },
      },
      json: {
        code: '12345678',
        pubkey: '11111111111111111111111111111112',
        timestamp: Date.now() - 60000,
        chain: 'solana',
        prefix: 'DEFAULT',
        signature: 'test-signature',
        status: 'resolved',
        expiresAt: Date.now() + 240000,
        transaction: {
          transaction: 'base64-transaction-data',
          txType: 'transfer',
        },
        meta: {
          description: 'Test action code',
          params: { test: 'value' },
        },
      },
      encoded: 'mock-encoded-action-code',
    })),
    fromPayload: jest.fn().mockImplementation((payload) => {
      // Add txSignature to the transaction if it's not already there
      const updatedPayload = {
        ...payload,
        transaction: {
          ...payload.transaction,
          txSignature: payload.transaction?.txSignature || '42bHReo7rqAsAhTm6Ertbrnw8uCy6WfthakuvViW6q5GU5zg5jTBoTmRd6RJFpXTPGfYgSKqJUzqSWcn6GaByLr8',
        },
      };
      return {
        ...updatedPayload,
        encoded: JSON.stringify(updatedPayload),
      };
    }),
  },
  CODE_LENGTH: 8,
  MAX_PREFIX_LENGTH: 10,
}));

const mockRedisModule = require('@actioncodes/relayer/utils/redis');
const mockRedis = mockRedisModule.default;
const mockSecure = require('@actioncodes/relayer/utils/secure');
const mockProtocol = require('@actioncodes/relayer/protocol/protocol').default;
const mockSolanaConnection = require('@actioncodes/relayer/protocol/protocol').solanaConnection;

describe('POST /api/finalize', () => {
  const validCode = '12345678';
  const validSignature = '42bHReo7rqAsAhTm6Ertbrnw8uCy6WfthakuvViW6q5GU5zg5jTBoTmRd6RJFpXTPGfYgSKqJUzqSWcn6GaByLr8';
  const validTransaction = {
    signatures: [validSignature],
    message: {
      accountKeys: [],
      recentBlockhash: '1234567890',
      instructions: [],
    },
  };

  const mockActionCode = {
    code: validCode,
    pubkey: '11111111111111111111111111111112',
    timestamp: Date.now() - 60000, // 1 minute ago
    chain: 'solana',
    prefix: 'DEFAULT',
    signature: 'test-signature',
    status: 'resolved',
    expiresAt: Date.now() + 240000, // 4 minutes from now
    transaction: {
      transaction: 'base64-transaction-data',
      txType: 'transfer',
    },
    meta: {
      description: 'Test action code',
      params: { test: 'value' },
    },
  };

  const mockEncryptedActionCode = 'encrypted-action-code-data';
  const mockDecryptedActionCode = JSON.stringify(mockActionCode);

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockRedis.get.mockResolvedValue(mockEncryptedActionCode);
    mockSecure.decryptField.mockReturnValue('decrypted-encoded-data');
    mockSecure.encryptField.mockReturnValue('new-encrypted-data');
    mockProtocol.getConfig.mockReturnValue({ codeTTL: CODE_TTL });
    mockProtocol.getChainAdapter.mockReturnValue({
      verifyFinalizedTransaction: jest.fn().mockReturnValue(true),
    });
    mockSolanaConnection.getTransaction.mockResolvedValue({
      ...validTransaction,
      meta: { err: null }, // Transaction succeeded
    });
  });

  const createRequest = (body: any): NextRequest => {
    return new NextRequest('http://localhost:3000/api/finalize', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  const createValidRequest = (overrides: any = {}) => {
    return {
      code: validCode,
      signature: validSignature,
      ...overrides,
    };
  };

  describe('✅ Core Functionality Tests', () => {
    test('1. Successfully finalizes a valid action code', async () => {
      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toMatchObject({
        status: 'success',
        finalizedSignature: validSignature,
      });
      expect(responseData.expiresAt).toBeGreaterThan(Date.now());
    });

    test('2. Updates action code status to finalized', async () => {
      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      await POST(request);

      // Verify that the action code was updated with finalized status
      expect(mockSecure.encryptField).toHaveBeenCalledWith(
        expect.stringContaining('"status":"finalized"'),
        validCode
      );
    });

    test('3. Adds transaction signature to action code', async () => {
      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      await POST(request);

      // Verify that the transaction signature was added
      expect(mockSecure.encryptField).toHaveBeenCalledWith(
        expect.stringContaining(`"txSignature":"${validSignature}"`),
        validCode
      );
    });

    test('4. Re-encrypts and stores updated action code', async () => {
      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      await POST(request);

      expect(mockSecure.encryptField).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `actioncode:${sha256(validCode)}`,
        'new-encrypted-data',
        { ex: CODE_TTL / 1000 }
      );
    });
  });

  describe('🔒 Security & Validation Tests', () => {
    test('5. Rejects invalid code format', async () => {
      const requestBody = createValidRequest({
        code: 'invalid',
      });
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });

    test('6. Rejects invalid signature format', async () => {
      const requestBody = createValidRequest({
        signature: 'invalid-signature',
      });
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });

    test('7. Rejects invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/finalize', {
        method: 'POST',
        body: 'invalid-json',
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid JSON in request body');
    });

    test('8. Rejects missing required fields', async () => {
      const requestBody = { code: validCode }; // Missing signature
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('🔍 Business Logic Tests', () => {
    test('9. Rejects when code not found in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(404);
      expect(responseData.code).toBe('CODE_NOT_FOUND');
      expect(responseData.message).toBe('Code not found or expired');
    });

    test('10. Rejects when code is expired', async () => {
      const expiredActionCode = {
        ...mockActionCode,
        timestamp: Date.now() - (CODE_TTL + 60000), // Expired
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(expiredActionCode);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(410);
      expect(responseData.code).toBe('CODE_EXPIRED');
      expect(responseData.message).toBe('Action code has expired');
    });

    test('11. Rejects when no transaction is attached', async () => {
      const actionCodeWithoutTx = {
        ...mockActionCode,
        transaction: undefined,
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(actionCodeWithoutTx);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('TX_MISSING');
      expect(responseData.message).toBe('No transaction attached to this action code');
    });

    test('12. Rejects when already finalized', async () => {
      const finalizedActionCode = {
        ...mockActionCode,
        transaction: {
          ...mockActionCode.transaction,
          txSignature: 'already-finalized-signature',
        },
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(finalizedActionCode);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(409);
      expect(responseData.code).toBe('TX_ALREADY_ATTACHED');
      expect(responseData.message).toBe('Action code is already finalized');
    });

    test('13. Rejects when action code missing chain information', async () => {
      const actionCodeWithoutChain = {
        ...mockActionCode,
        chain: undefined,
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(actionCodeWithoutChain);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Action code missing chain information');
    });

    test('14. Rejects unsupported chain', async () => {
      const unsupportedChainActionCode = {
        ...mockActionCode,
        chain: 'unsupported-chain',
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(unsupportedChainActionCode);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('UNSUPPORTED_CHAIN');
      expect(responseData.message).toBe("Chain 'unsupported-chain' is not supported for finalization");
    });
  });

  describe('🔗 Blockchain Verification Tests', () => {
    test('15. Rejects when transaction not found on blockchain', async () => {
      mockSolanaConnection.getTransaction.mockResolvedValue(null);

      // Ensure ActionCode.fromEncoded returns a valid action code with solana chain
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        chain: 'solana',
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('SIGNATURE_INVALID');
      expect(responseData.message).toBe('Transaction not found on blockchain');
    });

    test('16. Rejects when transaction failed on blockchain', async () => {
      mockSolanaConnection.getTransaction.mockResolvedValue({
        ...validTransaction,
        meta: { err: 'Transaction failed' },
      });

      // Ensure ActionCode.fromEncoded returns a valid action code with solana chain
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        chain: 'solana',
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('SIGNATURE_INVALID');
      expect(responseData.message).toBe('Transaction failed on blockchain');
    });

    test('17. Rejects when transaction verification fails', async () => {
      mockProtocol.getChainAdapter.mockReturnValue({
        verifyFinalizedTransaction: jest.fn().mockReturnValue(false),
      });

      // Ensure ActionCode.fromEncoded returns a valid action code with solana chain
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        chain: 'solana',
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('SIGNATURE_INVALID');
      expect(responseData.message).toBe('Transaction is not valid for this action code');
    });

    test('18. Handles blockchain verification errors gracefully', async () => {
      mockSolanaConnection.getTransaction.mockRejectedValue(new Error('Network error'));

      // Ensure ActionCode.fromEncoded returns a valid action code with solana chain
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        chain: 'solana',
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('SIGNATURE_INVALID');
      expect(responseData.message).toBe('Failed to verify transaction signature');
    });
  });

  describe('🔐 Encryption/Decryption Tests', () => {
    test('19. Rejects when decryption fails', async () => {
      mockSecure.decryptField.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid code provided for decryption');
    });

    test('20. Rejects when decrypted data is invalid JSON', async () => {
      // Mock ActionCode.fromEncoded to throw an error
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid code provided for decryption');
    });

    test('21. Rejects when decrypted action code has invalid structure', async () => {
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockImplementation(() => {
        throw new Error('Invalid action code format');
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid code provided for decryption');
    });
  });

  describe('⚡ Error Handling Tests', () => {
    test('22. Handles Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe('UNKNOWN_ERROR');
    });

    test('23. Handles encryption errors gracefully', async () => {
      // Reset all mocks to ensure clean state
      jest.clearAllMocks();
      
      // Set up the mocks needed for this test
      mockRedis.get.mockResolvedValue(mockEncryptedActionCode);
      mockSecure.decryptField.mockReturnValue('decrypted-encoded-data');
      mockSecure.encryptField.mockImplementation(() => {
        throw new Error('Encryption failed');
      });
      mockProtocol.getConfig.mockReturnValue({ codeTTL: CODE_TTL });
      mockProtocol.getChainAdapter.mockReturnValue({
        verifyFinalizedTransaction: jest.fn().mockReturnValue(true),
      });
      mockSolanaConnection.getTransaction.mockResolvedValue({
        ...validTransaction,
        meta: { err: null },
      });

      // Ensure ActionCode.fromEncoded is properly mocked
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        chain: 'solana',
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe('UNKNOWN_ERROR');
    });

    test('24. Handles unknown errors gracefully', async () => {
      mockRedis.get.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('🎯 Edge Cases', () => {
    test('25. Handles action code with minimal required fields', async () => {
      const minimalActionCode = {
        code: validCode,
        timestamp: Date.now() - 60000,
        chain: 'solana',
        transaction: {
          transaction: 'base64-data',
        },
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(minimalActionCode);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('success');
    });

    test('26. Handles action code with additional fields', async () => {
      const extendedActionCode = {
        ...mockActionCode,
        extraField: 'extra-value',
        nestedField: { nested: 'value' },
        // Ensure no txSignature to avoid "already finalized" error
        transaction: {
          ...mockActionCode.transaction,
          txSignature: undefined,
        },
      };
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(extendedActionCode);

      const requestBody = createValidRequest();
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('success');
    });

    test('27. Validates signature length correctly', async () => {
      // Create a valid base58 signature of exactly 64 bytes
      const validBytes = new Uint8Array(64).fill(1);
      const validSignature64 = bs58.encode(validBytes);

      // Ensure ActionCode.fromEncoded returns a valid action code without txSignature
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        transaction: {
          ...mockActionCode.transaction,
          txSignature: undefined,
        },
      });

      const requestBody = createValidRequest({
        signature: validSignature64,
      });
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('success');
    });

    test('28. Rejects signature with wrong length', async () => {
      // Create a base58 signature of wrong length (32 bytes instead of 64)
      const invalidBytes = new Uint8Array(32).fill(1);
      const invalidSignature = bs58.encode(invalidBytes);

      const requestBody = createValidRequest({
        signature: invalidSignature,
      });
      const request = createRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });
  });
});