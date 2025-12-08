import { useMemo } from 'react';
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";

// We keep the shape compatible-ish with what we had, 
// but we might need to adjust types if strictness bites us.
export const useAuth = () => {
    const { user, isLoaded } = useUser();
    const { sessionId } = useClerkAuth();

    const authUser = useMemo(() => {
        return user ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress
        } : null;
    }, [user]);

    return {
        // Map Clerk user to a shape that looks enough like Supabase User for our app
        user: authUser,
        session: sessionId ? { access_token: sessionId } : null, // Mock session
        loading: !isLoaded,
    };
};

// Deprecated: AuthProvider is no longer needed as we use ClerkProvider
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
};
