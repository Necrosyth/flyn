const fs = require('fs');
const admin = require('firebase-admin');

const credPath = '../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json';

// Check if credentials file exists
if (!fs.existsSync(credPath)) {
  console.log('Firebase credentials not found - skipping Firestore sync');
  process.exit(0);
}

// Initialize Firebase (Assuming you have service account credentials)
const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function syncPages() {
  const snapshot = await db.collection('landing_content').get(); // Adjust collection name if needed
  const pages = {};
  snapshot.forEach(doc => {
    pages[doc.id] = doc.data();
  });

  fs.writeFileSync('pages_content.json', JSON.stringify(pages, null, 2));
  console.log('Successfully synced pages content from Firestore to pages_content.json');
  process.exit(0);
}

syncPages();
