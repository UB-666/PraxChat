import { useState, useEffect } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

interface IncomingCallToastProps {
    callerId: string;
    onAccept: () => void;
    onDecline: () => void;
}

export default function IncomingCallToast({ callerId, onAccept, onDecline }: IncomingCallToastProps) {
    const [callerName, setCallerName] = useState<string>('Unknown');
    const [callerAvatar, setCallerAvatar] = useState<string | null>(null);

    // Fetch caller's username from profiles
    useEffect(() => {
        const fetchCallerName = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('username, email, avatar_url')
                .eq('id', callerId)
                .single();

            if (data) {
                setCallerName((data as any).username || (data as any).email || 'Unknown');
                setCallerAvatar((data as any).avatar_url);
            }
        };

        if (callerId) {
            fetchCallerName();
        }
    }, [callerId]);

    return (
        <div className="fixed top-4 right-4 z-[110] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-80 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex items-center gap-4 mb-4">
                {callerAvatar ? (
                    <img
                        src={callerAvatar}
                        alt={callerName}
                        className="w-12 h-12 rounded-full object-cover border-2 border-indigo-600 animate-pulse"
                    />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg animate-pulse">
                        {callerName.charAt(0).toUpperCase()}
                    </div>
                )}
                <div>
                    <h3 className="font-semibold text-white">Incoming Call...</h3>
                    <p className="text-xs text-zinc-400">From: {callerName}</p>
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onDecline}
                    className="flex-1 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                    <PhoneOff className="w-4 h-4" /> Decline
                </button>
                <button
                    onClick={onAccept}
                    className="flex-1 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                    <Phone className="w-4 h-4" /> Accept
                </button>
            </div>
        </div>
    );
}
