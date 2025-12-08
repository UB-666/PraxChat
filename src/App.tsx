/**
 * App.tsx
 * 
 * Main application router and authentication wrapper.
 * 
 * ARCHITECTURE:
 * - Clerk handles user authentication (SignedIn/SignedOut).
 * - SupabaseAuthProvider synchronizes Clerk auth with Supabase.
 * - ClerkSync runs first to authenticate the Supabase client.
 * - RegisterDevice and ChatLayout wait for auth before accessing Supabase.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { SupabaseAuthProvider } from './contexts/SupabaseAuthContext';
import { ToastProvider } from './components/Toast';
import SignInPage from './pages/SignIn';
import SignUpPage from './pages/SignUp';
import RegisterDevice from './pages/RegisterDevice';
import ChatLayout from './components/ChatLayout';
import ClerkSync from './components/ClerkSync';

/**
 * Protected Route Wrapper
 * Ensures ClerkSync runs before any protected content.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>
        <ClerkSync />
        {children}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SupabaseAuthProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />

            {/* Protected Routes */}
            <Route
              path="/register-device"
              element={
                <ProtectedRoute>
                  <RegisterDevice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ChatLayout />
                </ProtectedRoute>
              }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SupabaseAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
