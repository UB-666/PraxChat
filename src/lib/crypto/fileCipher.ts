import sodium from 'libsodium-wrappers';

export const FileCipher = {
    /**
     * Encrypts a file using a random ephemeral key (ChaCha20-Poly1305).
     * Returns the encrypted blob and the base64 key.
     */
    async encryptFile(file: File): Promise<{ encryptedBlob: Blob; key: string }> {
        await sodium.ready;

        // 1. Generate random key for this file
        const keyBytes = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
        const key = sodium.to_base64(keyBytes);

        // 2. Generate nonce
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

        // 3. Read file
        const buffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(buffer);

        // 4. Encrypt
        const ciphertext = sodium.crypto_secretbox_easy(inputBytes, nonce, keyBytes);

        // 5. Pack [Nonce + Ciphertext]
        const combined = new Uint8Array(nonce.length + ciphertext.length);
        combined.set(nonce);
        combined.set(ciphertext, nonce.length);

        const encryptedBlob = new Blob([combined]);

        return { encryptedBlob, key };
    },

    /**
     * Decrypts a file blob using the provided key.
     */
    async decryptFile(encryptedBlob: Blob, key: string, mimeType: string = 'application/octet-stream'): Promise<Blob> {
        await sodium.ready;

        const keyBytes = sodium.from_base64(key);
        const buffer = await encryptedBlob.arrayBuffer();
        const combined = new Uint8Array(buffer);

        if (combined.length < sodium.crypto_secretbox_NONCEBYTES) {
            throw new Error('File too short to contain nonce');
        }

        const nonce = combined.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = combined.subarray(sodium.crypto_secretbox_NONCEBYTES);

        const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, keyBytes);

        // Create a new Uint8Array with a fresh ArrayBuffer for Blob compatibility (TS 5.9+ strict typing)
        return new Blob([new Uint8Array(decrypted)], { type: mimeType });
    }
};
