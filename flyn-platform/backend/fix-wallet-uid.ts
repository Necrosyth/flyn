import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function fixWallet() {
  const email = 'prismbuildings@gmail.com';
  const user = await admin.auth().getUserByEmail(email);
  const correctUid = user.uid; // SYeaCY37tGO6svplSBPbk4WfT7o1
  const wrongId = 'SYeaCY37tGO6svplSBPbk4Wf';
  
  console.log(`\n🔧 Fixing wallet UID\n`);
  console.log(`   Wrong ID: ${wrongId}`);
  console.log(`   Correct UID: ${correctUid}\n`);
  
  // Get the wallet with wrong ID
  const wrongWallet = await db.collection('wallet').doc(wrongId).get();
  if (!wrongWallet.exists) {
    console.log(`❌ Wrong wallet not found`);
    process.exit(1);
  }
  
  const walletData = wrongWallet.data();
  console.log(`📋 Wallet data to migrate: ${walletData.balance} credits`);
  
  // Create wallet with correct UID
  await db.collection('wallet').doc(correctUid).set({
    ...walletData,
    tenantId: correctUid,
    updatedAt: new Date().toISOString()
  });
  console.log(`✅ Created wallet under correct UID`);
  
  // Migrate transactions
  const transactions = await db.collection('wallet').doc(wrongId).collection('transactions').get();
  console.log(`\n📋 Migrating ${transactions.size} transactions...`);
  
  for (const txn of transactions.docs) {
    await db.collection('wallet').doc(correctUid).collection('transactions').doc(txn.id).set(txn.data());
  }
  console.log(`✅ Migrated transactions`);
  
  // Delete old wallet
  await db.collection('wallet').doc(wrongId).delete();
  console.log(`✅ Deleted old wallet\n`);
  
  // Verify
  const newWallet = await db.collection('wallet').doc(correctUid).get();
  console.log(`🎉 Wallet fixed: ${newWallet.data().balance} credits under UID ${correctUid}`);
  
  await admin.app().delete();
  process.exit(0);
}

fixWallet().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
