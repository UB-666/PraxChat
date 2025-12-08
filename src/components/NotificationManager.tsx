import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

type NotificationManagerProps = {
    activeConversationId: string | null;
    conversations: { id: string; name: string; recipient_id: string }[];
    incomingCallerId?: string | null;
    onMessageClick?: (conversationId: string) => void;
};

/**
 * Handles browser notifications for messages and calls.
 * Renders nothing - just manages notification logic.
 */
export default function NotificationManager({
    activeConversationId,
    conversations,
    incomingCallerId,
    onMessageClick
}: NotificationManagerProps) {
    const { user } = useAuth();
    const { isSupabaseReady } = useSupabaseAuth();
    const permissionRef = useRef<NotificationPermission>('default');
    const messageAudioRef = useRef<HTMLAudioElement | null>(null);
    const hasRequestedPermissionRef = useRef(false);

    // Use refs to avoid recreating subscription on every render
    const conversationsRef = useRef(conversations);
    const activeConversationIdRef = useRef(activeConversationId);
    const onMessageClickRef = useRef(onMessageClick);

    // Keep refs updated
    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    useEffect(() => {
        onMessageClickRef.current = onMessageClick;
    }, [onMessageClick]);

    // Track if audio is unlocked
    const audioUnlockedRef = useRef(false);

    // Initialize audio and request permission
    useEffect(() => {
        // Check current permission
        if ('Notification' in window) {
            permissionRef.current = Notification.permission;
            console.log('[Notifications] Initial permission:', Notification.permission);
        }

        // Initialize message sound
        const audio = new Audio('/sounds/message.mp3');
        audio.volume = 0.6;
        audio.preload = 'auto';
        messageAudioRef.current = audio;

        // Try to unlock audio on ANY user interaction until successful
        const tryUnlockAudio = () => {
            if (audioUnlockedRef.current) return; // Already unlocked

            if (messageAudioRef.current) {
                const originalVolume = messageAudioRef.current.volume;
                messageAudioRef.current.volume = 0;
                messageAudioRef.current.play()
                    .then(() => {
                        messageAudioRef.current?.pause();
                        messageAudioRef.current!.currentTime = 0;
                        messageAudioRef.current!.volume = originalVolume;
                        audioUnlockedRef.current = true;
                        console.log('[Notifications] ✅ Audio unlocked!');
                        // Remove listeners once unlocked
                        document.removeEventListener('click', tryUnlockAudio);
                        document.removeEventListener('keydown', tryUnlockAudio);
                    })
                    .catch(() => {
                        // Will try again on next interaction
                    });
            }

            // Also request notification permission
            if (!hasRequestedPermissionRef.current) {
                hasRequestedPermissionRef.current = true;
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().then(permission => {
                        permissionRef.current = permission;
                        console.log('[Notifications] Permission granted:', permission);
                    });
                } else if ('Notification' in window) {
                    permissionRef.current = Notification.permission;
                }
            }
        };

        // Listen for clicks AND keypresses to unlock audio
        document.addEventListener('click', tryUnlockAudio);
        document.addEventListener('keydown', tryUnlockAudio);

        return () => {
            messageAudioRef.current?.pause();
            document.removeEventListener('click', tryUnlockAudio);
            document.removeEventListener('keydown', tryUnlockAudio);
        };
    }, []);

    // Subscribe to global messages for notifications - STABLE subscription
    useEffect(() => {
        if (!user || !isSupabaseReady) return;

        console.log('[Notifications] Setting up STABLE subscription for user:', user.id);

        const channel = supabase
            .channel(`notifications_${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                console.log('[Notifications] Message received:', payload.new);

                const msg = payload.new as {
                    conversation_id: string;
                    sender_user_id: string;
                };

                // Skip own messages
                if (msg.sender_user_id === user.id) {
                    console.log('[Notifications] Skipped - own message');
                    return;
                }

                // Skip if user is viewing this conversation AND tab is focused
                if (msg.conversation_id === activeConversationIdRef.current && document.hasFocus()) {
                    console.log('[Notifications] Skipped - viewing this conversation');
                    return;
                }

                // Find sender name
                const conversation = conversationsRef.current.find(c => c.id === msg.conversation_id);
                const senderName = conversation?.name || 'Someone';

                console.log('[Notifications] Processing notification for:', senderName);

                // Play sound
                messageAudioRef.current?.play().catch((e) => {
                    console.log('[Notifications] Sound blocked:', e.message);
                });

                // Show notification (only if tab not focused)
                if (!document.hasFocus() && permissionRef.current === 'granted') {
                    try {
                        const notification = new Notification(`New message from ${senderName}`, {
                            icon: '/logo.svg',
                            tag: `msg-${msg.conversation_id}`,
                            silent: true, // Use our custom sound instead of Windows default
                        });

                        notification.onclick = () => {
                            window.focus();
                            notification.close();
                            onMessageClickRef.current?.(msg.conversation_id);
                        };

                        setTimeout(() => notification.close(), 5000);
                        console.log('[Notifications] Notification shown!');
                    } catch (error) {
                        console.error('[Notifications] Failed:', error);
                    }
                } else {
                    console.log('[Notifications] Skipped notification - focused:', document.hasFocus(), 'permission:', permissionRef.current);
                }
            })
            .subscribe((status) => {
                console.log('[Notifications] Subscription status:', status);
            });

        return () => {
            console.log('[Notifications] Cleaning up subscription');
            supabase.removeChannel(channel);
        };
    }, [user?.id, isSupabaseReady]); // Only depends on user ID and auth ready state

    // Show notification for incoming calls
    useEffect(() => {
        if (!incomingCallerId) return;

        // Find caller name from conversations
        const conversation = conversationsRef.current.find(c => c.recipient_id === incomingCallerId);
        const callerName = conversation?.name || 'Someone';

        if (!document.hasFocus() && permissionRef.current === 'granted') {
            try {
                new Notification('Incoming Call', {
                    body: `${callerName} is calling you...`,
                    icon: '/logo.svg',
                    tag: 'incoming-call',
                });
            } catch (error) {
                console.error('[Notifications] Call notification failed:', error);
            }
        }
    }, [incomingCallerId]);

    // This component renders nothing
    return null;
}
