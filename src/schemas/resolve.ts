import { z } from 'zod';
import { ActionCodeStatus } from '@actioncodes/protocol';
import { CodeSchema } from './code';

export const ResolveRequestSchema = z.object({
    code: CodeSchema,
});

export const ResolveResponseSchema = z.object({
    codeHash: z.string(),
    timestamp: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    remainingInSeconds: z.number().int().min(0),
    status: z.enum(['pending', 'active', 'expired', 'finalized', 'error'] as ActionCodeStatus[]),
    pubkey: z.string(),
    signature: z.string(),
    chain: z.string(),
    prefix: z.string().optional(),
    metadata: z.object({
        description: z.string().optional(),
        params: z.record(z.string(), z.any()).optional(),
    }).optional(),
    transaction: z.object({
        transaction: z.string().optional(),
        txSignature: z.string().optional(),
        txType: z.string().optional(),
        message: z.string().optional(),
        signedMessage: z.string().optional(),
        intentType: z.enum(['transaction', 'sign-only']).optional(),
    }).optional(),
}); 