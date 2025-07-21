import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ResolveRequestSchema, ResolveResponseSchema } from "@actioncodes/relayer/schemas/resolve";
import { ActionCodesRelayerError } from "@actioncodes/relayer/utils/error";
import { decryptField } from "@actioncodes/relayer/utils/secure";
import redis, { getKey } from "@actioncodes/relayer/utils/redis";
import protocol from "@actioncodes/relayer/protocol/protocol";
import { sha256 } from "js-sha256";
import { ActionCode } from "@actioncodes/protocol";

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
        const parsed = ResolveRequestSchema.parse(body);
        const { code } = parsed;

        // Derive the codeHash from the code
        const codeHash = sha256(code);

        // Look up the encrypted action code in Redis
        const key = getKey(codeHash); // hash is derived from the code
        const encrypted = await redis.get<string>(key);

        if (!encrypted) {
            throw new ActionCodesRelayerError("CODE_NOT_FOUND", "Code not found or expired", 404);
        }

        // Decrypt the action code using the provided code
        let decodedActionCode;
        try {
            const decrypted = decryptField(encrypted, code);
            
            decodedActionCode = ActionCode.fromEncoded(decrypted)
        } catch {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid code provided for decryption", 400);
        }

        // Validate the decoded action code structure
        if (!decodedActionCode || typeof decodedActionCode !== 'object') {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid action code format", 400);
        }

        // Calculate remaining time and status
        const timestamp = decodedActionCode.timestamp;
        const expiresAt = timestamp + protocol.getConfig().codeTTL;
        const remainingTime = Math.max(0, expiresAt - Date.now());
        const remainingInSeconds = Math.floor(remainingTime / 1000);

        // Determine status based on remaining time
        const status = remainingTime <= 0 ? 'expired' : 'active';

        const response = {
            codeHash,
            timestamp,
            expiresAt,
            remainingInSeconds,
            status,
            signature: decodedActionCode.signature,
            transaction: decodedActionCode.transaction,
            pubkey: decodedActionCode.pubkey,
            chain: decodedActionCode.chain,
            prefix: decodedActionCode.prefix,
            metadata: decodedActionCode.metadata,
        };

        return NextResponse.json(ResolveResponseSchema.parse(response));
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json(
                new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid request payload", 400, {
                    details: error.message,
                }),
                { status: 400 }
            );
        }

        if (error instanceof ActionCodesRelayerError) {
            return NextResponse.json(error.toJSON(), { status: error.status });
        }

        return NextResponse.json(
            new ActionCodesRelayerError("UNKNOWN_ERROR", "Unknown error", 500),
            { status: 500 }
        );
    }
} 