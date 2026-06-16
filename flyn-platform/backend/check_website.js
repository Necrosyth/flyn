const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function checkWebsite() {
  try {
    const websiteId = 'bdfcaebb-20da-4338-85d2-ff6971e7a31c';
    
    // Find which tenant owns this website by searching in all tenants
    const tenantsSnap = await db.collection('tenants').get();
    console.log(`Checking ${tenantsSnap.docs.length} tenants for website ${websiteId}...\n`);
    
    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      const websiteSnap = await db.collection(`tenants/${tenantId}/websites`).doc(websiteId).get();
      
      if (websiteSnap.exists) {
        const website = websiteSnap.data();
        console.log(`Found website in tenant: ${tenantId}`);
        console.log(`Website name: ${website.name || 'Unknown'}`);
        console.log(`Has HTML: ${!!website.html}`);
        console.log(`HTML length: ${website.html ? website.html.length : 0} bytes`);
        console.log(`Website data keys:`, Object.keys(website).slice(0, 10));
        return;
      }
    }
    
    console.log('Website not found in any tenant!');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

checkWebsite();
