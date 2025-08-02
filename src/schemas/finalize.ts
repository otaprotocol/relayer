// Copyright 2025 Trana, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
    }).optional(),
    signedMessage: z.string().optional(),
});

// Response schema for finalize endpoint
export const FinalizeResponseSchema = z.object({
    status: z.literal('success'),
    finalizedSignature: z.string().optional(),
    finalizedMessage: z.string().optional(),
    expiresAt: z.number().int().positive(),
});

// Error response schema for finalize endpoint
export const FinalizeErrorResponseSchema = z.object({
    error: z.string(),
    code: z.string(),
    message: z.string(),
    status: z.number(),
}); 