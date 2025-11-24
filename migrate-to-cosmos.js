// migrate-to-cosmos.js - Migrate data from JSON to Cosmos DB
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./cosmosdb');

async function migrate() {
  try {
    console.log('🚀 Starting migration to Azure Cosmos DB...\n');
    
    // Check if users.json exists
    const usersFile = path.join(__dirname, 'backend', 'users.json');
    if (!fs.existsSync(usersFile)) {
      console.log('⚠️  No users.json found. Starting with empty database.');
      return;
    }
    
    // Load existing users.json
    const data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    
    console.log(`📊 Found ${data.users.length} users to migrate`);
    console.log(`📊 Found ${data.admins.length} admins\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Migrate users
    for (const user of data.users) {
      try {
        // Add isAdmin flag
        user.isAdmin = data.admins.includes(user.email);
        
        // Check if user already exists
        const existing = await db.getUserByEmail(user.email);
        if (existing) {
          console.log(`⏭️  Skipped (already exists): ${user.email}`);
          continue;
        }
        
        // Create user in Cosmos DB
        await db.createUser(user);
        console.log(`✅ Migrated: ${user.email} ${user.isAdmin ? '(Admin)' : ''}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed: ${user.email} - ${err.message}`);
        failCount++;
      }
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📊 Total: ${data.users.length}`);
    
    // Migrate orders if exists
    const ordersFile = path.join(__dirname, 'backend', 'orders.json');
    if (fs.existsSync(ordersFile)) {
      const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      console.log(`\n📦 Found ${orders.length} orders to migrate`);
      
      let orderSuccess = 0;
      let orderFail = 0;
      
      for (const order of orders) {
        try {
          await db.createOrder(order);
          console.log(`✅ Migrated order: ${order.id}`);
          orderSuccess++;
        } catch (err) {
          console.error(`❌ Failed order: ${order.id} - ${err.message}`);
          orderFail++;
        }
      }
      
      console.log('\n📦 Orders Migration Summary:');
      console.log(`   ✅ Success: ${orderSuccess}`);
      console.log(`   ❌ Failed: ${orderFail}`);
    }
    
    console.log('\n✨ Migration complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Verify data in Azure Portal');
    console.log('   2. Test application with Cosmos DB');
    console.log('   3. Backup users.json before deleting');
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

// Run migration
migrate();
