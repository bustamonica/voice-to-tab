-- Run this in the Supabase SQL editor once, after creating the project.
-- It creates the single table this app needs and a couple of helper indexes.

create table if not exists subscriptions (
  user_id text primary key,                       -- Clerk user ID (clerk_user_xxx)
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'incomplete',      -- active | canceled | past_due | ...
  plan text,                                      -- 'monthly' | 'yearly'
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists subscriptions_stripe_sub_id_idx
  on subscriptions (stripe_subscription_id);

create index if not exists subscriptions_stripe_customer_id_idx
  on subscriptions (stripe_customer_id);

-- The webhook writes via the service role key, which bypasses RLS. We still
-- enable RLS as defense-in-depth so accidentally exposing the anon key to the
-- client can't leak everyone's subscription state.
alter table subscriptions enable row level security;

-- Optional: a policy that lets a user read their own row from the client side
-- using a JWT containing { sub: <clerk_user_id> }. Phase 2 doesn't rely on
-- client-side reads, but this is here for future use.
-- create policy "subscriptions: read own" on subscriptions
--   for select using (auth.jwt() ->> 'sub' = user_id);
