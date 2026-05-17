import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

// Stripe sends webhooks as raw bytes; we need to verify the signature against
// the raw body, so we read it as text rather than letting Next.js parse JSON.
export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error('[webhook] invalid signature:', err.message);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err: any) {
    console.error('[webhook] handler error:', err);
    return NextResponse.json({ error: 'handler_error', message: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId =
        (session.client_reference_id as string | null) ||
        (session.metadata?.clerk_user_id as string | undefined);
      const subscriptionId = session.subscription as string | null;
      const customerId = session.customer as string | null;
      const plan = (session.metadata?.plan as 'monthly' | 'yearly' | undefined) || null;

      if (!clerkUserId) {
        console.warn('[webhook] checkout.session.completed without clerk_user_id');
        return;
      }
      await upsertSubscription({
        userId: clerkUserId,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        status: 'active',
        plan,
        currentPeriodEnd: null,
      });
      await setClerkPremium(clerkUserId, true);
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const clerkUserId = (sub.metadata?.clerk_user_id as string | undefined) || null;
      if (!clerkUserId) {
        console.warn('[webhook] subscription event without clerk_user_id metadata');
        return;
      }
      const status = sub.status; // 'active' | 'canceled' | 'past_due' | ...
      const plan = (sub.metadata?.plan as 'monthly' | 'yearly' | undefined) || null;
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      await upsertSubscription({
        userId: clerkUserId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: (sub.customer as string) || null,
        status,
        plan,
        currentPeriodEnd: periodEnd,
      });
      await setClerkPremium(clerkUserId, status === 'active' || status === 'trialing');
      return;
    }

    default:
      // Ignore the rest — Stripe sends many events we don't act on.
      return;
  }
}

type UpsertParams = {
  userId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: string;
  plan: 'monthly' | 'yearly' | null;
  currentPeriodEnd: string | null;
};

async function upsertSubscription(p: UpsertParams) {
  const db = supabaseAdmin();
  const { error } = await db.from('subscriptions').upsert(
    {
      user_id: p.userId,
      stripe_subscription_id: p.stripeSubscriptionId,
      stripe_customer_id: p.stripeCustomerId,
      status: p.status,
      plan: p.plan,
      current_period_end: p.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

async function setClerkPremium(userId: string, premium: boolean) {
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { premium },
  });
}
