/**
 * Script untuk membuat user admin default atau reset password admin
 * Usage: node create-admin.js
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Path ke file users.json
const usersFilePath = path.join(__dirname, 'backend', 'users.json');

// Admin credentials default
const DEFAULT_ADMIN = {
    email: 'admin@icaai.com',
    password: 'admin123',
    name: 'ICAAI Admin'
};

function loadUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
            return data;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
    return { users: [], admins: [], resetTokens: {} };
}

function saveUsers(data) {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving users:', error);
        return false;
    }
}

async function createAdminUser() {
    console.log('🔧 ICAAI Admin User Setup\n');

    const data = loadUsers();
    
    // Check if admin user already exists
    const existingAdmin = data.users.find(u => u.email === DEFAULT_ADMIN.email);
    
    if (existingAdmin) {
        console.log(`❗ Admin user ${DEFAULT_ADMIN.email} already exists!`);
        console.log('Do you want to reset the password? (y/n)');
        
        // For automation, we'll just show the existing user info
        console.log('\n📋 Existing Admin Users:');
        data.admins.forEach(email => {
            const user = data.users.find(u => u.email === email);
            if (user) {
                console.log(`  • ${user.name} (${user.email})`);
            }
        });
        
        console.log('\n✨ You can login with any of the existing admin accounts.');
        console.log('If you forgot the password, use the "Forgot Password" feature on the login page.');
        return;
    }

    // Create new admin user
    try {
        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
        const newUser = {
            id: Date.now().toString(),
            email: DEFAULT_ADMIN.email,
            name: DEFAULT_ADMIN.name,
            phone: '',
            company: 'ICAAI System',
            role: 'System Administrator',
            password: hashedPassword,
            provider: 'local',
            createdAt: new Date().toISOString()
        };

        data.users.push(newUser);
        
        // Add to admins list
        if (!data.admins.includes(DEFAULT_ADMIN.email)) {
            data.admins.push(DEFAULT_ADMIN.email);
        }

        if (saveUsers(data)) {
            console.log('✅ Default admin user created successfully!');
            console.log('\n📋 Admin Login Credentials:');
            console.log(`   Email: ${DEFAULT_ADMIN.email}`);
            console.log(`   Password: ${DEFAULT_ADMIN.password}`);
            console.log('\n🔗 Access Dashboard: http://localhost:4000/dashboard.html');
            console.log('🔗 Login Page: http://localhost:4000/login.html');
            console.log('\n⚠️  Please change the default password after first login!');
        } else {
            console.log('❌ Failed to save admin user!');
        }
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    }
}

// Run if called directly
if (require.main === module) {
    createAdminUser().catch(console.error);
}

module.exports = { createAdminUser };