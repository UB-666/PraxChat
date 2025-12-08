import { cn } from '../lib/utils';
import { Search } from 'lucide-react';

type Conversation = {
    id: string;
    name: string;
    subtitle?: string;
    lastMessage: string;
    time: string;
    unread?: number;
    online?: boolean;
    avatarColor?: string;
    avatar?: string;
};

type SidebarProps = {
    conversations: Conversation[];
    activeId: string | null;
    onSelect: (id: string) => void;
    className?: string;
};

export default function Sidebar({ conversations, activeId, onSelect, className }: SidebarProps) {
    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Search */}
            <div className="p-4 border-b border-zinc-800">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full h-9 pl-9 pr-4 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversations.map((conv) => (
                    <button
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group",
                            activeId === conv.id
                                ? "bg-zinc-800"
                                : "hover:bg-zinc-800/50"
                        )}
                    >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm overflow-hidden"
                                style={{ background: conv.avatarColor || 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                            >
                                {conv.avatar ? (
                                    <img src={conv.avatar} alt={conv.name} className="w-full h-full object-cover" />
                                ) : (
                                    conv.name.charAt(0)
                                )}
                            </div>
                            {conv.online && (
                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className={cn(
                                    "font-medium text-sm truncate",
                                    activeId === conv.id ? "text-white" : "text-zinc-300"
                                )}>
                                    {conv.name}
                                </span>
                                <span className="text-[10px] text-zinc-500">{conv.time}</span>
                            </div>
                            <p className={cn(
                                "text-xs truncate",
                                conv.unread ? "text-zinc-200 font-medium" : "text-zinc-500"
                            )}>
                                {conv.lastMessage}
                            </p>
                        </div>

                        {/* Status Dot - Green if unread, faded gray if read */}
                        <div className={cn(
                            "w-2.5 h-2.5 rounded-full transition-all",
                            conv.unread && conv.unread > 0
                                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                                : "bg-zinc-600/50"
                        )} />
                    </button>
                ))}
            </div>
        </div>
    );
}
