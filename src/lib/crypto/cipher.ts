import sodium from 'libsodium-wrappers';

export const Cipher = {
    async encryptMessage(message: string, key: string): Promise<string> {
        await sodium.ready;
        const keyBytes = sodium.from_base64(key);
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = sodium.crypto_secretbox_easy(message, nonce, keyBytes);

        // Combine nonce and ciphertext
        const combined = new Uint8Array(nonce.length + ciphertext.length);
        combined.set(nonce);
        combined.set(ciphertext, nonce.length);

        return sodium.to_base64(combined);
    },

    async decryptMessage(encryptedMessage: string, key: string): Promise<string> {
        await sodium.ready;
        const keyBytes = sodium.from_base64(key);
        const combined = sodium.from_base64(encryptedMessage);

        const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);

        const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, keyBytes);
        return sodium.to_string(decrypted);
    }
};
