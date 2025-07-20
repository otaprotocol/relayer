import { z } from 'zod';
import { CODE_LENGTH, MAX_PREFIX_LENGTH, CodeGenerator } from '@actioncodes/protocol';

// Shared code validation schema
export const CodeSchema = z.string()
    .min(CODE_LENGTH)
    .max(CODE_LENGTH + MAX_PREFIX_LENGTH)
    .refine((val) => {
        return CodeGenerator.validateCodeFormat(val);
    }, {
        message: 'Invalid code format',
    });

// Shared meta schema
export const MetaSchema = z.object({
    description: z.string().max(300).optional(),
    params: z.record(z.string(), z.any()).optional(),
}).optional().default({}); 