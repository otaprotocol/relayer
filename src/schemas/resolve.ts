import { z } from 'zod';
import { ActionCodeStatus, CODE_LENGTH, MAX_PREFIX_LENGTH, CodeGenerator } from '@actioncodes/protocol';

export const ResolveRequestSchema = z.object({
    code: z.string()
        .min(CODE_LENGTH)
        .max(CODE_LENGTH + MAX_PREFIX_LENGTH)
        .refine((val) => {
            return CodeGenerator.validateCodeFormat(val);
        }, {
            message: 'Invalid code format',
        }),
});

export const ResolveResponseSchema = z.object({
    codeHash: z.string(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    remainingInSeconds: z.number().int().min(0),
    status: z.enum(['pending', 'active', 'expired', 'finalized', 'error'] as ActionCodeStatus[]),
    pubkey: z.string(),
    chain: z.string(),
    prefix: z.string().optional(),
    meta: z.object({
        description: z.string().optional(),
        params: z.record(z.string(), z.any()).optional(),
    }).optional(),
    transaction: z.object({
        transaction: z.string().optional(),
        txSignature: z.string().optional(),
        txType: z.string().optional(),
    }).optional(),
}); 