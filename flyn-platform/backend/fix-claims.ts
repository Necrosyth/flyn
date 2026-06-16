import * as admin from 'firebase-admin';

const serviceAccount = require('../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'flyn-94396'
});

async function fixClaims() {
  console.log(`\n🔧 Fixing Firebase custom claims\n`);
  
  // Fix prismbuildings@gmail.com
  const user1 = await admin.auth().getUserByEmail('prismbuildings@gmail.com');
  console.log(`📧 ${user1.email}`);
  console.log(`   Old organization_id: ${user1.customClaims?.organization_id}`);
  console.log(`   UID: ${user1.uid}`);
  
  await admin.auth().setCustomUserClaims(user1.uid, {
    ...user1.customClaims,
    organization_id: user1.uid // Set organization_id to UID
  });
  console.log(`   ✅ Updated organization_id to: ${user1.uid}\n`);
  
  // Fix rsvltadom@yahoo.com
  const user2 = await admin.auth().getUserByEmail('rsvltadom@yahoo.com');
  console.log(`📧 ${user2.email}`);
  console.log(`   Old organization_id: ${user2.customClaims?.organization_id}`);
  console.log(`   UID: ${user2.uid}`);
  
  await admin.auth().setCustomUserClaims(user2.uid, {
    ...user2.customClaims,
    organization_id: user2.uid // Set organization_id to UID
  });
  console.log(`   ✅ Updated organization_id to: ${user2.uid}\n`);
  
  console.log(`🎉 Custom claims fixed! Users must refresh to get new token.\n`);
  
  await admin.app().delete();
  process.exit(0);
}

fixClaims().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
