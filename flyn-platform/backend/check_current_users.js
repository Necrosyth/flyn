const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Try loading env file
try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
} catch (e) {
  console.log('No .env file read directly, relying on system env');
}

let initialized = false;

// 1. Try cert file
const certPath = path.join(__dirname, '../../flyn-94396-firebase-adminsdk-fbsvc-530eda35ff.json');
if (fs.existsSync(certPath)) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require(certPath)),
      projectId: 'flyn-94396'
    });
    initialized = true;
    console.log('Firebase initialized using json file.');
  } catch (err) {
    console.error('Failed to initialize with cert file:', err.message);
  }
}

// 2. Try B64 from env
if (!initialized && process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  try {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'flyn-94396'
    });
    initialized = true;
    console.log('Firebase initialized using B64 from .env.');
  } catch (err) {
    console.error('Failed to initialize with B64:', err.message);
  }
}

if (!initialized) {
  try {
    admin.initializeApp({
      projectId: 'flyn-94396'
    });
    initialized = true;
    console.log('Firebase initialized default project ID.');
  } catch (err) {
    console.error('Failed default initialization:', err.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function run() {
  try {
    console.log('\n=== USERS IN AUTH ===');
    const listUsersResult = await admin.auth().listUsers(10);
    listUsersResult.users.forEach((userRecord) => {
      console.log(`- UID: ${userRecord.uid}`);
      console.log(`  Email: ${userRecord.email}`);
      console.log(`  DisplayName: ${userRecord.displayName}`);
      console.log(`  Custom Claims: ${JSON.stringify(userRecord.customClaims)}`);
    });

    console.log('\n=== TENANTS IN FIRESTORE ===');
    const tenantsSnap = await db.collection('tenants').get();
    console.log(`Found ${tenantsSnap.docs.length} tenants:`);
    tenantsSnap.docs.forEach((doc) => {
      console.log(`- Document ID: ${doc.id}`);
      const data = doc.data();
      console.log(`  Name: ${data.name}`);
      console.log(`  onboardingComplete: ${data.onboardingComplete}`);
      console.log(`  ownerEmail: ${data.ownerEmail}`);
      console.log(`  createdBy: ${data.createdBy}`);
      console.log(`  integrations: ${JSON.stringify(data.integrations)}`);
    });

  } catch (err) {
    console.error('Error during inspection:', err);
  }
  process.exit(0);
}

run();
