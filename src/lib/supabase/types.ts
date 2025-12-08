export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    username: string | null
                    display_name: string | null
                    email: string | null
                    created_at: string
                    disabled: boolean
                    is_admin: boolean
                    bio: string | null
                    avatar_url: string | null
                    social_links: Json | null
                }
                Insert: {
                    id: string
                    username?: string | null
                    display_name?: string | null
                    email?: string | null
                    created_at?: string
                    disabled?: boolean
                    is_admin?: boolean
                    bio?: string | null
                    avatar_url?: string | null
                    social_links?: Json | null
                }
                Update: {
                    id?: string
                    username?: string | null
                    display_name?: string | null
                    email?: string | null
                    created_at?: string
                    disabled?: boolean
                    is_admin?: boolean
                    bio?: string | null
                    avatar_url?: string | null
                    social_links?: Json | null
                }
            }
            devices: {
                Row: {
                    id: string
                    user_id: string
                    device_name: string | null
                    public_identity_key: string
                    public_prekeys: Json
                    created_at: string
                    last_seen: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    device_name?: string | null
                    public_identity_key: string
                    public_prekeys?: Json
                    created_at?: string
                    last_seen?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    device_name?: string | null
                    public_identity_key?: string
                    public_prekeys?: Json
                    created_at?: string
                    last_seen?: string | null
                }
            }
            conversations: {
                Row: {
                    id: string
                    kind: 'dm' | 'group' | null
                    meta: Json
                    created_at: string
                }
                Insert: {
                    id?: string
                    kind?: 'dm' | 'group' | null
                    meta?: Json
                    created_at?: string
                }
                Update: {
                    id?: string
                    kind?: 'dm' | 'group' | null
                    meta?: Json
                    created_at?: string
                }
            }
            conversation_participants: {
                Row: {
                    conversation_id: string
                    user_id: string
                }
                Insert: {
                    conversation_id: string
                    user_id: string
                }
                Update: {
                    conversation_id?: string
                    user_id?: string
                }
            }
            messages: {
                Row: {
                    id: string
                    conversation_id: string
                    sender_user_id: string
                    sender_device_id: string | null
                    ciphertext: string
                    ciphertext_header: Json | null
                    attachment_ptr: string | null
                    created_at: string
                    delivered: boolean
                }
                Insert: {
                    id?: string
                    conversation_id: string
                    sender_user_id: string
                    sender_device_id?: string | null
                    ciphertext: string
                    ciphertext_header?: Json | null
                    attachment_ptr?: string | null
                    created_at?: string
                    delivered?: boolean
                }
                Update: {
                    id?: string
                    conversation_id?: string
                    sender_user_id?: string
                    sender_device_id?: string | null
                    ciphertext?: string
                    ciphertext_header?: Json | null
                    attachment_ptr?: string | null
                    created_at?: string
                    delivered?: boolean
                }
            }
        }
        user_blocks: {
            Row: {
                blocker_id: string
                blocked_id: string
                created_at: string
            }
            Insert: {
                blocker_id: string
                blocked_id: string
                created_at?: string
            }
            Update: {
                blocker_id?: string
                blocked_id?: string
                created_at?: string
            }
        },
        Functions: {
            get_or_create_dm: {
                Args: {
                    p_recipient_id: string
                    p_sender_id: string
                }
                Returns: string
            }
        }
    }
}
