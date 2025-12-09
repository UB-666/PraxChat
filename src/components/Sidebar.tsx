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
            <div className="p-4 border-b border-zinc-800/50">
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        className="w-full h-10 pl-10 pr-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:bg-zinc-900 transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 nice-scrollbar">
                {conversations.map((conv, index) => (
                    <button
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        style={{ animationDelay: `${index * 0.05}s` }}
                        className={cn(
                            "w-full flex items-center gap-3.5 p-3 rounded-xl transition-all text-left relative overflow-hidden group border border-transparent animate-slide-in-right",
                            activeId === conv.id
                                ? "bg-indigo-600/10 border-indigo-500/20 shadow-sm"
                                : "hover:bg-zinc-800/50 hover:border-zinc-700/50"
                        )}
                    >
                        {/* Active Indicator Bar */}
                        {activeId === conv.id && (
                            <div className="absolute left-0 top-1/3 bottom-1/3 w-1 bg-indigo-500 rounded-r-full" />
                        )}

                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg shadow-md overflow-hidden ring-2 ring-transparent group-hover:ring-zinc-700 transition-all"
                                style={{ background: conv.avatar ? 'none' : (conv.avatarColor || 'linear-gradient(135deg, #6366f1, #a855f7)') }}
                            >
                                {conv.avatar ? (
                                    <img src={conv.avatar} alt={conv.name} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-300" />
                                ) : (
                                    conv.name.charAt(0)
                                )}
                            </div>
                            {conv.online && (
                                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-[3px] border-zinc-950 shadow-sm" />
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                            <div className="flex items-center justify-between">
                                <span className={cn(
                                    "font-semibold text-sm truncate tracking-tight transition-colors",
                                    activeId === conv.id ? "text-indigo-100" : "text-zinc-200 group-hover:text-white"
                                )}>
                                    {conv.name}
                                </span>
                                <span className={cn(
                                    "text-[10px] font-medium transition-colors",
                                    conv.unread ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-400"
                                )}>
                                    {conv.time}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <p className={cn(
                                    "text-sm truncate pr-2 transition-colors nav-message-preview",
                                    conv.unread
                                        ? "text-zinc-100 font-medium"
                                        : (activeId === conv.id ? "text-indigo-200/70" : "text-zinc-400 group-hover:text-zinc-300")
                                )}>
                                    {conv.lastMessage}
                                </p>
                                {/* Active unread badge */}
                                {/* Active unread badge or placeholder dot */}
                                {(conv.unread || 0) > 0 ? (
                                    <span className="flex-shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow-lg shadow-indigo-500/30">
                                        {conv.unread}
                                    </span>
                                ) : (
                                    <div className="w-3 h-3 rounded-full bg-zinc-800/80" />
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
