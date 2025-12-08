import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from './useAuth';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { KeyStore } from '../lib/crypto/keystore';
import { X3DH, type X3DHHeader } from '../lib/crypto/x3dh';
import { Cipher } from '../lib/crypto/cipher';
import { Ratchet } from '../lib/crypto/ratchet';
import imageCompression from 'browser-image-compression';
import { v4 as uuidv4 } from 'uuid';
import { FileCipher } from '../lib/crypto/fileCipher';

export type ChatMessage = {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    sent: boolean;
    attachment_ptr?: string;
    reply_to?: {
        id: string;
        content: string;
        sender_id: string;
        sent: boolean;
    };
};

export type ChatConversation = {
    id: string;
    name: string;
    last_message?: string;
    updated_at: string;
    unread_count: number;
    recipient_id: string;
    avatar_url?: string;
};

export function useChat() {
    const { user } = useAuth();
    const { isSupabaseReady } = useSupabaseAuth();
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);


    useEffect(() => {
        if (!user || !isSupabaseReady) return;

        const fetchConversations = async () => {

            const { data: myConvos, error } = await supabase
                .from('conversation_participants')
                .select('conversation_id, conversations(updated_at)')
                .eq('user_id', user.id)
                .returns<{ conversation_id: string; conversations: { updated_at: string } | null }[]>();

            if (error || !myConvos) return;

            const convos: ChatConversation[] = [];

            for (const c of myConvos) {
                const { data: other } = await supabase
                    .from('conversation_participants')
                    .select('user_id, profiles(email, username, avatar_url)')
                    .eq('conversation_id', c.conversation_id)
                    .neq('user_id', user.id)
                    .single() as { data: { user_id: string; profiles: { email: string; username: string; avatar_url: string } | null } | null };


                const { data: unreadCount } = await (supabase.rpc as Function)('get_unread_count', {
                    p_conversation_id: c.conversation_id,
                    p_user_id: user.id
                }) as { data: number | null };

                if (other && other.profiles) {
                    convos.push({
                        id: c.conversation_id,
                        name: other.profiles.username || other.profiles.email || 'Unknown',
                        updated_at: c.conversations?.updated_at || '',
                        unread_count: unreadCount ?? 0,
                        recipient_id: other.user_id,
                        avatar_url: other.profiles.avatar_url
                    });
                }
            }

            setConversations(convos);
        };

        fetchConversations();
    }, [user?.id, isSupabaseReady]);

    // Keep a ref to conversations for use in subscription callback
    const conversationsRef = useRef(conversations);
    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);


    const activeConversationIdRef = useRef(activeConversationId);
    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
    }, [activeConversationId]);

    // Global subscription: handles BOTH unread count AND realtime message display
    useEffect(() => {
        if (!user || !isSupabaseReady) return;

        const channel = supabase
            .channel('global_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                const msg = payload.new as any;




                if (msg.sender_user_id === user.id) {

                    return;
                }

                // If this message is for a conversation the user is NOT currently viewing, increment unread
                if (msg.conversation_id !== activeConversationIdRef.current) {

                    setConversations(prev => prev.map(c =>
                        c.id === msg.conversation_id
                            ? { ...c, unread_count: c.unread_count + 1 }
                            : c
                    ));
                } else {
                    // Message IS for active conversation - add it to messages


                    // Process message asynchronously
                    (async () => {
                        let content = '[Encrypted Message]';
                        try {
                            const ciphertext = msg.ciphertext;
                            const header = msg.ciphertext_header as X3DHHeader;

                            let sessionKey = header ? await KeyStore.getSessionByHeader(header.ephemeralKey) : null;

                            if (!sessionKey && header) {
                                const preKeyId = header.preKeyId || 0;
                                const myPreKey = await KeyStore.getPreKey(preKeyId);
                                if (myPreKey) {
                                    sessionKey = await X3DH.deriveSessionFromHeader(header, myPreKey.privateKey);
                                    await KeyStore.storeSessionByHeader(header.ephemeralKey, sessionKey);
                                }
                            }

                            if (sessionKey) {

                                const messageIndex = (header as any).messageIndex;
                                let decryptKey = sessionKey;
                                if (typeof messageIndex === 'number') {
                                    decryptKey = await Ratchet.deriveKeyAtIndex(sessionKey, messageIndex);
                                }
                                content = await Cipher.decryptMessage(ciphertext, decryptKey);
                            }
                        } catch (e) {
                            console.error('[useChat] Decrypt error:', e);
                        }


                        let replyTo: ChatMessage['reply_to'] = undefined;
                        if (msg.reply_to_message_id) {
                            try {
                                const { data: replyMsg } = await supabase
                                    .from('messages')
                                    .select('id, sender_user_id, ciphertext, ciphertext_header')
                                    .eq('id', msg.reply_to_message_id)
                                    .single();

                                if (replyMsg) {
                                    let replyContent = '[Quoted Message]';
                                    try {
                                        const replyHeader = (replyMsg as any).ciphertext_header as X3DHHeader;
                                        if (replyHeader && (replyMsg as any).ciphertext) {
                                            const replySession = await KeyStore.getSessionByHeader(replyHeader.ephemeralKey);
                                            if (replySession) {
                                                replyContent = await Cipher.decryptMessage((replyMsg as any).ciphertext, replySession);
                                                if (replyContent.length > 100) {
                                                    replyContent = replyContent.substring(0, 100) + '...';
                                                }
                                            }
                                        }
                                    } catch {
                                        replyContent = '[Encrypted Message]';
                                    }

                                    replyTo = {
                                        id: (replyMsg as any).id,
                                        content: replyContent,
                                        sender_id: (replyMsg as any).sender_user_id,
                                        sent: (replyMsg as any).sender_user_id === user.id
                                    };
                                }
                            } catch { }
                        }

                        setMessages(prev => {

                            if (prev.some(m => m.id === msg.id)) return prev;

                            return [...prev, {
                                id: msg.id,
                                content,
                                sender_id: msg.sender_user_id,
                                created_at: msg.created_at,
                                sent: false,
                                attachment_ptr: msg.attachment_ptr,
                                reply_to: replyTo
                            }];
                        });
                    })().catch(e => console.error('[useChat] Realtime error:', e));
                }
            })
            .subscribe(() => {

            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, isSupabaseReady]);


    useEffect(() => {
        if (!activeConversationId || !user) return;

        const markAsRead = async () => {
            await (supabase.rpc as Function)('mark_conversation_read', {
                p_conversation_id: activeConversationId
            });
            // Reset local unread count for this conversation
            setConversations(prev => prev.map(c =>
                c.id === activeConversationId ? { ...c, unread_count: 0 } : c
            ));
        };

        markAsRead();
    }, [activeConversationId, user]);


    const getSessionKeyForMessage = async (header: X3DHHeader) => {
        if (!header || !header.ephemeralKey) return null;
        return KeyStore.getSessionByHeader(header.ephemeralKey);
    };

    // Fetch messages for active conversation
    useEffect(() => {
        if (!activeConversationId || !user || !isSupabaseReady) return;



        setLoading(true);
        const fetchMessages = async () => {

            const { data: deletion } = await supabase
                .from('message_deletions')
                .select('deleted_before')
                .eq('user_id', user.id)
                .eq('conversation_id', activeConversationId)
                .maybeSingle() as { data: { deleted_before: string } | null };

            const deletedBefore = deletion?.deleted_before;

            // Fetch messages with reply info, filtering by deleted_before if set
            let query = supabase
                .from('messages')
                .select('*, reply_to:reply_to_message_id(id, sender_user_id, ciphertext, ciphertext_header)')
                .eq('conversation_id', activeConversationId)
                .order('created_at', { ascending: true });

            // If user cleared chat, only show messages after that time
            if (deletedBefore) {
                query = query.gt('created_at', deletedBefore);
            }

            const { data, error } = await query.returns<any[]>();

            if (error || !data) {
                setLoading(false);
                return;
            }

            const decryptedMessages: ChatMessage[] = [];

            for (const msg of data) {
                let content = '[Encrypted Message]';
                try {
                    const ciphertext = msg.ciphertext;
                    const header = msg.ciphertext_header as X3DHHeader;

                    if (header && ciphertext) {
                        // 1. Try to get session by header
                        let sessionKey = await getSessionKeyForMessage(header);
                        let decrypted = false;

                        if (sessionKey) {
                            const messageIndex = (header as any).messageIndex;

                            // Determine decryption key based on whether message has ratchet index
                            let decryptKey = sessionKey;
                            if (typeof messageIndex === 'number') {
                                // New ratcheted message - derive key from session + index
                                decryptKey = await Ratchet.deriveKeyAtIndex(sessionKey, messageIndex);
                            }

                            try {
                                content = await Cipher.decryptMessage(ciphertext, decryptKey);
                                decrypted = true;
                            } catch (e) {
                                // If derived key fails and we used ratchet, try session key directly (compat)
                                if (typeof messageIndex === 'number') {
                                    try {
                                        content = await Cipher.decryptMessage(ciphertext, sessionKey);
                                        decrypted = true;
                                    } catch {
                                        sessionKey = undefined;
                                    }
                                } else {
                                    sessionKey = undefined;
                                }
                            }
                        }

                        // 2. If no session or decryption failed, try to derive from header
                        if (!decrypted && !sessionKey && msg.sender_user_id !== user.id) {
                            const preKeyId = header.preKeyId || 0;
                            const myPreKey = await KeyStore.getPreKey(preKeyId);

                            if (myPreKey) {

                                const derivedSessionKey = await X3DH.deriveSessionFromHeader(header, myPreKey.privateKey);

                                await KeyStore.storeSessionByHeader(header.ephemeralKey, derivedSessionKey);

                                // Determine decryption key
                                const messageIndex = (header as any).messageIndex;
                                let decryptKey = derivedSessionKey;
                                if (typeof messageIndex === 'number') {
                                    decryptKey = await Ratchet.deriveKeyAtIndex(derivedSessionKey, messageIndex);
                                }

                                content = await Cipher.decryptMessage(ciphertext, decryptKey);

                            } else {
                                console.warn(`Msg ${msg.id}: Missed PreKey ${preKeyId}. Device check should prevent this.`);
                            }
                        }
                    }
                } catch (e: any) {
                    if (e.message?.includes('wrong secret key') || e.message?.includes('MAC')) {
                        content = '🔒 Message unavailable (Device keys changed)';
                        // Low-level warn only, this is expected after device resets
                        console.debug('Decryption skipped for msg ' + msg.id + ': Key inconsistency (expected after re-registration)');
                    } else {
                        console.error('Decryption error for msg ' + msg.id, e.message || e);
                        content = '⚠️ Malformed message';
                    }
                }

                // Process reply_to if present
                let replyTo: ChatMessage['reply_to'] = undefined;
                if (msg.reply_to && msg.reply_to.id) {
                    try {
                        let replyContent = '[Quoted Message]';

                        // 1. Try to find content from already decrypted messages in this batch
                        const alreadyDecrypted = decryptedMessages.find(m => m.id === msg.reply_to?.id);
                        if (alreadyDecrypted) {
                            replyContent = alreadyDecrypted.content;
                        } else {
                            // 2. Fallback: Try to decrypt reply content from ciphertext
                            const replyHeader = msg.reply_to.ciphertext_header as X3DHHeader;
                            if (replyHeader && msg.reply_to.ciphertext) {
                                const replySession = await getSessionKeyForMessage(replyHeader);
                                if (replySession) {
                                    try {
                                        replyContent = await Cipher.decryptMessage(msg.reply_to.ciphertext, replySession);
                                    } catch (e) {
                                        console.warn('[useChat] Reply decryption failed:', e);
                                        replyContent = '[Encrypted Message]';
                                    }
                                }
                            }
                        }

                        // Truncate if too long
                        if (replyContent.length > 100) {
                            replyContent = replyContent.substring(0, 100) + '...';
                        }

                        replyTo = {
                            id: msg.reply_to.id,
                            content: replyContent,
                            sender_id: msg.reply_to.sender_user_id,
                            sent: msg.reply_to.sender_user_id === user.id
                        };
                    } catch {
                        // Ignore reply errors, just don't show quote
                    }
                }

                decryptedMessages.push({
                    id: msg.id,
                    content,
                    sender_id: msg.sender_user_id,
                    created_at: msg.created_at,
                    sent: msg.sender_user_id === user.id,
                    attachment_ptr: msg.attachment_ptr,
                    reply_to: replyTo
                });
            }

            setMessages(decryptedMessages);
            setLoading(false);
        };

        fetchMessages();
        // Realtime messages are now handled by global_messages subscription above

    }, [activeConversationId, user?.id, isSupabaseReady]);

    const sendMessage = async (text: string, attachmentPath?: string, replyToMessageId?: string) => {
        if (!activeConversationId || !user) return;

        const conversation = conversations.find(c => c.id === activeConversationId);
        if (!conversation) return;

        // Check if user is blocked - prevent sending
        const blocked = await isUserBlocked(conversation.recipient_id);
        if (blocked) {
            throw new Error('You have blocked this user. Unblock them to send messages.');
        }

        // Check if YOU are blocked BY the recipient - prevent sending
        const blockedByRecipient = await isBlockedByUser(conversation.recipient_id);
        if (blockedByRecipient) {
            throw new Error('You cannot send messages to this user.');
        }

        // Optimistic Update
        const tempId = 'temp-' + Date.now();
        // Find reply context if replying
        const replyContext = replyToMessageId
            ? messages.find(m => m.id === replyToMessageId)
            : undefined;
        const optimisticMsg: ChatMessage = {
            id: tempId,
            content: text,
            sender_id: user.id,
            created_at: new Date().toISOString(),
            sent: true,
            attachment_ptr: attachmentPath,
            reply_to: replyContext ? {
                id: replyContext.id,
                content: replyContext.content,
                sender_id: replyContext.sender_id,
                sent: replyContext.sent
            } : undefined
        };
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            // 1. Check for valid session & peer key freshness
            let activeSession = await KeyStore.getActiveSession(conversation.recipient_id);
            let sessionKey: string;
            let header: X3DHHeader;


            const { data: recipientDevice, error: devError } = await supabase
                .from('devices')
                .select('*')
                .eq('user_id', conversation.recipient_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single() as any;

            if (devError || !recipientDevice) {
                console.warn('Recipient has no devices. Sending might fail if they come online later.');
                // Fallback: try to use cached session if exists, otherwise throw
                if (activeSession) {
                    sessionKey = activeSession.key;
                    header = activeSession.header;
                } else {
                    throw new Error('Recipient has no active devices to encrypt for.');
                }
            } else {

                const isIdentityMatch = activeSession?.peerIdentityKey === recipientDevice.public_identity_key;
                const isFreshDevice = activeSession?.deviceCreatedAt === recipientDevice.created_at;

                // If we have a session AND it matches the current server key AND timestamp, reuse it
                if (activeSession && activeSession.key && activeSession.header && isIdentityMatch && isFreshDevice) {

                    sessionKey = activeSession.key;
                    header = activeSession.header;
                    // Ensure we can decrypt our own message later by storing the session for this header
                    await KeyStore.storeSessionByHeader(header.ephemeralKey, sessionKey);
                } else {
                    // Session stale or missing -> Handshake

                    const session = await X3DH.establishSession(conversation.recipient_id);
                    sessionKey = session.sharedSecret;
                    header = session.header;


                    await KeyStore.storeActiveSession(
                        conversation.recipient_id,
                        sessionKey,
                        header,
                        recipientDevice.public_identity_key,
                        recipientDevice.created_at
                    );


                    await KeyStore.storeSessionByHeader(header.ephemeralKey, sessionKey);
                }
            }

            // Get message counter for this session (per-ephemeralKey)
            const messageCounter = await KeyStore.getSessionCounter(header.ephemeralKey);


            const messageKey = await Ratchet.deriveKeyAtIndex(sessionKey, messageCounter);

            // Encrypt with derived message key (unique per message)
            const ciphertext = await Cipher.encryptMessage(text, messageKey);

            // Increment session counter for next message
            await KeyStore.storeSessionCounter(header.ephemeralKey, messageCounter + 1);

            // Include messageIndex in header for receiver to derive same key
            const headerWithIndex = { ...header, messageIndex: messageCounter };

            const { data: insertedMsg, error } = await supabase.from('messages').insert({
                conversation_id: activeConversationId,
                sender_user_id: user.id,
                ciphertext: ciphertext,
                ciphertext_header: headerWithIndex,
                attachment_ptr: attachmentPath,
                reply_to_message_id: replyToMessageId || null
            } as any)
                .select()
                .single();


            if (error) throw error;

            // Replace optimistic message with real one (updates ID and timestamp)
            if (insertedMsg) {
                const realMsg = insertedMsg as any;
                setMessages(prev => prev.map(m =>
                    m.id === tempId ? {
                        ...m,
                        id: realMsg.id,
                        created_at: realMsg.created_at,
                        sent: true
                    } : m
                ));
            }

        } catch (e: any) {
            console.error('Send failed', e);
            alert(`Failed to send message: ${e.message || e}`);
            // Rollback optimistic update
            setMessages(prev => prev.filter(m => m.id !== tempId));
        }
    };

    const sendFile = async (file: File) => {
        if (!activeConversationId || !user) return;




        if (file.size > 5 * 1024 * 1024) {
            alert("File is too large (Max 5MB)");
            return;
        }

        let processedFile = file;


        if (file.type.startsWith('image/')) {
            try {

                processedFile = await imageCompression(file, {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true
                });

            } catch (e) {
                console.warn('Compression failed, using original', e);
            }
        }

        try {


            const { encryptedBlob, key } = await FileCipher.encryptFile(processedFile);



            const fileId = uuidv4();
            const filePath = `${user.id}/${fileId}.enc`;

            const { error: uploadError } = await supabase.storage
                .from('attachments')
                .upload(filePath, encryptedBlob);

            if (uploadError) throw uploadError;


            const metadata = {
                type: 'file',
                fileType: file.type,
                fileName: file.name,
                fileSize: processedFile.size,
                key: key
            };


            // We store the keys IN the message text (encrypted layer)
            await sendMessage(JSON.stringify(metadata), filePath);

        } catch (error: any) {
            console.error('File upload failed:', error);
            alert(`Failed to upload file: ${error.message || error.error || JSON.stringify(error)}`);
        }
    };

    const startNewChat = async (username: string) => {
        if (!user) return;




        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id, email, username')
            .ilike('username', username)
            .single() as any;

        if (error || !profiles) {
            console.error('User search error:', error);
            alert('User not found. Make sure they have registered and set a username.');
            return;
        }

        const recipientId = profiles.id;
        if (recipientId === user.id) {
            alert("Can't chat with yourself");
            return;
        }

        // 2. Check if conversation already exists locally
        const existing = conversations.find(c => c.recipient_id === recipientId);
        if (existing) {

            setActiveConversationId(existing.id);
            return;
        }



        const { data: convId, error: rpcError } = await supabase.rpc('get_or_create_dm', {
            p_recipient_id: recipientId,
            p_sender_id: user.id
        } as any);

        if (rpcError || !convId) {
            console.error('RPC error:', rpcError);
            alert('Failed to create conversation');
            return;
        }

        // 4. Update local state immediately
        const newConvo: ChatConversation = {
            id: convId as string,
            name: profiles.username || profiles.email || username,
            updated_at: new Date().toISOString(),
            unread_count: 0,
            recipient_id: recipientId
        };

        setConversations(prev => {
            if (prev.some(c => c.id === convId)) return prev;
            return [newConvo, ...prev];
        });

        setActiveConversationId(convId as string);
    };

    const blockUser = async (userIdToBlock: string) => {
        if (!user) return;
        const { error } = await supabase.from('user_blocks').insert({
            blocker_id: user.id,
            blocked_id: userIdToBlock
        } as any);
        if (error) {
            console.error('Block failed:', error);
            throw error;
        }
    };

    const unblockUser = async (userIdToUnblock: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('user_blocks')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', userIdToUnblock);
        if (error) {
            console.error('Unblock failed:', error);
            throw error;
        }
    };

    const isUserBlocked = async (userId: string): Promise<boolean> => {
        if (!user) return false;
        const { data, error } = await supabase
            .from('user_blocks')
            .select('blocker_id')
            .eq('blocker_id', user.id)
            .eq('blocked_id', userId)
            .maybeSingle();
        if (error) {
            console.error('Check block failed:', error);
            return false;
        }
        return !!data;
    };


    const isBlockedByUser = async (userId: string): Promise<boolean> => {
        if (!user) return false;
        // Query if userId has blocked current user (reverse check)
        const { data, error } = await supabase
            .from('user_blocks')
            .select('blocker_id')
            .eq('blocker_id', userId)
            .eq('blocked_id', user.id)
            .maybeSingle();
        if (error) {

            console.error('Check blocked-by failed:', error);
            return false;
        }
        return !!data;
    };

    const clearChat = async (conversationId: string) => {
        if (!user) return;



        const { error } = await supabase
            .from('message_deletions' as any)
            .upsert({
                user_id: user.id,
                conversation_id: conversationId,
                deleted_before: new Date().toISOString()
            } as any, {
                onConflict: 'user_id,conversation_id'
            });

        if (error) {
            console.error('Clear chat failed:', error);
            throw error;
        }

        // Clear local state to immediately reflect the change
        if (conversationId === activeConversationId) {
            setMessages([]);
        }
    };

    return {
        conversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        sendMessage,
        sendFile,
        startNewChat,
        loading,
        blockUser,
        unblockUser,
        isUserBlocked,
        isBlockedByUser,
        clearChat
    };
}
