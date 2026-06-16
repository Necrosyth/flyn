import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function findUser() {
  const email = 'prismbuildings@gmail.com';
  
  console.log(`\n🔍 Searching for user: ${email}\n`);
  
  // Check Firebase Auth
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log(`✅ Found in Firebase Auth:`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email}`);
  } catch (err: any) {
    console.log(`❌ Not in Firebase Auth: ${err.message}`);
  }
  
  // Check all documents in collections
  const collections = ['users', 'tenants', 'subscriptions'];
  for (const collName of collections) {
    const snapshot = await db.collection(collName).get();
    console.log(`\n📁 Checking ${collName} (${snapshot.size} docs)`);
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.email === email || data.userEmail === email) {
        console.log(`   ✅ FOUND in ${collName}/${doc.id}:`, {email: data.email, tenantId: data.tenantId, organizationId: data.organizationId});
      }
    });
  }
  
  // Check wallets
  const wallets = await db.collection('wallet').get();
  console.log(`\n💰 Checking wallet collection (${wallets.size} docs)`);
  wallets.forEach(doc => console.log(`   - ${doc.id}: ${doc.data().balance} credits`));
  
  await admin.app().delete();
  process.exit(0);
}

findUser().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
