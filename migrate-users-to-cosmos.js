// migrate-users-to-cosmos.js - Migrate users from JSON to Cosmos DB
require('dotenv').config();
const { CosmosClient } = require('@azure/cosmos');
const fs = require('fs');

async function migrateUsers() {
  try {
    // Read users from JSON file
    const usersData = JSON.parse(fs.readFileSync('./backend/users.json', 'utf8'));
    
    // Initialize Cosmos DB client
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    const databaseId = process.env.COSMOS_DATABASE || 'icaai-db';

    if (!endpoint || !key) {
      console.error('ERROR: COSMOS_ENDPOINT and COSMOS_KEY must be set in .env file');
      process.exit(1);
    }

    console.log('Connecting to Cosmos DB...');
    const client = new CosmosClient({ endpoint, key });
    const database = client.database(databaseId);
    const usersContainer = database.container('users');

    // Migrate each user
    const adminEmails = usersData.admins || [];
    
    for (const user of usersData.users) {
      console.log(`Migrating user: ${user.email}`);
      
      // Check if user already exists
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: user.email }]
      };
      const { resources: existingUsers } = await usersContainer.items.query(querySpec).fetchAll();
      
      if (existingUsers && existingUsers.length > 0) {
        console.log(`  - User ${user.email} already exists, skipping...`);
        continue;
      }

      // Create user in Cosmos DB
      const newUser = {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        phone: user.phone || '',
        company: user.company || '',
        role: user.role || '',
        password: user.password, // Already hashed
        provider: user.provider || 'local',
        isAdmin: adminEmails.includes(user.email),
        createdAt: user.createdAt || new Date().toISOString()
      };

      await usersContainer.items.create(newUser);
      console.log(`  ✓ Successfully migrated ${user.email} (Admin: ${newUser.isAdmin})`);
    }

    console.log('\n✓ Migration completed successfully!');
    console.log(`Total users migrated: ${usersData.users.length}`);
    console.log(`Admin users: ${adminEmails.join(', ')}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateUsers();
