/**
 * ratchet.ts
 * 
 * Symmetric Ratchet implementation for per-message forward secrecy.
 * 
 * Each message uses a unique key derived from a chain key via hash chain.
 * Even if one message key is compromised, other messages remain secure.
 * 
 * ALGORITHM:
 * - Chain Key (CK) advances after each message: CK_new = HASH(CK || 0x01)
 * - Message Key (MK) is derived: MK = HASH(CK || 0x02)
 * - Counter tracks message position for out-of-order handling
 */

import sodium from 'libsodium-wrappers';

// Constants for KDF input differentiation
const CHAIN_KEY_CONSTANT = new Uint8Array([0x01]);
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02]);

export type ChainState = {
    chainKey: string;       // Current chain key (base64)
    counter: number;        // Message counter for this chain
};

export const Ratchet = {
    /**
     * Initialize a new chain from the shared secret (root key).
     * Called once when session is established via X3DH.
     */
    async initializeChain(sharedSecret: string): Promise<ChainState> {
        await sodium.ready;

        // Use the shared secret as the initial chain key
        return {
            chainKey: sharedSecret,
            counter: 0
        };
    },

    /**
     * Advance the chain key by one step.
     * CK_new = HASH(CK || 0x01)
     */
    async advanceChainKey(chainKey: string): Promise<string> {
        await sodium.ready;

        const ckBytes = sodium.from_base64(chainKey);
        const input = new Uint8Array(ckBytes.length + 1);
        input.set(ckBytes);
        input.set(CHAIN_KEY_CONSTANT, ckBytes.length);

        const newChainKey = sodium.crypto_generichash(32, input);
        return sodium.to_base64(newChainKey);
    },

    /**
     * Derive a message key from the current chain key.
     * MK = HASH(CK || 0x02)
     * 
     * This key is used for a single message then discarded.
     */
    async deriveMessageKey(chainKey: string): Promise<string> {
        await sodium.ready;

        const ckBytes = sodium.from_base64(chainKey);
        const input = new Uint8Array(ckBytes.length + 1);
        input.set(ckBytes);
        input.set(MESSAGE_KEY_CONSTANT, ckBytes.length);

        const messageKey = sodium.crypto_generichash(32, input);
        return sodium.to_base64(messageKey);
    },

    /**
     * Process sending a message:
     * 1. Derive message key from current chain
     * 2. Advance chain key
     * 3. Return new chain state and message key
     */
    async ratchetForSend(state: ChainState): Promise<{
        newState: ChainState;
        messageKey: string;
        messageIndex: number;
    }> {
        // Derive message key from current chain
        const messageKey = await this.deriveMessageKey(state.chainKey);

        // Advance the chain
        const newChainKey = await this.advanceChainKey(state.chainKey);

        return {
            newState: {
                chainKey: newChainKey,
                counter: state.counter + 1
            },
            messageKey,
            messageIndex: state.counter
        };
    },

    /**
     * Stateless key derivation for decryption.
     * Derives message key directly from session key and message index.
     * This is deterministic and doesn't require chain state tracking.
     * 
     * Used for decrypting any message without chain state sync issues.
     */
    async deriveKeyAtIndex(sessionKey: string, messageIndex: number): Promise<string> {
        // Start from session key and advance to the message index
        let chainKey = sessionKey;
        for (let i = 0; i < messageIndex; i++) {
            chainKey = await this.advanceChainKey(chainKey);
        }
        // Derive the message key at this position
        return this.deriveMessageKey(chainKey);
    }
};
