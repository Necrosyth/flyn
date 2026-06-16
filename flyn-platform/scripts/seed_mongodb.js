const { MongoClient } = require('mongodb');

const uri = "mongodb://flyn:flyn_mongo_password@localhost:27017";
const dbName = "flyn_workflow_demo";

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
    "Germany", "France", "Brazil", "Japan", "South Africa",
    "Mexico", "Spain", "Italy", "Netherlands", "Singapore"
];

const departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Customer Support"];
const positions = ["Manager", "Developer", "Analyst", "Sales Representative", "Specilaist"];
const membershipTypes = ["visitor", "member", "leader", "pastor"];
const contactStatuses = ["lead", "qualified", "customer", "churned", "inactive"];
const leaveTypes = ["vacation", "sick", "personal", "maternity"];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db(dbName);

        // --- Users ---
        console.log("Seeding Users...");
        const users = [];
        for (let i = 0; i < 50; i++) {
            const name = names[i];
            users.push({
                fullName: name,
                email: name.toLowerCase().replace(' ', '.') + "@example.com",
                phone: "+1" + getRandomInt(1000000000, 9999999999),
                country: getRandom(countries),
                age: getRandomInt(20, 65),
                role: i === 0 ? "admin" : "user",
                status: "active",
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        await db.collection("users").deleteMany({});
        await db.collection("users").insertMany(users);

        // --- HR Employees ---
        console.log("Seeding HR Employees...");
        const employees = [];
        for (let i = 0; i < 50; i++) {
            const name = names[i];
            employees.push({
                name: name,
                email: name.toLowerCase().replace(' ', '.') + "@company.com",
                phone: "+1" + getRandomInt(1000000000, 9999999999),
                country: getRandom(countries),
                age: getRandomInt(22, 60),
                department: getRandom(departments),
                position: getRandom(positions),
                status: "active",
                startDate: new Date(Date.now() - getRandomInt(0, 1000 * 60 * 60 * 24 * 365 * 5)).toISOString(),
                notes: "Employee record for " + name,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        await db.collection("hr_employees").deleteMany({});
        await db.collection("hr_employees").insertMany(employees);

        // --- Church Members ---
        console.log("Seeding Church Members...");
        const members = [];
        for (let i = 0; i < 50; i++) {
            const name = names[i];
            members.push({
                name: name,
                email: name.toLowerCase().replace(' ', '.') + "@church.org",
                phone: "+1" + getRandomInt(1000000000, 9999999999),
                country: getRandom(countries),
                age: getRandomInt(5, 90),
                membershipType: getRandom(membershipTypes),
                status: "active",
                notes: "Faithful member " + name,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        await db.collection("church_members").deleteMany({});
        await db.collection("church_members").insertMany(members);

        // --- CRM Contacts ---
        console.log("Seeding CRM Contacts...");
        const contacts = [];
        for (let i = 0; i < 50; i++) {
            const name = names[i];
            contacts.push({
                name: name,
                email: name.toLowerCase().replace(' ', '.') + "@client.com",
                phone: "+1" + getRandomInt(1000000000, 9999999999),
                country: getRandom(countries),
                age: getRandomInt(25, 65),
                company: "Tech Solutions " + i,
                status: getRandom(contactStatuses),
                tags: ["imported", getRandom(["priority", "hold", "followup"])],
                source: getRandom(["website", "referral", "ad", "conference"]),
                owner: "Sales Agent " + getRandomInt(1, 5),
                score: getRandomInt(0, 100),
                notes: "CRM record for " + name,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        await db.collection("crm_contacts").deleteMany({});
        await db.collection("crm_contacts").insertMany(contacts);

        console.log("Seeding completed successfully!");

    } catch (err) {
        console.error("Error seeding database:", err);
    } finally {
        await client.close();
    }
}

seed();
