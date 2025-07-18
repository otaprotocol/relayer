import { ActionCodesRelayerError } from './error';

describe('ActionCodesRelayerError', () => {
  describe('constructor', () => {
    it('should create error with required parameters', () => {
      const error = new ActionCodesRelayerError('INVALID_PAYLOAD', 'Invalid payload provided');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ActionCodesRelayerError);
      expect(error.name).toBe('ActionCodesRelayerError');
      expect(error.code).toBe('INVALID_PAYLOAD');
      expect(error.message).toBe('Invalid payload provided');
      expect(error.status).toBe(400); // default status
      expect(error.details).toBeUndefined();
    });

    it('should create error with custom status', () => {
      const error = new ActionCodesRelayerError('CODE_NOT_FOUND', 'Code not found', 404);

      expect(error.code).toBe('CODE_NOT_FOUND');
      expect(error.message).toBe('Code not found');
      expect(error.status).toBe(404);
    });

    it('should create error with details', () => {
      const details = { code: '12345678', pubkey: 'test-pubkey' };
      const error = new ActionCodesRelayerError('SIGNATURE_INVALID', 'Invalid signature', 401, details);

      expect(error.code).toBe('SIGNATURE_INVALID');
      expect(error.message).toBe('Invalid signature');
      expect(error.status).toBe(401);
      expect(error.details).toEqual(details);
    });

    it('should create error with all parameters', () => {
      const details = { timestamp: 1234567890, chain: 'solana' };
      const error = new ActionCodesRelayerError('CODE_EXPIRED', 'Code has expired', 410, details);

      expect(error.code).toBe('CODE_EXPIRED');
      expect(error.message).toBe('Code has expired');
      expect(error.status).toBe(410);
      expect(error.details).toEqual(details);
    });
  });

  describe('error codes', () => {
    it('should handle INVALID_PAYLOAD error', () => {
      const error = new ActionCodesRelayerError('INVALID_PAYLOAD', 'Invalid request payload');

      expect(error.code).toBe('INVALID_PAYLOAD');
      expect(error.status).toBe(400);
    });

    it('should handle SIGNATURE_INVALID error', () => {
      const error = new ActionCodesRelayerError('SIGNATURE_INVALID', 'Invalid signature provided');

      expect(error.code).toBe('SIGNATURE_INVALID');
      expect(error.status).toBe(400);
    });

    it('should handle CODE_EXPIRED error', () => {
      const error = new ActionCodesRelayerError('CODE_EXPIRED', 'Action code has expired');

      expect(error.code).toBe('CODE_EXPIRED');
      expect(error.status).toBe(400);
    });

    it('should handle DUPLICATE_CODE error', () => {
      const error = new ActionCodesRelayerError('DUPLICATE_CODE', 'Code already exists');

      expect(error.code).toBe('DUPLICATE_CODE');
      expect(error.status).toBe(400);
    });

    it('should handle CODE_NOT_FOUND error', () => {
      const error = new ActionCodesRelayerError('CODE_NOT_FOUND', 'Code not found in database');

      expect(error.code).toBe('CODE_NOT_FOUND');
      expect(error.status).toBe(400);
    });

    it('should handle TX_ALREADY_ATTACHED error', () => {
      const error = new ActionCodesRelayerError('TX_ALREADY_ATTACHED', 'Transaction already attached to code');

      expect(error.code).toBe('TX_ALREADY_ATTACHED');
      expect(error.status).toBe(400);
    });

    it('should handle TX_MISSING error', () => {
      const error = new ActionCodesRelayerError('TX_MISSING', 'Transaction data is missing');

      expect(error.code).toBe('TX_MISSING');
      expect(error.status).toBe(400);
    });

    it('should handle UNSUPPORTED_CHAIN error', () => {
      const error = new ActionCodesRelayerError('UNSUPPORTED_CHAIN', 'Chain not supported');

      expect(error.code).toBe('UNSUPPORTED_CHAIN');
      expect(error.status).toBe(400);
    });

    it('should handle ADAPTER_NOT_FOUND error', () => {
      const error = new ActionCodesRelayerError('ADAPTER_NOT_FOUND', 'Chain adapter not found');

      expect(error.code).toBe('ADAPTER_NOT_FOUND');
      expect(error.status).toBe(400);
    });

    it('should handle UNKNOWN_ERROR error', () => {
      const error = new ActionCodesRelayerError('UNKNOWN_ERROR', 'An unknown error occurred');

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.status).toBe(400);
    });
  });

  describe('toJSON method', () => {
    it('should return JSON without details when details are not provided', () => {
      const error = new ActionCodesRelayerError('INVALID_PAYLOAD', 'Invalid payload');
      const json = error.toJSON();

      expect(json).toEqual({
        error: true,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload',
        status: 400
      });
    });

    it('should return JSON with details when details are provided', () => {
      const details = {
        code: '12345678',
        pubkey: 'test-pubkey',
        timestamp: 1234567890
      };
      const error = new ActionCodesRelayerError('SIGNATURE_INVALID', 'Invalid signature', 401, details);
      const json = error.toJSON();

      expect(json).toEqual({
        error: true,
        code: 'SIGNATURE_INVALID',
        message: 'Invalid signature',
        status: 401,
        details: details
      });
    });

    it('should return JSON with empty details object', () => {
      const error = new ActionCodesRelayerError('CODE_EXPIRED', 'Code expired', 410, {});
      const json = error.toJSON();

      expect(json).toEqual({
        error: true,
        code: 'CODE_EXPIRED',
        message: 'Code expired',
        status: 410,
        details: {}
      });
    });

    it('should return JSON with complex details', () => {
      const details = {
        code: '87654321',
        pubkey: 'complex-pubkey',
        chain: 'solana',
        metadata: {
          version: '1.0.0',
          features: ['encryption', 'validation']
        },
        timestamps: [1234567890, 1234567891, 1234567892]
      };
      const error = new ActionCodesRelayerError('UNKNOWN_ERROR', 'Complex error occurred', 500, details);
      const json = error.toJSON();

      expect(json).toEqual({
        error: true,
        code: 'UNKNOWN_ERROR',
        message: 'Complex error occurred',
        status: 500,
        details: details
      });
    });
  });

  describe('error inheritance and properties', () => {
    it('should properly extend Error class', () => {
      const error = new ActionCodesRelayerError('CODE_NOT_FOUND', 'Not found');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ActionCodesRelayerError).toBe(true);
      expect(error.name).toBe('ActionCodesRelayerError');
    });

    it('should have correct property types', () => {
      const error = new ActionCodesRelayerError('INVALID_PAYLOAD', 'Invalid payload', 400, { test: 'value' });

      expect(typeof error.code).toBe('string');
      expect(typeof error.message).toBe('string');
      expect(typeof error.status).toBe('number');
      expect(typeof error.details).toBe('object');
    });

    it('should maintain error stack trace', () => {
      const error = new ActionCodesRelayerError('UNKNOWN_ERROR', 'Test error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('error scenarios', () => {
    it('should handle authentication errors', () => {
      const authError = new ActionCodesRelayerError('SIGNATURE_INVALID', 'Authentication failed', 401, {
        pubkey: 'user-pubkey',
        timestamp: Date.now()
      });

      expect(authError.status).toBe(401);
      expect(authError.code).toBe('SIGNATURE_INVALID');
      expect(authError.details?.pubkey).toBe('user-pubkey');
    });

    it('should handle validation errors', () => {
      const validationError = new ActionCodesRelayerError('INVALID_PAYLOAD', 'Validation failed', 400, {
        field: 'code',
        value: 'invalid-code',
        expected: '8-digit numeric string'
      });

      expect(validationError.status).toBe(400);
      expect(validationError.code).toBe('INVALID_PAYLOAD');
      expect(validationError.details?.field).toBe('code');
    });

    it('should handle not found errors', () => {
      const notFoundError = new ActionCodesRelayerError('CODE_NOT_FOUND', 'Code not found', 404, {
        code: '12345678',
        searchedAt: new Date().toISOString()
      });

      expect(notFoundError.status).toBe(404);
      expect(notFoundError.code).toBe('CODE_NOT_FOUND');
    });

    it('should handle conflict errors', () => {
      const conflictError = new ActionCodesRelayerError('DUPLICATE_CODE', 'Code already exists', 409, {
        code: '87654321',
        existingCode: {
          pubkey: 'existing-pubkey',
          timestamp: 1234567890
        }
      });

      expect(conflictError.status).toBe(409);
      expect(conflictError.code).toBe('DUPLICATE_CODE');
    });

    it('should handle server errors', () => {
      const serverError = new ActionCodesRelayerError('UNKNOWN_ERROR', 'Internal server error', 500, {
        requestId: 'req-123',
        timestamp: Date.now(),
        component: 'database'
      });

      expect(serverError.status).toBe(500);
      expect(serverError.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('error serialization', () => {
    it('should be JSON serializable', () => {
      const error = new ActionCodesRelayerError('CODE_EXPIRED', 'Code expired', 410, {
        code: '12345678',
        expiredAt: '2023-12-01T00:00:00Z'
      });

      const jsonString = JSON.stringify(error.toJSON());
      const parsed = JSON.parse(jsonString);

      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('CODE_EXPIRED');
      expect(parsed.message).toBe('Code expired');
      expect(parsed.status).toBe(410);
      expect(parsed.details.code).toBe('12345678');
    });

    it('should handle circular references gracefully', () => {
      const details: any = { name: 'test' };
      details.self = details; // Create circular reference

      const error = new ActionCodesRelayerError('UNKNOWN_ERROR', 'Circular reference test', 500, details);

      // Should not throw when calling toJSON
      expect(() => error.toJSON()).not.toThrow();
    });
  });
});
