import { useRef, useEffect, useState } from 'react';
import { PhoneOff, Mic, Video } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

interface CallDialogProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    onEnd: () => void;
    otherUserId: string | null;
    callType: 'audio' | 'video';
    isConnecting?: boolean;
}

export default function CallDialog({ localStream, remoteStream, onEnd, otherUserId, callType, isConnecting = false }: CallDialogProps) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [userName, setUserName] = useState<string>('');
    const [userAvatar, setUserAvatar] = useState<string | null>(null);

    // Fetch other user's username from profiles
    useEffect(() => {
        const fetchUserName = async () => {
            if (!otherUserId) return;

            const { data } = await supabase
                .from('profiles')
                .select('username, email, avatar_url')
                .eq('id', otherUserId)
                .single();

            if (data) {
                setUserName((data as any).username || (data as any).email || 'Unknown');
                setUserAvatar((data as any).avatar_url);
            }
        };

        fetchUserName();
    }, [otherUserId]);

    useEffect(() => {
        if (localVideoRef.current && localStream && callType === 'video') {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, callType]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream && callType === 'video') {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, callType]);

    // Get display initial
    const displayInitial = userName ? userName.charAt(0).toUpperCase() : '?';
    const displayName = userName || 'Connecting...';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md">
            <div className="relative w-full h-full max-w-5xl max-h-[90vh] flex flex-col p-4">

                {/* Main Content Area */}
                <div className="flex-1 bg-zinc-900 rounded-2xl overflow-hidden relative border border-zinc-800 shadow-2xl flex items-center justify-center">

                    {/* Video Mode */}
                    {callType === 'video' ? (
                        <>
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            {!remoteStream && (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-4">
                                    {userAvatar ? (
                                        <img
                                            src={userAvatar}
                                            alt={displayName}
                                            className="w-24 h-24 rounded-full object-cover border-4 border-indigo-600 animate-pulse"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-bold text-white animate-pulse">
                                            {displayInitial}
                                        </div>
                                    )}
                                    <p className="text-zinc-400">Connecting video...</p>
                                </div>
                            )}

                            {/* Local Video (PiP) */}
                            <div className="absolute bottom-4 right-4 w-48 h-36 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-700 shadow-lg">
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover transform scale-x-[-1]"
                                />
                            </div>
                        </>
                    ) : (
                        /* Audio Mode */
                        <div className="flex flex-col items-center gap-6">
                            {userAvatar ? (
                                <div className="relative">
                                    <img
                                        src={userAvatar}
                                        alt={displayName}
                                        className="w-32 h-32 rounded-full object-cover shadow-2xl animate-pulse ring-4 ring-indigo-500/20"
                                    />
                                </div>
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-indigo-600 flex items-center justify-center text-5xl font-bold text-white shadow-2xl animate-pulse ring-4 ring-indigo-500/20">
                                    {displayInitial}
                                </div>
                            )}
                            <div className="text-center">
                                <h3 className="text-2xl font-bold text-white mb-2">{displayName}</h3>
                                <p className="text-zinc-400 flex items-center gap-2 justify-center">
                                    <span className={`w-2 h-2 rounded-full animate-pulse ${isConnecting ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                                    {isConnecting ? 'Calling...' : 'Audio Call Active'}
                                </p>
                            </div>
                            {/* Hidden audio elements for playback */}
                            {remoteStream && (
                                <audio autoPlay ref={(el) => { if (el) el.srcObject = remoteStream }} />
                            )}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="h-20 flex items-center justify-center gap-6 mt-4">
                    <button className="p-4 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-all">
                        <Mic className="w-6 h-6" />
                    </button>
                    <button
                        onClick={onEnd}
                        className="p-4 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                    >
                        <PhoneOff className="w-8 h-8" />
                    </button>
                    {callType === 'video' && (
                        <button className="p-4 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-all">
                            <Video className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
