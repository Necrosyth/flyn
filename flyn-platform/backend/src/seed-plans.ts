import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PlansService } from './billing/plans/plans.service';
import { CreatePlanDto } from './billing/plans/plans.types';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const plansService = app.get(PlansService);

  const plans: (CreatePlanDto & { id: string })[] = [
    // FREE
    {
      id: 'FREE',
      name: 'Free',
      description: 'Explore the platform in sandbox mode',
      interval: 'monthly',
      features: ['Up to 100 messages/month', '1 team member', 'Basic inbox', 'Email support'],
      pricing: [{ region: 'us' as any, amount: 0, currency: 'usd' }],
      gatewayPlanIds: {}
    },
    // STARTER
    {
      id: 'STARTER_MONTH',
      name: 'Starter',
      description: 'Go live with your first conversations',
      interval: 'monthly',
      features: ['Up to 1,000 messages/month', '2 team members', 'Standard channels', 'Basic AI tools'],
      pricing: [{ region: 'us' as any, amount: 3900, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeICRoEyrOM4ERojoOsvFY' }
    },
    {
      id: 'STARTER_YEAR',
      name: 'Starter',
      description: 'Go live with your first conversations',
      interval: 'yearly',
      features: ['Up to 1,000 messages/month', '2 team members', 'Standard channels', 'Basic AI tools'],
      pricing: [{ region: 'us' as any, amount: 37400, currency: 'usd' }], // ~20% discount
      gatewayPlanIds: { stripe: 'price_1TBeICRoEyrOM4ERojoOsvFY_YEAR' } // Replace with real yearly ID if exists
    },
    // GROWTH
    {
      id: 'GROWTH_MONTH',
      name: 'Growth',
      description: 'Scale operations with automation & AI',
      interval: 'monthly',
      features: ['Up to 5,000 messages/month', '5 team members', 'All channels', 'AI Agents', 'Automation builder'],
      pricing: [{ region: 'us' as any, amount: 8900, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeJ1RoEyrOM4ERnxj9t2pz' }
    },
    {
      id: 'GROWTH_YEAR',
      name: 'Growth',
      description: 'Scale operations with automation & AI',
      interval: 'yearly',
      features: ['Up to 5,000 messages/month', '5 team members', 'All channels', 'AI Agents', 'Automation builder'],
      pricing: [{ region: 'us' as any, amount: 85400, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeJ1RoEyrOM4ERnxj9t2pz_YEAR' }
    },
    // PRO
    {
      id: 'PRO_MONTH',
      name: 'Pro',
      description: 'Full control with advanced features',
      interval: 'monthly',
      features: ['Up to 20,000 messages/month', 'Unlimited team members', 'Custom Branding', 'Advanced Analytics', 'Priority support'],
      pricing: [{ region: 'us' as any, amount: 16900, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeKIRoEyrOM4ERj2KtNJoO' }
    },
    {
      id: 'PRO_YEAR',
      name: 'Pro',
      description: 'Full control with advanced features',
      interval: 'yearly',
      features: ['Up to 20,000 messages/month', 'Unlimited team members', 'Custom Branding', 'Advanced Analytics', 'Priority support'],
      pricing: [{ region: 'us' as any, amount: 162200, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeKIRoEyrOM4ERj2KtNJoO_YEAR' }
    },
    // ENTERPRISE
    {
      id: 'ENTERPRISE_MONTH',
      name: 'Enterprise',
      description: 'Mission-critical deployment at scale',
      interval: 'monthly',
      features: ['Unlimited everything', 'White-labeling', 'SSO/SAML', 'Dedicated infrastructure', 'SLA guarantee'],
      pricing: [{ region: 'us' as any, amount: 0, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeL4RoEyrOM4ERI0P4bGVw' }
    },
    {
      id: 'ENTERPRISE_YEAR',
      name: 'Enterprise',
      description: 'Mission-critical deployment at scale',
      interval: 'yearly',
      features: ['Unlimited everything', 'White-labeling', 'SSO/SAML', 'Dedicated infrastructure', 'SLA guarantee'],
      pricing: [{ region: 'us' as any, amount: 0, currency: 'usd' }],
      gatewayPlanIds: { stripe: 'price_1TBeL4RoEyrOM4ERI0P4bGVw_YEAR' }
    }
  ];

  console.log('Seeding plans...');
  for (const plan of plans) {
    try {
      await plansService.createPlan(plan);
      console.log(`Created plan: ${plan.name}`);
    } catch (err) {
      console.error(`Failed to create plan ${plan.name}:`, err.message);
    }
  }

  await app.close();
}

seed();
