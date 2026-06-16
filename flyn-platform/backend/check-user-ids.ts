import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function checkIds() {
  const email = 'prismbuildings@gmail.com';
  const user = await admin.auth().getUserByEmail(email);
  
  console.log(`\n👤 User: ${email}`);
  console.log(`🆔 Firebase Auth UID: ${user.uid}\n`);
  
  // Check custom claims
  console.log(`📋 Custom Claims:`, user.customClaims);
  
  // Check all collections for this user
  const tenants = await db.collection('tenants').get();
  console.log(`\n🏢 Checking tenants collection:`);
  
  tenants.forEach(doc => {
    const data = doc.data();
    if (data.ownerEmail === email || data.primaryEmail === email || data.createdBy === user.uid) {
      console.log(`   ✅ FOUND: ${doc.id}`);
      console.log(`      ownerEmail: ${data.ownerEmail}`);
      console.log(`      primaryEmail: ${data.primaryEmail}`);
      console.log(`      createdBy: ${data.createdBy}`);
      console.log(`      customFields: `, data);
    }
  });
  
  // Check wallets
  const wallets = await db.collection('wallet').get();
  console.log(`\n💰 Wallets available:`);
  wallets.forEach(doc => console.log(`   - ${doc.id}: ${doc.data().balance} credits`));
  
  console.log(`\n⚠️  IMPORTANT: Backend looks for: organization_id (custom claim) OR uid`);
  console.log(`    Current UID: ${user.uid}`);
  console.log(`    Has organization_id claim? ${user.customClaims?.organization_id ? 'YES: ' + user.customClaims.organization_id : 'NO'}`);
  
  await admin.app().delete();
  process.exit(0);
}

checkIds().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
