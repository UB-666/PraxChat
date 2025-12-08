import { useState } from 'react';
import { cn } from '../lib/utils';
import { MessageSquare, Settings, LogOut, Phone } from 'lucide-react';
import { useClerk } from '@clerk/clerk-react';

type NavItemProps = {
    icon: React.ReactNode;
    active?: boolean;
    onClick?: () => void;
    badge?: number;
    title?: string;
};

function NavItem({ icon, active, onClick, badge, title }: NavItemProps) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                "relative w-10 h-10 flex items-center justify-center rounded-xl transition-all group",
                active
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            )}
        >
            {icon}
            {badge && badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-zinc-950">
                    {badge}
                </span>
            )}
        </button>
    );
}

export type NavTab = 'messages' | 'calls';

export default function IconNav({
    activeTab,
    onTabChange,
    onSettingsClick
}: {
    activeTab: NavTab;
    onTabChange: (tab: NavTab) => void;
    onSettingsClick: () => void;
}) {
    const { signOut } = useClerk();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <div className="flex flex-col items-center w-[72px] py-6 bg-zinc-950 border-r border-zinc-800 h-full">
            {/* Logo */}
            <div className="mb-8">
                <img src="/logo.svg" alt="Praxchat" className="w-10 h-10 rounded-xl shadow-lg shadow-indigo-500/20 transition-transform hover:scale-105" />
            </div>

            {/* Main Nav */}
            <nav className="flex-1 flex flex-col items-center gap-4">
                <NavItem
                    icon={<MessageSquare className="w-5 h-5" />}
                    active={activeTab === 'messages'}
                    onClick={() => onTabChange('messages')}
                    title="Messages"
                />
                <NavItem
                    icon={<Phone className="w-5 h-5" />}
                    active={activeTab === 'calls'}
                    onClick={() => onTabChange('calls')}
                    title="Call History"
                />
            </nav>

            {/* Bottom Nav */}
            <div className="flex flex-col items-center gap-4 pt-6 border-t border-zinc-800 w-10">
                <NavItem icon={<Settings className="w-5 h-5" />} onClick={onSettingsClick} title="Settings" />
                <NavItem
                    icon={<LogOut className="w-5 h-5" />}
                    onClick={() => setShowLogoutConfirm(true)}
                    title="Log Out"
                />
            </div>
            {/* Logout Confirmation */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-white mb-2">Log out?</h3>
                        <p className="text-zinc-400 mb-6">Are you sure you want to sign out of your account?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="px-4 py-2 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 transition-colors text-sm"
                            >
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
