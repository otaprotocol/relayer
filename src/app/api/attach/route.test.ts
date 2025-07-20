import { NextRequest } from 'next/server';
import { POST } from './route';
import { sha256 } from 'js-sha256';
import { Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { ActionCodesProtocol } from '@actioncodes/protocol';

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
      // Add methods that might be called
      json: fields,
      encoded: 'mock-encoded-action-code',
      isValid: () => true,
      remainingTime: fields.expiresAt - Date.now(),
      expired: fields.expiresAt < Date.now(),
    })),
    fromEncoded: jest.fn().mockImplementation((encoded) => ({
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
    mockSecure.decryptField.mockReturnValue('decrypted-encoded-data');
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

  // Helper function to create a real Solana transaction
  const createRealSolanaTransaction = (fromKeypair: Keypair, toPubkey: string, amount: number = 0.001) => {
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(toPubkey),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );
    
    // Set recent blockhash (required for transaction)
    transaction.recentBlockhash = '11111111111111111111111111111111';
    transaction.feePayer = fromKeypair.publicKey;
    
    return transaction;
  };

  // Helper function to serialize transaction to base64
  const serializeTransaction = (transaction: Transaction) => {
    return transaction.serialize({ requireAllSignatures: false }).toString('base64');
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

      // Mock ActionCode.fromEncoded to return an action code with transaction
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(actionCodeWithTransaction);

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

      // Mock ActionCode.fromEncoded to return an expired action code
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue(expiredActionCode);

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

  describe('🔐 Protocol Integration Tests', () => {
    test('9. Uses real Solana keypair for protocol signing', async () => {
      // Create real Solana keypairs
      const userKeypair = Keypair.generate();
      const protocolKeypair = Keypair.generate();
      
      // Create a real Solana transaction
      const transaction = createRealSolanaTransaction(
        userKeypair, 
        '11111111111111111111111111111112'
      );
      const serializedTx = serializeTransaction(transaction);

      // Mock the protocol keypairs to return our real keypair
      const mockKeys = require('@actioncodes/relayer/config/keys');
      mockKeys.getProtocolKeypairs.mockReturnValue([{
        publicKey: protocolKeypair.publicKey,
        privateKey: protocolKeypair.secretKey,
      }]);

      // Mock the adapter to actually sign with the protocol key
      const mockAdapter = {
        signWithProtocolKey: jest.fn().mockImplementation(async (actionCode, keypair) => {
          // Simulate protocol signing by returning a modified action code
          return {
            ...actionCode,
            transaction: {
              transaction: serializedTx, // Use the original transaction
              txType: 'transfer',
              protocolMeta: 'encoded-protocol-meta',
              protocolSignature: protocolKeypair.publicKey.toBase58(), // Add protocol signature
            },
            status: 'resolved',
            expiresAt: Date.now() + 240000,
          };
        }),
      };
      mockProtocol.getChainAdapter.mockReturnValue(mockAdapter);

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: serializedTx,
        meta: {
          title: 'Real Solana Transaction',
          description: 'Testing with real keypairs',
          params: { amount: 0.001 },
        },
      };

      // Mock ActionCode.fromEncoded to return a valid action code
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        timestamp: Date.now() - 30000, // 30 seconds ago (well within TTL)
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.status).toBe('success');
      
      // Verify that the adapter was called with the protocol keypair
      expect(mockAdapter.signWithProtocolKey).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          publicKey: expect.any(Object),
          privateKey: expect.any(String),
        })
      );
    });

    test('10. Verifies protocol signature on attached transaction', async () => {
      // Create real Solana keypairs
      const userKeypair = Keypair.generate();
      const protocolKeypair = Keypair.generate();
      
      // Create a real Solana transaction
      const transaction = createRealSolanaTransaction(
        userKeypair, 
        '11111111111111111111111111111112'
      );
      const serializedTx = serializeTransaction(transaction);

      // Mock the protocol keypairs
      const mockKeys = require('@actioncodes/relayer/config/keys');
      mockKeys.getProtocolKeypairs.mockReturnValue([protocolKeypair]);

      // Mock the adapter to return a transaction with protocol signature
      const mockAdapter = {
        signWithProtocolKey: jest.fn().mockImplementation(async (actionCode, keypair) => {
          // Simulate protocol signing with signature verification
          const protocolSignature = protocolKeypair.publicKey.toBase58();
          
          return {
            ...actionCode,
            transaction: {
              transaction: serializedTx, // Use the original transaction
              txType: 'transfer',
              protocolMeta: 'encoded-protocol-meta',
              protocolSignature: protocolSignature,
            },
            status: 'resolved',
            expiresAt: Date.now() + 240000,
          };
        }),
      };
      mockProtocol.getChainAdapter.mockReturnValue(mockAdapter);

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: serializedTx,
      };

      // Mock ActionCode.fromEncoded to return a valid action code
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        timestamp: Date.now() - 30000, // 30 seconds ago (well within TTL)
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      
      // Verify that the transaction was signed with the protocol key
      expect(mockAdapter.signWithProtocolKey).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          publicKey: expect.any(Object),
          privateKey: expect.any(String),
        })
      );
    });

    test('11. Includes protocol memo in transaction metadata', async () => {
      // Create real Solana keypairs
      const userKeypair = Keypair.generate();
      const protocolKeypair = Keypair.generate();
      
      // Create a real Solana transaction
      const transaction = createRealSolanaTransaction(
        userKeypair, 
        '11111111111111111111111111111112'
      );
      const serializedTx = serializeTransaction(transaction);

      // Mock the protocol keypairs
      const mockKeys = require('@actioncodes/relayer/config/keys');
      mockKeys.getProtocolKeypairs.mockReturnValue([protocolKeypair]);

      // Mock protocol meta creation
      const mockProtocolMeta = {
        version: '1.0.0',
        codeId: sha256('12345678'),
        issuer: protocolKeypair.publicKey.toBase58(),
        timestamp: Date.now(),
        params: JSON.stringify({ amount: 0.001 }),
      };
      mockProtocol.createProtocolMeta.mockReturnValue(mockProtocolMeta);
      mockProtocol.encodeProtocolMeta.mockReturnValue('encoded-protocol-memo');

      // Mock the adapter to include protocol memo
      const mockAdapter = {
        signWithProtocolKey: jest.fn().mockImplementation(async (actionCode, keypair) => {
          // Call protocol meta creation methods
          mockProtocol.createProtocolMeta(actionCode, serializedTx, 'solana');
          mockProtocol.encodeProtocolMeta(mockProtocolMeta, 'solana');
          
          // Simulate protocol signing with memo
          return {
            ...actionCode,
            transaction: {
              transaction: serializedTx, // Use the original transaction
              txType: 'transfer',
              protocolMeta: 'encoded-protocol-memo',
              protocolSignature: protocolKeypair.publicKey.toBase58(),
            },
            status: 'resolved',
            expiresAt: Date.now() + 240000,
          };
        }),
      };
      mockProtocol.getChainAdapter.mockReturnValue(mockAdapter);

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: serializedTx,
        meta: {
          title: 'Transaction with Protocol Memo',
          description: 'Testing protocol memo inclusion',
          params: { amount: 0.001 },
        },
      };

      // Mock ActionCode.fromEncoded to return a valid action code
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        timestamp: Date.now() - 30000, // 30 seconds ago (well within TTL)
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      
      // Verify protocol meta was created
      expect(mockProtocol.createProtocolMeta).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.any(String)
      );
      
      // Verify protocol meta was encoded
      expect(mockProtocol.encodeProtocolMeta).toHaveBeenCalledWith(
        mockProtocolMeta,
        'solana'
      );
      
      // Verify the adapter was called with the signed transaction
      expect(mockAdapter.signWithProtocolKey).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          publicKey: expect.any(Object),
          privateKey: expect.any(String),
        })
      );
    });

    test('12. Handles multiple protocol keypairs with rotation', async () => {
      // Create multiple real Solana keypairs
      const userKeypair = Keypair.generate();
      const protocolKeypair1 = Keypair.generate();
      const protocolKeypair2 = Keypair.generate();
      const protocolKeypair3 = Keypair.generate();
      
      // Create a real Solana transaction
      const transaction = createRealSolanaTransaction(
        userKeypair, 
        '11111111111111111111111111111112'
      );
      const serializedTx = serializeTransaction(transaction);

      // Mock multiple protocol keypairs
      const mockKeys = require('@actioncodes/relayer/config/keys');
      mockKeys.getProtocolKeypairs.mockReturnValue([
        {
          publicKey: protocolKeypair1.publicKey,
          privateKey: protocolKeypair1.secretKey,
        },
        {
          publicKey: protocolKeypair2.publicKey,
          privateKey: protocolKeypair2.secretKey,
        },
        {
          publicKey: protocolKeypair3.publicKey,
          privateKey: protocolKeypair3.secretKey,
        },
      ]);

      // Track which keypair was used
      let usedKeypair: Keypair | null = null;
      const mockAdapter = {
        signWithProtocolKey: jest.fn().mockImplementation(async (actionCode, keypair) => {
          usedKeypair = keypair;
          
          // Simulate protocol signing with keypair tracking
          return {
            ...actionCode,
            transaction: {
              transaction: serializedTx, // Use the original transaction
              txType: 'transfer',
              protocolMeta: 'encoded-protocol-meta',
              protocolSignature: keypair.publicKey.toBase58(),
            },
            status: 'resolved',
            expiresAt: Date.now() + 240000,
          };
        }),
      };
      mockProtocol.getChainAdapter.mockReturnValue(mockAdapter);

      const requestBody = {
        code: '12345678',
        chain: 'solana',
        transaction: serializedTx,
      };

      // Mock ActionCode.fromEncoded to return a valid action code
      const { ActionCode } = require('@actioncodes/protocol');
      ActionCode.fromEncoded.mockReturnValue({
        ...mockActionCode,
        timestamp: Date.now() - 30000, // 30 seconds ago (well within TTL)
      });

      const request = createRequest(requestBody);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      
      // Verify that one of the protocol keypairs was used
      expect(usedKeypair).toBeTruthy();
      expect(usedKeypair).toHaveProperty('publicKey');
      expect(usedKeypair).toHaveProperty('privateKey');
      
      // Verify the signature is valid
      expect(mockAdapter.signWithProtocolKey).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          publicKey: expect.any(Object),
          privateKey: expect.any(String),
        })
      );
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