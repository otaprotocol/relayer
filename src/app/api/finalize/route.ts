import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { sha256 } from 'js-sha256';
import { FinalizeRequestSchema, FinalizeResponseSchema } from "@actioncodes/relayer/schemas/finalize";
import { ActionCodesRelayerError } from "@actioncodes/relayer/utils/error";
import { decryptField, encryptField } from "@actioncodes/relayer/utils/secure";
import redis, { getKey } from "@actioncodes/relayer/utils/redis";
import protocol, { solanaConnection } from "@actioncodes/relayer/protocol/protocol";
import { ActionCode, SolanaAdapter } from "@actioncodes/protocol";

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
        const parsed = FinalizeRequestSchema.parse(body);
        const { code, signature, signedMessage } = parsed;

        // 1. Derive codeHash from the code
        const codeHash = sha256(code);

        // 2. Fetch and decrypt the ActionCode from Redis
        const key = getKey(codeHash);
        const encrypted = await redis.get<string>(key);

        if (!encrypted) {
            return NextResponse.json(
                new ActionCodesRelayerError("CODE_NOT_FOUND", "Code not found or expired", 404).toJSON(),
                { status: 404 }
            );
        }

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

        // 3. Ensure code is not expired
        const now = Date.now();
        const timestamp = decodedActionCode.timestamp || now;
        const expiresAt = timestamp + protocol.getConfig().codeTTL;

        if (now > expiresAt) {
            return NextResponse.json(
                new ActionCodesRelayerError("CODE_EXPIRED", "Action code has expired", 410).toJSON(),
                { status: 410 }
            );
        }

        // 4. Ensure ActionCode has an attached transaction or message
        if (!decodedActionCode.transaction || (!decodedActionCode.transaction.transaction && !decodedActionCode.transaction.message)) {
            return NextResponse.json(
                new ActionCodesRelayerError("TX_MISSING", "No transaction attached to this action code", 400).toJSON(),
                { status: 400 }
            );
        }

        // 5. Ensure it's not already finalized
        if (decodedActionCode.transaction?.txSignature) {
            return NextResponse.json(
                new ActionCodesRelayerError("TX_ALREADY_ATTACHED", "Action code is already finalized", 409).toJSON(),
                { status: 409 }
            );
        }

        // 6. Get chain from the action code (not from request)
        const chain = decodedActionCode.chain;
        if (!chain) {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Action code missing chain information", 400);
        }

        // 7. Validate the transaction signature on the blockchain
        try {
            if (chain === 'solana') {
                if (signature) {
                    // For Solana, verify the transaction signature using the connection
                    const transaction = await solanaConnection.getTransaction(signature, {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0,
                    });

                    if (!transaction) {
                        return NextResponse.json(
                            new ActionCodesRelayerError("SIGNATURE_INVALID", "Transaction not found on blockchain", 400).toJSON(),
                            { status: 400 }
                        );
                    }

                    // Check integrity of the transaction
                    if (!(protocol.getChainAdapter(chain) as SolanaAdapter)?.verifyFinalizedTransaction(transaction, decodedActionCode)) {
                        return NextResponse.json(
                            new ActionCodesRelayerError("SIGNATURE_INVALID", "Transaction is not valid for this action code", 400).toJSON(),
                            { status: 400 }
                        );
                    }

                    // Verify that the transaction is confirmed
                    if (transaction.meta?.err) {
                        return NextResponse.json(
                            new ActionCodesRelayerError("SIGNATURE_INVALID", "Transaction failed on blockchain", 400).toJSON(),
                            { status: 400 }
                        );
                    }
                } else if (signedMessage) {
                    if (!(protocol.getChainAdapter(chain) as SolanaAdapter)?.validateSignedMessage(decodedActionCode.transaction.message || '', signedMessage, decodedActionCode.pubkey)) {
                        return NextResponse.json(
                            new ActionCodesRelayerError("SIGNATURE_INVALID", "Message signature is invalid", 400).toJSON(),
                            { status: 400 }
                        );
                    }
                } else {
                    return NextResponse.json(
                        new ActionCodesRelayerError("INVALID_PAYLOAD", "Transaction signature or signed message is required", 400).toJSON(),
                        { status: 400 }
                    );
                }

            } else {
                return NextResponse.json(
                    new ActionCodesRelayerError("UNSUPPORTED_CHAIN", `Chain '${chain}' is not supported for finalization`, 400).toJSON(),
                    { status: 400 }
                );
            }
        } catch (error) {
            // Always return SIGNATURE_INVALID for blockchain verification errors
            return NextResponse.json(
                new ActionCodesRelayerError("SIGNATURE_INVALID", "Failed to verify transaction signature", 400).toJSON(),
                { status: 400 }
            );
        }

        // 8. Add txSignature or signedMessage to ActionCode.transaction and set status to finalized
        if (signature) {
            decodedActionCode.transaction.txSignature = signature;
        } else if (signedMessage) {
            decodedActionCode.transaction.signedMessage = signedMessage;
        }

        const updatedActionCode = ActionCode.fromPayload({
            ...decodedActionCode.json,
            status: 'finalized',
        })

        // 9. Re-encrypt and store again in Redis and set time again to 2 mins to allow 
        // resolve for finalized
        const updatedEncrypted = encryptField(updatedActionCode.encoded, code);
        await redis.set(key, updatedEncrypted, { ex: protocol.getConfig().codeTTL / 1000 });

        // 10. Return structured result
        const response = {
            status: 'success' as const,
            finalizedSignature: signature,
            expiresAt: expiresAt,
        };

        return NextResponse.json(FinalizeResponseSchema.parse(response));
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
        return NextResponse.json(
            new ActionCodesRelayerError("UNKNOWN_ERROR", "Unknown error", 500).toJSON(),
            { status: 500 }
        );
    }
}
