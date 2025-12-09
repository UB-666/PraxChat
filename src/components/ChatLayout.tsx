import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import IconNav, { type NavTab } from './IconNav';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput, { type ReplyingTo } from './MessageInput';
import InfoPanel from './InfoPanel';
import SettingsDialog from './SettingsDialog';
import CallDialog from './CallDialog';
import IncomingCallToast from './IncomingCallToast';
import CallHistorySidebar from './CallHistorySidebar';
import NewChatDialog from './NewChatDialog';
import VaultUnlock from './VaultUnlock';
import { MessageSquare, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChat } from '../hooks/useChat';
import { useCall } from '../hooks/useCall';
import { KeyStore } from '../lib/crypto/keystore';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import NotificationManager from './NotificationManager';
import { usePresence } from '../hooks/usePresence';

export default function ChatLayout() {
    const navigate = useNavigate();
    const {
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
    } = useChat();

    // Calling Hook
    const {
        callState,
        incomingCall,
        startCall,
        answerCall,
        declineCall,
        endCall,
        cancelCall,
        localStream,
        remoteStream,
        otherUserId,
        callType
    } = useCall();

    // Presence hook for online/offline status
    const { isUserOnline } = usePresence();

    const [activeTab, setActiveTab] = useState<NavTab>('messages');
    const [showInfo, setShowInfo] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isVerifying, setIsVerifying] = useState(true);
    const [status, setStatus] = useState('Initializing...');
    const [isVaultLocked, setIsVaultLocked] = useState(false);

    // Toast for modern notifications
    const { showToast } = useToast();

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // New Chat Dialog state
    const [showNewChatDialog, setShowNewChatDialog] = useState(false);

    // Block state for active conversation
    const [isActiveUserBlocked, setIsActiveUserBlocked] = useState(false);

    // Track locally deleted messages (session-only, per-message "delete for me")
    const [localDeletedMessages, setLocalDeletedMessages] = useState<Set<string>>(new Set());

    // Reply state
    const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

    // Supabase Profile Avatar State
    const [supabaseAvatar, setSupabaseAvatar] = useState<string | null>(null);

    // Wrapped send message that shows toast on error
    const handleSendMessage = useCallback(async (text: string, replyToMessageId?: string) => {
        try {
            await sendMessage(text, undefined, replyToMessageId);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Failed to send message';
            showToast(errorMessage, 'error');
        }
    }, [sendMessage, showToast]);

    // Wrapped send file that shows toast on error
    const handleSendFile = useCallback(async (file: File) => {
        try {
            await sendFile(file);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Failed to send file';
            showToast(errorMessage, 'error');
        }
    }, [sendFile, showToast]);

    const { user } = useAuth();

    // Fetch Supabase Profile for Avatar
    // 🚨 Safe implementation to avoid crashes
    useEffect(() => {
        if (!user?.id) return;

        let isMounted = true;

        const fetchProfile = async () => {
            try {
                // Return type is explicitly compatible with what we expect
                const { data, error } = await supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', user.id)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching profile avatar:', error);
                    return;
                }

                if (isMounted && data) {
                    // Safe access after verification
                    // Explicit cast to handle potential type inference issues
                    setSupabaseAvatar((data as { avatar_url: string | null }).avatar_url);
                }
            } catch (err) {
                console.error('Unexpected error fetching profile:', err);
            }
        };

        fetchProfile();

        return () => {
            isMounted = false;
        };
    }, [user?.id]);

    // Check for device keys and sync with server
    useEffect(() => {
        // Only verify if we are in verifying state
        if (!isVerifying && !isVaultLocked) return;

        const checkRegistration = async () => {
            try {
                if (!user) {
                    setStatus('Waiting for user (Clerk)...');
                    return;
                }

                // Check if verified already (optimization)
                if (!isVerifying && !isVaultLocked) return;

                // Check if vault exists and is locked
                const hasVault = await KeyStore.hasVault();
                if (hasVault && !KeyStore.isVaultUnlocked()) {
                    setStatus('Vault locked');
                    setIsVaultLocked(true);
                    setIsVerifying(false);
                    return;
                }

                setStatus('Checking local Identity Key...');
                const idKey = await KeyStore.getIdentityKey();
                const preKey = await KeyStore.getPreKey(0);

                if (!idKey || !preKey) {
                    setStatus('Keys incomplete. Redirecting...');
                    navigate('/register-device');
                    return;
                }

                // Verify server has OUR key registered
                setStatus('Checking server registration...');
                const { data: devices, error: deviceError } = await supabase
                    .from('devices')
                    .select('*')
                    .eq('user_id', user.id)
                    .returns<any[]>();

                if (deviceError) {
                    setStatus('Server error: ' + deviceError.message);
                    return;
                }

                const isRegistered = devices?.some(d => d.public_identity_key === idKey.publicKey);
                // Also verify PreKey match to ensure encryption works
                const isPreKeyValid = devices?.some(d => Array.isArray(d.public_prekeys) && d.public_prekeys.includes(preKey.publicKey));

                if (!isRegistered || !isPreKeyValid) {
                    setStatus(isRegistered ? 'PreKey mismatch. Updating...' : 'Identity mismatch. Registering...');
                    navigate('/register-device');
                    return;
                }
                // If we get here, we are good!
                setStatus('Verified!');
                setIsVerifying(false);

            } catch (error) {
                console.error('Error verifying keys:', error);
                setStatus('Error: ' + String(error));
            }
        };
        checkRegistration();
    }, [navigate, user, isVerifying, isVaultLocked]);

    // Mobile state
    const [showSidebar, setShowSidebar] = useState(true);

    const activeConv = conversations.find(c => c.id === activeConversationId);

    // Check if active conversation user is blocked (either direction)
    useEffect(() => {
        const checkBlockStatus = async () => {
            if (!activeConv) {
                setIsActiveUserBlocked(false);
                return;
            }
            // Check both directions: you blocked them OR they blocked you
            const [youBlockedThem, theyBlockedYou] = await Promise.all([
                isUserBlocked(activeConv.recipient_id),
                isBlockedByUser(activeConv.recipient_id)
            ]);
            // Either direction means calls/messages should be blocked
            setIsActiveUserBlocked(youBlockedThem || theyBlockedYou);
        };
        checkBlockStatus();
    }, [activeConv?.recipient_id, isUserBlocked, isBlockedByUser]);

    const handleSelect = (id: string) => {
        setActiveConversationId(id);
        if (window.innerWidth < 768) {
            setShowSidebar(false);
        }
    };

    const handleNewChat = () => {
        setShowNewChatDialog(true);
    };

    // Transform conversations to match Sidebar props
    const sidebarConversations = conversations.map(c => ({
        id: c.id,
        name: c.name,
        lastMessage: '...',
        time: new Date(c.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread: c.unread_count,
        online: isUserOnline(c.recipient_id),
        avatar: c.avatar_url
    }));

    // Transform messages to match MessageList props, filtering out locally deleted ones
    const uiMessages = messages
        .filter(m => !localDeletedMessages.has(m.id))
        .map(m => ({
            id: m.id,
            content: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            raw_timestamp: m.created_at,
            sent: m.sent,
            read: true,
            attachment_ptr: m.attachment_ptr,
            reply_to: m.reply_to
        }));

    if (isVerifying) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    <p className="text-zinc-400">Verifying secure session...</p>
                    <pre className="text-xs text-zinc-600 mt-2 font-mono bg-black/50 p-2 rounded">
                        User: {user ? user.id : 'Waiting for user...'}
                        {'\n'}
                        Status: {status}
                    </pre>
                </div>
            </div>
        );
    }

    // Show vault unlock screen if vault is locked
    if (isVaultLocked) {
        return (
            <VaultUnlock
                onUnlock={() => {
                    // Re-check registration after unlock
                    setIsVaultLocked(false);
                    setIsVerifying(true);
                }}
            />
        );
    }

    return (
        <div className="flex h-screen w-full bg-zinc-950 text-zinc-50 overflow-hidden md:flex-row flex-col">
            {/* 1. Icon Nav (Desktop) */}
            <div className="hidden md:block flex-none h-full">
                <IconNav
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onSettingsClick={() => setShowSettings(true)}
                />
            </div>

            {/* 2. Sidebar Area (Messages OR Calls) */}
            <div className={cn(
                "md:w-80 flex-none border-r border-zinc-800 bg-zinc-900 flex flex-col h-full",
                // Mobile: Show if sidebar is active, otherwise hidden
                showSidebar ? "flex w-full" : "hidden md:flex",
                // Mobile: adjust height to account for bottom nav
                "md:h-full h-[calc(100vh-64px)]"
            )}>
                {activeTab === 'messages' ? (
                    <>
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-white tracking-tight">Messages</h2>
                            <div className="flex gap-2">
                                <div className="relative group">
                                    <button
                                        onClick={handleNewChat}
                                        className="w-9 h-9 flex items-center justify-center bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all text-white shadow-lg shadow-indigo-500/20 active:scale-95"
                                    >
                                        <UserPlus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <Sidebar
                            conversations={sidebarConversations}
                            activeId={activeConversationId}
                            onSelect={(id) => {
                                handleSelect(id);
                            }}
                            className="flex-1 min-h-0"
                        />
                    </>
                ) : (
                    <CallHistorySidebar
                        className="flex-1 min-h-0 flex flex-col"
                        onCallClick={(id, type) => startCall(id, type)}
                        isUserBlocked={isUserBlocked}
                        isBlockedByUser={isBlockedByUser}
                    />
                )}
            </div>

            {/* 3. Main Chat */}
            <div className={cn(
                "flex-1 flex flex-col min-w-0 bg-zinc-950 relative h-full",
                // Mobile: Show if sidebar is hidden (meaning chat is active)
                !showSidebar ? "flex fixed inset-0 z-30" : "hidden md:flex"
            )}>
                {activeConv ? (
                    <div key={activeConversationId} className="flex flex-col h-full animate-fade-in w-full">
                        {(() => {
                            // Calculate search matches for current conversation
                            const matchingMessageIds = searchTerm.trim()
                                ? uiMessages.filter(msg => !msg.attachment_ptr && msg.content.toLowerCase().includes(searchTerm.toLowerCase())).map(m => m.id)
                                : [];
                            const searchMatchCount = matchingMessageIds.length;

                            const handleNextMatch = () => {
                                if (searchMatchCount > 0) {
                                    setCurrentMatchIndex(prev => (prev + 1) % searchMatchCount);
                                }
                            };

                            const handlePrevMatch = () => {
                                if (searchMatchCount > 0) {
                                    setCurrentMatchIndex(prev => (prev - 1 + searchMatchCount) % searchMatchCount);
                                }
                            };

                            const handleSearchChange = (term: string) => {
                                setSearchTerm(term);
                                setCurrentMatchIndex(0); // Reset to first match
                            };

                            return (
                                <>
                                    <ChatHeader
                                        name={activeConv.name}
                                        avatar={activeConv.avatar_url}
                                        online={isUserOnline(activeConv.recipient_id)}
                                        onToggleInfo={() => setShowInfo(!showInfo)}
                                        onBack={() => setShowSidebar(true)}
                                        onVideoCall={() => startCall(activeConv.recipient_id, 'video')}
                                        onAudioCall={() => startCall(activeConv.recipient_id, 'audio')}
                                        callsDisabled={isActiveUserBlocked}
                                        searchTerm={searchTerm}
                                        onSearchChange={handleSearchChange}
                                        searchMatchCount={searchMatchCount}
                                        currentMatchIndex={currentMatchIndex}
                                        onNextMatch={handleNextMatch}
                                        onPrevMatch={handlePrevMatch}
                                    />
                                    {loading ? (
                                        <div className="flex-1 flex items-center justify-center text-zinc-500">
                                            Loading messages...
                                        </div>
                                    ) : (
                                        <MessageList
                                            messages={uiMessages}
                                            searchTerm={searchTerm}
                                            currentMatchIndex={currentMatchIndex}
                                            onCopy={() => {
                                                showToast('Message copied!', 'success');
                                            }}
                                            onReply={(msg) => {
                                                // Get sender name from active conversation
                                                const senderName = msg.sent ? 'You' : activeConv?.name || 'Them';
                                                setReplyingTo({
                                                    id: msg.id,
                                                    content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
                                                    senderName
                                                });
                                            }}
                                            onDelete={(messageId: string) => {
                                                // Local delete - add to set to hide from UI
                                                setLocalDeletedMessages(prev => new Set(prev).add(messageId));
                                                showToast('Message deleted', 'success');
                                            }}
                                        />
                                    )}
                                    <MessageInput
                                        onSend={handleSendMessage}
                                        onFileSelect={handleSendFile}
                                        disabled={isActiveUserBlocked}
                                        disabledMessage="Messaging blocked between you and this user."
                                        replyingTo={replyingTo}
                                        onCancelReply={() => setReplyingTo(null)}
                                    />
                                </>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center flex-col text-zinc-500">
                        <MessageSquare className="w-16 h-16 mb-6 opacity-20" />
                        <p className="text-lg font-medium">Select a conversation</p>
                        <p className="text-sm opacity-60">or start a new one to get messaging</p>
                    </div>
                )}
            </div>

            {/* 4. Info Panel */}
            {/* Desktop: Static Panel */}
            <div className="hidden lg:block h-full">
                {showInfo && activeConv && (
                    <InfoPanelWrapper
                        activeConv={activeConv}
                        startCall={startCall}
                        blockUser={blockUser}
                        unblockUser={unblockUser}
                        isUserBlocked={isUserBlocked}
                        clearChat={clearChat}
                        onClose={() => setShowInfo(false)}
                        onBlockStatusChange={setIsActiveUserBlocked}
                        callsDisabled={isActiveUserBlocked}
                    />
                )}
            </div>

            {/* Mobile: Modal/Overlay Panel */}
            {showInfo && activeConv && (
                <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-zinc-900 h-full shadow-2xl animate-in slide-in-from-right duration-300">
                        <InfoPanel
                            name={activeConv.name}
                            recipientId={activeConv.recipient_id}
                            onClose={() => setShowInfo(false)}
                            onVideoCall={() => startCall(activeConv.recipient_id, 'video')}
                            onAudioCall={() => startCall(activeConv.recipient_id, 'audio')}
                            onBlock={async () => {
                                await blockUser(activeConv.recipient_id);
                                setIsActiveUserBlocked(true);
                            }}
                            onUnblock={async () => {
                                await unblockUser(activeConv.recipient_id);
                                setIsActiveUserBlocked(false);
                            }}
                            isBlocked={isActiveUserBlocked}
                            callsDisabled={isActiveUserBlocked}
                            onClearChat={async () => {
                                await clearChat(activeConv.id);
                            }}
                        />
                    </div>
                    {/* Click outside to close */}
                    <div className="absolute left-0 top-0 bottom-0 w-[calc(100%-24rem)]" onClick={() => setShowInfo(false)} />
                </div>
            )}


            {/* 5. New Chat Dialog */}
            {showNewChatDialog && (
                <NewChatDialog
                    onClose={() => setShowNewChatDialog(false)}
                    onStartChat={startNewChat}
                />
            )}

            {/* Settings Dialog */}
            <SettingsDialog
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />

            {/* Calling UI */}
            {incomingCall && (
                <IncomingCallToast
                    callerId={otherUserId || 'Unknown'}
                    onAccept={answerCall}
                    onDecline={declineCall}
                />
            )}

            {(callState === 'CONNECTED' || callState === 'OUTGOING') && (
                <CallDialog
                    localStream={localStream}
                    remoteStream={remoteStream}
                    onEnd={callState === 'OUTGOING' ? cancelCall : endCall}
                    otherUserId={otherUserId}
                    callType={callType}
                    isConnecting={callState === 'OUTGOING'}
                />
            )}

            {/* Browser Notifications Manager */}
            <NotificationManager
                activeConversationId={activeConversationId}
                conversations={conversations}
                incomingCallerId={incomingCall ? otherUserId : null}
                onMessageClick={(convId) => setActiveConversationId(convId)}
            />

            {/* Mobile Bottom Nav */}
            {showSidebar && (
                <BottomNav
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onSettingsClick={() => setShowSettings(true)}
                    userAvatar={supabaseAvatar || user?.imageUrl}
                />
            )}

        </div>
    );
}

// Wrapper component to manage block state for InfoPanel
function InfoPanelWrapper({
    activeConv,
    startCall,
    blockUser,
    unblockUser,
    isUserBlocked,
    clearChat,
    onClose,
    onBlockStatusChange,
    callsDisabled
}: {
    activeConv: { id: string; name: string; recipient_id: string };
    startCall: (recipientId: string, type: 'audio' | 'video') => void;
    blockUser: (userId: string) => Promise<void>;
    unblockUser: (userId: string) => Promise<void>;
    isUserBlocked: (userId: string) => Promise<boolean>;
    clearChat: (conversationId: string) => Promise<void>;
    onClose: () => void;
    onBlockStatusChange: (blocked: boolean) => void;
    callsDisabled: boolean;
}) {
    const [isBlocked, setIsBlocked] = useState(false);

    // Only check if YOU blocked them (for block/unblock button state)
    // Don't call onBlockStatusChange here - ChatLayout handles that with both directions
    useEffect(() => {
        const checkBlocked = async () => {
            const blocked = await isUserBlocked(activeConv.recipient_id);
            setIsBlocked(blocked);
        };
        checkBlocked();
    }, [activeConv.recipient_id, isUserBlocked]);

    const handleBlock = async () => {
        await blockUser(activeConv.recipient_id);
        setIsBlocked(true);
        onBlockStatusChange(true);
    };

    const handleUnblock = async () => {
        await unblockUser(activeConv.recipient_id);
        setIsBlocked(false);
        onBlockStatusChange(false);
    };

    const handleClearChat = async () => {
        await clearChat(activeConv.id);
    };

    return (
        <div className="hidden lg:block w-80 flex-none border-l border-zinc-800 bg-zinc-900 h-full">
            <InfoPanel
                name={activeConv.name}
                recipientId={activeConv.recipient_id}
                onClose={onClose}
                onVideoCall={() => startCall(activeConv.recipient_id, 'video')}
                onAudioCall={() => startCall(activeConv.recipient_id, 'audio')}
                onBlock={handleBlock}
                onUnblock={handleUnblock}
                isBlocked={isBlocked}
                callsDisabled={callsDisabled}
                onClearChat={handleClearChat}
            />
        </div>
    );
}
