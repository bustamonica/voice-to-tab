import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe, PRICE_IDS } from '@/lib/stripe';

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan: 'monthly' | 'yearly' = body?.plan === 'yearly' ? 'yearly' : 'monthly';
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_not_configured', message: `Set STRIPE_PRICE_${plan.toUpperCase()} in .env.local` },
      { status: 500 },
    );
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const origin = request.headers.get('origin') || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,
      success_url: `${origin}/?subscribed=1`,
      cancel_url: `${origin}/?canceled=1`,
      metadata: { clerk_user_id: userId, plan },
      // Send the same Clerk user id into the subscription so subsequent
      // events (renewal, cancel, etc.) can be traced back without relying on
      // checkout.session metadata.
      subscription_data: { metadata: { clerk_user_id: userId, plan } },
      allow_promotion_codes: true,
    });
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[checkout] stripe error:', err);
    return NextResponse.json({ error: 'stripe_error', message: err.message }, { status: 500 });
  }
}
