import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { FileCipher } from '../lib/crypto/fileCipher';
import { FileIcon, ImageIcon, VideoIcon, Download, Loader2, AlertTriangle, Lock } from 'lucide-react';

type AttachmentMetadata = {
    type: 'file';
    fileType: string;
    fileName: string;
    fileSize: number;
    key: string;
    path: string; // We'll pass path separately or inject it into metadata before rendering
};

type AttachmentBubbleProps = {
    jsonContent: string;
    attachmentPath?: string;
    sentByMe: boolean;
    timestamp: string; // ISO string for expiry check
};

export default function AttachmentBubble({ jsonContent, attachmentPath, sentByMe, timestamp }: AttachmentBubbleProps) {
    const [metadata, setMetadata] = useState<AttachmentMetadata | null>(null);
    const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR' | 'EXPIRED'>('IDLE');
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        try {
            const parsed = JSON.parse(jsonContent);
            if (parsed.type === 'file') {
                // Check Expiry (24 hours)
                const created = new Date(timestamp).getTime();
                const now = Date.now();
                const diffHours = (now - created) / (1000 * 60 * 60);

                if (diffHours >= 24) {
                    setStatus('EXPIRED');
                } else {
                    setMetadata(parsed);
                    // Auto-load images/videos
                    if (parsed.fileType.startsWith('image/')) {
                        // We delay slightly to allow UI to settle, or just trigger load
                        // But we'll wait for user click or run immediately?
                        // "Professional" apps usually auto-load images.
                        loadAttachment(parsed, attachmentPath);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to parse attachment metadata', e);
            setStatus('ERROR');
        }
    }, [jsonContent, timestamp, attachmentPath]);

    const loadAttachment = async (meta: AttachmentMetadata, path?: string) => {
        if (!path || status === 'LOADING' || status === 'READY') return;

        setStatus('LOADING');
        try {
            // 1. Download Encrypted Blob
            const { data, error } = await supabase.storage.from('attachments').download(path);
            if (error) throw error;
            if (!data) throw new Error('No data received');

            // 2. Decrypt
            const decryptedBlob = await FileCipher.decryptFile(data, meta.key, meta.fileType);

            // 3. Create URL
            const url = URL.createObjectURL(decryptedBlob);
            setBlobUrl(url);
            setStatus('READY');

        } catch (e: any) {
            console.error('Download/Decrypt failed', e);
            setStatus('ERROR');
            setErrorMsg(e.message || 'Failed to load');
        }
    };

    const handleDownload = () => {
        if (blobUrl && metadata) {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = metadata.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else if (metadata && attachmentPath) {
            loadAttachment(metadata, attachmentPath).then(() => {
                // We rely on state update to trigger future click? 
                // Actually after loadAttachment resolves, blobUrl state might not be immediate if we don't return it.
                // But loadAttachment sets state.
                // Better UX: Just load, user clicks again or we auto-trigger?
                // For "Files", we usually want to download to disk.
            });
        }
    };

    if (status === 'EXPIRED') {
        return (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>Attachment expired (24h limit)</span>
            </div>
        );
    }

    if (!metadata) return null;

    const isImage = metadata.fileType.startsWith('image/');
    const isVideo = metadata.fileType.startsWith('video/');

    return (
        <div className="flex flex-col gap-2">
            {/* Image Preview */}
            {isImage && status === 'READY' && blobUrl && (
                <img src={blobUrl} alt="Encrypted content" className="max-w-[200px] md:max-w-xs rounded-lg border border-zinc-700" />
            )}

            {/* Loading/Action State */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${sentByMe ? 'bg-white/10 border-white/20' : 'bg-black/20 border-zinc-700'}`}>
                <div className="p-2 bg-zinc-800 rounded-lg">
                    {isImage ? <ImageIcon className="w-5 h-5 text-indigo-400" /> :
                        isVideo ? <VideoIcon className="w-5 h-5 text-indigo-400" /> :
                            <FileIcon className="w-5 h-5 text-indigo-400" />}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate max-w-[150px]">{metadata.fileName}</p>
                    <p className="text-[10px] opacity-70 flex items-center gap-1">
                        {(metadata.fileSize / 1024).toFixed(1)} KB • <Lock className="w-3 h-3" /> Encrypted
                    </p>
                </div>

                {status === 'LOADING' ? (
                    <Loader2 className="w-5 h-5 animate-spin opacity-70" />
                ) : (
                    <button
                        onClick={handleDownload}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                        title="Download / Decrypt"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                )}
            </div>

            {errorMsg && <p className="text-[10px] text-red-400">{errorMsg}</p>}
        </div>
    );
}
