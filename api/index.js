// Vercel serverless function entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Lazy load modules to avoid initialization errors
let db;
let sendWelcomeEmail;
let generateToken;

function loadModules() {
  if (!db) {
    db = require('../cosmosdb');
    const mailer = require('../mailer');
    sendWelcomeEmail = mailer.sendWelcomeEmail;
    const authCosmos = require('../auth-cosmos');
    generateToken = authCosmos.generateToken;
  }
  return { db, sendWelcomeEmail, generateToken };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register endpoint
app.post('/auth/register', async (req, res) => {
  try {
    const { db, sendWelcomeEmail, generateToken } = loadModules();
    const { email, password, name, phone, company } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Check if user already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
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

    await db.createUser(newUser);

    // Send welcome email
    try {
      await sendWelcomeEmail(email, newUser.name);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    // Generate token
    const token = generateToken(newUser);

    res.status(201).json({
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
    res.status(500).json({ error: 'Terjadi kesalahan saat registrasi' });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { db, generateToken } = loadModules();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Get user from database
    const user = await db.getUserByEmail(email);
    if (!user || user.provider !== 'local') {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Check password
    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Generate token
    const token = generateToken(user);

    res.json({
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
    res.status(500).json({ error: 'Terjadi kesalahan saat login' });
  }
});

// Get current user (simplified without auth middleware)
app.get('/auth/me', (req, res) => {
  // In a real app, you'd verify JWT token here
  res.json({ message: 'Auth endpoint - implement JWT verification' });
});

// Catch-all for undefined routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Export for Vercel
module.exports = app;
