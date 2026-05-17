import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';

// Returns the active subscription row for the current user so the client can
// display "Premium — renews on YYYY-MM-DD" and similar context. Falls back
// to null if there's nothing.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(data ?? null);
  } catch (err) {
    console.warn('[api/subscription] supabase lookup failed:', err);
    return NextResponse.json(null);
  }
}
