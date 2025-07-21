import { z } from 'zod';
import { ActionCodeStatus } from '@actioncodes/protocol';
import { CodeSchema } from './code';

// Request schema for status endpoint - accepts a one-time code
export const StatusRequestSchema = z.object({
    code: CodeSchema,
});

// Response schema for status endpoint
export const StatusResponseSchema = z.object({
    status: z.enum(['pending', 'resolved', 'finalized'] as ActionCodeStatus[]),
    expiresAt: z.number().int().positive(), // UNIX timestamp
    hasTransaction: z.boolean(),
    hasMessage: z.boolean(),
    signedMessage: z.string().optional(), // if message was signed
    finalizedSignature: z.string().optional(), // if broadcasted
});

// Error response schema for when no object is found
export const StatusErrorResponseSchema = z.object({
    error: z.string(),
    status: z.literal('error' as ActionCodeStatus),
});
