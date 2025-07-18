import { ActionCodesProtocol, SolanaAdapter } from '@actioncodes/protocol';
import { CODE_TTL } from '../config/constants';

const protocol = new ActionCodesProtocol({
    codeTTL: CODE_TTL,
});
protocol.registerAdapter(new SolanaAdapter());

export default protocol;