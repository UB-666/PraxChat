import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../hooks/useAuth';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from './Toast';

type CallLog = {
    id: string;
    caller_id: string;
    recipient_id: string;
    call_type: 'audio' | 'video';
    status: 'completed' | 'missed' | 'rejected' | 'ongoing';
    started_at: string;
    duration: number | null;
    otherUser?: {
        display_name: string | null;
        avatar_url: string | null;
        username: string | null;
    } | null;
    isCaller?: boolean;
};

export default function CallHistorySidebar({
    className,
    onCallClick,
    isUserBlocked,
    isBlockedByUser
}: {
    className?: string;
    onCallClick: (recipientId: string, type: 'audio' | 'video') => void;
    isUserBlocked?: (userId: string) => Promise<boolean>;
    isBlockedByUser?: (userId: string) => Promise<boolean>;
}) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchCalls = async () => {
            // Keep existing fetchCalls logic, but defining it inside useEffect might be tricky for re-use
            // so I'll move it out or keep it here.
            // Actually, I'll define it inside and call it.
            setLoading(true);
            const { data, error } = await supabase
                .from('call_logs')
                .select('*')
                .or(`caller_id.eq.${user.id},recipient_id.eq.${user.id}`)
                .order('started_at', { ascending: false })
                .limit(50)
                .returns<CallLog[]>();

            if (error) {
                console.error('Error fetching calls:', error);
                setLoading(false);
                return;
            }

            if (!data) {
                setLoading(false);
                return;
            }

            const enrichedLogs = await Promise.all(data.map(async (log: CallLog) => {
                const isCaller = log.caller_id === user.id;
                const otherUserId = isCaller ? log.recipient_id : log.caller_id;

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name, avatar_url, username')
                    .eq('id', otherUserId)
                    .single();

                return {
                    ...log,
                    otherUser: profile,
                    isCaller
                };
            }));

            setCallLogs(enrichedLogs);
            setLoading(false);
        };

        fetchCalls();

        // Realtime Subscription
        const channel = supabase
            .channel('call_logs_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'call_logs'
                },
                (payload) => {
                    // Refetch if the change involves the current user
                    // Note: payload.new or payload.old contains the record data
                    const newRecord = payload.new as CallLog;
                    const oldRecord = payload.old as CallLog;

                    const record = newRecord?.id ? newRecord : oldRecord;

                    if (record && (record.caller_id === user.id || record.recipient_id === user.id)) {
                        fetchCalls();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    return (
        <div className={className}>
            <div className="p-4 border-b border-zinc-800">
                <h2 className="text-lg font-bold text-white">Call History</h2>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-zinc-500">Loading history...</div>
                ) : callLogs.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">No calls yet.</div>
                ) : (
                    <div className="flex flex-col">
                        {callLogs.map((log) => (
                            <div
                                key={log.id}
                                className="p-3 hover:bg-zinc-800 transition-colors flex items-center gap-3 group cursor-pointer border-b border-zinc-900"
                                onClick={async () => {
                                    const recipientId = log.isCaller ? log.recipient_id : log.caller_id;

                                    // Check if blocked in either direction
                                    if (isUserBlocked && await isUserBlocked(recipientId)) {
                                        showToast('You have blocked this user. Unblock to call.', 'error');
                                        return;
                                    }
                                    if (isBlockedByUser && await isBlockedByUser(recipientId)) {
                                        showToast('You cannot call this user.', 'error');
                                        return;
                                    }

                                    onCallClick(recipientId, log.call_type);
                                }}
                            >
                                {/* Avatar */}
                                <div className="relative flex-none">
                                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden">
                                        {log.otherUser?.avatar_url ? (
                                            <img src={log.otherUser.avatar_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-sm font-bold text-white uppercase">
                                                {log.otherUser?.display_name?.[0] || '?'}
                                            </span>
                                        )}
                                    </div>
                                    {/* Call Type Icon Badge */}
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 flex items-center justify-center ring-2 ring-zinc-900">
                                        {log.call_type === 'video' ? (
                                            <Video className="w-2.5 h-2.5 text-zinc-400" />
                                        ) : (
                                            <Phone className="w-2.5 h-2.5 text-zinc-400" />
                                        )}
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-zinc-200 truncate">
                                        {log.otherUser?.display_name || 'Unknown User'}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        {log.status === 'missed' ? (
                                            <PhoneMissed className="w-3 h-3 text-red-500" />
                                        ) : log.isCaller ? (
                                            <PhoneOutgoing className="w-3 h-3 text-emerald-500" />
                                        ) : (
                                            <PhoneIncoming className="w-3 h-3 text-blue-500" />
                                        )}
                                        <span>
                                            {format(new Date(log.started_at), 'MMM d, h:mm a')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
