// auth-mongo.js - Authentication with MongoDB
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AzureAdOAuth2Strategy = require('passport-azure-ad').OIDCStrategy;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./mongodb');

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

// Microsoft Azure AD OAuth Strategy
if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  passport.use(new AzureAdOAuth2Strategy({
    identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.AZURE_AD_CLIENT_ID,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: process.env.AZURE_AD_CALLBACK_URL || 'http://localhost:4000/auth/microsoft/callback',
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

// Initialize passport with app
function initAuth(app) {
  app.use(passport.initialize());
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      isAdmin: user.isAdmin || false
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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

// Super admin middleware
async function requireSuperAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const isUserSuperAdmin = await db.isSuperAdmin(decoded.email);
    
    if (!isUserSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin access required' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  initAuth,
  passport,
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
  generateToken,
  JWT_SECRET
};
