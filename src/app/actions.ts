'use server'

import { PROTOCOL_CODE_PREFIX, PROTOCOL_PREFIX, PROTOCOL_VERSION } from "@actioncodes/protocol"
import { getProtocolPubkeys } from "@actioncodes/relayer/utils/auth";

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