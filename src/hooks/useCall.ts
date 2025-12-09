import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase/client';

export type CallState = 'IDLE' | 'INCOMING' | 'OUTGOING' | 'CONNECTED' | 'ENDING';
export type CallType = 'audio' | 'video';

const CALL_TIMEOUT_MS = 30000;

export function useCall() {
    const { user } = useAuth();
    const [peer, setPeer] = useState<Peer | null>(null);
    const [peerReady, setPeerReady] = useState(false);
    const [callState, setCallState] = useState<CallState>('IDLE');
    const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
    const [, setActiveCall] = useState<MediaConnection | null>(null);
    const [callType, setCallType] = useState<CallType>('video');
    const [otherUserId, setOtherUserId] = useState<string | null>(null);
    const [currentCallLogId, setCurrentCallLogId] = useState<string | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const activeCallRef = useRef<MediaConnection | null>(null);
    const incomingCallRef = useRef<MediaConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const callLogIdRef = useRef<string | null>(null);
    const callStateRef = useRef<CallState>('IDLE');
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringbackAudioRef = useRef<HTMLAudioElement | null>(null);
    const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const initAttemptRef = useRef(0);

    // Initialize audio
    useEffect(() => {
        ringbackAudioRef.current = new Audio('/sounds/ringback.mp3');
        ringbackAudioRef.current.loop = true;
        ringbackAudioRef.current.volume = 0.5;
        ringtoneAudioRef.current = new Audio('/sounds/ringtone.mp3');
        ringtoneAudioRef.current.loop = true;
        ringtoneAudioRef.current.volume = 0.7;
        return () => {
            ringbackAudioRef.current?.pause();
            ringtoneAudioRef.current?.pause();
        };
    }, []);

    const performCleanup = useCallback(() => {

        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        ringbackAudioRef.current?.pause();
        ringtoneAudioRef.current?.pause();
        if (ringbackAudioRef.current) ringbackAudioRef.current.currentTime = 0;
        if (ringtoneAudioRef.current) ringtoneAudioRef.current.currentTime = 0;
        if (activeCallRef.current) { activeCallRef.current.close(); activeCallRef.current = null; }
        if (incomingCallRef.current) { incomingCallRef.current.close(); incomingCallRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        callLogIdRef.current = null;
        callStateRef.current = 'IDLE';
        setActiveCall(null);
        setIncomingCall(null);
        setLocalStream(null);
        setRemoteStream(null);
        setCallState('IDLE');
        setCurrentCallLogId(null);
        setOtherUserId(null);
    }, []);

    // Initialize Peer with retry logic for "ID taken" error
    useEffect(() => {
        if (!user) return;

        let isMounted = true;
        let retryTimeout: ReturnType<typeof setTimeout>;

        // Use stable peer ID (cleaned user ID without session suffix)
        const myPeerId = user.id.replace(/[^a-zA-Z0-9]/g, '');

        const createPeer = (attempt: number) => {
            if (!isMounted) return;

            // Cleaning previous peer if exists
            if (peerRef.current) {
                peerRef.current.destroy();
                peerRef.current = null;
            }

            const newPeer = new Peer(myPeerId, {
                debug: 1,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            newPeer.on('open', () => {
                if (!isMounted) {
                    newPeer.destroy();
                    return;
                }

                setPeerReady(true);
            });

            newPeer.on('call', (call) => {
                if (!isMounted) return;


                incomingCallRef.current = call;
                callStateRef.current = 'INCOMING';
                setIncomingCall(call);
                setCallState('INCOMING');

                if (call.metadata) {
                    if (call.metadata.type) setCallType(call.metadata.type);
                    if (call.metadata.logId) {
                        callLogIdRef.current = call.metadata.logId;
                        setCurrentCallLogId(call.metadata.logId);
                    }
                    setOtherUserId(call.metadata.callerId || call.peer);
                } else {
                    setCallType('video');
                    setOtherUserId(call.peer);
                }

                call.on('close', () => {
                    if (isMounted) performCleanup();
                });
                call.on('error', (err) => {
                    console.error('[useCall] Incoming call error:', err);
                    if (isMounted) performCleanup();
                });
            });

            newPeer.on('error', (err: any) => {
                console.error('[useCall] PeerJS error:', err.type, err.message);

                // Handle "ID taken" by waiting and retrying
                if (err.type === 'unavailable-id' && attempt < 3) {
                    if (!isMounted) return;

                    newPeer.destroy();
                    retryTimeout = setTimeout(() => {
                        if (isMounted) {
                            initAttemptRef.current = attempt + 1;
                            createPeer(attempt + 1);
                        }
                    }, 2000);
                }
            });

            newPeer.on('disconnected', () => {
                if (isMounted) setPeerReady(false);
            });

            peerRef.current = newPeer;
            if (isMounted) setPeer(newPeer);
        };

        createPeer(0);

        return () => {
            isMounted = false;
            if (retryTimeout) clearTimeout(retryTimeout);
            if (peerRef.current) {

                peerRef.current.destroy();
                peerRef.current = null;
            }
        };
    }, [user, performCleanup]);


    useEffect(() => {
        if (!currentCallLogId) return;

        const channel = supabase
            .channel(`call_sync_${currentCallLogId}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'call_logs',
                filter: `id=eq.${currentCallLogId}`
            }, (payload) => {
                const newStatus = (payload.new as any)?.status;

                if (['rejected', 'missed', 'completed', 'cancelled'].includes(newStatus)) performCleanup();
            })
            .subscribe(() => { /* Subscribed */ });
        return () => { supabase.removeChannel(channel); };
    }, [currentCallLogId, performCleanup]);

    // Timeouts
    useEffect(() => {
        if (callState === 'OUTGOING') {
            timeoutRef.current = setTimeout(async () => {

                const logId = callLogIdRef.current;
                if (logId) await (supabase.from('call_logs') as any).update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', logId);
                performCleanup();
            }, CALL_TIMEOUT_MS);
        } else if (callState === 'INCOMING') {
            timeoutRef.current = setTimeout(() => { performCleanup(); }, 35000);
        } else if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, [callState, performCleanup]);

    // Audio
    useEffect(() => {
        if (callState === 'OUTGOING') { ringtoneAudioRef.current?.pause(); ringbackAudioRef.current?.play().catch(() => { }); }
        else if (callState === 'INCOMING') { ringbackAudioRef.current?.pause(); ringtoneAudioRef.current?.play().catch(() => { }); }
        else { ringbackAudioRef.current?.pause(); ringtoneAudioRef.current?.pause(); }
    }, [callState]);

    // Video sync
    useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream]);
    useEffect(() => { if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream; }, [remoteStream]);

    const startCall = async (recipientId: string, type: CallType = 'video') => {
        if (!peer || !peerReady || !user) {
            console.error('[useCall] Peer not ready');
            return;
        }


        setCallType(type);
        setCallState('OUTGOING');
        callStateRef.current = 'OUTGOING';
        setOtherUserId(recipientId);

        try {
            const { data: logData, error: logError } = await (supabase.from('call_logs') as any)
                .insert({ caller_id: user.id, recipient_id: recipientId, call_type: type, status: 'ringing' })
                .select().single();
            if (logError) console.error('[useCall] Log error:', logError);
            const logId = logData?.id;
            if (logId) { callLogIdRef.current = logId; setCurrentCallLogId(logId); }

            const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
            localStreamRef.current = stream;
            setLocalStream(stream);

            // Recipient peer ID is their cleaned user ID
            const recipientPeerId = recipientId.replace(/[^a-zA-Z0-9]/g, '');


            const call = peer.call(recipientPeerId, stream, { metadata: { type, logId, callerId: user.id } });
            activeCallRef.current = call;
            setActiveCall(call);

            call.on('stream', (rs) => {

                setRemoteStream(rs);
                setCallState('CONNECTED');
                callStateRef.current = 'CONNECTED';
                if (logId) (supabase.from('call_logs') as any).update({ status: 'ongoing' }).eq('id', logId);
            });
            call.on('close', () => { performCleanup(); });
            call.on('error', (e) => { console.error('[useCall] Call error:', e); performCleanup(); });
        } catch (err) {
            console.error('[useCall] Start call failed:', err);
            setCallState('IDLE');
            alert('Could not access camera/microphone');
        }
    };

    const answerCall = async () => {
        const call = incomingCallRef.current;
        if (!call) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
            localStreamRef.current = stream;
            setLocalStream(stream);
            call.answer(stream);
            setCallState('CONNECTED');
            callStateRef.current = 'CONNECTED';
            activeCallRef.current = call;
            incomingCallRef.current = null;
            setActiveCall(call);
            setIncomingCall(null);
            const logId = callLogIdRef.current;
            if (logId) await (supabase.from('call_logs') as any).update({ status: 'ongoing' }).eq('id', logId);
            call.on('stream', (rs) => setRemoteStream(rs));
            call.on('close', () => { performCleanup(); });
        } catch (err) {
            console.error('[useCall] Answer failed:', err);
            performCleanup();
        }
    };

    const declineCall = async () => {

        if (incomingCallRef.current) incomingCallRef.current.close();
        const logId = callLogIdRef.current;
        if (logId) await (supabase.from('call_logs') as any).update({ status: 'rejected', ended_at: new Date().toISOString() }).eq('id', logId);
        performCleanup();
    };

    const endCall = async () => {

        if (activeCallRef.current) activeCallRef.current.close();
        const logId = callLogIdRef.current;
        if (logId) await (supabase.from('call_logs') as any).update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', logId);
        performCleanup();
    };

    const cancelCall = async () => {

        if (activeCallRef.current) activeCallRef.current.close();
        const logId = callLogIdRef.current;
        if (logId) await (supabase.from('call_logs') as any).update({ status: 'cancelled', ended_at: new Date().toISOString() }).eq('id', logId);
        performCleanup();
    };

    return {
        callState, incomingCall, startCall, answerCall, declineCall, endCall, cancelCall,
        localStream, remoteStream, localVideoRef, remoteVideoRef, otherUserId, callType
    };
}
