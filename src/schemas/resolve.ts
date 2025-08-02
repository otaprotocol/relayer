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