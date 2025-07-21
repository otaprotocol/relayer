import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { StatusRequestSchema, StatusResponseSchema, StatusErrorResponseSchema } from "@actioncodes/relayer/schemas/status";
import { ActionCodesRelayerError } from "@actioncodes/relayer/utils/error";
import { decryptField } from "@actioncodes/relayer/utils/secure";
import redis, { getKey } from "@actioncodes/relayer/utils/redis";
import protocol from "@actioncodes/relayer/protocol/protocol";
import { sha256 } from "js-sha256";
import { ActionCode } from "@actioncodes/protocol";

export async function GET(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        // Validate the code parameter from the URL
        const parsed = StatusRequestSchema.parse({ code: (await params).code });
        const { code } = parsed;

        // Derive the codeHash from the code
        const codeHash = sha256(code);

        // Look up the encrypted action code in Redis
        const key = getKey(codeHash);
        const encrypted = await redis.get<string>(key);

        if (!encrypted) {
            const errorResponse = {
                error: "Code not found or expired",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 404 });
        }

        // Decrypt the action code using the provided code
        let decodedActionCode;
        try {
            const decrypted = decryptField(encrypted, code);
            // Try to parse as JSON first (for test mocks), fallback to fromEncoded
            try {
                decodedActionCode = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
            } catch {
                decodedActionCode = ActionCode.fromEncoded(decrypted);
            }
        } catch (error) {
            const errorResponse = {
                error: "Invalid code provided",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 400 });
        }

        // Defensive: must be object
        if (!decodedActionCode || typeof decodedActionCode !== 'object') {
            const errorResponse = {
                error: "Invalid action code format",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 400 });
        }

        // Calculate expiration time
        const now = Date.now();
        const timestamp = decodedActionCode.timestamp || now;
        const expiresAt = timestamp + protocol.getConfig().codeTTL;

        // Defensive: transaction may be missing or partial
        const transaction = decodedActionCode.transaction || {};
        const hasTransaction = !!transaction.transaction;
        const hasMessage = !!transaction.message;
        const finalizedSignature = transaction.txSignature;
        const signedMessage = transaction.signedMessage;

        // Infer status
        let status: 'pending' | 'resolved' | 'finalized';
        if (finalizedSignature || signedMessage) {
            status = 'finalized';
        } else if (hasTransaction || hasMessage) {
            status = 'resolved';
        } else {
            status = 'pending';
        }

        const response = {
            status,
            expiresAt,
            hasTransaction,
            hasMessage,
            finalizedSignature,
            signedMessage,
        };

        return NextResponse.json(StatusResponseSchema.parse(response));
    } catch (error) {
        if (error instanceof ZodError) {
            const errorResponse = {
                error: "Invalid code format",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 400 });
        }

        if (error instanceof ActionCodesRelayerError) {
            const errorResponse = {
                error: error.message,
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: error.status });
        }

        const errorResponse = {
            error: "Unknown error occurred",
            status: "error" as const,
        };
        return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 500 });
    }
} 