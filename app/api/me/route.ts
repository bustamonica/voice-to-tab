import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

// Returns the current user's subscription status. We read from Clerk's
// publicMetadata.premium first (cheap, in-process), but also fall back to a
// Supabase lookup in case the webhook updated the DB before the Clerk
// metadata sync (or if metadata was wiped). When Clerk env vars aren't set
// at all, we degrade to "guest, non-premium" so the app boots without auth.
export async function GET() {
  const freeSeconds = Number(process.env.NEXT_PUBLIC_FREE_RECORDING_SECONDS ?? '10');

  if (!clerkEnabled) {
    return NextResponse.json({
      signedIn: false,
      premium: false,
      freeRecordingSeconds: freeSeconds,
      authConfigured: false,
    });
  }

  // Imported lazily so that the app doesn't try to load Clerk's runtime
  // checks (and fail) when auth isn't configured.
  const { auth, currentUser } = await import('@clerk/nextjs/server');

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({
      signedIn: false,
      premium: false,
      freeRecordingSeconds: freeSeconds,
      authConfigured: true,
    });
  }

  const user = await currentUser();
  let premium = Boolean(user?.publicMetadata?.premium);

  if (!premium && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const db = supabaseAdmin();
      const { data } = await db
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      if (data && (data.status === 'active' || data.status === 'trialing')) {
        premium = true;
      }
    } catch (err) {
      console.warn('[api/me] supabase check failed:', err);
    }
  }

  return NextResponse.json({
    signedIn: true,
    premium,
    freeRecordingSeconds: freeSeconds,
    userId,
    authConfigured: true,
  });
}
