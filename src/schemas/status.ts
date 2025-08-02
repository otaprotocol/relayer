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
