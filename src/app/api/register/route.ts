import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { sha256 } from 'js-sha256';
import { CodeGenerator, PROTOCOL_CODE_PREFIX, ActionCode } from "@actioncodes/protocol";
import { RegisterRequestSchema, RegisterResponseSchema } from "@actioncodes/relayer/schemas/register";
import { ActionCodesRelayerError } from "@actioncodes/relayer/utils/error";
import { encryptField } from "@actioncodes/relayer/utils/secure";
import redis, { getKey } from "@actioncodes/relayer/utils/redis";
import protocol from "@actioncodes/relayer/protocol/protocol";

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
        const parsed = RegisterRequestSchema.parse(body);
        const { code, pubkey, signature, prefix = PROTOCOL_CODE_PREFIX, chain, timestamp } = parsed;

        if (!protocol.isChainSupported(chain)) {
            throw new ActionCodesRelayerError("UNSUPPORTED_CHAIN", `Chain '${chain}' is not supported`);
        }

        const adapter = protocol.getChainAdapter(chain);
        if (!adapter) {
            throw new ActionCodesRelayerError("ADAPTER_NOT_FOUND", `Adapter for '${chain}' not found`);
        }

        if (!CodeGenerator.validateCode(code, pubkey, timestamp, prefix)) {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid code");
        }

        try {
            const actionCode = ActionCode.fromPayload({
                code,
                pubkey,
                signature,
                timestamp,
                prefix,
                chain,
                status: 'pending',
                expiresAt: timestamp + protocol.getConfig().codeTTL,
            });

            if (!protocol.validateActionCode(actionCode)) {
                throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Invalid action code", 400);
            }

            const encrypted = encryptField(actionCode.encoded, code);
            const key = getKey(sha256(actionCode.code));
            await redis.set(key, encrypted, { ex: protocol.getConfig().codeTTL });

            return NextResponse.json(RegisterResponseSchema.parse({
                codeHash: actionCode.codeHash,
                issuedAt: actionCode.timestamp,
                expiresAt: actionCode.timestamp + protocol.getConfig().codeTTL,
                remainingInSeconds: Math.floor(actionCode.remainingTime / 1000),
                status: actionCode.status,
            }));
        } catch {
            throw new ActionCodesRelayerError("INVALID_PAYLOAD", "Can't construct or validate action code.", 400);
        }
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