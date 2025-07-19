import { NextRequest } from 'next/server';
import { POST } from './route';
import { ActionCodesRelayerError } from '@actioncodes/relayer/utils/error';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { CODE_TTL } from '@actioncodes/relayer/config/constants';

// Mock dependencies
jest.mock('@actioncodes/relayer/utils/redis', () => ({
  __esModule: true,
  default: {
    set: jest.fn().mockResolvedValue('OK'),
  },
  getKey: jest.fn((key: string) => `test:${key}`),
}));

jest.mock('@actioncodes/relayer/protocol/protocol', () => ({
  __esModule: true,
  default: {
    isChainSupported: jest.fn().mockReturnValue(true),
    getChainAdapter: jest.fn().mockReturnValue({
      verifyCodeSignature: jest.fn().mockReturnValue(true),
    }),
    createActionCode: jest.fn().mockResolvedValue({
      codeHash: 'test-code-hash',
      timestamp: 1234567890,
      remainingTime: 120000, // 2 minutes (CODE_TTL)
      status: 'pending',
      encoded: 'test-encoded-data',
      code: '12345678',
    }),
    getConfig: jest.fn().mockReturnValue({
      codeTTL: 120000, // 2 minutes (CODE_TTL)
    }),
  },
}));

jest.mock('@actioncodes/relayer/utils/secure', () => ({
  encryptField: jest.fn().mockReturnValue('encrypted-data'),
}));

// Mock CodeGenerator.validateCode to return true for valid codes
jest.mock('@actioncodes/protocol', () => ({
  ...jest.requireActual('@actioncodes/protocol'),
  CodeGenerator: {
    ...jest.requireActual('@actioncodes/protocol').CodeGenerator,
    validateCode: jest.fn().mockReturnValue(true),
  },
  CODE_LENGTH: 8,
  MAX_PREFIX_LENGTH: 10,
  MIN_PREFIX_LENGTH: 1,
}));

describe('POST /api/register', () => {
  let keypair: Keypair;
  let validTimestamp: number;
  let validCode: string;

  beforeEach(() => {
    keypair = Keypair.generate();
    validTimestamp = Date.now();
    validCode = '12345678'; // Use a simple valid code
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset protocol mocks to default values
    const { default: protocol } = require('@actioncodes/relayer/protocol/protocol');
    protocol.isChainSupported.mockReturnValue(true);
    protocol.getChainAdapter.mockReturnValue({
      verifyCodeSignature: jest.fn().mockReturnValue(true),
    });
    protocol.createActionCode.mockResolvedValue({
      codeHash: 'test-code-hash',
      timestamp: 1234567890,
      remainingTime: 120000, // 2 minutes (CODE_TTL)
      status: 'pending',
      encoded: 'test-encoded-data',
      code: validCode,
    });
    protocol.getConfig.mockReturnValue({
      codeTTL: 120000, // 2 minutes (CODE_TTL)
    });
  });

  const createValidRequest = (overrides: any = {}) => {
    const signature = nacl.sign.detached(
      Buffer.from(validCode),
      keypair.secretKey
    );

    const pubkey = keypair.publicKey.toBase58();

    return {
      code: validCode,
      pubkey: pubkey,
      signature: Buffer.from(signature).toString('base64'),
      timestamp: validTimestamp,
      prefix: 'DEFAULT',
      chain: 'solana' as const,
      meta: {
        description: 'Test action code',
        params: { test: 'value' },
      },
      ...overrides,
    };
  };

  const createMockRequest = (body: any): NextRequest => {
    return {
      json: jest.fn().mockResolvedValue(body),
    } as any;
  };

  describe('successful registration', () => {
    it('should register a valid action code', async () => {
      const requestBody = createValidRequest();
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toMatchObject({
        codeHash: 'test-code-hash',
        issuedAt: 1234567890,
        remainingInSeconds: Math.floor(CODE_TTL / 1000),
        status: 'pending',
      });
      expect(responseData.expiresAt).toBe(1234567890 + CODE_TTL);
    });

    it('should register without optional fields', async () => {
      const requestBody = createValidRequest({
        prefix: undefined,
        meta: undefined,
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('pending');
    });

    it('should register with Solana chain (which is supported)', async () => {
      const requestBody = createValidRequest({
        chain: 'solana' as const,
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('pending');
      expect(responseData.codeHash).toBe('test-code-hash');
    });
  });

  describe('validation errors', () => {
    it('should reject invalid public key', async () => {
      const requestBody = createValidRequest({
        pubkey: 'invalid-public-key',
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid request payload');
    });

    it('should reject invalid code length', async () => {
      const requestBody = createValidRequest({
        code: '123', // Too short
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid request payload');
    });

    it('should reject invalid timestamp', async () => {
      const requestBody = createValidRequest({
        timestamp: -1, // Invalid timestamp
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid request payload');
    });

    it('should reject invalid chain', async () => {
      const requestBody = createValidRequest({
        chain: 'invalid-chain' as any,
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid request payload');
    });
  });

  describe('business logic errors', () => {
    it('should reject unsupported chain', async () => {
      const { default: protocol } = require('@actioncodes/relayer/protocol/protocol');
      protocol.isChainSupported.mockReturnValue(false);

      const requestBody = createValidRequest({
        chain: 'solana' as const, // Use solana but mock it as unsupported
      });
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('UNSUPPORTED_CHAIN');
      expect(responseData.message).toBe("Chain 'solana' is not supported");
    });

    it('should reject when action code creation fails', async () => {
      const { default: protocol } = require('@actioncodes/relayer/protocol/protocol');
      protocol.createActionCode.mockRejectedValue(new Error('Creation failed'));

      const requestBody = createValidRequest();
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe("Can't construct action code.");
    });
  });

  describe('error handling', () => {
    it('should handle empty request body', async () => {
      const request = {
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid JSON in request body');
      expect(responseData.details).toEqual({ details: 'Request body must be valid JSON' });
    });

    it('should handle malformed JSON', async () => {
      const request = {
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token in JSON at position 1')),
      } as any;

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.code).toBe('INVALID_PAYLOAD');
      expect(responseData.message).toBe('Invalid JSON in request body');
      expect(responseData.details).toEqual({ details: 'Request body must be valid JSON' });
    });

    it('should handle unknown errors', async () => {
      const { default: protocol } = require('@actioncodes/relayer/protocol/protocol');
      protocol.isChainSupported.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const requestBody = createValidRequest();
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.code).toBe('UNKNOWN_ERROR');
      expect(responseData.message).toBe('Unknown error');
    });

    it('should preserve ActionCodesRelayerError status codes', async () => {
      const { default: protocol } = require('@actioncodes/relayer/protocol/protocol');
      protocol.isChainSupported.mockImplementation(() => {
        throw new ActionCodesRelayerError('CODE_EXPIRED', 'Code expired', 410);
      });

      const requestBody = createValidRequest();
      const request = createMockRequest(requestBody);

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(410);
      expect(responseData.code).toBe('CODE_EXPIRED');
      expect(responseData.message).toBe('Code expired');
    });
  });
}); 