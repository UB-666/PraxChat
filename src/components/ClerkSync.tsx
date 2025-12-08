/**
 * ClerkSync.tsx
 * 
 * PURPOSE:
 * Synchronizes Clerk authentication state with Supabase.
 * Includes AUTOMATIC TOKEN REFRESH to prevent JWT expiration errors.
 * 
 * FLOW:
 * 1. Wait for Clerk to load user data.
 * 2. Get a Supabase-compatible JWT from Clerk.
 * 3. Inject token into Supabase client (Header Injection bypass).
 * 4. Signal to the rest of the app that Supabase is ready.
 * 5. Set up periodic refresh to keep token fresh.
 */

import { useUser, useAuth } from "@clerk/clerk-react";
import { useEffect, useRef, useCallback } from "react";
import { supabase, setSessionToken } from "../lib/supabase/client";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext";

// Refresh token 10 seconds before expiry (Clerk tokens are 60s by default)
const TOKEN_REFRESH_INTERVAL_MS = 50 * 1000; // 50 seconds

export default function ClerkSync() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const { setSupabaseReady, setAuthError } = useSupabaseAuth();

    const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasInitialized = useRef(false);


    const refreshToken = useCallback(async () => {
        if (!user) return false;

        try {
            // Get fresh token from Clerk (Clerk handles its own refresh logic)
            const token = await getToken({ template: 'supabase' });

            if (!token) {
                console.warn('[ClerkSync] No token received from Clerk');
                return false;
            }

            // Inject fresh token into Supabase client
            setSessionToken(token);
            // console.log('[ClerkSync] 🔄 Token refreshed');
            return true;

        } catch (err) {
            console.error('[ClerkSync] Token refresh failed:', err);
            return false;
        }
    }, [user, getToken]);

    // Initial setup and profile sync
    useEffect(() => {
        if (!isLoaded || !user) {
            hasInitialized.current = false;
            return;
        }

        const initializeAuth = async () => {
            // Skip if already initialized in this session
            if (hasInitialized.current) return;

            // console.log('[ClerkSync] Starting auth sync for:', user.id);

            try {

                const token = await getToken({ template: 'supabase' });

                if (!token) {
                    const errorMsg = "Clerk 'supabase' JWT Template is missing.";
                    console.error('[ClerkSync]', errorMsg);
                    setAuthError(errorMsg);
                    return;
                }

                // 2. Attempt Standard Session Setup (usually fails for Clerk IDs)
                const { error: authError } = await supabase.auth.setSession({
                    access_token: token,
                    refresh_token: token
                });

                if (authError) {
                    if (authError.message.includes('UUID')) {
                        console.warn('[ClerkSync] Using Header Injection bypass.');
                        setSessionToken(token);
                    } else {
                        console.error('[ClerkSync] Auth error:', authError.message);
                        setAuthError(authError.message);
                        return;
                    }
                }

                // 3. Mark as ready
                hasInitialized.current = true;
                setSupabaseReady(true);
                // console.log('[ClerkSync] ✅ Supabase client authenticated.');

                // 4. Upsert Profile
                const email = user.primaryEmailAddress?.emailAddress;
                if (email) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .upsert({
                            id: user.id,
                            email: email,
                            username: user.username || null,
                        } as any, { onConflict: 'id' });

                    if (profileError) {
                        console.error('[ClerkSync] Profile upsert failed:', profileError.message);
                    } else {
                        // console.log('[ClerkSync] Profile synced.');
                    }
                }

                // 5. Start periodic token refresh
                if (refreshIntervalRef.current) {
                    clearInterval(refreshIntervalRef.current);
                }

                refreshIntervalRef.current = setInterval(() => {

                    refreshToken();
                }, TOKEN_REFRESH_INTERVAL_MS);



            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error('[ClerkSync] Unexpected error:', message);
                setAuthError(message);
            }
        };

        initializeAuth();

        // Cleanup on unmount
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
        };
    }, [user, isLoaded, getToken, setSupabaseReady, setAuthError, refreshToken]);

    return null;
}
