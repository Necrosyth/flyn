/**
 * stripe-bootstrap.mjs
 *
 * One-shot script to wire plan_definitions → Stripe Products + Prices.
 * Idempotent: plans that already have stripeProductId are skipped.
 * Free/enterprise plans (monthly=0 AND yearly=0) are skipped.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY             – live or test Stripe secret key
 *   GOOGLE_APPLICATION_CREDENTIALS – path to Firebase service-account JSON
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx \
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node scripts/stripe-bootstrap.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY env var is required');
  process.exit(1);
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var is required');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
  appInfo: { name: 'FLYN Bootstrap', version: '1.0.0' },
});

async function bootstrap() {
  const snap = await db.collection('plan_definitions').get();

  const plans = snap.docs
    .filter(doc => doc.id !== '_schema_' && doc.id !== '__schema__')
    .map(doc => ({ ref: doc.ref, id: doc.id, ...doc.data() }));

  console.log(`Found ${plans.length} plan(s) to process\n`);

  for (const plan of plans) {
    if (plan.stripeProductId) {
      console.log(`[SKIP]   ${plan.id} — already bootstrapped (product=${plan.stripeProductId})`);
      continue;
    }

    const monthly = plan.pricing?.monthly ?? 0;
    const yearly  = plan.pricing?.yearly  ?? 0;

    if (monthly === 0 && yearly === 0) {
      console.log(`[SKIP]   ${plan.id} — free/custom plan (no paid pricing)`);
      continue;
    }

    try {
      const currency = (plan.pricing?.currency || 'USD').toLowerCase();

      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || plan.name,
        metadata: { planId: plan.id },
      });

      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(monthly * 100),
        currency,
        recurring: { interval: 'month' },
        metadata: { planId: plan.id, interval: 'monthly' },
      });

      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(yearly * 100),
        currency,
        recurring: { interval: 'year' },
        metadata: { planId: plan.id, interval: 'yearly' },
      });

      await plan.ref.update({
        stripeProductId: product.id,
        'pricing.stripeMonthlyPriceId': monthlyPrice.id,
        'pricing.stripeYearlyPriceId': yearlyPrice.id,
        updatedAt: new Date().toISOString(),
      });

      console.log(`[OK]     ${plan.id}`);
      console.log(`         product = ${product.id}`);
      console.log(`         monthly = ${monthlyPrice.id}  ($${monthly}/mo)`);
      console.log(`         yearly  = ${yearlyPrice.id}  ($${yearly}/yr)`);
    } catch (err) {
      console.error(`[ERROR]  ${plan.id}: ${err.message}`);
    }

    console.log();
  }

  console.log('Bootstrap complete.');
}

bootstrap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
