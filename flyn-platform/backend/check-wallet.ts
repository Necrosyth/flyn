import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function checkWallet() {
  const email = 'prismbuildings@gmail.com';
  
  // Find user by email
  const userSnapshot = await db.collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();
  
  if (userSnapshot.empty) {
    console.log('❌ User not found');
    process.exit(1);
  }
  
  const userData = userSnapshot.docs[0].data();
  console.log(`\n📧 User: ${email}`);
  console.log(`🆔 User UID: ${userData.uid || 'N/A'}`);
  console.log(`🏢 Organization ID: ${userData.organizationId || 'N/A'}`);
  console.log(`🏢 Tenant ID: ${userData.tenantId || 'N/A'}`);
  
  const tenantId = userData.tenantId || userData.organizationId || userSnapshot.docs[0].id;
  
  // Check all wallet documents
  const walletsSnapshot = await db.collection('wallet').get();
  console.log(`\n💰 All wallet documents:`);
  walletsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`  - ${doc.id}: ${data.balance || 0} credits`);
  });
  
  // Check the specific wallet for this user
  const walletDoc = await db.collection('wallet').doc(tenantId).get();
  console.log(`\n🔍 Wallet for tenant "${tenantId}":`);
  if (walletDoc.exists) {
    console.log(`  ✅ Found: ${walletDoc.data().balance || 0} credits`);
  } else {
    console.log(`  ❌ Not found`);
  }
  
  await admin.app().delete();
  process.exit(0);
}

checkWallet().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
