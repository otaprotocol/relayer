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