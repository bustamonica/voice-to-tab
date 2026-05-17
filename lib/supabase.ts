import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only admin client using the service role key. NEVER expose this in
// client code. We use it from API routes / webhook handlers to upsert
// subscription rows.
let adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export type SubscriptionRow = {
  user_id: string;           // Clerk user ID
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;            // 'active' | 'canceled' | 'past_due' | ...
  plan: 'monthly' | 'yearly' | null;
  current_period_end: string | null;
  updated_at: string;
};
