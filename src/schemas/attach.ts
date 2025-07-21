import { z } from 'zod';
import { SUPPORTED_CHAINS } from '@actioncodes/protocol';
import { CodeSchema, MetaSchema } from './code';

export const AttachRequestSchema = z.object({
    code: CodeSchema,
    chain: z.enum(SUPPORTED_CHAINS),
    intentType: z.enum(['transaction', 'sign-only']),
    transaction: z.string().min(20).refine(val => {
        try {
            // Validate base64 format for Solana transactions
            Buffer.from(val, 'base64');
            return true;
        } catch {
            return false;
        }
    }, { message: 'Invalid base64 transaction' }).optional(),
    message: z.string().optional(),
    meta: MetaSchema,
});

export const AttachResponseSchema = z.object({
    status: z.literal('success'),
    codeHash: z.string(),
    expiresAt: z.number().int().positive(),
    chain: z.string(),
    actionCodeStatus: z.literal('resolved'),
    hasTransaction: z.boolean(),
    hasMessage: z.boolean(),
}); 