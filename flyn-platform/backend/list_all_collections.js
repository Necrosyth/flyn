const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function listCollections() {
  try {
    // List root collections
    const collections = await db.listCollections();
    console.log('Root collections:');
    collections.forEach(col => {
      console.log(`  - ${col.id}`);
    });
    
    // Check the structure of a few key collections
    console.log('\n=== Checking custom_hostnames ===');
    const hostnames = await db.collection('custom_hostnames').get();
    if (hostnames.docs.length > 0) {
      const firstHostname = hostnames.docs[0].data();
      console.log('Sample custom_hostname:', {
        hostname: firstHostname.hostname,
        websiteId: firstHostname.websiteId,
        tenantId: firstHostname.tenantId
      });
    }
    
    // Try to find the tenant that owns the website
    console.log('\n=== Looking for tenant with website ===');
    const targetWebsiteId = 'bdfcaebb-20da-4338-85d2-ff6971e7a31c';
    const tenantsSnap = await db.collection('tenants').get();
    console.log(`Checking ${tenantsSnap.docs.length} tenants...`);
    
    for (const tenantDoc of tenantsSnap.docs) {
      const subCollections = await tenantDoc.ref.listCollections();
      const hasWebsites = subCollections.some(c => c.id === 'websites');
      if (hasWebsites) {
        console.log(`Tenant ${tenantDoc.id} has 'websites' subcollection`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

listCollections();
