-- ============================================================================
-- PRAXCHAT MASTER DATABASE SCHEMA
-- ============================================================================

-- SECTIONS:
--   1. Helper Functions (Auth & Utils)
--   2. Table Definitions
--   3. Indexes
--   4. Triggers & RPC Functions
--   5. Row Level Security (RLS) Policies
--   6. Storage Configuration
--   7. Realtime Configuration
-- ============================================================================


-- ============================================================================
-- SECTION 1: HELPER FUNCTIONS
-- ============================================================================

-- A. Get Current User ID
-- Extracts 'clerk_id' from JWT, falls back to 'sub'.
-- Required for Clerk <-> Supabase integration.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'clerk_id'), 
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    );
$$;


-- B. Conversation Membership Check
-- SECURITY DEFINER prevents RLS recursion when checking message access.
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM conversation_participants 
        WHERE conversation_id = _conversation_id 
        AND user_id = public.current_user_id()
    );
END;
$$;


-- C. Debug Helpers (Optional - useful for troubleshooting)
CREATE OR REPLACE FUNCTION public.get_jwt_claims()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT auth.jwt();
$$;

CREATE OR REPLACE FUNCTION public.debug_rls_check()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_uid TEXT;
    v_claims JSONB;
BEGIN
    BEGIN
        v_claims := current_setting('request.jwt.claims', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_claims := '{"error": "Could not get claims"}'::jsonb;
    END;

    BEGIN
        v_uid := public.current_user_id();
    EXCEPTION WHEN OTHERS THEN
        v_uid := 'ERROR: function missing?';
    END;
    
    RETURN jsonb_build_object(
        '1_computed_uid', v_uid,
        '2_raw_sub', v_claims ->> 'sub',
        '3_raw_clerk_id', v_claims ->> 'clerk_id',
        '4_role', v_claims ->> 'role'
    );
END;
$$;


-- ============================================================================
-- SECTION 2: TABLE DEFINITIONS
-- ============================================================================

-- A. PROFILES
-- User information synced from Clerk
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT NOT NULL PRIMARY KEY,                -- Clerk User ID
    username TEXT UNIQUE,                         -- For searching/mentions
    display_name TEXT,                       
    email TEXT,
    bio TEXT,                                     -- User biography
    avatar_url TEXT,                              -- Profile picture URL
    social_links JSONB DEFAULT '{"github": "", "twitter": "", "linkedin": ""}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    disabled BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE
);


-- B. DEVICES
-- Cryptographic device identity for E2EE
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_name TEXT,
    public_identity_key TEXT NOT NULL,            -- Ed25519 public key (base64)
    public_prekeys JSONB DEFAULT '[]'::JSONB,     -- X3DH prekeys array
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ
);


-- C. CONVERSATIONS
-- DM or group chat containers
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT CHECK (kind IN ('dm', 'group')) DEFAULT 'dm',
    meta JSONB DEFAULT '{}'::JSONB,               -- Group title, avatar, etc.
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- D. CONVERSATION PARTICIPANTS
-- Links users to conversations
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),       -- For unread count tracking
    PRIMARY KEY (conversation_id, user_id)
);


-- E. MESSAGES
-- Encrypted message content
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    ciphertext TEXT NOT NULL,                     -- E2E encrypted payload
    ciphertext_header JSONB,                      -- X3DH header for decryption
    attachment_ptr TEXT,                          -- Storage path for encrypted file
    reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered BOOLEAN DEFAULT FALSE
);


-- F. CALL LOGS
-- Voice/video call history
CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'rejected', 'ongoing', 'ringing', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration INTEGER,                             -- Duration in seconds
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- G. USER BLOCKS
-- Blocking functionality
CREATE TABLE IF NOT EXISTS public.user_blocks (
    blocker_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);


-- H. MESSAGE DELETIONS
-- Soft delete tracking ("Delete for me" feature)
CREATE TABLE IF NOT EXISTS public.message_deletions (
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    deleted_before TIMESTAMPTZ NOT NULL,          -- Hide messages before this time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, conversation_id)
);


-- ============================================================================
-- SECTION 3: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_conv_id ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_participants_last_read ON public.conversation_participants(conversation_id, user_id, last_read_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_user ON public.message_deletions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_deletions_conv ON public.message_deletions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);


-- ============================================================================
-- SECTION 4: TRIGGERS & RPC FUNCTIONS
-- ============================================================================

-- A. Auto-update conversation timestamp on new message
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON public.messages;
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_timestamp();


-- B. Get or Create DM (Atomic)
CREATE OR REPLACE FUNCTION public.get_or_create_dm(
    p_recipient_id TEXT,
    p_sender_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conv_id UUID;
BEGIN
    -- Find existing DM
    SELECT c.id INTO v_conv_id
    FROM public.conversations c
    JOIN public.conversation_participants cp1 ON c.id = cp1.conversation_id
    JOIN public.conversation_participants cp2 ON c.id = cp2.conversation_id
    WHERE c.kind = 'dm'
      AND cp1.user_id = p_sender_id
      AND cp2.user_id = p_recipient_id
    LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
        RETURN v_conv_id;
    END IF;

    -- Create new DM
    INSERT INTO public.conversations (kind, meta)
    VALUES ('dm', '{}')
    RETURNING id INTO v_conv_id;

    -- Add participants
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES 
        (v_conv_id, p_sender_id),
        (v_conv_id, p_recipient_id);

    RETURN v_conv_id;
END;
$$;


-- C. Get Unread Count
CREATE OR REPLACE FUNCTION public.get_unread_count(
    p_conversation_id UUID,
    p_user_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_last_read TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    SELECT last_read_at INTO v_last_read
    FROM conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id;
    
    IF v_last_read IS NULL THEN
        RETURN 0;
    END IF;
    
    SELECT COUNT(*) INTO v_count
    FROM messages
    WHERE conversation_id = p_conversation_id
    AND created_at > v_last_read
    AND sender_user_id != p_user_id;
    
    RETURN COALESCE(v_count, 0);
END;
$$;


-- D. Mark Conversation as Read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(
    p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE conversation_participants
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id
    AND user_id = current_user_id();
END;
$$;


-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on All Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;


-- === PROFILES ===
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_read_all" ON public.profiles 
    FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles 
    FOR UPDATE USING (current_user_id() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles 
    FOR INSERT WITH CHECK (current_user_id() = id);


-- === DEVICES ===
DROP POLICY IF EXISTS "devices_read_all" ON public.devices;
DROP POLICY IF EXISTS "devices_insert_own" ON public.devices;
DROP POLICY IF EXISTS "devices_update_own" ON public.devices;
DROP POLICY IF EXISTS "devices_delete_own" ON public.devices;

CREATE POLICY "devices_read_all" ON public.devices 
    FOR SELECT USING (true);
CREATE POLICY "devices_insert_own" ON public.devices 
    FOR INSERT WITH CHECK (current_user_id() = user_id);
CREATE POLICY "devices_update_own" ON public.devices 
    FOR UPDATE USING (current_user_id() = user_id);
CREATE POLICY "devices_delete_own" ON public.devices 
    FOR DELETE USING (current_user_id() = user_id);


-- === CONVERSATIONS ===
DROP POLICY IF EXISTS "conversations_read_own" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;

CREATE POLICY "conversations_read_own" ON public.conversations 
    FOR SELECT USING (is_conversation_member(id));
CREATE POLICY "conversations_insert" ON public.conversations 
    FOR INSERT WITH CHECK (true);
CREATE POLICY "conversations_update" ON public.conversations 
    FOR UPDATE USING (is_conversation_member(id));


-- === CONVERSATION PARTICIPANTS ===
DROP POLICY IF EXISTS "participants_read_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_insert_any" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_insert_self" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_read_auth" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_insert_auth" ON public.conversation_participants;

-- Read: If member of conversation OR it's your own row
CREATE POLICY "participants_read_own" ON public.conversation_participants 
    FOR SELECT USING (
        is_conversation_member(conversation_id) OR user_id = current_user_id()
    );
-- Insert: Only self-join allowed (DM creation via SECURITY DEFINER RPC bypasses this)
CREATE POLICY "participants_insert_self" ON public.conversation_participants 
    FOR INSERT WITH CHECK (
        user_id = current_user_id()
    );


-- === MESSAGES ===
DROP POLICY IF EXISTS "messages_read_own" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_own" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;

CREATE POLICY "messages_read_own" ON public.messages 
    FOR SELECT USING (is_conversation_member(conversation_id));
CREATE POLICY "messages_insert_own" ON public.messages 
    FOR INSERT WITH CHECK (current_user_id() = sender_user_id);
CREATE POLICY "messages_delete_own" ON public.messages 
    FOR DELETE USING (
        sender_user_id = current_user_id() 
        OR is_conversation_member(conversation_id)
    );


-- === CALL LOGS ===
DROP POLICY IF EXISTS "call_logs_read_own" ON public.call_logs;
DROP POLICY IF EXISTS "call_logs_insert_own" ON public.call_logs;
DROP POLICY IF EXISTS "call_logs_update_own" ON public.call_logs;
DROP POLICY IF EXISTS "call_logs_allow_all" ON public.call_logs;

CREATE POLICY "call_logs_read_own" ON public.call_logs 
    FOR SELECT USING (current_user_id() = caller_id OR current_user_id() = recipient_id);
CREATE POLICY "call_logs_insert_own" ON public.call_logs 
    FOR INSERT WITH CHECK (current_user_id() = caller_id);
CREATE POLICY "call_logs_update_own" ON public.call_logs 
    FOR UPDATE USING (current_user_id() = caller_id OR current_user_id() = recipient_id);


-- === USER BLOCKS ===
DROP POLICY IF EXISTS "blocks_read_own" ON public.user_blocks;
DROP POLICY IF EXISTS "blocks_insert_own" ON public.user_blocks;
DROP POLICY IF EXISTS "blocks_delete_own" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks_read_own" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks_read_if_blocked" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks_insert_own" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks_delete_own" ON public.user_blocks;

-- Blocker can see their blocks
CREATE POLICY "user_blocks_read_own" ON public.user_blocks 
    FOR SELECT USING (blocker_id = current_user_id());
-- Blocked user can check if they're blocked (for UX feedback)
CREATE POLICY "user_blocks_read_if_blocked" ON public.user_blocks 
    FOR SELECT USING (blocked_id = current_user_id());
CREATE POLICY "user_blocks_insert_own" ON public.user_blocks 
    FOR INSERT WITH CHECK (blocker_id = current_user_id());
CREATE POLICY "user_blocks_delete_own" ON public.user_blocks 
    FOR DELETE USING (blocker_id = current_user_id());


-- === MESSAGE DELETIONS ===
DROP POLICY IF EXISTS "deletions_read_own" ON public.message_deletions;
DROP POLICY IF EXISTS "deletions_insert_own" ON public.message_deletions;
DROP POLICY IF EXISTS "deletions_update_own" ON public.message_deletions;
DROP POLICY IF EXISTS "deletions_delete_own" ON public.message_deletions;

CREATE POLICY "deletions_read_own" ON public.message_deletions 
    FOR SELECT USING (user_id = current_user_id());
CREATE POLICY "deletions_insert_own" ON public.message_deletions 
    FOR INSERT WITH CHECK (user_id = current_user_id());
CREATE POLICY "deletions_update_own" ON public.message_deletions 
    FOR UPDATE USING (user_id = current_user_id());
CREATE POLICY "deletions_delete_own" ON public.message_deletions 
    FOR DELETE USING (user_id = current_user_id());


-- ============================================================================
-- SECTION 6: STORAGE CONFIGURATION
-- ============================================================================

-- Create attachments bucket (private)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', false) 
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
DROP POLICY IF EXISTS "storage_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_read_all_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own files" ON storage.objects;

-- Upload: Users can only upload to their own folder (user_id/filename)
CREATE POLICY "storage_upload_own" ON storage.objects 
    FOR INSERT TO authenticated 
    WITH CHECK (
        bucket_id = 'attachments' AND
        (storage.foldername(name))[1] = current_user_id()
    );

-- Read: All authenticated users can read (files are encrypted anyway)
CREATE POLICY "storage_read_all_auth" ON storage.objects 
    FOR SELECT TO authenticated 
    USING (bucket_id = 'attachments');

-- Delete: Users can only delete their own files
CREATE POLICY "storage_delete_own" ON storage.objects 
    FOR DELETE TO authenticated 
    USING (
        bucket_id = 'attachments' AND
        (storage.foldername(name))[1] = current_user_id()
    );


-- ============================================================================
-- SECTION 7: REALTIME CONFIGURATION
-- ============================================================================

-- Enable Realtime for live chat and call notifications
-- Note: Use IF NOT EXISTS pattern to avoid errors on re-run

DO $$
BEGIN
    -- Messages (live chat)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    -- Call Logs (call notifications)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'call_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
    END IF;

    -- Conversation Participants (new chat notifications)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
    END IF;
END $$;


-- ============================================================================
-- SCHEMA COMPLETE 🚀
-- ============================================================================
-- 
-- Tables: profiles, devices, conversations, conversation_participants, 
--         messages, call_logs, user_blocks, message_deletions
-- Functions: current_user_id, is_conversation_member, get_or_create_dm,
--            get_unread_count, mark_conversation_read, debug helpers
-- Storage: attachments bucket with RLS
-- Realtime: messages, call_logs, conversation_participants
--
-- ============================================================================
