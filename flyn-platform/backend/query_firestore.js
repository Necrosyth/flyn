const admin = require('firebase-admin');

// Initialize with application default credentials (gcloud auth)
admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function findWebsites() {
  try {
    console.log('=== Checking custom_hostnames ===');
    const hostnames = await db.collection('custom_hostnames').get();
    console.log(`\nCustom Hostnames (${hostnames.docs.length} total):`);
    hostnames.docs.forEach(doc => {
      console.log(`  ${doc.id}: ${JSON.stringify(doc.data())}`);
    });
    
    if (hostnames.empty) {
      console.log('\n=== Searching for Phoenicx website ===');
      
      // Try to find any website with Phoenicx in the name
      const allDocs = await db.collectionGroup('websites').limit(20).get();
      console.log(`Found ${allDocs.docs.length} websites:`);
      allDocs.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\n  ID: ${doc.id}`);
        console.log(`  Path: ${doc.ref.path}`);
        console.log(`  Name: ${data.name || 'Unknown'}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

findWebsites();
