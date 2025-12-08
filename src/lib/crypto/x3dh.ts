import { supabase } from '../supabase/client';
import { Crypto } from './primitives';
import { KeyStore } from './keystore';

export type X3DHHeader = {
    senderIdentityKey: string;
    ephemeralKey: string;
    preKeyId?: number; // If we used a one-time prekey
};

export type Session = {
    sharedSecret: string;
    header: X3DHHeader;
};

export const X3DH = {
    async fetchPeerBundle(userId: string) {
        const { data, error } = await supabase
            .from('devices')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .limit(1)
            .single() as any;

        if (error || !data) {
            throw new Error('Peer not found or has no devices registered');
        }

        return data;
    },

    async establishSession(recipientUserId: string): Promise<Session> {
        // 1. Get my identity key
        const myIdentityKey = await KeyStore.getIdentityKey();
        if (!myIdentityKey) throw new Error('My identity key not found');

        // 2. Get recipient's bundle
        const peerDevice = await this.fetchPeerBundle(recipientUserId);

        // 3. Generate Ephemeral Key (EK)
        const ephemeralKey = await Crypto.generatePreKey();

        // 4. Perform DH calculations
        const myIdPrivCurve = await Crypto.convertEd25519SecretKeyToCurve25519(myIdentityKey.privateKey);
        const peerIdPubCurve = await Crypto.convertEd25519PublicKeyToCurve25519(peerDevice.public_identity_key);

        const peerPreKeys = peerDevice.public_prekeys as string[];
        if (!peerPreKeys || peerPreKeys.length === 0) {
            throw new Error('Peer has no prekeys');
        }

        // Select a random prekey from the pool for better security
        const preKeyIndex = Math.floor(Math.random() * peerPreKeys.length);
        const peerPreKey = peerPreKeys[preKeyIndex];

        const dh1 = await Crypto.computeSharedSecret(myIdPrivCurve, peerPreKey);
        const dh2 = await Crypto.computeSharedSecret(ephemeralKey.privateKey, peerIdPubCurve);
        const dh3 = await Crypto.computeSharedSecret(ephemeralKey.privateKey, peerPreKey);

        const sharedSecretInput = dh1 + dh2 + dh3;
        const sharedSecret = await Crypto.genericHash(sharedSecretInput);

        return {
            sharedSecret,
            header: {
                senderIdentityKey: myIdentityKey.publicKey,
                ephemeralKey: ephemeralKey.publicKey,
                preKeyId: preKeyIndex, // Track which prekey was used
            }
        };
    },

    async deriveSessionFromHeader(header: X3DHHeader, myPreKeyPrivate: string): Promise<string> {
        // Receiver side derivation
        const myIdentityKey = await KeyStore.getIdentityKey();
        if (!myIdentityKey) throw new Error('My identity key not found');

        const myIdPrivCurve = await Crypto.convertEd25519SecretKeyToCurve25519(myIdentityKey.privateKey);
        const senderIdPubCurve = await Crypto.convertEd25519PublicKeyToCurve25519(header.senderIdentityKey);

        const ephemeralPub = header.ephemeralKey;

        // DH1 = DH(myPreKeyPrivate, senderIdentityKeyPublic)
        // Sender did: DH(myIdPrivCurve, peerPreKey) -> Peer is ME. So Sender Identity * My PreKey
        const dh1 = await Crypto.computeSharedSecret(myPreKeyPrivate, senderIdPubCurve);

        // DH2 = DH(myIdentityKeyPrivate, ephemeralKeyPublic)
        // Sender did: DH(ephemeralKeyPrivate, peerIdPubCurve) -> Ephemeral * My Identity
        const dh2 = await Crypto.computeSharedSecret(myIdPrivCurve, ephemeralPub);

        // DH3 = DH(myPreKeyPrivate, ephemeralKeyPublic)
        // Sender did: DH(ephemeralKeyPrivate, peerPreKey) -> Ephemeral * My PreKey
        const dh3 = await Crypto.computeSharedSecret(myPreKeyPrivate, ephemeralPub);

        const sharedSecretInput = dh1 + dh2 + dh3;
        return Crypto.genericHash(sharedSecretInput);
    }
};
