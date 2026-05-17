import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';

// Returns the current user's subscription status.
// In Phase 2 this reads from Clerk publicMetadata.premium as a stand-in for a
// real DB. Phase 3 will swap this to read from Supabase (kept in sync with
// Stripe via webhook).
export async function GET() {
  const { userId } = await auth();
  const freeSeconds = Number(process.env.NEXT_PUBLIC_FREE_RECORDING_SECONDS ?? '10');

  if (!userId) {
    return NextResponse.json({
      signedIn: false,
      premium: false,
      freeRecordingSeconds: freeSeconds,
    });
  }

  const user = await currentUser();
  const premium = Boolean(user?.publicMetadata?.premium);

  return NextResponse.json({
    signedIn: true,
    premium,
    freeRecordingSeconds: freeSeconds,
    userId,
  });
}
