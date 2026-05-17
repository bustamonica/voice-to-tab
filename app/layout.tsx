import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voice to Guitar Tab',
  description:
    "Hum a melody. On stop, Spotify's Basic Pitch neural net transcribes it into a guitar tab.",
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  // When Clerk env vars aren't configured, render without the provider so
  // the rest of the app still boots (just without auth).
  return clerkEnabled ? <ClerkProvider>{body}</ClerkProvider> : body;
}
