import type { KeyPair } from './primitives';
import { VaultCrypto } from './vaultCrypto';

const DB_NAME = 'PraxChatKeyStore';
const STORE_NAME = 'keys';
const DB_VERSION = 1;

// Vault metadata ID
const VAULT_META_ID = 'vault_meta';

export type VaultMeta = {
    salt: string;
    verifier: string;
    createdAt: string;
};

export const KeyStore = {
    async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };

            request.onerror = (event) => {
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    },

    // =====================
    // VAULT MANAGEMENT
    // =====================

    /**
     * Check if vault has been initialized (has salt/verifier).
     */
    async hasVault(): Promise<boolean> {
        const meta = await this.getVaultMeta();
        return meta !== undefined;
    },

    /**
     * Check if vault is currently unlocked.
     */
    isVaultUnlocked(): boolean {
        return VaultCrypto.isUnlocked();
    },

    /**
     * Initialize a new vault with password.
     * Creates salt and verifier, stores in IndexedDB.
     */
    async initializeVault(password: string): Promise<void> {
        const { salt, verifier } = await VaultCrypto.initializeVault(password);
        await this.storeVaultMeta({ salt, verifier, createdAt: new Date().toISOString() });
    },

    /**
     * Unlock the vault with password.
     * Returns true on success, false on wrong password.
     */
    async unlockVault(password: string): Promise<boolean> {
        const meta = await this.getVaultMeta();
        if (!meta) {
            throw new Error('Vault not initialized');
        }
        return VaultCrypto.unlockVault(password, meta.salt, meta.verifier);
    },

    /**
     * Lock the vault (clear session key).
     */
    lockVault(): void {
        VaultCrypto.lockVault();
    },

    /**
     * Store vault metadata (salt, verifier).
     */
    async storeVaultMeta(meta: VaultMeta): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: VAULT_META_ID, ...meta });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get vault metadata.
     */
    async getVaultMeta(): Promise<VaultMeta | undefined> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(VAULT_META_ID);
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve({ salt: result.salt, verifier: result.verifier, createdAt: result.createdAt });
                } else {
                    resolve(undefined);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all data (for "forgot password" flow).
     */
    async clearAll(): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                VaultCrypto.lockVault(); // Also clear session
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Store a keypair with encrypted private key (if vault exists).
     * Public key is stored unencrypted (needed for key exchange).
     * If vault not set up (user skipped), stores unencrypted.
     */
    async storeKey(id: string, key: KeyPair): Promise<void> {
        const hasVault = await this.hasVault();

        // If vault exists but is locked, error
        if (hasVault && !VaultCrypto.isUnlocked()) {
            throw new Error('Vault is locked - cannot store keys');
        }

        const db = await this.openDB();

        // Encrypt if vault is set up and unlocked
        if (hasVault && VaultCrypto.isUnlocked()) {
            const encryptedPrivateKey = await VaultCrypto.encryptValue(key.privateKey);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({
                    id,
                    publicKey: key.publicKey,
                    privateKey: encryptedPrivateKey,
                    keyType: key.keyType,
                    encrypted: true
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // No vault (user skipped) - store unencrypted
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({
                id,
                publicKey: key.publicKey,
                privateKey: key.privateKey,
                keyType: key.keyType,
                encrypted: false
            });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a keypair, decrypting the private key.
     * Throws if vault is locked.
     */
    async getKey(id: string): Promise<KeyPair | undefined> {
        const db = await this.openDB();
        const result = await new Promise<any>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) return undefined;

        // If key is encrypted, decrypt it
        if (result.encrypted) {
            if (!VaultCrypto.isUnlocked()) {
                throw new Error('Vault is locked - cannot read keys');
            }
            const decryptedPrivateKey = await VaultCrypto.decryptValue(result.privateKey);
            return {
                publicKey: result.publicKey,
                privateKey: decryptedPrivateKey,
                keyType: result.keyType
            };
        }

        // Legacy unencrypted key (for migration)
        return {
            publicKey: result.publicKey,
            privateKey: result.privateKey,
            keyType: result.keyType
        };
    },

    async storeIdentityKey(keyPair: KeyPair): Promise<void> {
        return this.storeKey('identity', keyPair);
    },

    async getIdentityKey(): Promise<KeyPair | undefined> {
        return this.getKey('identity');
    },

    async storeSession(userId: string, sessionKey: string, header?: any): Promise<void> {
        const hasVault = await this.hasVault();

        if (hasVault && !VaultCrypto.isUnlocked()) {
            throw new Error('Vault is locked - cannot store session');
        }

        const db = await this.openDB();

        if (hasVault && VaultCrypto.isUnlocked()) {
            const encryptedKey = await VaultCrypto.encryptValue(sessionKey);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ id: `session:${userId}`, key: encryptedKey, header, encrypted: true });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // No vault - store unencrypted
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: `session:${userId}`, key: sessionKey, header, encrypted: false });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getSession(userId: string): Promise<{ key: string; header?: any } | undefined> {
        const db = await this.openDB();
        const result = await new Promise<any>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`session:${userId}`);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) return undefined;

        if (result.encrypted) {
            if (!VaultCrypto.isUnlocked()) {
                throw new Error('Vault is locked - cannot read session');
            }
            const decryptedKey = await VaultCrypto.decryptValue(result.key);
            return { key: decryptedKey, header: result.header };
        }

        // Legacy unencrypted
        return { key: result.key, header: result.header };
    },

    async storeSessionByHeader(ephemeralKey: string, sessionKey: string): Promise<void> {
        const hasVault = await this.hasVault();

        if (hasVault && !VaultCrypto.isUnlocked()) {
            throw new Error('Vault is locked - cannot store session');
        }

        const db = await this.openDB();

        if (hasVault && VaultCrypto.isUnlocked()) {
            const encryptedKey = await VaultCrypto.encryptValue(sessionKey);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ id: `session_by_key:${ephemeralKey}`, key: encryptedKey, encrypted: true });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: `session_by_key:${ephemeralKey}`, key: sessionKey, encrypted: false });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getSessionByHeader(ephemeralKey: string): Promise<string | undefined> {
        const db = await this.openDB();
        const result = await new Promise<any>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`session_by_key:${ephemeralKey}`);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) return undefined;

        if (result.encrypted) {
            if (!VaultCrypto.isUnlocked()) {
                throw new Error('Vault is locked - cannot read session');
            }
            return VaultCrypto.decryptValue(result.key);
        }

        // Legacy unencrypted
        return result.key;
    },

    async storeActiveSession(userId: string, sessionKey: string, header: any, peerIdentityKey?: string, deviceCreatedAt?: string): Promise<void> {
        const hasVault = await this.hasVault();

        if (hasVault && !VaultCrypto.isUnlocked()) {
            throw new Error('Vault is locked - cannot store session');
        }

        const db = await this.openDB();

        if (hasVault && VaultCrypto.isUnlocked()) {
            const encryptedKey = await VaultCrypto.encryptValue(sessionKey);
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ id: `active_session:${userId}`, key: encryptedKey, header, peerIdentityKey, deviceCreatedAt, encrypted: true });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: `active_session:${userId}`, key: sessionKey, header, peerIdentityKey, deviceCreatedAt, encrypted: false });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getActiveSession(userId: string): Promise<{ key: string; header: any; peerIdentityKey?: string; deviceCreatedAt?: string } | undefined> {
        const db = await this.openDB();
        const result = await new Promise<any>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`active_session:${userId}`);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) return undefined;

        if (result.encrypted) {
            if (!VaultCrypto.isUnlocked()) {
                throw new Error('Vault is locked - cannot read session');
            }
            const decryptedKey = await VaultCrypto.decryptValue(result.key);
            return {
                key: decryptedKey,
                header: result.header,
                peerIdentityKey: result.peerIdentityKey,
                deviceCreatedAt: result.deviceCreatedAt
            };
        }

        // Legacy unencrypted
        return {
            key: result.key,
            header: result.header,
            peerIdentityKey: result.peerIdentityKey,
            deviceCreatedAt: result.deviceCreatedAt
        };
    },

    async storePreKey(id: number, keyPair: KeyPair): Promise<void> {
        return this.storeKey(`prekey:${id}`, keyPair);
    },

    async getPreKey(id: number): Promise<KeyPair | undefined> {
        return this.getKey(`prekey:${id}`);
    },

    /**
     * Store chain state for symmetric ratchet.
     * Tracks sending and receiving chains separately.
     */
    async storeChainState(
        userId: string,
        sendingChainKey: string,
        sendCounter: number,
        receivingChainKey: string,
        receiveCounter: number
    ): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({
                id: `chain_state:${userId}`,
                sendingChainKey,
                sendCounter,
                receivingChainKey,
                receiveCounter
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getChainState(userId: string): Promise<{
        sendingChainKey: string;
        sendCounter: number;
        receivingChainKey: string;
        receiveCounter: number;
    } | undefined> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`chain_state:${userId}`);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve({
                        sendingChainKey: result.sendingChainKey,
                        sendCounter: result.sendCounter,
                        receivingChainKey: result.receivingChainKey,
                        receiveCounter: result.receiveCounter
                    });
                } else {
                    resolve(undefined);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Store message counter for a session (identified by ephemeralKey).
     * Used for symmetric ratchet to derive unique per-message keys.
     */
    async storeSessionCounter(ephemeralKey: string, counter: number): Promise<void> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({ id: `session_counter:${ephemeralKey}`, counter });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get message counter for a session.
     * Returns 0 if no counter exists (new session).
     */
    async getSessionCounter(ephemeralKey: string): Promise<number> {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`session_counter:${ephemeralKey}`);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.counter : 0);
            };
            request.onerror = () => reject(request.error);
        });
    }
};
