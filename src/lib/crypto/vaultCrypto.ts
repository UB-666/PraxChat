/**
 * vaultCrypto.ts
 * 
 * Password-protected vault encryption for IndexedDB keys.
 * Uses Web Crypto API for PBKDF2 key derivation and AES-GCM encryption.
 * 
 * SECURITY:
 * - PBKDF2 with 100,000 iterations (OWASP recommendation)
 * - AES-256-GCM for authenticated encryption
 * - Random salt per vault (stored unencrypted)
 * - Random nonce per encrypted value
 * 
 * Follows Signal Desktop approach for browser key protection.
 */

// Session key storage (cleared on tab close)
const SESSION_KEY = 'praxchat_vault_key';

// Constants
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const KEY_BITS = 256;

// Password verification string (to detect wrong password)
const VERIFIER_PLAINTEXT = 'PRAXCHAT_VAULT_VERIFIED_2025';

/**
 * Derive a 256-bit key from password using PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    // Convert Uint8Array to fresh ArrayBuffer for PBKDF2 salt (TypeScript strict compatibility)
    const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: KEY_BITS },
        true, // extractable for session caching
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt a string value with AES-GCM.
 * Returns base64 encoded: [nonce (12 bytes)][ciphertext]
 */
async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        encoder.encode(plaintext)
    );

    // Combine nonce + ciphertext
    const combined = new Uint8Array(nonce.length + ciphertext.byteLength);
    combined.set(nonce);
    combined.set(new Uint8Array(ciphertext), nonce.length);

    return btoa(Array.from(combined).map(b => String.fromCharCode(b)).join(''));
}

/**
 * Decrypt a base64 encoded encrypted value.
 */
async function decrypt(encrypted: string, key: CryptoKey): Promise<string> {
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

    const nonce = combined.slice(0, NONCE_BYTES);
    const ciphertext = combined.slice(NONCE_BYTES);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}

/**
 * Export key to base64 for session storage.
 */
async function exportKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return btoa(Array.from(new Uint8Array(raw)).map(b => String.fromCharCode(b)).join(''));
}

/**
 * Import key from base64.
 */
async function importKey(keyBase64: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM', length: KEY_BITS },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Vault Crypto API
 */
export const VaultCrypto = {
    /**
     * Initialize a new vault with a password.
     * Returns salt and encrypted verifier to store in IndexedDB.
     */
    async initializeVault(password: string): Promise<{
        salt: string;
        verifier: string;
    }> {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const key = await deriveKey(password, salt);
        const verifier = await encrypt(VERIFIER_PLAINTEXT, key);

        // Store key in session storage for current tab
        const exportedKey = await exportKey(key);
        sessionStorage.setItem(SESSION_KEY, exportedKey);

        return {
            salt: btoa(Array.from(salt).map(b => String.fromCharCode(b)).join('')),
            verifier
        };
    },

    /**
     * Unlock vault with password. Returns true if successful.
     */
    async unlockVault(password: string, saltBase64: string, verifier: string): Promise<boolean> {
        try {
            const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
            const key = await deriveKey(password, salt);

            // Verify password by decrypting verifier
            const decrypted = await decrypt(verifier, key);
            if (decrypted !== VERIFIER_PLAINTEXT) {
                return false;
            }

            // Store key in session storage
            const exportedKey = await exportKey(key);
            sessionStorage.setItem(SESSION_KEY, exportedKey);

            return true;
        } catch {
            // Decryption failed - wrong password
            return false;
        }
    },

    /**
     * Check if vault is currently unlocked (key in session).
     */
    isUnlocked(): boolean {
        return sessionStorage.getItem(SESSION_KEY) !== null;
    },

    /**
     * Lock the vault (clear session key).
     */
    lockVault(): void {
        sessionStorage.removeItem(SESSION_KEY);
    },

    /**
     * Encrypt a value using the session key.
     * Throws if vault is locked.
     */
    async encryptValue(value: string): Promise<string> {
        const keyBase64 = sessionStorage.getItem(SESSION_KEY);
        if (!keyBase64) {
            throw new Error('Vault is locked');
        }
        const key = await importKey(keyBase64);
        return encrypt(value, key);
    },

    /**
     * Decrypt a value using the session key.
     * Throws if vault is locked or decryption fails.
     */
    async decryptValue(encrypted: string): Promise<string> {
        const keyBase64 = sessionStorage.getItem(SESSION_KEY);
        if (!keyBase64) {
            throw new Error('Vault is locked');
        }
        const key = await importKey(keyBase64);
        return decrypt(encrypted, key);
    },

    /**
     * Generate random salt (for external use if needed).
     */
    generateSalt(): string {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        return btoa(Array.from(salt).map(b => String.fromCharCode(b)).join(''));
    }
};
