import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Don't throw at import time in dev; pages that don't need Stripe still load.
  console.warn('[stripe] STRIPE_SECRET_KEY is not set. /api/checkout will fail.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing', {
  apiVersion: '2024-12-18.acacia',
});

export const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || '',
  yearly: process.env.STRIPE_PRICE_YEARLY || '',
};
