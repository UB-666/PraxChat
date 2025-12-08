import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from './useAuth';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Hook for tracking real-time online/offline status using Supabase Presence.
 * Returns a map of userId -> online status and a method to check if a user is online.
 */
export function usePresence() {
    const { user } = useAuth();
    const { isSupabaseReady } = useSupabaseAuth();
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Check if a specific user is online
    const isUserOnline = useCallback((userId: string): boolean => {
        return onlineUsers.has(userId);
    }, [onlineUsers]);

    // Set up presence channel
    useEffect(() => {
        if (!user || !isSupabaseReady) return;

        console.log('[Presence] Setting up presence for user:', user.id);

        const channel = supabase.channel('online_users', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channelRef.current = channel;

        // Handle presence sync (initial state and updates)
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState<{ user_id: string }>();
            console.log('[Presence] Sync:', state);

            const online = new Set<string>();
            Object.values(state).forEach((presences) => {
                presences.forEach((presence) => {
                    if (presence.user_id) {
                        online.add(presence.user_id);
                    }
                });
            });

            setOnlineUsers(online);
            console.log('[Presence] Online users:', Array.from(online));
        });

        // Handle user joining
        channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('[Presence] User joined:', key, newPresences);
            setOnlineUsers(prev => {
                const next = new Set(prev);
                (newPresences as Array<{ user_id?: string }>).forEach((p) => {
                    if (p.user_id) next.add(p.user_id);
                });
                return next;
            });
        });

        // Handle user leaving
        channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('[Presence] User left:', key, leftPresences);
            setOnlineUsers(prev => {
                const next = new Set(prev);
                (leftPresences as Array<{ user_id?: string }>).forEach((p) => {
                    if (p.user_id) next.delete(p.user_id);
                });
                return next;
            });
        });

        // Subscribe and track our presence
        channel.subscribe(async (status) => {
            console.log('[Presence] Subscription status:', status);
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString(),
                });
                console.log('[Presence] ✅ Tracking started for:', user.id);
            }
        });

        // Handle page visibility changes (tab hidden = offline, visible = online)
        const handleVisibilityChange = async () => {
            if (!channelRef.current) return;

            if (document.visibilityState === 'visible') {
                await channelRef.current.track({
                    user_id: user.id,
                    online_at: new Date().toISOString(),
                });
            } else {
                await channelRef.current.untrack();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Handle page unload
        const handleBeforeUnload = () => {
            channelRef.current?.untrack();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            console.log('[Presence] Cleaning up presence channel');
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            channel.untrack();
            supabase.removeChannel(channel);
        };
    }, [user?.id, isSupabaseReady]);

    return {
        onlineUsers,
        isUserOnline,
    };
}
