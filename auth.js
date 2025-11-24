const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'backend', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Load users from file
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    return { users: [], admins: [] };
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// Save users to file
function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Initialize passport
function initAuth(app) {
  app.use(require('express-session')({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
      const data = loadUsers();
      let user = data.users.find(u => u.googleId === profile.id);
      
      if (!user) {
        user = {
          id: Date.now().toString(),
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          provider: 'google',
          createdAt: new Date().toISOString()
        };
        data.users.push(user);
        saveUsers(data);
      }
      
      user.isAdmin = data.admins.includes(user.email);
      return done(null, user);
    }));
  }

  // Microsoft OAuth
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use(new OIDCStrategy({
      identityMetadata: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      responseType: 'code',
      responseMode: 'form_post',
      redirectUrl: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:4000/auth/microsoft/callback',
      allowHttpForRedirectUrl: true,
      scope: ['profile', 'email', 'openid']
    }, (iss, sub, profile, accessToken, refreshToken, done) => {
      const data = loadUsers();
      let user = data.users.find(u => u.microsoftId === profile.oid);
      
      if (!user) {
        user = {
          id: Date.now().toString(),
          microsoftId: profile.oid,
          email: profile.upn || profile.email,
          name: profile.displayName || profile.name,
          provider: 'microsoft',
          createdAt: new Date().toISOString()
        };
        data.users.push(user);
        saveUsers(data);
      }
      
      user.isAdmin = data.admins.includes(user.email);
      return done(null, user);
    }));
  }

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser((id, done) => {
    const data = loadUsers();
    const user = data.users.find(u => u.id === id);
    if (user) {
      user.isAdmin = data.admins.includes(user.email);
    }
    done(null, user);
  });
}

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login.html');
}

// Middleware to check admin
function requireAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { initAuth, requireAuth, requireAdmin, generateToken, loadUsers, saveUsers };
