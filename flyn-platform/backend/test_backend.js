const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'flyn-94396'
});

const db = admin.firestore();

async function testLookup() {
  try {
    // Simulate what the backend does
    const domain = 'test.myflynai.com';
    const hostWithoutPort = domain.split(':')[0];
    
    console.log(`Testing domain lookup for: ${domain}`);
    console.log(`Domain without port: ${hostWithoutPort}\n`);
    
    // Check if it's a platform domain
    const PLATFORM_DOMAINS = [
      'api.myflynai.com',
      'app.myflynai.com',
      'myflynai.com',
      'localhost',
      '127.0.0.1'
    ];
    
    const isPlatformDomain = PLATFORM_DOMAINS.some(pd => hostWithoutPort.endsWith(pd));
    console.log(`Is platform domain: ${isPlatformDomain}`);
    
    if (!isPlatformDomain) {
      console.log(`\nLooking up custom hostname...`);
      const customSnap = await db.collection('custom_hostnames')
        .where('hostname', '==', domain.toLowerCase())
        .limit(1)
        .get();
      
      console.log(`Found custom hostname: ${!customSnap.empty}`);
      
      if (!customSnap.empty) {
        const data = customSnap.docs[0].data();
        console.log(`Custom hostname data:`, {
          hostname: data.hostname,
          websiteId: data.websiteId,
          status: data.status
        });
        
        const websiteId = data.websiteId;
        
        // Now lookup the website
        console.log(`\nLooking up website: ${websiteId}`);
        const websiteSnap = await db.collection('public_websites').doc(websiteId).get();
        
        if (websiteSnap.exists) {
          const websiteData = websiteSnap.data();
          console.log(`Website found!`);
          console.log(`  Has HTML: ${!!websiteData.html}`);
          console.log(`  HTML length: ${websiteData.html?.length || 0} bytes`);
          console.log(`  Name: ${websiteData.name || 'Unnamed'}`);
        } else {
          console.log(`Website NOT found in public_websites!`);
        }
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
}

testLookup();
