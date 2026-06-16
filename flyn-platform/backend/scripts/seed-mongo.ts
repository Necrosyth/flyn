/**
 * MongoDB Seed Script
 * 
 * Creates sample user data for testing the AI Router + MongoDB workflow.
 * Run with: npx ts-node scripts/seed-mongo.ts
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'flyn_workflow_demo';
const COLLECTION_NAME = 'users';

interface User {
    name: string;
    email: string;
    age: number;
    country: string;
    city: string;
    status: 'active' | 'inactive';
    createdAt: Date;
}

// Sample users with varied data
const sampleUsers: User[] = [
    // India users (above age 20)
    { name: 'Rahul Sharma', email: 'rahul.sharma@example.com', age: 28, country: 'India', city: 'Mumbai', status: 'active', createdAt: new Date('2024-01-15') },
    { name: 'Priya Patel', email: 'priya.patel@example.com', age: 25, country: 'India', city: 'Delhi', status: 'active', createdAt: new Date('2024-02-20') },
    { name: 'Amit Kumar', email: 'amit.kumar@example.com', age: 32, country: 'India', city: 'Bangalore', status: 'active', createdAt: new Date('2024-03-10') },
    { name: 'Sneha Reddy', email: 'sneha.reddy@example.com', age: 24, country: 'India', city: 'Hyderabad', status: 'active', createdAt: new Date('2024-04-05') },
    { name: 'Vikram Singh', email: 'vikram.singh@example.com', age: 35, country: 'India', city: 'Chennai', status: 'inactive', createdAt: new Date('2024-05-12') },
    { name: 'Ananya Gupta', email: 'ananya.gupta@example.com', age: 22, country: 'India', city: 'Pune', status: 'active', createdAt: new Date('2024-06-18') },
    { name: 'Rohan Mehta', email: 'rohan.mehta@example.com', age: 29, country: 'India', city: 'Jaipur', status: 'active', createdAt: new Date('2024-07-22') },
    { name: 'Kavya Nair', email: 'kavya.nair@example.com', age: 27, country: 'India', city: 'Kochi', status: 'active', createdAt: new Date('2024-08-30') },

    // India users (below or at age 20 - should not be selected)
    { name: 'Arjun Verma', email: 'arjun.verma@example.com', age: 19, country: 'India', city: 'Lucknow', status: 'active', createdAt: new Date('2024-09-05') },
    { name: 'Diya Shah', email: 'diya.shah@example.com', age: 20, country: 'India', city: 'Ahmedabad', status: 'active', createdAt: new Date('2024-10-10') },

    // Users from other countries (should not be selected)
    { name: 'John Smith', email: 'john.smith@example.com', age: 30, country: 'USA', city: 'New York', status: 'active', createdAt: new Date('2024-01-20') },
    { name: 'Emma Wilson', email: 'emma.wilson@example.com', age: 26, country: 'UK', city: 'London', status: 'active', createdAt: new Date('2024-02-25') },
    { name: 'Liu Wei', email: 'liu.wei@example.com', age: 28, country: 'China', city: 'Shanghai', status: 'active', createdAt: new Date('2024-03-15') },
    { name: 'Hans Mueller', email: 'hans.mueller@example.com', age: 35, country: 'Germany', city: 'Berlin', status: 'active', createdAt: new Date('2024-04-20') },
    { name: 'Yuki Tanaka', email: 'yuki.tanaka@example.com', age: 24, country: 'Japan', city: 'Tokyo', status: 'active', createdAt: new Date('2024-05-25') },
    { name: 'Sophie Martin', email: 'sophie.martin@example.com', age: 29, country: 'France', city: 'Paris', status: 'active', createdAt: new Date('2024-06-30') },
    { name: 'Carlos Garcia', email: 'carlos.garcia@example.com', age: 31, country: 'Spain', city: 'Madrid', status: 'active', createdAt: new Date('2024-07-15') },
    { name: 'Ahmed Hassan', email: 'ahmed.hassan@example.com', age: 27, country: 'Egypt', city: 'Cairo', status: 'active', createdAt: new Date('2024-08-20') },
];

async function seedDatabase() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('✓ Connected to MongoDB');

        const db = client.db(DATABASE_NAME);
        const collection = db.collection<User>(COLLECTION_NAME);

        // Drop existing collection if it exists
        const collections = await db.listCollections({ name: COLLECTION_NAME }).toArray();
        if (collections.length > 0) {
            await collection.drop();
            console.log('✓ Dropped existing collection');
        }

        // Insert sample users
        const result = await collection.insertMany(sampleUsers);
        console.log(`✓ Inserted ${result.insertedCount} users`);

        // Create indexes for better query performance
        await collection.createIndex({ country: 1 });
        await collection.createIndex({ age: 1 });
        await collection.createIndex({ country: 1, age: 1 });
        console.log('✓ Created indexes');

        // Show some stats
        const totalCount = await collection.countDocuments();
        const indiaAbove20Count = await collection.countDocuments({
            country: 'India',
            age: { $gt: 20 }
        });

        console.log('\n📊 Database Stats:');
        console.log(`   Total users: ${totalCount}`);
        console.log(`   Users in India above age 20: ${indiaAbove20Count}`);

        // Show the query that would be generated
        console.log('\n🔍 Sample MongoDB Query for "users in India above age 20":');
        console.log(JSON.stringify({
            collection: 'users',
            operation: 'find',
            query: { country: 'India', age: { $gt: 20 } },
            projection: { email: 1, name: 1, _id: 0 }
        }, null, 2));

        // Show sample result
        const sampleResult = await collection.find(
            { country: 'India', age: { $gt: 20 } },
            { projection: { email: 1, name: 1, _id: 0 } }
        ).toArray();

        console.log('\n📧 Emails to send:');
        sampleResult.forEach(user => {
            console.log(`   - ${user.name}: ${user.email}`);
        });

        console.log('\n✅ Database seeded successfully!');
        console.log(`\n📝 Connection string: ${MONGODB_URI}`);
        console.log(`   Database: ${DATABASE_NAME}`);
        console.log(`   Collection: ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

seedDatabase();
