import { useState, useRef, useEffect } from 'react';
import { Phone, Video, MoreHorizontal, Search, X, ChevronUp, ChevronDown } from 'lucide-react';

type ChatHeaderProps = {
    name: string;
    online?: boolean;
    avatar?: string;
    onToggleInfo?: () => void;
    onBack?: () => void;
    onVideoCall?: () => void;
    onAudioCall?: () => void;
    // Block status
    callsDisabled?: boolean;
    // Search props
    searchTerm?: string;
    onSearchChange?: (term: string) => void;
    searchMatchCount?: number;
    currentMatchIndex?: number;
    onNextMatch?: () => void;
    onPrevMatch?: () => void;
};

export default function ChatHeader({
    name,
    avatar,
    online,
    onToggleInfo,
    onBack,
    onVideoCall,
    onAudioCall,
    callsDisabled = false,
    searchTerm = '',
    onSearchChange,
    searchMatchCount = 0,
    currentMatchIndex = 0,
    onNextMatch,
    onPrevMatch
}: ChatHeaderProps) {
    const [showSearch, setShowSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Focus search input when opened
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    const handleSearchToggle = () => {
        if (showSearch) {
            // Close search and clear
            setShowSearch(false);
            onSearchChange?.('');
        } else {
            setShowSearch(true);
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                onPrevMatch?.();
            } else {
                onNextMatch?.();
            }
        } else if (e.key === 'Escape') {
            handleSearchToggle();
        }
    };

    return (
        <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
            {/* Main Header Row */}
            <div className="h-16 px-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Mobile Back Button */}
                    <button
                        onClick={onBack}
                        className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-white"
                    >
                        ←
                    </button>

                    {/* User Info */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleInfo}>
                        <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm overflow-hidden">
                                {avatar ? (
                                    <img src={avatar} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                    name.charAt(0)
                                )}
                            </div>
                            {online && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950" />
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-white">{name}</h3>
                            <p className="text-xs text-zinc-400">
                                {online ? 'Active now' : 'Offline'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={callsDisabled ? undefined : onAudioCall}
                        disabled={callsDisabled}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${callsDisabled
                                ? 'text-zinc-600 cursor-not-allowed opacity-50'
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                        title={callsDisabled ? 'Calls disabled' : 'Audio call'}
                    >
                        <Phone className="w-4 h-4" />
                    </button>
                    <button
                        onClick={callsDisabled ? undefined : onVideoCall}
                        disabled={callsDisabled}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${callsDisabled
                                ? 'text-zinc-600 cursor-not-allowed opacity-50'
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                        title={callsDisabled ? 'Calls disabled' : 'Video call'}
                    >
                        <Video className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-zinc-800 mx-2" />
                    <button
                        onClick={handleSearchToggle}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${showSearch
                            ? 'bg-indigo-600 text-white'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                        title="Search in chat (Ctrl+F)"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onToggleInfo}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Search Bar Row (Collapsible) */}
            {showSearch && (
                <div className="px-6 pb-3 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
                        <Search className="w-4 h-4 text-zinc-500" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => onSearchChange?.(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Search messages..."
                            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-zinc-500"
                        />
                        {searchTerm && (
                            <span className="text-xs text-zinc-500">
                                {searchMatchCount > 0 ? `${currentMatchIndex + 1}/${searchMatchCount}` : '0 results'}
                            </span>
                        )}
                    </div>

                    {/* Navigation Arrows */}
                    <button
                        onClick={onPrevMatch}
                        disabled={searchMatchCount === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="Previous match (Shift+Enter)"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onNextMatch}
                        disabled={searchMatchCount === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="Next match (Enter)"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Close Button */}
                    <button
                        onClick={handleSearchToggle}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all"
                        title="Close search (Esc)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
