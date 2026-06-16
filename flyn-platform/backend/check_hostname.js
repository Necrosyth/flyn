const admin = require('firebase-admin');
const serviceAccount = require('./src/firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

(async () => {
  try {
    const snap = await db.collection('custom_hostnames').where('hostname', '==', 'test.myflynai.com').get();
    console.log('Custom hostname docs:', snap.size);
    snap.docs.forEach(doc => {
      console.log('ID:', doc.id);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
