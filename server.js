require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
const passport = require('passport');
const { initAuth, requireAuth, requireAdmin: authRequireAdmin, requireSuperAdmin: authRequireSuperAdmin, generateToken } = require('./auth-mongo');
const db = require('./mongodb');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('./mailer');
const crypto = require('crypto');
const multer = require('multer');

// Try multiple ways to import pdf-parse
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  try {
    const pdfParseModule = require('pdf-parse');
    pdfParse = pdfParseModule.default || pdfParseModule;
  } catch (e2) {
    console.error('Failed to load pdf-parse:', e2);
    pdfParse = null;
  }
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Simple socket auth: mark sockets as admin when they provide the admin token.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    socket.data = socket.data || {};
    socket.data.isAdmin = (token === 'admin');
  } catch (e) {
    socket.data = { isAdmin: false };
  }
  next();
});

function broadcastToAdmins(event, payload) {
  try {
    io.sockets.sockets.forEach((s) => {
      if (s && s.data && s.data.isAdmin) {
        s.emit(event, payload);
      }
    });
  } catch (e) {
    console.warn('broadcastToAdmins failed', e && e.message);
  }
}

app.use(cors());
app.use(express.json());

// Initialize authentication
initAuth(app);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('WARNING: OPENAI_API_KEY not found in environment (.env)');
  console.error('OpenAI features will not work');
} else {
  console.log('Using OpenAI API with key:', OPENAI_API_KEY.substring(0, 20) + '...');
}

// Store active sessions and stats
const activeSessions = new Map();
const sessionStats = {
  totalSessions: 0,
  activeSessions: 0,
  totalMessages: 0,
  totalAudioChunks: 0,
  startTime: new Date().toISOString()
};

// Emit monitoring updates to connected dashboard clients
function emitMonitoring() {
  try {
    const payload = {
      stats: {
        ...sessionStats,
        activeSessions: activeSessions.size,
        uptime: Math.floor((Date.now() - new Date(sessionStats.startTime)) / 1000)
      }
    };
    broadcastToAdmins('monitoring.update', payload);
  } catch (e) {
    console.warn('emitMonitoring failed', e && e.message);
  }
}

// Read backend call_logs and emit sessions list to dashboards
const CALL_LOGS_DIR = path.join(__dirname, 'backend', 'call_logs');
function emitSessionsUpdate() {
  try {
    const sessions = [];
    if (fs.existsSync(CALL_LOGS_DIR)) {
      const files = fs.readdirSync(CALL_LOGS_DIR).filter(f => f.endsWith('.json'));
      files.sort();
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(CALL_LOGS_DIR, f), 'utf8');
          const j = JSON.parse(raw);

          const startTime = j.start_time || j.startTime || j.startTimeISO || null;
          const lastMsg = (j.messages && j.messages.length) ? j.messages[j.messages.length-1].timestamp : j.end_time || j.last_message || null;
          const messageCount = (j.session_stats && j.session_stats.total_messages) ? j.session_stats.total_messages : (j.messages ? j.messages.length : 0);

          let durationSeconds = null;
          if (startTime && lastMsg) {
            try {
              durationSeconds = Math.max(0, Math.floor((new Date(lastMsg) - new Date(startTime)) / 1000));
            } catch (e) {
              durationSeconds = null;
            }
          }

          sessions.push({
            session_id: j.session_id || j.sessionId || f,
            status: j.status || 'unknown',
            start_time: startTime,
            last_message: lastMsg,
            message_count: messageCount,
            duration_seconds: durationSeconds,
            readable_start: startTime ? new Date(startTime).toLocaleString() : null
          });
        } catch (e) {
          console.warn('Failed to parse call log', f, e && e.message);
        }
      }
    }

    // sort sessions by start_time desc (fallback to filename order)
    sessions.sort((a, b) => {
      if (a.start_time && b.start_time) return new Date(b.start_time) - new Date(a.start_time);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return 0;
    });

    broadcastToAdmins('sessions.update', { sessions });
  } catch (e) {
    console.warn('emitSessionsUpdate failed', e && e.message);
  }
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8004';

// Helpers: transfer to human and close session
async function transferToHuman(sessionId, reason) {
  try {
    // Log transfer to backend so call_logs reflect transfer
    await fetch(`${BACKEND_URL}/log-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        participant_type: 'system',
        message: `TRANSFER_TO_HUMAN: ${reason || 'agent_request'}`,
        timestamp: new Date().toISOString(),
        status: 'transferred'
      })
    });

    // Notify admins and session participants
    broadcastToAdmins('dispatch.to_human', { sessionId, reason });
    const s = activeSessions.get(sessionId);
    if (s && s.ws) {
      try { s.ws.send(JSON.stringify({ type: 'system.transfer', reason })); } catch (e) { }
    }

    // Refresh sessions/monitoring
    emitMonitoring();
    emitSessionsUpdate();
  } catch (e) {
    console.warn('transferToHuman failed', e && e.message);
  }
}

async function closeSession(sessionId, reason) {
  try {
    await fetch(`${BACKEND_URL}/log-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        participant_type: 'system',
        message: `CLOSE_CALL_CONFIRMED: ${reason || 'agent_auto_close'}`,
        timestamp: new Date().toISOString(),
        status: 'completed'
      })
    });

    // Notify admins and session participants
    broadcastToAdmins('call.closed', { sessionId, reason });
    const s = activeSessions.get(sessionId);
    if (s && s.ws) {
      try { s.ws.send(JSON.stringify({ type: 'system.close_call', reason })); } catch (e) { }
      try { s.ws.close(); } catch (e) { }
    }

    // Update stats and sessions
    emitMonitoring();
    emitSessionsUpdate();
  } catch (e) {
    console.warn('closeSession failed', e && e.message);
  }
}
// Default configuration
const defaultConfig = {
  instructions: `CRITICAL: YOU MUST ALWAYS RESPOND IN INDONESIAN (BAHASA INDONESIA). NEVER USE ANY OTHER LANGUAGE.

PRIMARY RULES (NO EXCEPTIONS)

You are an cheerfull interactive call agent that speaks naturally and expresses appropriate emotion based on user intent.
Behave like a helpful customer support specialist: listen, respond concisely, and ask clarifying questions when needed.
When the user speaks you should be interruptible — if the user starts talking, stop speaking immediately and listen.

IMPORTANT PDF SEARCH: When users ask about menu items, prices, food options, or any specific information that might be in documents, ALWAYS use the search_pdf function first to get the most current and accurate information. Don't rely only on the initial PDF context - search for specific queries to get relevant details.

Match the user's tone when appropriate (e.g., calm and reassuring for complaints, upbeat for simple requests). Keep answers clear, human, and concise.
Prefer short sentences and natural prosody. Use empathy where helpful (e.g., "I understand", "I can help with that").
Always verify when details are ambiguous and offer next steps or options.

IMPORTANT: When mentioning prices or numbers:
- Say "37 ribu" instead of "tiga puluh tujuh ribu"
- Say "150 ribu" instead of "seratus lima puluh ribu" 
- Say "2.5 juta" instead of "dua koma lima juta"
- Use natural, conversational number formats that people actually say in daily conversation.
`,
  voice: "echo",
  temperature: 0.6,
  max_response_output_tokens: 10000,
  turn_detection: {
    type: "server_vad",
    threshold: 0.45,
    prefix_padding_ms: 200,
    silence_duration_ms: 150
  }
};

// Authentication routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`/?token=${token}`);
  }
);

app.get('/auth/microsoft', passport.authenticate('azuread-openidconnect'));

app.post('/auth/microsoft/callback',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login.html' }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`/?token=${token}`);
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/login.html');
  });
});

app.post('/auth/register', async (req, res) => {
  const { name, email, phone, company, role, password } = req.body;
  
  if (!name || !email || !phone || !company || !role || !password) {
    return res.json({ success: false, error: 'Semua field harus diisi' });
  }
  
  if (password.length < 6) {
    return res.json({ success: false, error: 'Password minimal 6 karakter' });
  }
  
  // Check if user exists in Cosmos DB
  const existingUser = await db.getUserByEmail(email);
  if (existingUser) {
    return res.json({ success: false, error: 'Email sudah terdaftar' });
  }
  
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const newUser = {
    id: Date.now().toString(),
    email,
    name,
    phone,
    company,
    role,
    password: hashedPassword,
    provider: 'local',
    createdAt: new Date().toISOString()
  };
  
  // Save to Cosmos DB
  await db.createUser(newUser);
  
  // Send welcome email
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    sendWelcomeEmail(email, name).catch(err => console.error('Email error:', err));
  }
  
  res.json({ success: true });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await db.getUserByEmail(email);
    
    if (!user || user.provider !== 'local') {
      return res.json({ success: false, error: 'Email atau password salah' });
    }
    
    const bcrypt = require('bcryptjs');
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.json({ success: false, error: 'Email atau password salah' });
    }
    
    const userPayload = { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
    const token = generateToken(userPayload);
    
    res.json({ success: true, token, user: { name: user.name, email: user.email, isAdmin: user.isAdmin } });
  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, error: 'Terjadi kesalahan pada server' });
  }
});

app.get('/api/user', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
    const user = await db.getUserByEmail(payload.email);
    
    if (user) {
      const userRole = await db.getUserRole(user.email);
      res.json({ 
        user: { 
          name: user.name, 
          email: user.email, 
          isAdmin: user.isAdmin || false,
          role: userRole,
          isSuperAdmin: userRole === 'superadmin'
        } 
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (e) {
    console.error('Get user error:', e);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Orders routes
const ORDERS_FILE = path.join(__dirname, 'backend', 'orders.json');

function loadOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    const isAdmin = await db.isAdmin(req.user.email);
    
    // Admin sees all orders, regular users see only their orders
    const userOrders = isAdmin ? orders : orders.filter(o => o.userEmail === req.user.email);
    res.json({ orders: userOrders, isAdmin });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  const { items, total } = req.body;
  
  try {
    const newOrder = {
      id: Date.now().toString(),
      userEmail: req.user.email,
      userName: req.user.name,
      items,
      total,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await db.createOrder(newOrder);
    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// Admin routes
app.get('/api/admin/users', authRequireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    const currentUserRole = await db.getUserRole(req.user.email);
    
    const formattedUsers = await Promise.all(users.map(async u => {
      const userRole = await db.getUserRole(u.email);
      const userId = u._id ? u._id.toString() : (u.id || u.email); // Use _id, custom id, or email as fallback
      return {
        id: userId,
        name: u.name || 'N/A',
        email: u.email,
        phone: u.phone || '-',
        company: u.company || '-',
        role: u.role || '-',
        userRole: userRole, // superadmin, admin, user
        provider: u.provider,
        createdAt: u.createdAt,
        isAdmin: u.isAdmin || false,
        isSuperAdmin: userRole === 'superadmin'
      };
    }));
    
    res.json({ 
      users: formattedUsers, 
      currentUser: {
        ...req.user,
        role: currentUserRole,
        isSuperAdmin: currentUserRole === 'superadmin'
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/api/admin/users/:id', authRequireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const user = await db.getUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    await db.deleteUserById(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

app.post('/api/admin/toggle', authRequireAdmin, async (req, res) => {
  const { userId, makeAdmin } = req.body;
  
  try {
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Only super admin can change super admin status
    const targetUserRole = await db.getUserRole(user.email);
    const currentUserRole = await db.getUserRole(req.user.email);
    
    if (targetUserRole === 'superadmin' && currentUserRole !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Cannot modify super admin' });
    }
    
    await db.setAdmin(user.email, makeAdmin);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle admin error:', error);
    res.status(500).json({ success: false, error: 'Failed to update admin status' });
  }
});

// Change user role (Super Admin only)
app.post('/api/admin/change-role', authRequireSuperAdmin, async (req, res) => {
  const { userId, newRole } = req.body;
  
  try {
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Prevent changing super admin's role
    if (user.email === 'maskiryz23@gmail.com' && newRole !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Cannot change super admin role' });
    }
    
    if (newRole === 'admin') {
      await db.setAdmin(user.email, true);
    } else if (newRole === 'user') {
      await db.setAdmin(user.email, false);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Change role error:', error);
    res.status(500).json({ success: false, error: 'Failed to change user role' });
  }
});

// API routes first

// Removed Azure OpenAI functions - using standard OpenAI API only
app.get('/api/config', (req, res) => {
  res.json(defaultConfig);
});

app.post('/api/config', authRequireAdmin, (req, res) => {
  Object.assign(defaultConfig, req.body);
  console.log('Config updated:', JSON.stringify(defaultConfig, null, 2));
  res.json({ success: true, config: defaultConfig });
});

// Monitoring dashboard endpoint
app.get('/api/monitoring', authRequireAdmin, (req, res) => {
  // Sessions: combine activeSessions and call_logs
  const sessions = [];
  const CALL_LOGS_DIR = path.join(__dirname, 'backend', 'call_logs');
  if (fs.existsSync(CALL_LOGS_DIR)) {
    const files = fs.readdirSync(CALL_LOGS_DIR).filter(f => f.endsWith('.json'));
    files.sort();
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(CALL_LOGS_DIR, f), 'utf8');
        const j = JSON.parse(raw);
        const startTime = j.start_time || j.startTime || j.startTimeISO || null;
        const lastMsg = (j.messages && j.messages.length) ? j.messages[j.messages.length-1].timestamp : j.end_time || j.last_message || null;
        const messageCount = (j.session_stats && j.session_stats.total_messages) ? j.session_stats.total_messages : (j.messages ? j.messages.length : 0);
        let durationSeconds = null;
        if (startTime && lastMsg) {
          try {
            durationSeconds = Math.max(0, Math.floor((new Date(lastMsg) - new Date(startTime)) / 1000));
          } catch (e) {
            durationSeconds = null;
          }
        }
        sessions.push({
          session_id: j.session_id || j.sessionId || f,
          status: j.status || 'unknown',
          start_time: startTime,
          last_message: lastMsg,
          message_count: messageCount,
          duration_seconds: durationSeconds,
          readable_start: startTime ? new Date(startTime).toLocaleString() : null
        });
      } catch (e) {
        console.warn('Failed to parse call log', f, e && e.message);
      }
    }
  }
  // sort sessions by start_time desc (fallback to filename order)
  sessions.sort((a, b) => {
    if (a.start_time && b.start_time) return new Date(b.start_time) - new Date(a.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return 0;
  });
  res.json({
    stats: {
      ...sessionStats,
      activeSessions: activeSessions.size,
      uptime: Math.floor((Date.now() - new Date(sessionStats.startTime)) / 1000)
    },
    sessions,
    config: defaultConfig
  });
});

// PDF/Knowledge Base functionality
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const filename = `${timestamp}_${file.originalname}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// PDF upload endpoint
app.post('/api/pdfs/upload', authRequireAdmin, upload.array('pdfs', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      try {
        // Parse PDF text
        const dataBuffer = fs.readFileSync(file.path);
        console.log('Processing PDF:', file.originalname, 'Size:', dataBuffer.length);
        
        // Try multiple approaches to parse PDF
        let pdfData = { text: '' };
        let textExtracted = false;
        
        if (pdfParse) {
          try {
            console.log('Attempting PDF parse, pdfParse type:', typeof pdfParse);
            
            // Method 1: Direct function call
            if (typeof pdfParse === 'function') {
              pdfData = await pdfParse(dataBuffer);
              textExtracted = true;
              console.log('PDF parsed successfully with direct call');
            }
            // Method 2: Try default export
            else if (pdfParse.default && typeof pdfParse.default === 'function') {
              pdfData = await pdfParse.default(dataBuffer);
              textExtracted = true;
              console.log('PDF parsed successfully with default export');
            }
            // Method 3: Check if it's an object with parse method
            else if (pdfParse.parse && typeof pdfParse.parse === 'function') {
              pdfData = await pdfParse.parse(dataBuffer);
              textExtracted = true;
              console.log('PDF parsed successfully with parse method');
            }
            // Method 4: Try to call it anyway and let it fail gracefully
            else {
              try {
                pdfData = await pdfParse(dataBuffer);
                textExtracted = true;
                console.log('PDF parsed successfully with fallback call');
              } catch (fallbackError) {
                console.log('All PDF parse methods failed, using text-free storage');
              }
            }
          } catch (parseError) {
            console.error('PDF Parse Error:', parseError.message);
            console.log('PDF will be stored without text content');
          }
        } else {
          console.log('pdf-parse library not available, storing PDF without text extraction');
        }
        
        // Store in MongoDB
        const pdfDoc = await db.createPDF({
          filename: file.originalname,
          filepath: file.path,
          uploadedBy: req.user.email,
          uploadedAt: new Date(),
          textContent: pdfData.text || '',
          selected: false,
          fileSize: file.size
        });

        results.push({
          id: pdfDoc.insertedId,
          filename: file.originalname,
          success: true,
          textExtracted: pdfData.text ? true : false
        });
      } catch (error) {
        console.error('Error processing PDF:', error);
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('PDF upload error:', error);
    res.status(500).json({ error: 'Failed to upload PDFs' });
  }
});

// List PDFs endpoint
app.get('/api/pdfs/list', authRequireAdmin, async (req, res) => {
  try {
    const pdfs = await db.getAllPDFs();
    res.json({ 
      pdfs: pdfs.map(pdf => ({
        id: pdf._id,
        filename: pdf.filename,
        uploadedBy: pdf.uploadedBy,
        uploadedAt: pdf.uploadedAt,
        selected: pdf.selected || false,
        fileSize: pdf.fileSize
      }))
    });
  } catch (error) {
    console.error('Error listing PDFs:', error);
    res.status(500).json({ error: 'Failed to list PDFs' });
  }
});

// Select PDF endpoint
app.post('/api/pdfs/select', authRequireAdmin, async (req, res) => {
  try {
    const { pdfId } = req.body;
    await db.selectPDF(pdfId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error selecting PDF:', error);
    res.status(500).json({ error: 'Failed to select PDF' });
  }
});

// Delete PDF endpoint
app.delete('/api/pdfs/:id', authRequireAdmin, async (req, res) => {
  try {
    const pdfId = req.params.id;
    const pdf = await db.getPDFById(pdfId);
    
    if (pdf && pdf.filepath) {
      // Delete file from disk
      if (fs.existsSync(pdf.filepath)) {
        fs.unlinkSync(pdf.filepath);
      }
    }
    
    await db.deletePDF(pdfId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting PDF:', error);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
});

// Search in PDFs endpoint (simplified version)
app.post('/api/pdfs/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const selectedPdf = await db.getSelectedPDF();
    if (!selectedPdf) {
      return res.json({ results: [], message: 'No PDF selected' });
    }

    // Simple text search in PDF content
    const content = selectedPdf.textContent || '';
    const queryLower = query.toLowerCase();
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    const results = sentences
      .filter(sentence => sentence.toLowerCase().includes(queryLower))
      .slice(0, 5)
      .map(sentence => ({
        text: sentence.trim(),
        filename: selectedPdf.filename
      }));

    res.json({ results, selectedPdf: selectedPdf.filename });
  } catch (error) {
    console.error('PDF search error:', error);
    res.status(500).json({ error: 'Failed to search PDFs' });
  }
});

// Static files after API routes
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/forgot-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  const data = loadUsers();
  const user = data.users.find(u => u.email === email && u.provider === 'local');
  
  if (!user) {
    return res.json({ success: false, error: 'Email tidak ditemukan' });
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = Date.now() + 3600000; // 1 hour
  
  // Store reset token
  if (!data.resetTokens) data.resetTokens = {};
  data.resetTokens[resetToken] = {
    email: user.email,
    expiry: resetExpiry
  };
  saveUsers(data);
  
  // Send reset email
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    await sendPasswordResetEmail(user.email, user.name, resetToken);
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Email service tidak dikonfigurasi' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  
  const data = loadUsers();
  
  if (!data.resetTokens || !data.resetTokens[token]) {
    return res.json({ success: false, error: 'Token tidak valid' });
  }
  
  const resetData = data.resetTokens[token];
  
  if (Date.now() > resetData.expiry) {
    delete data.resetTokens[token];
    saveUsers(data);
    return res.json({ success: false, error: 'Token sudah kadaluarsa' });
  }
  
  const user = data.users.find(u => u.email === resetData.email);
  
  if (!user) {
    return res.json({ success: false, error: 'User tidak ditemukan' });
  }
  
  // Update password
  const bcrypt = require('bcryptjs');
  user.password = await bcrypt.hash(password, 10);
  
  // Remove used token
  delete data.resetTokens[token];
  saveUsers(data);
  
  res.json({ success: true });
});

app.get('/admin', (req, res) => {
  // Admin page will handle authentication on client-side
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/config.html', (req, res) => {
  // Redirect old standalone config page to main UI and open the config panel
  res.redirect('/?openConfig=1');
});



app.get('/monitoring', (req, res) => {
  // Monitoring page will handle authentication on client-side
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

app.get('/users', (req, res) => {
  // Users page will handle authentication on client-side
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

app.get('/dashboard', (req, res) => {
  // Dashboard will handle authentication on client-side
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/admin/users/export', authRequireAdmin, async (req, res) => {
  try {
    const allUsers = await db.getAllUsers();
    const users = allUsers.map(u => ({
      name: u.name,
      email: u.email,
      phone: u.phone || '-',
      company: u.company || '-',
      role: u.role || '-',
      provider: u.provider,
      createdAt: new Date(u.createdAt).toLocaleString('id-ID'),
      isAdmin: u.isAdmin ? 'Yes' : 'No'
    }));
  
    res.json({ users });
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ error: 'Failed to export users' });
  }
});

// Debug helper: force-send a greeting to an active session or to all sessions
app.post('/debug/send-greeting', (req, res) => {
  try {
    const { sessionId, text } = req.body || {};
    const greetingText = text || 'Halo! Ini pesan percobaan dari server untuk menguji pemutaran audio.';

    const targets = [];
    if (sessionId) {
      const s = activeSessions.get(sessionId);
      if (s) targets.push(s);
    } else {
      for (const s of activeSessions.values()) targets.push(s);
    }

    if (!targets.length) return res.status(404).json({ success: false, error: 'No active sessions found' });

    for (const session of targets) {
      try {
        if (session.ws && session.isConnected) {
          session.ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: greetingText }]
            }
          }));

          session.ws.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text', 'audio'] }
          }));
        }
      } catch (err) {
        console.warn('Failed to send greeting to session', session.sessionId, err);
      }
    }

    return res.json({ success: true, sentTo: targets.map(t => t.sessionId) });
  } catch (err) {
    console.error('Error in /debug/send-greeting:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('connect-realtime', async (data) => {
    const sessionId = data.sessionId || socket.id;
    
    try {
      // Get PDF context
      let pdfText = "";
      let pdfName = "";
      try {
        const response = await fetch(`${BACKEND_URL}/pdf-text`);
        if (response.ok) {
          const pdfData = await response.json();
          pdfText = pdfData.text || "";
          pdfName = pdfData.filename || "";
        }
      } catch (error) {
        console.error('Error fetching PDF:', error);
      }

      // Build instructions with PDF context
      let instructions = defaultConfig.instructions;
      if (pdfText) {
        instructions += `\n\nSOLARIA MENU KNOWLEDGE BASE:\n${pdfText}`;
        instructions += `\n\nIMPORTANT: You have access to the complete Solaria menu above. Use this information to answer questions about food items, prices, and availability. Always reference the menu when customers ask about food options.`;
      }

      // Create WebSocket connection to OpenAI
      console.log('Connecting to OpenAI Realtime API...');
      const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      const session = {
        sessionId,
        ws,
        instructions,
        isConnected: false,
        hasOngoingResponse: false,
        startTime: new Date().toISOString()
      };
      
      activeSessions.set(sessionId, session);
      
      // Update stats
      sessionStats.totalSessions++;
      sessionStats.activeSessions = activeSessions.size;

      // Notify dashboards about new session
      emitMonitoring();
      emitSessionsUpdate();

      ws.on('open', () => {
        console.log('Connected to OpenAI Realtime');
        session.isConnected = true;
        
        // Configure session - use current config values
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: instructions,
            voice: defaultConfig.voice || 'echo',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: defaultConfig.turn_detection || {
              type: 'server_vad',
              threshold: 0.45,
              prefix_padding_ms: 200,
              silence_duration_ms: 350
            },
            temperature: defaultConfig.temperature || 0.8,
            max_response_output_tokens: 4096
          }
        };
        
        console.log('Using voice:', sessionConfig.session.voice);
        
        console.log('Sending session config:', JSON.stringify(sessionConfig, null, 2));
        ws.send(JSON.stringify(sessionConfig));

        socket.emit('realtime-connected', { sessionId });
        
        // Send greeting after a short delay
        setTimeout(() => {
          console.log('Sending greeting message...');
          try {
            // Dynamic greeting based on PDF name
            let greetingText = 'Halo, terima kasih sudah menghubungi kami. Ada yang bisa kami bantu?';
            if (pdfName) {
              // Extract restaurant/company name from PDF filename (remove .pdf extension)
              const businessName = pdfName.replace('.pdf', '').replace(/_/g, ' ');
              greetingText = `Halo, terima kasih sudah menghubungi ${businessName}. Ada yang bisa kami bantu?`;
            }
            
            ws.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: greetingText
                }]
              }
            }));
            
            // Only create greeting response if no ongoing response
            if (!session.hasOngoingResponse) {
              ws.send(JSON.stringify({
                type: 'response.create',
                response: {
                  modalities: ['text', 'audio'],
                  instructions: defaultConfig.instructions
                }
              }));
              
              session.hasOngoingResponse = true;
            }
          } catch (error) {
            console.error('Error sending greeting:', error);
          }
        }, 1500);
      });

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          
          switch (event.type) {
            case 'response.audio.delta':
              if (event.delta) {
                console.log(`Audio delta received: ${event.delta.length} chars (base64)`);
                sessionStats.totalAudioChunks++;
                sessionStats.activeSessions = activeSessions.size;
                socket.emit('audio-delta', {
                  sessionId,
                  delta: event.delta
                });
                // update dashboards immediately
                emitMonitoring();
              }
              break;
              
            case 'response.text.delta':
              if (event.delta) {
                sessionStats.totalMessages++;
                sessionStats.activeSessions = activeSessions.size;
                socket.emit('text-delta', {
                  sessionId,
                  delta: event.delta
                });
                // update dashboards immediately
                emitMonitoring();
              }
              break;
              
            case 'input_audio_buffer.speech_started':
              console.log('User speech started - interrupting agent');
              // Cancel ongoing response when user starts speaking
              if (session.hasOngoingResponse) {
                try {
                  session.ws.send(JSON.stringify({ type: 'response.cancel' }));
                  session.hasOngoingResponse = false;
                  console.log('Response cancelled due to user interruption');
                } catch (e) {
                  console.warn('Failed to cancel response:', e.message);
                }
              }
              socket.emit('user-speech-start', { sessionId });
              break;
              
            case 'input_audio_buffer.speech_stopped':
              console.log('User speech stopped');
              socket.emit('user-speech-end', { sessionId });
              break;
              
            case 'response.audio_transcript.delta':
              // Handle audio transcript if available
              if (event.delta) {
                console.log('Audio transcript delta:', event.delta);
                socket.emit('text-delta', {
                  sessionId,
                  delta: event.delta
                });
              }
              break;
              
            case 'conversation.item.input_audio_transcription.delta':
              // Real-time user speech transcription
              if (event.delta) {
                console.log('User speech delta:', event.delta);
                socket.emit('user-speech-delta', {
                  sessionId,
                  delta: event.delta
                });
              }
              break;
              
            case 'response.audio.done':
              console.log('Audio response completed');
              socket.emit('speech-stopped', { sessionId });
              break;
              
            case 'response.done':
              console.log('Response completed');
              session.hasOngoingResponse = false;
              socket.emit('response-done', { sessionId });
              break;
              
            case 'response.created':
              console.log('Response started');
              session.hasOngoingResponse = true;
              // Delay speech-started to allow transcript to arrive first
              session.pendingSpeechStart = true;
              setTimeout(() => {
                if (session.pendingSpeechStart) {
                  // Send pending transcript first if available
                  if (session.pendingUserTranscript) {
                    socket.emit('user-transcript', {
                      sessionId,
                      transcript: session.pendingUserTranscript
                    });
                    session.pendingUserTranscript = null;
                  }
                  socket.emit('speech-started', { sessionId });
                  session.pendingSpeechStart = false;
                }
              }, 300); // Increased delay to ensure transcript arrives first
              break;
              
            case 'response.cancelled':
              console.log('Response cancelled');
              session.hasOngoingResponse = false;
              session.pendingSpeechStart = false;
              socket.emit('speech-stopped', { sessionId });
              break;

            case 'conversation.item.input_audio_transcription.completed':
              if (event.transcript) {
                console.log('User transcript received:', event.transcript);
                sessionStats.totalMessages++;
                sessionStats.activeSessions = activeSessions.size;
                // Always send transcript immediately when received
                socket.emit('user-transcript', {
                  sessionId,
                  transcript: event.transcript
                });
                session.pendingUserTranscript = event.transcript;
                logMessage(sessionId, 'user', event.transcript);
                emitMonitoring();
              }
              break;
              
            case 'input_audio_buffer.committed':
              console.log('Audio buffer committed');
              break;

            case 'response.output_item.done':
              if (event.item?.content) {
                const textContent = event.item.content.find(c => c.type === 'text');
                if (textContent?.text) {
                  console.log('Agent response text:', textContent.text.substring(0, 100) + '...');
                  sessionStats.totalMessages++;
                  sessionStats.activeSessions = activeSessions.size;
                  logMessage(sessionId, 'agent', textContent.text);
                  emitMonitoring();
                  // Heuristic: if agent expresses uncertainty, auto-dispatch to human
                  try {
                    const txt = textContent.text.toLowerCase();
                    const uncertainRe = /\b(i('?m)? not sure|i do not know|i don't know|i may be wrong|i might be wrong|not sure|uncertain|unable to help|recommend transfer|please transfer)\b/gi;
                    if (uncertainRe.test(txt)) {
                      console.log('Agent uncertainty detected - dispatching to human for session', sessionId);
                      transferToHuman(sessionId, 'auto_uncertainty_detected');
                    }

                    const closeRe = /\b(call (is )?(closed|ended)|goodbye|terima kasih|panggilan (ditutup|selesai)|end of call|session closed)\b/gi;
                    if (closeRe.test(txt)) {
                      console.log('Agent signaled call closure - closing session', sessionId);
                      closeSession(sessionId, 'agent_signaled_close');
                    }
                  } catch (e) {
                    console.warn('Heuristic check failed', e && e.message);
                  }
                }
              }
              break;
              
            case 'error':
              console.error('OpenAI Realtime error:', event.error);
              // Handle specific error types
              if (event.error?.type === 'invalid_request_error') {
                if (event.error?.message?.includes('no active response')) {
                  console.log('Cancellation failed - no active response (this is normal)');
                  session.hasOngoingResponse = false;
                } else if (event.error?.message?.includes('already has an active response')) {
                  console.log('Response creation blocked - response already in progress');
                  // Don't emit error for this case, just log it
                } else {
                  socket.emit('error', { message: event.error.message || 'Unknown error' });
                }
              } else {
                socket.emit('error', { message: event.error.message || 'Unknown error' });
              }
              break;
              
            default:
              // Log other events for debugging
              if (event.type && !event.type.includes('session.')) {
                console.log('Unhandled event type:', event.type);
              }
              break;
          }
        } catch (error) {
          console.error('Error parsing message:', error, 'Raw data:', data.toString().substring(0, 200));
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          type: error.type
        });
        socket.emit('error', { message: 'OpenAI connection error: ' + error.message });
        activeSessions.delete(sessionId);
      });

      ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
        console.log('Close code meanings:');
        console.log('1000: Normal closure');
        console.log('1001: Going away');
        console.log('1002: Protocol error');
        console.log('1003: Unsupported data');
        console.log('1005: No status received');
        console.log('1006: Abnormal closure');
        console.log('1007: Invalid frame payload data');
        console.log('1008: Policy violation');
        console.log('1009: Message too big');
        console.log('1010: Mandatory extension');
        console.log('1011: Internal server error');
        console.log('1015: TLS handshake');
        
        if (code === 1008) {
          console.error('Policy violation - likely authentication issue');
          socket.emit('error', { message: 'Authentication failed - check API key' });
        } else if (code === 1002) {
          console.error('Protocol error - check request format');
          socket.emit('error', { message: 'Protocol error - invalid request format' });
        }
        
        activeSessions.delete(sessionId);
        sessionStats.activeSessions = activeSessions.size;
        socket.emit('realtime-disconnected', { sessionId });
        // notify dashboards that a session ended
        emitMonitoring();
        emitSessionsUpdate();
      });

    } catch (error) {
      console.error('Error connecting to realtime:', error);
      socket.emit('error', { message: 'Failed to connect' });
    }
  });

  socket.on('send-audio', (data) => {
    const { sessionId, audio } = data;
    const session = activeSessions.get(sessionId);
    
    if (session?.ws && session.isConnected) {
      try {
        session.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: audio
        }));
      } catch (error) {
        console.error('Error sending audio:', error);
      }
    }
  });

  socket.on('send-text', (data) => {
    const { sessionId, text } = data;
    const session = activeSessions.get(sessionId);
    
    if (session?.ws && session.isConnected) {
      console.log('Sending text message:', text);
      
      try {
        // Send text message to OpenAI Realtime API
        session.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text }]
          }
        }));

        // Only create response if no ongoing response
        if (!session.hasOngoingResponse) {
          session.ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text', 'audio'],
              instructions: defaultConfig.instructions
            }
          }));
          
          session.hasOngoingResponse = true;
        } else {
          console.log('Skipping response creation - response already in progress');
        }
        logMessage(sessionId, 'user', text);
        
      } catch (error) {
        console.error('Error sending text message:', error);
      }
    }
  });

  socket.on('interrupt', (data) => {
    const { sessionId } = data;
    const session = activeSessions.get(sessionId);
    
    if (session?.ws && session.isConnected) {
      // Always try to cancel, but don't error if no response is active
      try {
        if (session.hasOngoingResponse) {
          session.ws.send(JSON.stringify({
            type: 'response.cancel'
          }));
          session.hasOngoingResponse = false;
          console.log('Agent interrupted by user');
        } else {
          console.log('Interrupt requested but no active response to cancel');
        }
      } catch (error) {
        console.warn('Failed to interrupt agent:', error.message);
        // Reset state anyway
        session.hasOngoingResponse = false;
      }
    }
  });

  socket.on('disconnect-realtime', (data) => {
    const { sessionId } = data;
    const session = activeSessions.get(sessionId);
    
    if (session?.ws) {
      session.ws.close();
    }
    
    activeSessions.delete(sessionId);
  });

  socket.on('pdf-changed', (data) => {
    console.log('PDF changed by admin:', data.filename);
    // Broadcast to all connected users
    socket.broadcast.emit('pdf-updated', {
      filename: data.filename,
      timestamp: data.timestamp
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Admin manual actions via socket
  socket.on('dispatch-human', (data) => {
    if (!socket.data?.isAdmin) return socket.emit('error', { message: 'Admin only' });
    const { sessionId, reason } = data || {};
    if (!sessionId) return socket.emit('error', { message: 'sessionId required' });
    
    // Notify customer that human agent is taking over
    const session = activeSessions.get(sessionId);
    if (session && session.ws && session.isConnected) {
      try {
        // Send message to customer via OpenAI
        session.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'assistant',
            content: [{
              type: 'text',
              text: 'Mohon tunggu sebentar, saya akan menghubungkan Anda dengan customer service kami.'
            }]
          }
        }));
        
        // Create response
        if (!session.hasOngoingResponse) {
          session.ws.send(JSON.stringify({
            type: 'response.create',
            response: { modalities: ['text', 'audio'] }
          }));
          session.hasOngoingResponse = true;
        }
        
        // Emit to customer's socket
        io.to(sessionId).emit('admin-takeover', {
          message: 'Admin is joining the conversation',
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Failed to notify customer:', e.message);
      }
    }
    
    transferToHuman(sessionId, reason || 'manual_admin');
  });

  socket.on('close-call', (data) => {
    if (!socket.data?.isAdmin) return socket.emit('error', { message: 'Admin only' });
    const { sessionId, reason } = data || {};
    if (!sessionId) return socket.emit('error', { message: 'sessionId required' });
    closeSession(sessionId, reason || 'manual_admin_close');
  });
});

async function logMessage(sessionId, type, message) {
  try {
    await fetch('http://127.0.0.1:8004/log-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        participant_type: type,
        message: message,
        timestamp: new Date().toISOString(),
        status: 'active'
      })
    });
  } catch (error) {
    console.error('Error logging:', error);
  }
}

// Using OpenAI Realtime API only - no additional helper functions needed

const PORT = process.env.PORT || 3000;

// Periodically emit monitoring and sessions (every 2s)
setInterval(() => {
  emitMonitoring();
  emitSessionsUpdate();
}, 2000);

// Watch call_logs for changes and debounce emits to admins (fs.watch fallback)
let watchTimeout = null;
try {
  if (fs.existsSync(CALL_LOGS_DIR)) {
    fs.watch(CALL_LOGS_DIR, { persistent: false }, (eventType, filename) => {
      if (!filename) return;
      if (watchTimeout) clearTimeout(watchTimeout);
      watchTimeout = setTimeout(() => {
        emitSessionsUpdate();
      }, 250);
    });
  }
} catch (e) {
  console.warn('fs.watch for call_logs failed', e && e.message);
}
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Start background tasks
  setInterval(emitMonitoring, 5000); // every 5s
  setInterval(emitSessionsUpdate, 15000); // every 15s
  emitSessionsUpdate(); // initial call
});