import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

// Creates a Stripe Customer Portal session so an existing subscriber can
// update their payment method / change plan / cancel. Returns the portal URL
// for the client to redirect to.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let customerId: string | null = null;
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();
    customerId = data?.stripe_customer_id ?? null;
  } catch (err) {
    console.error('[portal] supabase lookup failed:', err);
  }

  if (!customerId) {
    return NextResponse.json(
      { error: 'no_subscription', message: 'No active subscription found for this user.' },
      { status: 404 },
    );
  }

  const origin = request.headers.get('origin') || 'http://localhost:3000';
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin,
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[portal] stripe error:', err);
    return NextResponse.json({ error: 'stripe_error', message: err.message }, { status: 500 });
  }
}
