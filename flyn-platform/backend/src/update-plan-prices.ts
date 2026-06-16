import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PlansService } from './billing/plans/plans.service';

type PriceUpdate = {
  name: string;
  amountCents: number;
  stripeId: string;
};

const UPDATES: PriceUpdate[] = [
  { name: 'Starter', amountCents: 3000, stripeId: 'price_1TBeICRoEyrOM4ERojoOsvFY' },
  { name: 'Growth', amountCents: 6000, stripeId: 'price_1TBeJ1RoEyrOM4ERnxj9t2pz' },
  { name: 'Pro', amountCents: 9000, stripeId: 'price_1TBeKIRoEyrOM4ERj2KtNJoO' },
  { name: 'Enterprise', amountCents: 12000, stripeId: 'price_1TBeL4RoEyrOM4ERI0P4bGVw' },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const plansService = app.get(PlansService);

  const plans = await plansService.listPlans();

  for (const upd of UPDATES) {
    const plan = plans.find((p) => (p.name || '').toLowerCase() === upd.name.toLowerCase());
    if (!plan) {
      // eslint-disable-next-line no-console
      console.warn(`Plan not found for name=${upd.name}`);
      continue;
    }

    const nextPricing = (plan.pricing || []).map((px) => ({
      ...px,
      amount: upd.amountCents,
    }));

    if (!nextPricing.length) {
      nextPricing.push({ region: 'us' as any, amount: upd.amountCents, currency: 'usd' } as any);
    }

    // Ensure gatewayPlanIds contains stripe mapping
    const nextGatewayIds = {
      ...(plan.gatewayPlanIds || {}),
      stripe: upd.stripeId
    };

    await plansService.updatePlan(plan.id, { 
      pricing: nextPricing,
      gatewayPlanIds: nextGatewayIds
    });
    // eslint-disable-next-line no-console
    console.log(`Updated ${plan.name} (${plan.id}) -> ${upd.amountCents} (Stripe: ${upd.stripeId})`);
  }

  await app.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
