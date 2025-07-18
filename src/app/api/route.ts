import { PROTOCOL_CODE_PREFIX, PROTOCOL_PREFIX, PROTOCOL_VERSION } from '@actioncodes/protocol'
import { getProtocolPubkeys } from '@actioncodes/relayer/utils/auth';
import { version } from '../../../package.json';

export const runtime = "edge";

export async function GET() {
    try {
        const pubkeys = getProtocolPubkeys().map((pKey) => pKey.toBase58());

        return Response.json({
            name: "Official Action Codes Relayer",
            relayer_version: version,
            protocol_version: PROTOCOL_VERSION,
            meta_prefix: PROTOCOL_PREFIX,
            code_prefix: PROTOCOL_CODE_PREFIX,
            timestamp: Date.now(),
            keys: pubkeys,
        });
    } catch (error) {
        console.error(error);
        return Response.json({
            error: "Internal server error",
        }, { status: 500 });
    }
}