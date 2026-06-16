import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function addCreditsToTenants() {
  const tenants = [
    { email: 'prismbuildings@gmail.com', tenantId: 'SYeaCY37tGO6svplSBPbk4Wf' },
    { email: 'rsvltadom@yahoo.com', tenantId: 'RdrVTbrAVzcgDWoJp6tvfYg' }
  ];
  
  for (const { email, tenantId } of tenants) {
    try {
      console.log(`\nProcessing ${email} (tenant: ${tenantId})...`);
      
      // Get or create wallet
      const walletRef = db.collection('wallet').doc(tenantId);
      const walletDoc = await walletRef.get();
      
      const now = new Date().toISOString();
      const { v4: uuidv4 } = require('uuid');
      const txnId = uuidv4();
      
      if (!walletDoc.exists) {
        console.log(`Creating new wallet for tenant ${tenantId}`);
        await walletRef.set({
          tenantId,
          balance: 100,
          totalPurchased: 100,
          totalUsed: 0,
          updatedAt: now
        });
      } else {
        const wallet = walletDoc.data();
        const currentBalance = wallet.balance || 0;
        console.log(`Updating wallet balance from ${currentBalance} to ${currentBalance + 100}`);
        await walletRef.update({
          balance: currentBalance + 100,
          totalPurchased: (wallet.totalPurchased || 0) + 100,
          updatedAt: now
        });
      }
      
      // Create transaction record
      await walletRef.collection('transactions').doc(txnId).set({
        id: txnId,
        type: 'topup',
        amount: 100,
        description: 'Admin credit grant',
        feature: 'manual',
        timestamp: now
      });
      
      console.log(`✅ Successfully added 100 credits to ${email}`);
    } catch (error) {
      console.error(`❌ Error processing ${email}:`, error.message);
    }
  }
  
  await admin.app().delete();
  process.exit(0);
}

addCreditsToTenants().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
