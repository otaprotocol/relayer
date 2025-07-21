import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { sha256 } from 'js-sha256';
import { AttachRequestSchema, AttachResponseSchema } from "@actioncodes/relayer/schemas/attach";
import { ActionCodesRelayerError } from "@actioncodes/relayer/utils/error";
import { decryptField, encryptField } from "@actioncodes/relayer/utils/secure";
import redis, { getKey } from "@actioncodes/relayer/utils/redis";
import protocol from "@actioncodes/relayer/protocol/protocol";
import { ActionCode } from "@actioncodes/protocol";
import { getProtocolKeypairs } from "@actioncodes/relayer/config/keys";

const keypairs = getProtocolKeypairs();

export async function POST(request: NextRequest) {
    let body;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid JSON in request body", 400, {
                details: "Request body must be valid JSON",
            }),
            { status: 400 }
        );
    }

    try {
        const parsed = AttachRequestSchema.parse(body);
        const { code, transaction, chain, meta, intentType, message } = parsed;

        // Derive the codeHash from the code
        const codeHash = sha256(code);

        // Look up the encrypted action code in Redis
        const key = getKey(codeHash);
        const encrypted = await redis.get<string>(key);

        if (!encrypted) {
            throw new ActionCodesRelayerError("CODE_NOT_FOUND", "Code not found or expired", 404);
        }

        // Decrypt the action code using the provided code
        let decodedActionCode;
        try {
            const decrypted = decryptField(encrypted, code);
            decodedActionCode = ActionCode.fromEncoded(decrypted);
        } catch {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid code provided for decryption", 400);
        }

        // Validate the decoded action code structure
        if (!decodedActionCode || typeof decodedActionCode !== 'object') {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid action code format", 400);
        }

        // Check if code is expired
        const now = Date.now();
        const timestamp = decodedActionCode.timestamp || now;
        const expiresAt = timestamp + protocol.getConfig().codeTTL;
        const remainingTime = Math.max(0, expiresAt - now);

        if (remainingTime <= 0) {
            throw new ActionCodesRelayerError("CODE_EXPIRED", "Action code has expired", 410);
        }

        // Check if transaction is already attached
        if (decodedActionCode.transaction) {
            throw new ActionCodesRelayerError("TX_ALREADY_ATTACHED", "Transaction already attached to this code", 409);
        }

        // Validate chain support
        if (!protocol.isChainSupported(chain)) {
            throw new ActionCodesRelayerError("UNSUPPORTED_CHAIN", `Chain '${chain}' is not supported`);
        }

        // Get chain adapter
        const adapter = protocol.getChainAdapter(chain);
        if (!adapter) {
            throw new ActionCodesRelayerError("ADAPTER_NOT_FOUND", `Adapter for '${chain}' not found`);
        }

        try {
            // Create ActionCode object from decoded data
            const actionCode = ActionCode.fromPayload({
                code: decodedActionCode.code || code,
                pubkey: decodedActionCode.pubkey,
                timestamp: timestamp,
                chain: decodedActionCode.chain as "solana",
                prefix: decodedActionCode.prefix || 'DEFAULT',
                signature: decodedActionCode.signature || '',
                status: 'pending',
                expiresAt,
                transaction: decodedActionCode.transaction,
                metadata: {
                    ...decodedActionCode.metadata,
                    ...meta,
                },
            });

            if (intentType === 'transaction') {
                // Get a random keypair from the keypairs array to rotate over time
                const signerKey = keypairs[Math.floor(Math.random() * keypairs.length)];

                // Attach transaction with protocol meta
                const updatedActionCode = protocol.attachTransaction(
                    actionCode,
                    transaction || '',
                    signerKey.publicKey.toBase58()
                );

                const signedActionCode = await adapter.signWithProtocolKey(updatedActionCode, signerKey);

                // Re-encrypt and store the updated action code
                const updatedEncrypted = encryptField(signedActionCode.encoded, code);
                const remainingTTL = updatedActionCode.timestamp + protocol.getConfig().codeTTL - Date.now();
                await redis.set(key, updatedEncrypted, { ex: Math.ceil(remainingTTL / 1000) });
            } else if (intentType === 'sign-only') {
                // Get a random keypair from the keypairs array to rotate over time
                const updatedActionCode = protocol.attachMessage(actionCode, message || '');

                // Re-encrypt and store the updated action code
                const updatedEncrypted = encryptField(updatedActionCode.encoded, code);
                const remainingTTL = updatedActionCode.timestamp + protocol.getConfig().codeTTL - Date.now();
                await redis.set(key, updatedEncrypted, { ex: Math.ceil(remainingTTL / 1000) });
            } else {
                throw new ActionCodesRelayerError("INVALID_INTENT_TYPE", "Invalid intent type", 400);
            }



            const response = {
                status: 'success',
                codeHash,
                expiresAt,
                chain,
                actionCodeStatus: 'resolved',
                hasTransaction: intentType === 'transaction',
                hasMessage: intentType === 'sign-only',
            };

            return NextResponse.json(AttachResponseSchema.parse(response));
        } catch (error) {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Can't attach transaction to action code.", 400);
        }
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json(
                new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid request payload", 400, {
                    details: error.message,
                }).toJSON(),
                { status: 400 }
            );
        }

        if (error instanceof ActionCodesRelayerError) {
            return NextResponse.json(error.toJSON(), { status: error.status });
        }

        // Unknown error: return 500
        return NextResponse.json(
            new ActionCodesRelayerError("UNKNOWN_ERROR", "Unknown error", 500).toJSON(),
            { status: 500 }
        );
    }
} 