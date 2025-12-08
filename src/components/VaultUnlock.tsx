import { useState, useCallback } from 'react';
import { KeyStore } from '../lib/crypto/keystore';
import { Lock, Unlock, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type VaultUnlockProps = {
    onUnlock: () => void;
};

export default function VaultUnlock({ onUnlock }: VaultUnlockProps) {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [showForgotConfirm, setShowForgotConfirm] = useState(false);

    const MAX_ATTEMPTS = 5;

    const handleUnlock = useCallback(async () => {
        if (!password.trim()) {
            setError('Please enter your vault password');
            return;
        }

        // Check persistent attempts
        const storedAttempts = parseInt(localStorage.getItem('vault_attempts') || '0', 10);
        if (storedAttempts >= MAX_ATTEMPTS) {
            setError(`Too many failed attempts. Please use "Forgot Password" to reset.`);
            return;
        }

        setIsUnlocking(true);
        setError(null);

        try {
            const success = await KeyStore.unlockVault(password);

            if (success) {
                // Clear attempts on success
                localStorage.removeItem('vault_attempts');
                setAttempts(0);
                onUnlock();
            } else {
                const newAttempts = storedAttempts + 1;
                localStorage.setItem('vault_attempts', newAttempts.toString());
                setAttempts(newAttempts);

                if (newAttempts >= MAX_ATTEMPTS) {
                    setError(`Too many failed attempts. Please use "Forgot Password" to reset.`);
                } else {
                    setError(`Incorrect password. ${MAX_ATTEMPTS - newAttempts} attempts remaining.`);
                }
                setPassword('');
            }
        } catch (e: any) {
            setError(e.message || 'Failed to unlock vault');
        } finally {
            setIsUnlocking(false);
        }
    }, [password, onUnlock]);

    // Initialize attempts from storage
    useState(() => {
        const stored = parseInt(localStorage.getItem('vault_attempts') || '0', 10);
        setAttempts(stored);
    });

    const handleForgotPassword = useCallback(async () => {
        try {
            // Clear all vault data
            await KeyStore.clearAll();
            // Redirect to device registration
            navigate('/register-device');
        } catch (e: any) {
            setError('Failed to reset vault: ' + e.message);
        }
    }, [navigate]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isUnlocking && attempts < MAX_ATTEMPTS) {
            handleUnlock();
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-zinc-950 z-50">
            <div className="w-full max-w-md p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
                {/* Header */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Vault Locked</h1>
                    <p className="text-zinc-400 text-sm text-center mt-2">
                        Enter your vault password to access your encrypted keys
                    </p>
                </div>

                {/* Password Input */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="vault-password" className="block text-sm font-medium text-zinc-300 mb-2">
                            Vault Password
                        </label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                            <input
                                id="vault-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isUnlocking || attempts >= MAX_ATTEMPTS}
                                placeholder="Enter vault password"
                                className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Unlock Button */}
                    <button
                        onClick={handleUnlock}
                        disabled={isUnlocking || attempts >= MAX_ATTEMPTS}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {isUnlocking ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Unlocking...
                            </>
                        ) : (
                            <>
                                <Unlock className="w-5 h-5" />
                                Unlock Vault
                            </>
                        )}
                    </button>

                    {/* Forgot Password */}
                    <div className="text-center">
                        {!showForgotConfirm ? (
                            <button
                                onClick={() => setShowForgotConfirm(true)}
                                className="text-sm text-zinc-400 hover:text-indigo-400 transition-colors"
                            >
                                Forgot password?
                            </button>
                        ) : (
                            <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-left">
                                <p className="text-sm text-red-400 mb-3">
                                    <strong>Warning:</strong> This will delete all your encryption keys and chat history. You will need to re-register your device.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowForgotConfirm(false)}
                                        className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleForgotPassword}
                                        className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
                                    >
                                        Reset Vault
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Security Note */}
                <p className="mt-6 text-xs text-zinc-600 text-center">
                    Your vault password protects your encryption keys.{' '}
                    <span className="text-zinc-500">It cannot be recovered if forgotten.</span>
                </p>
            </div>
        </div>
    );
}
