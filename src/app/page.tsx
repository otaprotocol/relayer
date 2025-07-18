import { PROTOCOL_CODE_PREFIX, PROTOCOL_PREFIX, PROTOCOL_VERSION } from "@actioncodes/protocol"
import { version } from '../../package.json';
import { getProtocolPubkeys } from "@actioncodes/relayer/utils/auth";

const pubkeys = getProtocolPubkeys().map((pKey) => pKey.toBase58());


const data = {
    name: "Official Action Codes Relayer",
    docs: "https://ota.codes/docs",
    relayer_version: version,
    protocol_version: PROTOCOL_VERSION,
    meta_prefix: PROTOCOL_PREFIX,
    code_prefix: PROTOCOL_CODE_PREFIX,
    timestamp: Date.now(),
    keys: pubkeys,
}

export default function Home() {
    return <div className="flex flex-col items-center justify-center h-screen">
        <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>
    </div>;
}