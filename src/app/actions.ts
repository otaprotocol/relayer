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

import { redis } from './utils/redis';
import { ActionCodesRelayerError } from './utils/error';

'use server'

import { PROTOCOL_CODE_PREFIX, PROTOCOL_PREFIX, PROTOCOL_VERSION } from "@actioncodes/protocol"
import { getProtocolPubkeys } from "@actioncodes/relayer/config/keys";

export async function getRelayerData() {
    try {
        const pubkeys = getProtocolPubkeys().map((pKey) => pKey.toBase58());
        
        return {
            name: "Official Action Codes Relayer",
            docs: "https://ota.codes/docs",
            relayer_version: process.env.npm_package_version || 'unknown',
            protocol_version: PROTOCOL_VERSION,
            meta_prefix: PROTOCOL_PREFIX,
            code_prefix: PROTOCOL_CODE_PREFIX,
            timestamp: Date.now(),
            keys: pubkeys,
        };
    } catch (error) {
        console.error('Failed to get relayer data:', error);
        return {
            name: "Official Action Codes Relayer",
            docs: "https://ota.codes/docs",
            relayer_version: process.env.npm_package_version || 'unknown',
            protocol_version: PROTOCOL_VERSION,
            meta_prefix: PROTOCOL_PREFIX,
            code_prefix: PROTOCOL_CODE_PREFIX,
            timestamp: Date.now(),
            keys: [],
            error: 'Failed to load protocol keys'
        };
    }
} 