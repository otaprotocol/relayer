// Copyright 2025 Trana, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { clusterApiUrl, Connection } from '@solana/web3.js';
import { ActionCodesProtocol, SolanaAdapter } from '@actioncodes/protocol';
import { CODE_TTL } from '../config/constants';

const protocol = new ActionCodesProtocol({
    codeTTL: CODE_TTL,
});

protocol.registerAdapter(new SolanaAdapter());

export const solanaConnection = new Connection(process.env.RPC_SOLANA_URL! || clusterApiUrl('mainnet-beta'));

export default protocol;