/**
 * fix-feature-keys.ts
 *
 * One-time migration: add canonical feature keys that withPlanGate pages use
 * but are missing from Firestore plan_definitions docs.
 *
 * Mismatches found:
 *   ai.agent.builder  → Firestore has ai.agent.deploy  (same feature, wrong key)
 *   telephony.ui      → Missing from Firestore entirely
 *   branding.custom_domain → Missing from Firestore entirely
 *   ai.social         → Missing from Firestore entirely
 *
 * Strategy: ADD missing keys without removing existing ones (backwards-compatible).
 * Also patches the _schema_ doc so the pricing table shows these rows.
 *
 * Run:  npx ts-node src/fix-feature-keys.ts
 */

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ─── Keys to add per plan ─────────────────────────────────────────────────────

const KEYS_TO_ADD: Record<string, {
  category: string;
  values: Record<string, boolean>;
  label: string;
  order: number;
}> = {
  'ai.agent.builder': {
    category: 'communication',
    label: 'ChatBot / AI Agent Builder',
    order: 1,
    values: { starter: false, growth: true, professional: true, enterprise: true },
  },
  'ai.social': {
    category: 'communication',
    label: 'AI Social Media Agent',
    order: 3,
    values: { starter: false, growth: false, professional: true, enterprise: true },
  },
  'telephony.ui': {
    category: 'automation',
    label: 'Telephony / IVR',
    order: 2,
    values: { starter: false, growth: false, professional: true, enterprise: true },
  },
  'branding.custom_domain': {
    category: 'platform',
    label: 'Custom Domain',
    order: 4,
    values: { starter: false, growth: false, professional: false, enterprise: true },
  },
};

const PLAN_IDS = ['starter', 'growth', 'professional', 'enterprise'];

async function main() {
  // ── Init Firebase ───────────────────────────────────────────────────────────
  const b64  = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  let serviceAccount: admin.ServiceAccount;
  if (b64) {
    serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as admin.ServiceAccount;
  } else if (path) {
    serviceAccount = JSON.parse(readFileSync(path, 'utf-8')) as admin.ServiceAccount;
  } else {
    throw new Error('Set FIREBASE_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_PATH');
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  const PLANS = db.collection('plan_definitions');

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  fix-feature-keys.ts — Canonical key migration');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Patch each plan doc ─────────────────────────────────────────────────────
  for (const planId of PLAN_IDS) {
    const doc = await PLANS.doc(planId).get();
    if (!doc.exists) {
      console.warn(`  ⚠️  Plan '${planId}' not found — skipping`);
      continue;
    }

    const data = doc.data() as any;
    const updates: Record<string, boolean> = {};
    const added: string[] = [];

    for (const [featureKey, meta] of Object.entries(KEYS_TO_ADD)) {
      const category = meta.category;
      const currentCategoryData = data?.features?.[category] ?? {};
      const alreadySet = featureKey in currentCategoryData;

      if (!alreadySet) {
        const firestorePath = `features.${category}.${featureKey}`;
        updates[firestorePath] = meta.values[planId];
        added.push(`  + features.${category}.${featureKey} = ${meta.values[planId]}`);
      } else {
        console.log(`  ✓  [${planId}] features.${category}.${featureKey} already set (${currentCategoryData[featureKey]})`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await PLANS.doc(planId).update(updates);
      console.log(`\n  ✅  [${planId}] Added ${Object.keys(updates).length} key(s):`);
      added.forEach(l => console.log(l));
    } else {
      console.log(`  ✓  [${planId}] All canonical keys already present`);
    }
  }

  // ── Patch the _schema_ doc ──────────────────────────────────────────────────
  console.log('\n── Updating _schema_ ─────────────────────────────────────');

  const schemaDoc = await PLANS.doc('_schema_').get();
  if (!schemaDoc.exists) {
    console.warn('  ⚠️  _schema_ doc not found — skipping schema patch');
  } else {
    const schema = schemaDoc.data() as any;
    const categories: any[] = schema.categories ?? [];
    let schemaChanged = false;

    for (const [featureKey, meta] of Object.entries(KEYS_TO_ADD)) {
      const cat = categories.find((c: any) => c.key === meta.category);
      if (!cat) {
        console.warn(`  ⚠️  Category '${meta.category}' not found in schema`);
        continue;
      }
      const alreadyInSchema = (cat.features ?? []).some((f: any) => f.key === featureKey);
      if (!alreadyInSchema) {
        cat.features = cat.features ?? [];
        cat.features.push({ key: featureKey, label: meta.label, order: meta.order, type: 'boolean' });
        // Re-sort by order
        cat.features.sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99));
        console.log(`  + schema: added ${featureKey} to category '${meta.category}'`);
        schemaChanged = true;
      } else {
        console.log(`  ✓  schema: ${featureKey} already in '${meta.category}'`);
      }
    }

    if (schemaChanged) {
      await PLANS.doc('_schema_').update({ categories, updatedAt: new Date().toISOString() });
      console.log('  ✅  _schema_ updated');
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Done. Restart your backend to clear any in-memory cache.');
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
