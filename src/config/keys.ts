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

import { Keypair, PublicKey } from "@solana/web3.js";

export const getProtocolKeypairs = (): Keypair[] => {
    const authKeysRaw = process.env.PROTOCOL_AUTHS;
    if (!authKeysRaw) {
        throw new Error("PROTOCOL_AUTHS is not set");
    }

    let authKeys: number[][];
    try {
        authKeys = JSON.parse(authKeysRaw) as number[][];
        if (!Array.isArray(authKeys)) {
            throw new Error("PROTOCOL_AUTHS must be an array");
        }
    } catch (error) {
        throw new Error(`Failed to parse PROTOCOL_AUTHS: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }

    const keypairs = authKeys.map((pKey) => {
        if (!Array.isArray(pKey)) {
            throw new Error("Each key in PROTOCOL_AUTHS must be an array of numbers");
        }
        return Keypair.fromSecretKey(Uint8Array.from(pKey));
    });
    return keypairs;
}

export const getProtocolPubkeys = (): PublicKey[] => {
    const keypairs = getProtocolKeypairs();
    return keypairs.map((keypair) => keypair.publicKey);
}