import { useEffect, useRef, useCallback, useState } from 'react';
import { sanitizeHtml } from '../lib/utils/sanitize';
import { cn } from '../lib/utils';
import { Check, CheckCheck, MoreVertical, Reply, Copy, Trash2 } from 'lucide-react';
import AttachmentBubble from './AttachmentBubble';

export type Message = {
    id: string;
    content: string;
    timestamp: string;
    raw_timestamp?: string; // ISO string for expiry check
    sent: boolean;
    read?: boolean;
    attachment_ptr?: string;
    reply_to?: {
        id: string;
        content: string;
        sender_id: string;
        sent: boolean;
    };
};

type MessageListProps = {
    messages: Message[];
    searchTerm?: string;
    currentMatchIndex?: number;
    onReply?: (message: Message) => void;
    onCopy?: (message: Message) => void;
    onDelete?: (messageId: string) => void;
    onScrollToMessage?: (messageId: string) => void;
};

/**
 * Highlights search term in text by wrapping matches in span with highlight style
 */
function highlightText(text: string, searchTerm: string): React.ReactNode {
    // Sanitize input first to prevent XSS
    const safeText = sanitizeHtml(text);

    if (!searchTerm.trim()) return safeText;

    const safeSearchTerm = sanitizeHtml(searchTerm);
    const regex = new RegExp(`(${safeSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = safeText.split(regex);

    return parts.map((part, index) => {
        if (part.toLowerCase() === searchTerm.toLowerCase()) {
            return (
                <mark
                    key={index}
                    className="bg-yellow-500/40 text-inherit rounded px-0.5"
                >
                    {part}
                </mark>
            );
        }
        return part;
    });
}

/**
 * Context menu dropdown for message actions
 */
function MessageMenu({
    message,
    position,
    onClose,
    onReply,
    onCopy,
    onDelete
}: {
    message: Message;
    position: 'left' | 'right';
    onClose: () => void;
    onReply?: (message: Message) => void;
    onCopy?: (message: Message) => void;
    onDelete?: (messageId: string) => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const handleCopy = () => {
        if (!message.attachment_ptr) {
            navigator.clipboard.writeText(message.content);
        }
        onCopy?.(message);
        onClose();
    };

    const handleReply = () => {
        onReply?.(message);
        onClose();
    };

    const handleDelete = () => {
        onDelete?.(message.id);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className={cn(
                "absolute z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]",
                "animate-in fade-in zoom-in-95 duration-150",
                position === 'right' ? "right-0" : "left-0",
                "top-full mt-1"
            )}
        >
            <button
                onClick={handleReply}
                className="w-full px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2.5 transition-colors"
            >
                <Reply className="w-4 h-4 text-zinc-400" />
                Reply
            </button>
            {!message.attachment_ptr && (
                <button
                    onClick={handleCopy}
                    className="w-full px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2.5 transition-colors"
                >
                    <Copy className="w-4 h-4 text-zinc-400" />
                    Copy
                </button>
            )}
            <div className="h-px bg-zinc-700 my-1" />
            <button
                onClick={handleDelete}
                className="w-full px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 flex items-center gap-2.5 transition-colors"
            >
                <Trash2 className="w-4 h-4" />
                Delete
            </button>
        </div>
    );
}

export default function MessageList({
    messages,
    searchTerm = '',
    currentMatchIndex = 0,
    onReply,
    onCopy,
    onDelete,
    onScrollToMessage
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // Helper to scroll to a message (for clicking quoted messages)
    const scrollToMessage = (messageId: string) => {
        const element = messageRefs.current.get(messageId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash highlight with ring (follows rounded corners)
            element.classList.add('transition-all', 'duration-1000', 'ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-zinc-950');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-zinc-950');
                // Clean up transition
                setTimeout(() => {
                    element.classList.remove('transition-all', 'duration-1000');
                }, 1000);
            }, 1000);
        }
        onScrollToMessage?.(messageId);
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        if (!searchTerm) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, searchTerm]);

    // Find matching message IDs
    const getMatchingMessageIds = useCallback(() => {
        if (!searchTerm.trim()) return [];
        return messages
            .filter(msg => !msg.attachment_ptr && msg.content.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(msg => msg.id);
    }, [messages, searchTerm]);

    // Scroll to current match
    useEffect(() => {
        if (!searchTerm.trim()) return;

        const matchingIds = getMatchingMessageIds();
        if (matchingIds.length === 0) return;

        const targetId = matchingIds[currentMatchIndex];
        const targetElement = messageRefs.current.get(targetId);

        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [searchTerm, currentMatchIndex, getMatchingMessageIds]);

    const matchingIds = getMatchingMessageIds();

    const toggleMenu = (msgId: string) => {
        setActiveMenuId(prev => prev === msgId ? null : msgId);
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-950">
            {/* Date Separator */}
            <div className="flex items-center justify-center">
                <span className="text-[10px] font-medium text-zinc-500 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                    Today
                </span>
            </div>

            {messages.map((msg, i) => {
                const isSequence = i > 0 && messages[i - 1].sent === msg.sent;
                const isMatch = matchingIds.includes(msg.id);
                const isCurrentMatch = isMatch && matchingIds[currentMatchIndex] === msg.id;
                const isMenuOpen = activeMenuId === msg.id;

                return (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex w-full group/message",
                            msg.sent ? "justify-end" : "justify-start",
                            isSequence ? "mt-1" : "mt-6"
                        )}
                    >
                        <div className={cn(
                            "max-w-[85%] md:max-w-[70%] lg:max-w-[60%] relative flex gap-2",
                            msg.sent ? "flex-row-reverse" : "flex-row"
                        )}>
                            {/* Message Bubble */}
                            <div className="relative flex flex-col items-end">
                                <div
                                    ref={(el) => {
                                        if (el) messageRefs.current.set(msg.id, el);
                                    }}
                                    className={cn(
                                        "px-4 py-2 text-[15px] leading-relaxed shadow-md transition-all relative break-words min-w-[80px]",
                                        msg.sent
                                            ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl rounded-tr-sm animate-slide-up"
                                            : "bg-zinc-800/80 text-zinc-100 border border-zinc-700/50 rounded-2xl rounded-tl-sm backdrop-blur-sm animate-slide-up",
                                        // Highlight current match with ring
                                        isCurrentMatch && "ring-2 ring-yellow-400 ring-offset-2 ring-offset-zinc-950 z-10"
                                    )}
                                >
                                    {/* Link Preview / Reply */}
                                    {msg.reply_to && (
                                        <button
                                            onClick={() => scrollToMessage(msg.reply_to!.id)}
                                            className={cn(
                                                "w-full text-left mb-2 p-2 rounded-lg border-l-2 transition-colors overflow-hidden",
                                                msg.sent
                                                    ? "bg-indigo-800/40 border-indigo-300/50 hover:bg-indigo-800/60"
                                                    : "bg-zinc-900/50 border-zinc-600 hover:bg-zinc-900/70"
                                            )}
                                        >
                                            <p className={cn(
                                                "text-xs font-bold mb-0.5",
                                                msg.sent ? "text-indigo-200" : "text-indigo-400"
                                            )}>
                                                {msg.reply_to.sent ? 'You' : 'Them'}
                                            </p>
                                            <p className={cn(
                                                "text-xs truncate opacity-90",
                                                msg.sent ? "text-indigo-100" : "text-zinc-400"
                                            )}>
                                                {sanitizeHtml(msg.reply_to.content)}
                                            </p>
                                        </button>
                                    )}

                                    <div className="mr-10 pb-1"> {/* Spacing for timestamp */}
                                        {msg.attachment_ptr ? (
                                            <AttachmentBubble
                                                jsonContent={msg.content}
                                                attachmentPath={msg.attachment_ptr}
                                                sentByMe={msg.sent}
                                                timestamp={msg.raw_timestamp || new Date().toISOString()}
                                            />
                                        ) : (
                                            highlightText(msg.content, searchTerm)
                                        )}
                                    </div>

                                    {/* Timestamp & Status (Inside Bubble) */}
                                    <div className={cn(
                                        "absolute bottom-1.5 right-3 flex items-center gap-1 select-none",
                                        msg.sent ? "text-indigo-200/80" : "text-zinc-500"
                                    )}>
                                        <span className="text-[10px] font-medium tracking-wide">
                                            {msg.timestamp.replace(/AM|PM/, '')}
                                        </span>
                                        {msg.sent && (
                                            msg.read
                                                ? <CheckCheck className="w-3 h-3 text-indigo-200" strokeWidth={2.5} />
                                                : <Check className="w-3 h-3 text-indigo-300" strokeWidth={2.5} />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions Button (visible on hover) */}
                            <button
                                onClick={() => toggleMenu(msg.id)}
                                className={cn(
                                    "p-1.5 rounded-full transition-all self-center opacity-0 group-hover/message:opacity-100",
                                    isMenuOpen ? "opacity-100 bg-zinc-800" : "hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Context Menu */}
                            {isMenuOpen && (
                                <MessageMenu
                                    message={msg}
                                    position={msg.sent ? 'right' : 'left'}
                                    onClose={() => setActiveMenuId(null)}
                                    onReply={onReply}
                                    onCopy={onCopy}
                                    onDelete={onDelete}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
