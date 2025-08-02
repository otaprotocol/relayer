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

type ActionCodesRelayerErrorCode =
    | 'INVALID_PAYLOAD'
    | 'SIGNATURE_INVALID'
    | 'CODE_EXPIRED'
    | 'DUPLICATE_CODE'
    | 'CODE_NOT_FOUND'
    | 'TX_ALREADY_ATTACHED'
    | 'TX_MISSING'
    | 'UNSUPPORTED_CHAIN'
    | 'ADAPTER_NOT_FOUND'
    | 'INVALID_INTENT_TYPE'
    | 'UNKNOWN_ERROR';

export class ActionCodesRelayerError extends Error {
    public code: ActionCodesRelayerErrorCode;
    public status: number;
    public details?: Record<string, any>;

    constructor(
        code: ActionCodesRelayerErrorCode,
        message: string,
        status: number = 400,
        details?: Record<string, any>
    ) {
        super(message);
        this.name = 'ActionCodesRelayerError';
        this.code = code;
        this.status = status;
        this.details = details;
    }

    toJSON() {
        return {
            error: true,
            code: this.code,
            message: this.message,
            status: this.status,
            ...(this.details ? { details: this.details } : {})
        };
    }
}