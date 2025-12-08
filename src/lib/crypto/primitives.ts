import sodium from 'libsodium-wrappers';

export type KeyPair = {
    publicKey: string;
    privateKey: string;
    keyType: 'ed25519' | 'x25519';
};

export const Crypto = {
    ready: sodium.ready,

    async generateIdentityKeyPair(): Promise<KeyPair> {
        await sodium.ready;
        const kp = sodium.crypto_sign_keypair();
        return {
            publicKey: sodium.to_base64(kp.publicKey),
            privateKey: sodium.to_base64(kp.privateKey),
            keyType: 'ed25519',
        };
    },

    async generatePreKey(): Promise<KeyPair> {
        await sodium.ready;
        const kp = sodium.crypto_box_keypair();
        return {
            publicKey: sodium.to_base64(kp.publicKey),
            privateKey: sodium.to_base64(kp.privateKey),
            keyType: 'x25519',
        };
    },

    async sign(message: string, privateKey: string): Promise<string> {
        await sodium.ready;
        const signature = sodium.crypto_sign_detached(
            message,
            sodium.from_base64(privateKey)
        );
        return sodium.to_base64(signature);
    },

    async verify(message: string, signature: string, publicKey: string): Promise<boolean> {
        await sodium.ready;
        try {
            return sodium.crypto_sign_verify_detached(
                sodium.from_base64(signature),
                message,
                sodium.from_base64(publicKey)
            );
        } catch {
            return false;
        }
    },

    async computeSharedSecret(myPrivateKey: string, theirPublicKey: string): Promise<string> {
        await sodium.ready;
        const secret = sodium.crypto_scalarmult(
            sodium.from_base64(myPrivateKey),
            sodium.from_base64(theirPublicKey)
        );
        return sodium.to_base64(secret);
    },

    async convertEd25519PublicKeyToCurve25519(ed25519PublicKey: string): Promise<string> {
        await sodium.ready;
        const curve25519Pk = sodium.crypto_sign_ed25519_pk_to_curve25519(
            sodium.from_base64(ed25519PublicKey)
        );
        return sodium.to_base64(curve25519Pk);
    },

    async convertEd25519SecretKeyToCurve25519(ed25519SecretKey: string): Promise<string> {
        await sodium.ready;
        const curve25519Sk = sodium.crypto_sign_ed25519_sk_to_curve25519(
            sodium.from_base64(ed25519SecretKey)
        );
        return sodium.to_base64(curve25519Sk);
    },

    async genericHash(input: string): Promise<string> {
        await sodium.ready;
        const hash = sodium.crypto_generichash(32, sodium.from_string(input));
        return sodium.to_base64(hash);
    },
};
