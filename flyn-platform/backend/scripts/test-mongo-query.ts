/**
 * Quick MongoDB Query Test
 * Tests that the backend can connect and query MongoDB
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'flyn_workflow_demo';

async function testQuery() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('✓ Connected to MongoDB');

        const db = client.db(DATABASE_NAME);
        const collection = db.collection('users');

        // Test the query that workflows will use
        const query = { country: 'India', age: { $gt: 20 } };
        const projection = { email: 1, name: 1, _id: 0 };
        
        const results = await collection
            .find(query, { projection })
            .sort({ name: 1 })
            .toArray();

        console.log(`\n✅ Query successful! Found ${results.length} users\n`);
        console.log('Sample results:');
        results.slice(0, 3).forEach(user => {
            console.log(`   - ${user.name}: ${user.email}`);
        });

        console.log('\n🔍 Query used:');
        console.log(JSON.stringify({ query, projection }, null, 2));

    } catch (error) {
        console.error('❌ Error:', (error as Error).message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

testQuery();
