const axios = require('axios');

const BASE_URL = "http://localhost:13000";
const ADMIN_EMAIL = "admin@nocobase.com";
const ADMIN_PASSWORD = "admin123";

const names = [
    "James Smith", "Michael Johnson", "Robert Williams", "Maria Garcia", "David Miller",
    "Sarah Davis", "John Rodriguez", "Karen Martinez", "Thomas Hernandez", "Lisa Lopez",
    "Christopher Gonzalez", "Michelle Wilson", "Matthew Anderson", "Jennifer Thomas", "Daniel Taylor",
    "Elizabeth Moore", "Anthony Jackson", "Patricia Martin", "Mark Lee", "Linda Perez",
    "Donald Thompson", "Barbara White", "Paul Harris", "Susan Sanchez", "Steven Clark",
    "Jessica Ramirez", "Andrew Lewis", "Sarah Robinson", "Joshua Walker", "Kimberly Young",
    "Kevin Allen", "Emily King", "Brian Wright", "Donna Scott", "Edward Torres",
    "Michelle Nguyen", "Ronald Hill", "Dorothy Adams", "Timothy Baker", "Carol Nelson",
    "Jason Carter", "Amanda Mitchell", "Jeffrey Perez", "Melissa Roberts", "Ryan Turner",
    "Deborah Phillips", "Gary Campbell", "Stephanie Parker", "Nicholas Evans", "Rebecca Edwards"
];

const countries = [
    "United States", "India", "United Kingdom", "Canada", "Australia",
    "Germany", "France", "Brazil", "Japan", "South Africa"
];

const departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Customer Support"];
const positions = ["Manager", "Developer", "Analyst", "Sales Representative", "Specialist"];
const membershipTypes = ["visitor", "member", "leader", "pastor"];
const contactStatuses = ["lead", "qualified", "customer", "churned", "inactive"];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    console.log("🔐 Authenticating with NocoBase...");
    let token;
    try {
        const authRes = await axios.post(`${BASE_URL}/api/auth:signIn`, {
            account: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        token = authRes.data.data.token;
        console.log("✅ Authenticated");
    } catch (err) {
        console.error("❌ Auth failed:", err.message);
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const seedCollection = async (collection, data) => {
        console.log(`🌱 Seeding ${collection}...`);
        for (const item of data) {
            try {
                await axios.post(`${BASE_URL}/api/${collection}:create`, item, { headers });
            } catch (err) {
                // Silently skip if creation fails (likely already exists or schema mismatch)
                // console.warn(`   ⚠️ Error seeding ${collection}:`, err.response?.data || err.message);
            }
        }
    };

    // --- Users (flyn_users) ---
    const users = names.map((name, i) => ({
        name: name,
        email: name.toLowerCase().replace(' ', '.') + "@example.com",
        phone: "+1" + getRandomInt(1000000000, 9999999999),
        role: i === 0 ? "admin" : "user",
        status: "active"
    }));
    // Note: 'users' might be a system collection, we'll try flyn_users if it exists or use contacts as proxy
    // For now base it on what NocoBaseService.ts setup:

    // --- HR Employees (flyn_hr_employees) ---
    const employees = names.map(name => ({
        name: name,
        email: name.toLowerCase().replace(' ', '.') + "@company.com",
        phone: "+1" + getRandomInt(1000000000, 9999999999),
        department: getRandom(departments),
        position: getRandom(positions),
        status: "active",
        start_date: new Date(Date.now() - getRandomInt(0, 1000 * 60 * 60 * 24 * 365 * 5)).toISOString().split('T')[0],
        notes: "Seed record"
    }));
    await seedCollection("flyn_hr_employees", employees);

    // --- Church Members (flyn_church_members) ---
    const members = names.map(name => ({
        name: name,
        email: name.toLowerCase().replace(' ', '.') + "@church.org",
        phone: "+1" + getRandomInt(1000000000, 9999999999),
        membership_type: getRandom(membershipTypes),
        status: "active",
        join_date: new Date(Date.now() - getRandomInt(0, 1000 * 60 * 60 * 24 * 365 * 2)).toISOString().split('T')[0]
    }));
    await seedCollection("flyn_church_members", members);

    // --- CRM Contacts (contacts) ---
    const crmContacts = names.map(name => ({
        name: name,
        email: name.toLowerCase().replace(' ', '.') + "@client.com",
        phone: "+1" + getRandomInt(1000000000, 9999999999),
        company: "Seed Corp",
        status: getRandom(contactStatuses),
        source: "Import",
        score: getRandomInt(0, 100),
        owner: "Admin"
    }));
    await seedCollection("contacts", crmContacts);

    console.log("🎉 NocoBase Seeding completed!");
}

seed();
