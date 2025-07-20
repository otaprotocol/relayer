import { z } from 'zod';
import { CodeSchema } from './code';
import bs58 from 'bs58';

// Request schema for finalize endpoint
export const FinalizeRequestSchema = z.object({
    code: CodeSchema,
    signature: z.string().refine((val) => {
        try {
            // Try to decode as base58 and check length
            // Use bs58 for base58 decoding
            const decoded = bs58.decode(val);
            return decoded.length === 64;
        } catch {
            return false;
        }
    }, {
        message: 'Transaction signature must be a valid base58 string of 64 bytes',
    }),
});

// Response schema for finalize endpoint
export const FinalizeResponseSchema = z.object({
    status: z.literal('success'),
    finalizedSignature: z.string(),
    expiresAt: z.number().int().positive(),
});

// Error response schema for finalize endpoint
export const FinalizeErrorResponseSchema = z.object({
    error: z.string(),
    code: z.string(),
    message: z.string(),
    status: z.number(),
}); 