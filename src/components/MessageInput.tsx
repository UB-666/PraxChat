import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Send, Paperclip, Smile, X, Reply } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';

// Lazy load the emoji picker to prevent white screen on initial load
const EmojiPicker = lazy(() => import('emoji-picker-react'));

export type ReplyingTo = {
    id: string;
    content: string;
    senderName: string;
};

type MessageInputProps = {
    onSend: (content: string, replyToMessageId?: string) => void;
    onFileSelect?: (file: File) => void;
    disabled?: boolean;
    disabledMessage?: string;
    replyingTo?: ReplyingTo | null;
    onCancelReply?: () => void;
};

export default function MessageInput({
    onSend,
    onFileSelect,
    disabled = false,
    disabledMessage,
    replyingTo,
    onCancelReply
}: MessageInputProps) {
    // Show blocked message if disabled
    if (disabled) {
        return (
            <div className="border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md p-4">
                <div className="flex items-center justify-center py-3 px-4 bg-zinc-900 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 text-sm">
                        🚫 {disabledMessage || 'You cannot send messages to this user.'}
                    </span>
                </div>
            </div>
        );
    }
    const [message, setMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [message]);

    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        };

        if (showEmojiPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showEmojiPicker]);

    // Focus input when replying
    useEffect(() => {
        if (replyingTo) {
            textareaRef.current?.focus();
        }
    }, [replyingTo]);

    const handleSend = () => {
        if (message.trim()) {
            onSend(message.trim(), replyingTo?.id);
            setMessage('');
            onCancelReply?.();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
        // Cancel reply with Escape
        if (e.key === 'Escape' && replyingTo) {
            onCancelReply?.();
        }
    };

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onFileSelect) {
            onFileSelect(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        setMessage(prev => prev + emojiData.emoji);
        textareaRef.current?.focus();
    };

    const toggleEmojiPicker = () => {
        setShowEmojiPicker(prev => !prev);
    };

    return (
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 relative">
            {/* Reply Preview Bar */}
            {replyingTo && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <Reply className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-indigo-400 font-medium">
                            Replying to {replyingTo.senderName}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                            {replyingTo.content}
                        </p>
                    </div>
                    <button
                        onClick={onCancelReply}
                        className="p-1 hover:bg-zinc-800 rounded transition-colors"
                        title="Cancel reply"
                    >
                        <X className="w-4 h-4 text-zinc-500" />
                    </button>
                </div>
            )}

            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Emoji Picker Popup - Lazy Loaded */}
            {showEmojiPicker && (
                <div
                    ref={emojiPickerRef}
                    className="absolute bottom-20 right-4 z-50 shadow-2xl rounded-lg overflow-hidden"
                >
                    <Suspense fallback={
                        <div className="w-80 h-96 bg-zinc-900 flex items-center justify-center">
                            <span className="text-zinc-400">Loading...</span>
                        </div>
                    }>
                        <EmojiPicker
                            onEmojiClick={handleEmojiClick}
                            theme={"dark" as any}
                            width={320}
                            height={400}
                            searchPlaceholder="Search emoji..."
                            skinTonesDisabled
                            previewConfig={{ showPreview: false }}
                        />
                    </Suspense>
                </div>
            )}

            <div className="flex items-end gap-2 bg-zinc-900 p-2 rounded-2xl border border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">

                {/* Attach */}
                <button
                    onClick={handleFileClick}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
                    title="Attach file (Max 5MB)"
                >
                    <Paperclip className="w-5 h-5" />
                </button>

                {/* Input */}
                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-zinc-500 resize-none py-2.5 max-h-32"
                />

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleEmojiPicker}
                        className={`p-2 rounded-xl transition-all ${showEmojiPicker
                            ? 'text-indigo-400 bg-zinc-800'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                        title="Emoji picker"
                    >
                        <Smile className="w-5 h-5" />
                    </button>

                    {/* Send Button - Always visible */}
                    <button
                        onClick={handleSend}
                        disabled={!message.trim()}
                        className={`p-2 rounded-xl transition-all ml-1 ${message.trim()
                            ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-95'
                            : 'text-zinc-600 cursor-not-allowed bg-zinc-900/50'
                            }`}
                        title="Send message"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="text-center mt-2 hidden md:block">
                <p className="text-[10px] text-zinc-600">
                    Press <kbd className="font-sans bg-zinc-900 px-1 rounded text-zinc-400">Enter</kbd> to send
                </p>
            </div>
        </div>
    );
}
