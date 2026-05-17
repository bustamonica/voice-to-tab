import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

// Returns the current user's subscription status. We read from Clerk's
// publicMetadata.premium first (cheap, in-process), but also fall back to a
// Supabase lookup in case the webhook updated the DB before the Clerk
// metadata sync (or if metadata was wiped).
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
  let premium = Boolean(user?.publicMetadata?.premium);

  // If Clerk says no, double-check Supabase. Supabase is the source of truth;
  // Clerk metadata is a cache the webhook tries to keep in sync.
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
  });
}
