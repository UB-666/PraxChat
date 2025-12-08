import { useState, useEffect } from 'react';
import { X, Save, Loader2, User, Link as LinkIcon } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../hooks/useAuth';

type SettingsDialogProps = {
    isOpen: boolean;
    onClose: () => void;
};

type SocialLinks = {
    github: string;
    twitter: string;
    linkedin: string;
};

export default function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form State
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [socials, setSocials] = useState<SocialLinks>({
        github: '',
        twitter: '',
        linkedin: ''
    });

    // Fetch existing profile
    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchProfile = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single() as any;

            if (data && !error) {
                setDisplayName(data.display_name || '');
                setBio(data.bio || '');
                setAvatarUrl(data.avatar_url || '');

                const links = data.social_links as any; // Cast from JSON
                setSocials({
                    github: links?.github || '',
                    twitter: links?.twitter || '',
                    linkedin: links?.linkedin || ''
                });
            }
            setLoading(false);
        };

        fetchProfile();
    }, [isOpen, user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);

        const updates = {
            id: user.id,
            display_name: displayName,
            bio: bio,
            avatar_url: avatarUrl,
            social_links: socials,
        };

        const { error } = await supabase
            .from('profiles')
            .upsert(updates as any); // Cast to any to avoid strict type issues with new columns if not fully propagated

        if (error) {
            console.error('Error saving profile:', error);
            alert('Failed to save profile: ' + error.message);
        } else {
            onClose();
        }
        setSaving(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <h2 className="text-lg font-semibold text-white">Settings</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        </div>
                    ) : (
                        <>
                            {/* Basics */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                                    <User className="w-4 h-4" /> Profile Info
                                </h3>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="e.g. John Doe"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Bio / Title</label>
                                    <input
                                        type="text"
                                        value={bio}
                                        onChange={(e) => setBio(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="e.g. Product Designer"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Avatar Image URL</label>
                                    <input
                                        type="text"
                                        value={avatarUrl}
                                        onChange={(e) => setAvatarUrl(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            {/* Socials */}
                            <div className="space-y-4 pt-4 border-t border-zinc-800">
                                <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4" /> Social Links
                                </h3>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">GitHub URL</label>
                                    <input
                                        type="text"
                                        value={socials.github}
                                        onChange={(e) => setSocials({ ...socials, github: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="https://github.com/..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Twitter/X URL</label>
                                    <input
                                        type="text"
                                        value={socials.twitter}
                                        onChange={(e) => setSocials({ ...socials, twitter: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="https://twitter.com/..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">LinkedIn URL</label>
                                    <input
                                        type="text"
                                        value={socials.linkedin}
                                        onChange={(e) => setSocials({ ...socials, linkedin: e.target.value })}
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="https://linkedin.com/in/..."
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
