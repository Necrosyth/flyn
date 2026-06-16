const { Client } = require('pg');

const connectionString = "postgresql://flyn:flyn_pg_password@localhost:5434/flyn_data";

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
    "India", "India", "India", "India", "India", // Higher weight for India as per user request
    "United States", "United Kingdom", "Canada", "Australia", "Germany"
];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log("Connected to PostgreSQL");

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE,
                country VARCHAR(100),
                age INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query("DELETE FROM users");
        console.log("Cleared existing users");

        for (let i = 0; i < 50; i++) {
            const name = names[i];
            const email = name.toLowerCase().replace(' ', '.') + "@example.com";
            const country = getRandom(countries);
            const age = getRandomInt(18, 60);

            await client.query(
                "INSERT INTO users (name, email, country, age) VALUES ($1, $2, $3, $4)",
                [name, email, country, age]
            );
        }

        console.log("Seeding completed successfully: 50 users added to flyn-postgres");

    } catch (err) {
        console.error("Error seeding PostgreSQL:", err);
    } finally {
        await client.end();
    }
}

seed();
