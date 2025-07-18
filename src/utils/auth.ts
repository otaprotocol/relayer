import { Keypair, PublicKey } from "@solana/web3.js";

export const getProtocolKeypairs = (): Keypair[] => {
    const authKeysRaw = process.env.PROTOCOL_AUTHS;
    if (!authKeysRaw) {
        throw new Error("PROTOCOL_AUTHS is not set");
    }

    const authKeys = JSON.parse(authKeysRaw) as number[][];


    const keypairs = authKeys.map((pKey) => {
        return Keypair.fromSecretKey(Uint8Array.from(pKey));
    });
    return keypairs;
}

export const getProtocolPubkeys = (): PublicKey[] => {
    const keypairs = getProtocolKeypairs();
    return keypairs.map((keypair) => keypair.publicKey);
}