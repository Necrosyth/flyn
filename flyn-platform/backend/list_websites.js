const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function listWebsites() {
  try {
    const tenantsSnap = await db.collection('tenants').get();
    
    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      const tenantName = tenantDoc.data().name || tenantDoc.data().email || tenantId;
      const websitesSnap = await db.collection(`tenants/${tenantId}/websites`).get();
      
      if (websitesSnap.docs.length > 0) {
        console.log(`\nTenant: ${tenantName} (${tenantId})`);
        websitesSnap.docs.forEach(doc => {
          const data = doc.data();
          console.log(`  Website: ${data.name || 'Unnamed'} (${doc.id})`);
          console.log(`    Has HTML: ${!!data.html}`);
          console.log(`    Quality: ${data.quality || 'default'}`);
        });
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

listWebsites();
