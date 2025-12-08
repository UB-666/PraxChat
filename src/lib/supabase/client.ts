import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    const msg = 'Missing Supabase environment variables! Check .env.local';
    console.error(msg);
    alert(msg);
    throw new Error(msg);
}

// Internal instance that can be swapped
let internalClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
let isInitialized = false;
let currentToken: string | null = null;

/**
 * PROXY CLIENT
 * Allows swapping the underlying client instance.
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
    get: (_target, prop) => {
        // Forward all property access to the current internal instance
        const value = (internalClient as any)[prop];
        // Bind functions to the instance to preserve 'this' context
        if (typeof value === 'function') {
            return value.bind(internalClient);
        }
        return value;
    }
});

/**
 * Get the current token for manual header injection if needed.
 */
export const getCurrentToken = () => currentToken;

/**
 * INITIAL SETUP - Called ONCE when user first authenticates.
 */
export const setSessionToken = (token: string) => {
    currentToken = token;

    if (isInitialized) {

        refreshToken(token);
        return;
    }


    internalClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        },
        // We also mock the auth state so local checks pass
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
    // Manually set realtime auth immediately
    internalClient.realtime.setAuth(token);
    isInitialized = true;
    // console.log('[SupabaseProxy] Client authenticated via Header Injection.');
};

/**
 * REFRESH TOKEN - Called on subsequent token refreshes.
 */
export const refreshToken = (token: string) => {
    // console.log('[SupabaseProxy] Refreshing token (updating headers + realtime)...');
    currentToken = token;

    // Recreate client with new headers for REST API calls

    const oldRealtime = internalClient.realtime;

    internalClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    // Update realtime on old client to preserve subscriptions, then on new
    oldRealtime.setAuth(token);
    internalClient.realtime.setAuth(token);
};
