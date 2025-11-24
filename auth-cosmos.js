// auth-cosmos.js - Authentication with Cosmos DB
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AzureAdOAuth2Strategy = require('passport-azure-ad').OIDCStrategy;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./cosmosdb');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Local Strategy
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await db.getUserByEmail(email);
      if (!user || user.provider !== 'local') {
        return done(null, false, { message: 'Email atau password salah' });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Email atau password salah' });
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await db.getUserByEmail(profile.emails[0].value);
      
      if (!user) {
        user = await db.createUser({
          id: Date.now().toString(),
          email: profile.emails[0].value,
          name: profile.displayName,
          provider: 'google',
          googleId: profile.id,
          createdAt: new Date().toISOString(),
          isAdmin: false
        });
        
        // First user is admin
        const allUsers = await db.getAllUsers();
        if (allUsers.length === 1) {
          await db.setAdmin(user.email, true);
          user.isAdmin = true;
        }
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

// Microsoft OAuth Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(new AzureAdOAuth2Strategy({
    identityMetadata: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    responseType: 'code',
    responseMode: 'form_post',
    redirectUrl: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:4000/auth/microsoft/callback',
    allowHttpForRedirectUrl: true,
    scope: ['profile', 'email', 'openid']
  },
  async (iss, sub, profile, accessToken, refreshToken, done) => {
    try {
      const email = profile._json.email || profile._json.preferred_username;
      let user = await db.getUserByEmail(email);
      
      if (!user) {
        user = await db.createUser({
          id: Date.now().toString(),
          email: email,
          name: profile.displayName,
          provider: 'microsoft',
          microsoftId: profile._json.oid,
          createdAt: new Date().toISOString(),
          isAdmin: false
        });
        
        const allUsers = await db.getAllUsers();
        if (allUsers.length === 1) {
          await db.setAdmin(user.email, true);
          user.isAdmin = true;
        }
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.getUserById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const isUserAdmin = await db.isAdmin(decoded.email);
    
    if (!isUserAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  passport,
  requireAuth,
  requireAdmin,
  JWT_SECRET
};
