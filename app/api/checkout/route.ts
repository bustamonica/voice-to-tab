import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Stub for Phase 3. Will create a Stripe Checkout session for the requested
// plan ('monthly' | 'yearly') and return its URL for the client to redirect
// to. Today it just returns 501 so the client can show a helpful "coming
// soon" state.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const plan = body?.plan === 'yearly' ? 'yearly' : 'monthly';
  return NextResponse.json(
    {
      error: 'not_implemented',
      message:
        'Stripe checkout will be wired in Phase 3. Plan requested: ' + plan,
    },
    { status: 501 },
  );
}
