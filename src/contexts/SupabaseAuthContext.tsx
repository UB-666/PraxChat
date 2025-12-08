/**
 * SupabaseAuthContext.tsx
 * 
 * PURPOSE:
 * Provides a shared state to synchronize Supabase authentication across components.
 * Prevents race conditions where components try to use Supabase before ClerkSync
 * has finished injecting the authentication token.
 * 
 * USAGE:
 * 1. Wrap your app (or SignedIn sections) with <SupabaseAuthProvider>.
 * 2. In ClerkSync, call setSupabaseReady(true) after successful token injection.
 * 3. In other components, check isSupabaseReady before making Supabase calls.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SupabaseAuthContextType {
    /** True when Supabase client has been authenticated with Clerk token */
    isSupabaseReady: boolean;
    /** Call this after successful token injection */
    setSupabaseReady: (ready: boolean) => void;
    /** Error message if auth failed */
    authError: string | null;
    /** Set auth error */
    setAuthError: (error: string | null) => void;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | null>(null);

interface ProviderProps {
    children: ReactNode;
}

/**
 * Provider component that manages Supabase authentication state.
 * Must be placed above any components that need to access Supabase.
 */
export function SupabaseAuthProvider({ children }: ProviderProps) {
    const [isSupabaseReady, setIsReady] = useState(false);
    const [authError, setError] = useState<string | null>(null);

    const setSupabaseReady = useCallback((ready: boolean) => {
        setIsReady(ready);
        if (ready) {
            setError(null); // Clear any previous errors on success
        }
    }, []);

    const setAuthError = useCallback((error: string | null) => {
        setError(error);
        if (error) {
            setIsReady(false); // If there's an error, we're not ready
        }
    }, []);

    return (
        <SupabaseAuthContext.Provider
            value={{
                isSupabaseReady,
                setSupabaseReady,
                authError,
                setAuthError
            }}
        >
            {children}
        </SupabaseAuthContext.Provider>
    );
}

/**
 * Hook to access Supabase auth state.
 * Throws if used outside of SupabaseAuthProvider.
 */
export function useSupabaseAuth(): SupabaseAuthContextType {
    const context = useContext(SupabaseAuthContext);
    if (!context) {
        throw new Error(
            'useSupabaseAuth must be used within a SupabaseAuthProvider. ' +
            'Wrap your component tree with <SupabaseAuthProvider>.'
        );
    }
    return context;
}
