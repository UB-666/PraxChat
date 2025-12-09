import { MessageSquare, Phone, Settings, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';

export type NavTab = 'messages' | 'calls';

type BottomNavProps = {
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    onSettingsClick: () => void;
    userAvatar?: string | null;
};

export default function BottomNav({
    activeTab,
    onTabChange,
    onSettingsClick,
    userAvatar
}: BottomNavProps) {
    const { signOut } = useClerk();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <>
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-zinc-800 flex items-center justify-around px-2 z-40 pb-safe">
                <button
                    onClick={() => onTabChange('messages')}
                    className={cn(
                        "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors",
                        activeTab === 'messages' ? "text-indigo-500" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <MessageSquare className={cn("w-6 h-6", activeTab === 'messages' && "fill-current")} />
                    <span className="text-[10px] font-medium">Chats</span>
                </button>

                <button
                    onClick={() => onTabChange('calls')}
                    className={cn(
                        "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors",
                        activeTab === 'calls' ? "text-indigo-500" : "text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <Phone className={cn("w-6 h-6", activeTab === 'calls' && "fill-current")} />
                    <span className="text-[10px] font-medium">Calls</span>
                </button>

                <button
                    onClick={onSettingsClick}
                    className="flex flex-col items-center justify-center w-16 h-full gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    <Settings className="w-6 h-6" />
                    <span className="text-[10px] font-medium">Settings</span>
                </button>

                <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="flex flex-col items-center justify-center w-16 h-full gap-1 text-zinc-500 hover:text-red-400 transition-colors"
                >
                    {userAvatar ? (
                        <img src={userAvatar} alt="Profile" className="w-6 h-6 rounded-full object-cover border border-zinc-700" />
                    ) : (
                        <LogOut className="w-6 h-6" />
                    )}
                    <span className="text-[10px] font-medium">Logout</span>
                </button>
            </div>

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white mb-2">Log out?</h3>
                        <p className="text-zinc-400 mb-6 text-sm">Are you sure you want to sign out of your account?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleLogout}
                                className="flex-1 px-4 py-3 rounded-xl bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-colors text-sm font-medium"
                            >
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
