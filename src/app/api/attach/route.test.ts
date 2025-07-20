import { NextRequest } from 'next/server';
import { POST } from './route';
import { sha256 } from 'js-sha256';

// Mock dependencies
jest.mock('@actioncodes/relayer/utils/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    set: jest.fn(),
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
    isChainSupported: jest.fn(),
    getChainAdapter: jest.fn(),
    getConfig: jest.fn(() => ({ codeTTL: 300000 })), // 5 minutes
    createProtocolMeta: jest.fn(),
    encodeProtocolMeta: jest.fn(),
    attachTransaction: jest.fn(),
  },
}));

jest.mock('@actioncodes/relayer/config/keys', () => ({
  __esModule: true,
  getProtocolKeypairs: jest.fn(() => [
    {
      publicKey: { toBase58: () => 'test-public-key-1' },
      privateKey: 'test-private-key-1',
    },
  ]),
}));

jest.mock('@actioncodes/protocol', () => ({
  ...jest.requireActual('@actioncodes/protocol'),
  CodeGenerator: {
    ...jest.requireActual('@actioncodes/protocol').CodeGenerator,
    validateCode: jest.fn().mockReturnValue(true),
    validateCodeFormat: jest.fn().mockReturnValue(true),
  },
  ActionCode: {
    fromPayload: jest.fn().mockImplementation((fields) => ({
      code: fields.code,
      pubkey: fields.pubkey,
      timestamp: fields.timestamp,
      chain: fields.chain,
      prefix: fields.prefix,
      signature: fields.signature,
      status: fields.status,
      expiresAt: fields.expiresAt,
      transaction: fields.transaction,
      metadata: fields.metadata,
    })),
  },
  CODE_LENGTH: 8,
  MAX_PREFIX_LENGTH: 12,
  MIN_PREFIX_LENGTH: 3,
  SUPPORTED_CHAINS: ['solana', 'evm'],
}));

const mockRedisModule = require('@actioncodes/relayer/utils/redis');
const mockRedis = mockRedisModule.default;
const mockSecure = require('@actioncodes/relayer/utils/secure');
const mockProtocol = require('@actioncodes/relayer/protocol/protocol').default;

describe('POST /api/attach', () => {
  const mockActionCode = {
    code: '12345678',
    pubkey: '11111111111111111111111111111112',
    timestamp: Date.now() - 60000, // 1 minute ago
    chain: 'solana',
    prefix: 'DEFAULT',
    signature: 'test-signature',
    status: 'pending',
    expiresAt: Date.now() + 240000, // 4 minutes from now
    transaction: undefined,
    meta: undefined,
  };

  const mockEncryptedActionCode = 'encrypted-action-code-data';
  const mockDecryptedActionCode = JSON.stringify(mockActionCode);

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockRedis.get.mockResolvedValue(mockEncryptedActionCode);
    mockSecure.decryptField.mockReturnValue(mockDecryptedActionCode);
    mockSecure.encryptField.mockReturnValue('new-encrypted-data');
    mockProtocol.isChainSupported.mockReturnValue(true);
    mockProtocol.getChainAdapter.mockReturnValue({
      signWithProtocolKey: jest.fn().mockResolvedValue({
        ...mockActionCode,
        transaction: {
          transaction: 'base64-transaction-data',
          txType: 'transfer',
          protocolMeta: 'encoded-protocol-meta',
        },
        status: 'resolved',
        expiresAt: Date.now() + 240000,
      }),
    });
    mockProtocol.attachTransaction.mockReturnValue({
      ...mockActionCode,
      transaction: {
        transaction: 'base64-transaction-data',
        txType: 'transfer',
      },
    });
    mockRedis.set.mockResolvedValue('OK');
  });

  const createRequest = (body: any): NextRequest => {
    return new NextRequest('http://localhost:3000/api/attach', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  describe('✅ Core Functionality Tests', () => {
    test('1. Successfully attaches transaction to valid action code', async () => {
      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh', // base64 encoded
        meta: {
          title: 'Test Transaction',
          description: 'Test transaction description',
          params: { amount: 100 },
        },
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toMatchObject({
        status: 'success',
        codeHash: sha256('12345678'),
        chain: 'solana',
        actionCodeStatus: 'resolved',
        hasTransaction: true,
      });
      expect(responseData.expiresAt).toBeGreaterThan(Date.now());
    });

    test('2. Attaches transaction without optional meta fields', async () => {
      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('success');
      expect(responseData.hasTransaction).toBe(true);
    });
  });

  describe('🔒 Security & Validation Tests', () => {
    test('3. Rejects invalid code format', async () => {
      const requestBody = {
        code: 'invalid',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });

    test('4. Rejects invalid transaction format (not base64)', async () => {
      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'invalid-base64!@#',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });

    test('5. Rejects unsupported chain', async () => {
      const requestBody = {
        code: '12345678',
        chain: 'unsupported',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
    });

    test('6. Rejects when code not found in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(404);
      expect(responseData.code).toBe('CODE_NOT_FOUND');
    });

    test('7. Rejects when transaction already attached', async () => {
      const actionCodeWithTransaction = {
        ...mockActionCode,
        transaction: {
          transaction: 'existing-transaction',
          txType: 'transfer',
        },
      };

      mockSecure.decryptField.mockReturnValue(JSON.stringify(actionCodeWithTransaction));

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(409);
      expect(responseData.code).toBe('TX_ALREADY_ATTACHED');
    });
  });

  describe('🕒 Timing & Expiry Tests', () => {
    test('8. Rejects expired action code', async () => {
      const expiredActionCode = {
        ...mockActionCode,
        timestamp: Date.now() - 400000, // 6+ minutes ago
      };

      mockSecure.decryptField.mockReturnValue(JSON.stringify(expiredActionCode));

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(410);
      expect(responseData.code).toBe('CODE_EXPIRED');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/attach', {
        method: 'POST',
        body: 'invalid-json',
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid JSON in request body');
    });

    test('should handle unknown errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: 'dGVzdC10cmFuc2FjdGlvbi1kYXRh',
      };

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe('UNKNOWN_ERROR');
    });
  });
}); 