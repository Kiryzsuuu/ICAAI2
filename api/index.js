// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '1.0.1',
    timestamp: new Date().toISOString(),
    env: {
      hasCosmosEndpoint: !!process.env.COSMOS_ENDPOINT,
      hasCosmosKey: !!process.env.COSMOS_KEY,
      hasCosmosDatabase: !!process.env.COSMOS_DATABASE
    }
  });
});

// Register endpoint
app.post('/auth/register', async (req, res) => {
  try {
    // Lazy load modules
    const { CosmosClient } = require('@azure/cosmos');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    
    const { email, password, name, phone, company } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Initialize Cosmos DB client
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    const databaseId = process.env.COSMOS_DATABASE || 'icaai-db';

    if (!endpoint || !key) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const client = new CosmosClient({ endpoint, key });
    const database = client.database(databaseId);
    const usersContainer = database.container('users');

    // Check if user already exists
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }]
    };
    const { resources: existingUsers } = await usersContainer.items.query(querySpec).fetchAll();
    
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
      name: name || email.split('@')[0],
      phone: phone || '',
      company: company || '',
      provider: 'local',
      isAdmin: false,
      createdAt: new Date().toISOString()
    };

    await usersContainer.items.create(newUser);

    // Generate token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        isAdmin: newUser.isAdmin
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat registrasi: ' + error.message });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    // Lazy load modules
    const { CosmosClient } = require('@azure/cosmos');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Initialize Cosmos DB client
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    const databaseId = process.env.COSMOS_DATABASE || 'icaai-db';

    if (!endpoint || !key) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const client = new CosmosClient({ endpoint, key });
    const database = client.database(databaseId);
    const usersContainer = database.container('users');

    // Get user from database
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }]
    };
    const { resources: users } = await usersContainer.items.query(querySpec).fetchAll();
    
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user = users[0];
    
    if (user.provider !== 'local') {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat login: ' + error.message });
  }
});

// Export for Vercel
module.exports = app;
