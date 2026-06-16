import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function fixWallet() {
  console.log(`\n🔧 Fixing wallets to use correct ORGANIZATION/TENANT IDs\n`);
  
  // Fix prismbuildings@gmail.com
  const user1 = await admin.auth().getUserByEmail('prismbuildings@gmail.com');
  const orgId1 = user1.customClaims?.organization_id;
  
  console.log(`📧 prismbuildings@gmail.com`);
  console.log(`   Organization ID: ${orgId1}`);
  
  if (orgId1) {
    // Delete old wallet if exists
    await db.collection('wallet').doc('SYeaCY37tGO6svplSBPbk4Wf').delete();
    
    // Create wallet under organization ID
    await db.collection('wallet').doc(orgId1).set({
      tenantId: orgId1,
      balance: 100,
      totalPurchased: 100,
      totalUsed: 0,
      updatedAt: new Date().toISOString()
    });
    
    // Create transaction
    const { v4: uuidv4 } = require('uuid');
    await db.collection('wallet').doc(orgId1).collection('transactions').doc(uuidv4()).set({
      id: uuidv4(),
      type: 'topup',
      amount: 100,
      description: 'Admin credit grant',
      feature: 'manual',
      timestamp: new Date().toISOString()
    });
    
    console.log(`   ✅ Wallet created under org ID: ${orgId1} with 100 credits\n`);
  }
  
  // Fix rsvltadom@yahoo.com
  const user2 = await admin.auth().getUserByEmail('rsvltadom@yahoo.com');
  const orgId2 = user2.customClaims?.organization_id;
  
  console.log(`📧 rsvltadom@yahoo.com`);
  console.log(`   Organization ID: ${orgId2}`);
  
  if (orgId2) {
    // Delete old wallet if exists
    await db.collection('wallet').doc('RdrvTbrAVzcgDWoJp6tvfYgqV303').delete();
    
    // Create wallet under organization ID
    await db.collection('wallet').doc(orgId2).set({
      tenantId: orgId2,
      balance: 100,
      totalPurchased: 100,
      totalUsed: 0,
      updatedAt: new Date().toISOString()
    });
    
    // Create transaction
    const { v4: uuidv4 } = require('uuid');
    await db.collection('wallet').doc(orgId2).collection('transactions').doc(uuidv4()).set({
      id: uuidv4(),
      type: 'topup',
      amount: 100,
      description: 'Admin credit grant',
      feature: 'manual',
      timestamp: new Date().toISOString()
    });
    
    console.log(`   ✅ Wallet created under org ID: ${orgId2} with 100 credits\n`);
  }
  
  // Verify all wallets
  const wallets = await db.collection('wallet').get();
  console.log(`💰 All wallets:`);
  wallets.forEach(doc => console.log(`   - ${doc.id}: ${doc.data().balance} credits`));
  
  console.log(`\n🎉 Wallets fixed at organization level!\n`);
  
  await admin.app().delete();
  process.exit(0);
}

fixWallet().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
