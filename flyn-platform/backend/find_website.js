const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function findWebsite() {
  try {
    const targetWebsiteId = 'bdfcaebb-20da-4338-85d2-ff6971e7a31c';
    
    console.log(`Searching for website: ${targetWebsiteId}\n`);
    
    // Check public_websites collection
    console.log('Checking public_websites...');
    const publicSnap = await db.collection('public_websites').doc(targetWebsiteId).get();
    if (publicSnap.exists) {
      const data = publicSnap.data();
      console.log('Found in public_websites!');
      console.log(`  Name: ${data.name}`);
      console.log(`  Has HTML: ${!!data.html}`);
      console.log(`  HTML length: ${data.html ? data.html.length : 0}`);
      return;
    }
    
    // Search in all tenants' websites
    console.log('\nChecking tenants\' websites...');
    const tenantsSnap = await db.collection('tenants').get();
    for (const tenantDoc of tenantsSnap.docs) {
      const websiteSnap = await tenantDoc.ref.collection('websites').doc(targetWebsiteId).get();
      if (websiteSnap.exists) {
        console.log(`Found in tenant ${tenantDoc.id}!`);
        const data = websiteSnap.data();
        console.log(`  Name: ${data.name}`);
        console.log(`  Has HTML: ${!!data.html}`);
        return;
      }
    }
    
    console.log('Website not found anywhere!');
    
    // List some websites that do exist
    console.log('\n=== Looking for Phoenicx ===');
    const allPublic = await db.collection('public_websites').limit(20).get();
    console.log(`\nPublic websites (showing first ${Math.min(20, allPublic.docs.length)}):`);
    allPublic.docs.forEach(doc => {
      console.log(`  ${doc.data().name || 'Unnamed'} (${doc.id})`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

findWebsite();
