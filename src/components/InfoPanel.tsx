import { X, Github, Twitter, Linkedin, Phone, Video } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import ImageLightbox from './ImageLightbox';

type InfoPanelProps = {
    name: string;
    recipientId: string;
    onClose: () => void;
    onVideoCall: () => void;
    onAudioCall: () => void;
    onBlock: () => Promise<void>;
    onUnblock: () => Promise<void>;
    isBlocked: boolean;
    callsDisabled?: boolean; // True if blocked in either direction
    onClearChat: () => Promise<void>;
};

export default function InfoPanel({
    name,
    recipientId,
    onClose,
    onVideoCall,
    onAudioCall,
    onBlock,
    onUnblock,
    isBlocked,
    callsDisabled = false,
    onClearChat
}: InfoPanelProps) {
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'block' | 'unblock' | 'clear' | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [isImageOpen, setIsImageOpen] = useState(false);

    useEffect(() => {
        if (!recipientId) return;
        const fetchProfile = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', recipientId)
                .single();
            setProfile(data);
            setLoading(false);
        };
        fetchProfile();
    }, [recipientId]);

    const handleBlockClick = () => setConfirmAction(isBlocked ? 'unblock' : 'block');
    const handleClearClick = () => setConfirmAction('clear');
    const cancelConfirm = () => setConfirmAction(null);

    const executeAction = async () => {
        setActionLoading(true);
        try {
            if (confirmAction === 'block') {
                await onBlock();
            } else if (confirmAction === 'unblock') {
                await onUnblock();
            } else if (confirmAction === 'clear') {
                await onClearChat();
            }
        } catch (e) {
            console.error('Action failed:', e);
            alert('Action failed. Please try again.');
        }
        setActionLoading(false);
        setConfirmAction(null);
    };

    return (
        <div className="h-full flex flex-col bg-zinc-900 relative">
            {/* Confirmation Overlay */}
            {confirmAction && (
                <div className="absolute inset-0 bg-zinc-900/95 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${confirmAction === 'unblock' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                        }`}>
                        {confirmAction === 'block' && <span className="text-3xl">🚫</span>}
                        {confirmAction === 'unblock' && <span className="text-3xl">✅</span>}
                        {confirmAction === 'clear' && <span className="text-3xl">🗑️</span>}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                        {confirmAction === 'block' && 'Block User?'}
                        {confirmAction === 'unblock' && 'Unblock User?'}
                        {confirmAction === 'clear' && 'Clear Chat?'}
                    </h3>
                    <p className="text-zinc-400 text-center mb-8">
                        {confirmAction === 'block' && 'They will not be able to message you. You can unblock later.'}
                        {confirmAction === 'unblock' && 'They will be able to message you again.'}
                        {confirmAction === 'clear' && 'This will delete all messages in this conversation. This cannot be undone.'}
                    </p>
                    <div className="flex flex-col gap-3 w-full">
                        <button
                            onClick={executeAction}
                            disabled={actionLoading}
                            className={`w-full py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50 ${confirmAction === 'unblock'
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : 'bg-red-500 hover:bg-red-600 text-white'
                                }`}
                        >
                            {actionLoading ? 'Processing...' : (
                                confirmAction === 'block' ? 'Yes, Block User' :
                                    confirmAction === 'unblock' ? 'Yes, Unblock User' :
                                        'Yes, Clear History'
                            )}
                        </button>
                        <button
                            onClick={cancelConfirm}
                            disabled={actionLoading}
                            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800">
                <h3 className="font-semibold text-white">Profile</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                {/* Avatar */}
                <div className="flex flex-col items-center mb-8">
                    <div
                        className={`w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl text-white font-bold mb-4 shadow-lg overflow-hidden relative ${profile?.avatar_url ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                        onClick={() => profile?.avatar_url && setIsImageOpen(true)}
                    >
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                            name.charAt(0)
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-white">{profile?.display_name || name}</h2>
                    <p className="text-sm text-zinc-400">@{profile?.username || 'unknown'}</p>
                    {isBlocked && (
                        <span className="mt-2 px-3 py-1 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20">
                            Blocked
                        </span>
                    )}
                </div>

                {/* Call Actions */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                    <button
                        onClick={callsDisabled ? undefined : onAudioCall}
                        disabled={callsDisabled}
                        className={`py-3 px-4 rounded-xl bg-zinc-800 text-white flex items-center justify-center gap-3 transition-all ${callsDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-zinc-700 hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                    >
                        <Phone className={`w-5 h-5 ${callsDisabled ? 'text-zinc-500' : 'text-emerald-400'}`} />
                        <span className="font-medium">Audio Call</span>
                    </button>
                    <button
                        onClick={callsDisabled ? undefined : onVideoCall}
                        disabled={callsDisabled}
                        className={`py-3 px-4 rounded-xl bg-zinc-800 text-white flex items-center justify-center gap-3 transition-all ${callsDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-zinc-700 hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                    >
                        <Video className={`w-5 h-5 ${callsDisabled ? 'text-zinc-500' : 'text-indigo-400'}`} />
                        <span className="font-medium">Video Call</span>
                    </button>
                </div>

                {/* Info */}
                <div className="space-y-6 flex-1">
                    <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">About</h4>
                        <p className="text-sm text-zinc-300 leading-relaxed">
                            {loading ? 'Loading...' : (profile?.bio || 'This user has not added a bio yet.')}
                        </p>
                    </div>

                    <div>
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Social</h4>
                        <div className="flex gap-2">
                            {profile?.social_links?.github && (
                                <a href={profile.social_links.github} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800 transition-colors">
                                    <Github className="w-4 h-4" />
                                </a>
                            )}
                            {profile?.social_links?.twitter && (
                                <a href={profile.social_links.twitter} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800 transition-colors">
                                    <Twitter className="w-4 h-4" />
                                </a>
                            )}
                            {profile?.social_links?.linkedin && (
                                <a href={profile.social_links.linkedin} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800 transition-colors">
                                    <Linkedin className="w-4 h-4" />
                                </a>
                            )}
                            {!profile?.social_links && !loading && <span className="text-xs text-zinc-500">No social links</span>}
                        </div>
                    </div>

                </div>
            </div>

            {/* Sticky Footer for Actions */}
            <div className="p-6 border-t border-zinc-800 bg-zinc-900 mt-auto shrink-0">
                <div className="flex gap-3">
                    <button
                        onClick={handleBlockClick}
                        className={`flex-1 py-3 px-3 rounded-xl border text-sm flex flex-col items-center gap-1.5 group transition-all ${isBlocked
                            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5'
                            }`}
                    >
                        <span className="text-xl group-hover:scale-110 transition-transform">
                            {isBlocked ? '✅' : '🚫'}
                        </span>
                        <span className="font-medium">{isBlocked ? 'Unblock' : 'Block'}</span>
                    </button>
                    <button
                        onClick={handleClearClick}
                        className="flex-1 py-3 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all text-sm flex flex-col items-center gap-1.5 group"
                    >
                        <span className="text-xl group-hover:scale-110 transition-transform">🗑️</span>
                        <span className="font-medium">Clear Chat</span>
                    </button>
                </div>
            </div>

            {isImageOpen && profile?.avatar_url && (
                <ImageLightbox
                    src={profile.avatar_url}
                    alt={name}
                    onClose={() => setIsImageOpen(false)}
                />
            )}
        </div>
    );
}
