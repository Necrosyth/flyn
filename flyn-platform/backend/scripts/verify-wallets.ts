#!/usr/bin/env node
/**
 * Script to verify and initialize wallet documents for test accounts.
 * Usage: npx ts-node backend/scripts/verify-wallets.ts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json';
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Service account file not found at ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

interface WalletDoc {
  tenantId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  updatedAt: string;
}

const TEST_ACCOUNTS = [
  {
    email: 'prismbuildings@gmail.com',
    organizationId: 'SYeaCY37tGO6svplSBPbk4WfT7o1',
    expectedBalance: 100,
  },
  {
    email: 'rsvltadom@yahoo.com',
    organizationId: 'RdrvTbrAVzcgDWoJp6tvfYgqV303',
    expectedBalance: 100,
  },
];

async function verifyAndCreateWallets() {
  console.log('🔍 Verifying wallet documents for test accounts...\n');

  for (const account of TEST_ACCOUNTS) {
    console.log(`📧 ${account.email}`);
    console.log(`   Organization ID: ${account.organizationId}`);

    try {
      const walletRef = db.collection('wallet').doc(account.organizationId);
      const walletSnap = await walletRef.get();

      if (walletSnap.exists) {
        const walletData = walletSnap.data() as WalletDoc;
        console.log(`   ✅ Wallet exists`);
        console.log(`      Balance: ${walletData.balance} credits`);
        console.log(`      Total Purchased: ${walletData.totalPurchased}`);
        console.log(`      Total Used: ${walletData.totalUsed}`);

        // Check if balance is correct
        if (walletData.balance === account.expectedBalance) {
          console.log(`   ✅ Balance is correct (${account.expectedBalance} credits)`);
        } else {
          console.log(`   ⚠️  Balance mismatch. Expected ${account.expectedBalance}, got ${walletData.balance}`);
          console.log(`      Would you like to update to ${account.expectedBalance}? (Manual step required)`);
        }
      } else {
        console.log(`   ❌ Wallet does NOT exist`);
        console.log(`      Creating wallet with ${account.expectedBalance} credits...`);

        const newWallet: WalletDoc = {
          tenantId: account.organizationId,
          balance: account.expectedBalance,
          totalPurchased: account.expectedBalance,
          totalUsed: 0,
          updatedAt: new Date().toISOString(),
        };

        await walletRef.set(newWallet);
        console.log(`   ✅ Wallet created successfully`);
      }
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.message}`);
    }

    console.log();
  }

  console.log('✨ Wallet verification complete!');
  console.log('\nNext steps:');
  console.log('1. Try logging in with prismbuildings@gmail.com');
  console.log('2. Check if the wallet balance (100 credits) appears in the top nav');
  console.log('3. Try generating a website to verify credits are deducted');

  await admin.app().delete();
}

verifyAndCreateWallets().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
