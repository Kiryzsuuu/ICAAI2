const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function seedMongoDB() {
    const client = new MongoClient('mongodb+srv://maskiryz23_db_user:JAaWpshc3MmvCKFo@icaai.m8botum.mongodb.net/?appName=ICAAI');
    
    try {
        console.log('Connecting to MongoDB Atlas...');
        await client.connect();
        console.log('Connected successfully');
        
        const db = client.db('icaai');
        const collection = db.collection('users');
        
        // Hash passwords
        const adminHash = await bcrypt.hash('admin123', 10);
        
        const users = [
            {
                email: 'maskiryz23@gmail.com',
                password: adminHash,
                isAdmin: true,
                createdAt: new Date()
            },
            {
                email: 'kiryzsu@gmail.com', 
                password: adminHash,
                isAdmin: true,
                createdAt: new Date()
            },
            {
                email: 'admin@icaai.com',
                password: adminHash,
                isAdmin: true,
                createdAt: new Date()
            }
        ];
        
        // Clear existing data
        console.log('Clearing existing users...');
        await collection.deleteMany({});
        
        // Insert test users
        console.log('Inserting test users...');
        const result = await collection.insertMany(users);
        console.log(`Inserted ${result.insertedCount} users successfully`);
        
        // Verify insertion
        const count = await collection.countDocuments();
        console.log(`Total users in database: ${count}`);
        
        // List users
        const allUsers = await collection.find({}, { projection: { password: 0 } }).toArray();
        console.log('Users created:');
        allUsers.forEach(user => {
            console.log(`- ${user.email} (Admin: ${user.isAdmin})`);
        });
        
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await client.close();
        console.log('Connection closed');
    }
}

seedMongoDB();