/**
 * RegisterDevice.tsx
 * 
 * PURPOSE:
 * Handles device registration and cryptographic key setup for end-to-end encryption.
 * 
 * FLOW:
 * 1. Wait for Clerk user data to load.
 * 2. Wait for Supabase auth to be ready (via SupabaseAuthContext).
 * 3. Ensure user profile exists in database.
 * 4. **NEW** Set up vault password for key encryption.
 * 5. Generate identity keypair if not present locally.
 * 6. Register device with server (stores public key for key exchange).
 * 7. Navigate to main chat.
 * 
 * SECURITY:
 * - Private keys NEVER leave the device (stored in IndexedDB).
 * - Private keys are encrypted with vault password (PBKDF2 + AES-GCM).
 * - Only public keys are uploaded to the server.
 * - Single-device policy for MVP (deletes old devices on new registration).
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Crypto } from '../lib/crypto/primitives';
import { KeyStore } from '../lib/crypto/keystore';
import { supabase } from '../lib/supabase/client';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { ShieldCheck, Loader2, AlertCircle, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';

type RegistrationStatus =
    | 'waiting_clerk'
    | 'waiting_supabase'
    | 'syncing_profile'
    | 'setting_vault_password'
    | 'checking_keys'
    | 'generating_keys'
    | 'registering_device'
    | 'success'
    | 'error';

export default function RegisterDevice() {
    const { user, isLoaded: isClerkLoaded } = useUser();
    const { isSupabaseReady, authError } = useSupabaseAuth();
    const navigate = useNavigate();

    const [status, setStatus] = useState<RegistrationStatus>('waiting_clerk');
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);

    // Vault password state
    const [vaultPassword, setVaultPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [needsVaultSetup, setNeedsVaultSetup] = useState(false);
    const [skippedVault, setSkippedVault] = useState(false);

    // Handle vault password submission
    const handleVaultSetup = useCallback(async () => {
        if (!vaultPassword) {
            setPasswordError('Please enter a password');
            return;
        }
        if (vaultPassword.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }
        if (vaultPassword !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }

        setPasswordError(null);
        setNeedsVaultSetup(false);

        try {
            // Initialize vault with password
            await KeyStore.initializeVault(vaultPassword);
            console.log('[RegisterDevice] Vault initialized');

            // Continue registration by triggering the effect
            setStatus('checking_keys');
        } catch (e: any) {
            setPasswordError(e.message || 'Failed to set up vault');
            setNeedsVaultSetup(true);
        }
    }, [vaultPassword, confirmPassword]);

    useEffect(() => {
        async function register() {
            // --- Gate 1: Wait for Clerk ---
            if (!isClerkLoaded) {
                setStatus('waiting_clerk');
                setStatusMessage('Loading user data from Clerk...');
                return;
            }

            if (!user) {
                setError('No user found. Redirecting to sign-in...');
                setStatus('error');
                navigate('/auth');
                return;
            }

            // --- Gate 2: Wait for Supabase Auth ---
            if (!isSupabaseReady) {
                setStatus('waiting_supabase');
                setStatusMessage('Waiting for secure connection...');

                // Check for auth errors from ClerkSync
                if (authError) {
                    setError(`Auth failed: ${authError}`);
                    setStatus('error');
                }
                return;
            }

            // --- Gate 3: Check if we need to wait for vault setup ---
            if (needsVaultSetup) {
                return; // Wait for user to set password
            }

            console.log('[RegisterDevice] Starting registration for:', user.id);

            try {
                // --- Step 1: Ensure Profile Exists ---
                setStatus('syncing_profile');
                setStatusMessage('Syncing profile to database...');

                const email = user.primaryEmailAddress?.emailAddress;
                const username = user.username;

                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: user.id,
                        email: email || null,
                        username: username || null,
                    } as any, { onConflict: 'id' });

                if (profileError) {
                    console.error('[RegisterDevice] Profile sync failed:', profileError);
                    setError(`Profile sync failed: ${profileError.message}`);
                    setStatus('error');
                    return;
                }

                console.log('[RegisterDevice] Profile synced successfully');

                // --- Step 2: Check Vault Status ---
                const hasVault = await KeyStore.hasVault();

                if (!hasVault && !skippedVault) {
                    // New device - need vault password (unless user already skipped)
                    console.log('[RegisterDevice] No vault found, prompting for password');
                    setStatus('setting_vault_password');
                    setStatusMessage('Set up your vault password to protect your keys');
                    setNeedsVaultSetup(true);
                    return;
                }

                // Vault exists but might be locked - redirect to main for unlock
                if (hasVault && !KeyStore.isVaultUnlocked()) {
                    console.log('[RegisterDevice] Vault locked, redirecting...');
                    navigate('/');
                    return;
                }

                // If no vault (user skipped), continue with unencrypted storage

                // --- Step 3: Check Local Identity Key ---
                setStatus('checking_keys');
                setStatusMessage('Checking local identity keys...');

                let identityKey = await KeyStore.getIdentityKey();
                let shouldRegister = false;

                if (!identityKey) {
                    // Fresh install: Generate new identity
                    console.log('[RegisterDevice] No local key, generating new one');
                    setStatus('generating_keys');
                    setStatusMessage('Generating new identity keypair...');

                    identityKey = await Crypto.generateIdentityKeyPair();
                    await KeyStore.storeIdentityKey(identityKey);
                    shouldRegister = true;
                } else {
                    // Existing key: Verify server registration
                    console.log('[RegisterDevice] Found local key, checking server...');
                    const localPreKey = await KeyStore.getPreKey(0);

                    const { data: existingDevices } = await supabase
                        .from('devices')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('public_identity_key', identityKey.publicKey);

                    // Skip registration if: Server has device AND we have PreKey
                    if (existingDevices && existingDevices.length > 0 && localPreKey) {
                        console.log('[RegisterDevice] Device already registered, skipping.');
                        setStatus('success');
                        setStatusMessage('Device verified. Redirecting...');
                        setTimeout(() => navigate('/'), 500);
                        return;
                    } else {
                        console.warn('[RegisterDevice] Key mismatch or missing prekey. Re-registering.');
                        shouldRegister = true;
                    }
                }

                // --- Step 3: Register Device ---
                if (shouldRegister) {
                    setStatus('registering_device');
                    setStatusMessage('Registering device with server...');

                    // Generate pool of 10 prekeys for security
                    const PREKEY_COUNT = 10;
                    const preKeyPublics: string[] = [];

                    for (let i = 0; i < PREKEY_COUNT; i++) {
                        const preKey = await Crypto.generatePreKey();
                        await KeyStore.storePreKey(i, preKey);
                        preKeyPublics.push(preKey.publicKey);
                    }

                    console.log(`[RegisterDevice] Generated ${PREKEY_COUNT} prekeys`);

                    // Remove old devices (single-device policy for MVP)
                    await supabase
                        .from('devices')
                        .delete()
                        .eq('user_id', user.id);

                    // Register this device with all prekeys
                    const { error: deviceError } = await supabase
                        .from('devices')
                        .insert({
                            user_id: user.id,
                            device_name: navigator.userAgent.slice(0, 100),
                            public_identity_key: identityKey.publicKey,
                            public_prekeys: preKeyPublics as any,
                        } as any);

                    if (deviceError) {
                        console.error('[RegisterDevice] Device registration failed:', deviceError);
                        setError(`Device registration failed: ${deviceError.message}`);
                        setStatus('error');
                        return;
                    }

                    console.log('[RegisterDevice] Device registered successfully!');
                }

                // --- Success ---
                setStatus('success');
                setStatusMessage('Success! Redirecting to chat...');
                setTimeout(() => navigate('/'), 500);

            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error('[RegisterDevice] Unexpected error:', message);
                setError(message);
                setStatus('error');
            }
        }

        register();
    }, [user, isClerkLoaded, isSupabaseReady, authError, navigate, needsVaultSetup, skippedVault]);

    const isError = status === 'error';
    const isSuccess = status === 'success';
    const isVaultSetup = status === 'setting_vault_password';

    // Vault password setup UI
    if (isVaultSetup) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950">
                <div className="w-full max-w-md p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl mx-4">
                    {/* Header */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
                            <Lock className="w-8 h-8 text-indigo-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Secure Your Keys</h1>
                        <p className="text-zinc-400 text-sm text-center mt-2">
                            Create a vault password to protect your encryption keys
                        </p>
                    </div>

                    {/* Password Inputs */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="vault-password" className="block text-sm font-medium text-zinc-300 mb-2">
                                Vault Password
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                <input
                                    id="vault-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={vaultPassword}
                                    onChange={(e) => setVaultPassword(e.target.value)}
                                    placeholder="Enter vault password (min 8 chars)"
                                    className="w-full pl-10 pr-10 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-400"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {/* Password strength indicator */}
                            {vaultPassword && (
                                <div className="mt-2 flex gap-1">
                                    <div className={`h-1 flex-1 rounded ${vaultPassword.length >= 8 ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div className={`h-1 flex-1 rounded ${vaultPassword.length >= 12 ? 'bg-green-500' : 'bg-zinc-700'}`} />
                                    <div className={`h-1 flex-1 rounded ${vaultPassword.length >= 16 ? 'bg-green-500' : 'bg-zinc-700'}`} />
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="confirm-password" className="block text-sm font-medium text-zinc-300 mb-2">
                                Confirm Password
                            </label>
                            <input
                                id="confirm-password"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm vault password"
                                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>

                        {/* Error Message */}
                        {passwordError && (
                            <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400">{passwordError}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            onClick={handleVaultSetup}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <ShieldCheck className="w-5 h-5" />
                            Create Secure Vault
                        </button>

                        {/* Skip Option */}
                        <button
                            onClick={() => {
                                // Skip vault setup - continue without encryption
                                setSkippedVault(true);
                                setNeedsVaultSetup(false);
                                setStatus('checking_keys');
                            }}
                            className="w-full py-2 text-zinc-500 hover:text-zinc-400 text-sm transition-colors"
                        >
                            Skip for now (less secure)
                        </button>
                    </div>

                    {/* Security Note */}
                    <p className="mt-6 text-xs text-zinc-600 text-center">
                        <strong className="text-zinc-500">Recommended:</strong> Set a vault password to protect your keys.{' '}
                        Skipping leaves keys accessible to browser extensions.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center space-y-4 max-w-md px-4">
                {/* Status Icon */}
                <div className={`rounded-full p-4 ${isError ? 'bg-red-900/30' :
                    isSuccess ? 'bg-green-900/30' :
                        'bg-indigo-900/30'
                    }`}>
                    {isError ? (
                        <AlertCircle className="h-8 w-8 text-red-400" />
                    ) : isSuccess ? (
                        <ShieldCheck className="h-8 w-8 text-green-400" />
                    ) : (
                        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                    )}
                </div>

                {/* Title */}
                <h2 className="text-xl font-semibold text-white text-center">
                    {isError ? 'Setup Failed' :
                        isSuccess ? 'Setup Complete' :
                            'Setting up secure session'}
                </h2>

                {/* Status Message */}
                <p className={`text-sm text-center ${isError ? 'text-red-400' : 'text-zinc-400'
                    }`}>
                    {error || statusMessage}
                </p>

                {/* Debug Info */}
                <div className="mt-4 p-3 bg-black/50 rounded text-xs font-mono text-zinc-600 w-full">
                    <div>User ID: {user?.id || 'Loading...'}</div>
                    <div>Email: {user?.primaryEmailAddress?.emailAddress || 'N/A'}</div>
                    <div>Username: {user?.username || 'NOT SET'}</div>
                    <div>Clerk: {isClerkLoaded ? '✓' : '...'}</div>
                    <div>Supabase: {isSupabaseReady ? '✓' : '...'}</div>
                </div>

                {/* Retry Button */}
                {isError && (
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors"
                    >
                        Retry
                    </button>
                )}
            </div>
        </div>
    );
}
