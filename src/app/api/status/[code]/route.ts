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
            decodedActionCode = ActionCode.fromEncoded(decrypted);
        } catch (error) {
            const errorResponse = {
                error: "Invalid code provided",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 400 });
        }

        // Validate the decoded action code structure
        if (!decodedActionCode || typeof decodedActionCode !== 'object') {
            const errorResponse = {
                error: "Invalid action code format",
                status: "error" as const,
            };
            return NextResponse.json(StatusErrorResponseSchema.parse(errorResponse), { status: 400 });
        }

        // Calculate expiration time
        const now = Date.now();
        const issuedAt = decodedActionCode.timestamp || now;
        const expiresAt = issuedAt + protocol.getConfig().codeTTL;

        // Determine status based on the action code state
        let status: 'pending' | 'resolved' | 'finalized';
        
        if (decodedActionCode.transaction?.txSignature) {
            status = 'finalized';
        } else if (decodedActionCode.transaction?.transaction) {
            status = 'resolved';
        } else {
            status = 'pending';
        }

        // Check if transaction exists
        const hasTransaction = !!(decodedActionCode.transaction?.transaction);

        const response = {
            status,
            expiresAt,
            hasTransaction,
            finalizedSignature: decodedActionCode.transaction?.txSignature,
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