import { clusterApiUrl, Connection } from '@solana/web3.js';
import { ActionCodesProtocol, SolanaAdapter } from '@actioncodes/protocol';
import { CODE_TTL } from '../config/constants';

const protocol = new ActionCodesProtocol({
    codeTTL: CODE_TTL,
});

protocol.registerAdapter(new SolanaAdapter());

export const solanaConnection = new Connection(process.env.RPC_SOLANA_URL! || clusterApiUrl('mainnet-beta'));

export default protocol;