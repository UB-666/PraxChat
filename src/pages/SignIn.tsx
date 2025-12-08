import { SignIn } from "@clerk/clerk-react";

export default function SignInPage() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
            <SignIn
                appearance={{
                    elements: {
                        rootBox: "mx-auto",
                        card: "bg-zinc-900 border border-zinc-800 text-zinc-100",
                        headerTitle: "text-zinc-100",
                        headerSubtitle: "text-zinc-400",
                        socialButtonsBlockButton: "bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700",
                        formFieldLabel: "text-zinc-300",
                        formFieldInput: "bg-zinc-950 border-zinc-800 text-zinc-100",
                        footerActionLink: "text-indigo-400 hover:text-indigo-300",
                        identityPreviewText: "text-zinc-300",
                        formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white",
                    }
                }}
                signUpUrl="/sign-up"
            />
        </div>
    );
}
