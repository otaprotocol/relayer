import { z } from 'zod';
import { PublicKey } from '@solana/web3.js'
import { SUPPORTED_CHAINS, MIN_PREFIX_LENGTH, MAX_PREFIX_LENGTH, ActionCodeStatus } from '@actioncodes/protocol';
import { CodeSchema, MetaSchema } from './code';

// Currently Solana only
export const RegisterRequestSchema = z.object({
    code: CodeSchema,
    pubkey: z.string()
        .refine(val => {
            try {
                new PublicKey(val);
                return true;
            } catch {
                return false;
            }
        }, {
            message: 'Invalid public key',
        }),
    signature: z.string().refine(val => {
        try {
            Buffer.from(val, 'base64');
            return true;
        } catch {
            return false;
        }
    }, { message: 'Invalid base64 signature' }),
    timestamp: z.number().int().positive(),
    prefix: z.string().min(MIN_PREFIX_LENGTH).max(MAX_PREFIX_LENGTH).optional(),
    chain: z.enum(SUPPORTED_CHAINS),
    metadata: MetaSchema.optional(),
});

export const RegisterResponseSchema = z.object({
    codeHash: z.string(),
    timestamp: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    remainingInSeconds: z.number().int().positive(),
    status: z.enum(['pending', 'active', 'expired', 'finalized', 'error'] as ActionCodeStatus[]),
});