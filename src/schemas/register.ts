import { z } from 'zod';
import { PublicKey } from '@solana/web3.js'
import { SUPPORTED_CHAINS, CODE_LENGTH, MAX_PREFIX_LENGTH, MIN_PREFIX_LENGTH, ActionCodeStatus } from '@actioncodes/protocol';

// Currently Solana only
export const RegisterRequestSchema = z.object({
    code: z.string().min(CODE_LENGTH).max(CODE_LENGTH + MAX_PREFIX_LENGTH),
    pubkey: z.string()
        .length(44)
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
    meta: z.object({
        description: z.string().optional(),
        params: z.record(z.string(), z.any()).optional(),
    }).optional(),
});

export const RegisterResponseSchema = z.object({
    codeHash: z.string(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    remainingInSeconds: z.number().int().positive(),
    status: z.enum(['pending', 'active', 'expired', 'finalized', 'error'] as ActionCodeStatus[]),
});