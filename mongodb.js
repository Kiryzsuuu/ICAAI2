// mongodb.js - MongoDB Database Operations
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'icaai-db';

let client = null;
let db = null;

// Initialize MongoDB connection
async function initClient() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DATABASE_NAME);
    console.log('✅ Connected to MongoDB:', DATABASE_NAME);
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

// Create a new user
async function createUser(userData) {
  const database = await initClient();
  const users = database.collection('users');
  
  const user = {
    ...userData,
    createdAt: userData.createdAt || new Date().toISOString(),
    isAdmin: userData.isAdmin || false
  };
  
  await users.insertOne(user);
  return user;
}

// Get user by email
async function getUserByEmail(email) {
  const database = await initClient();
  const users = database.collection('users');
  return await users.findOne({ email: email.toLowerCase() });
}

// Get user by ID
async function getUserById(id) {
  const database = await initClient();
  const users = database.collection('users');
  
  // Try to find by custom id field first
  let user = await users.findOne({ id: id });
  
  // If not found and id looks like ObjectId, try MongoDB _id
  if (!user && id && id.match(/^[0-9a-fA-F]{24}$/)) {
    const { ObjectId } = require('mongodb');
    user = await users.findOne({ _id: new ObjectId(id) });
  }
  
  // If not found, try email as fallback
  if (!user && id && id.includes('@')) {
    user = await users.findOne({ email: id.toLowerCase() });
  }
  
  return user;
}

// Get all users
async function getAllUsers() {
  const database = await initClient();
  const users = database.collection('users');
  return await users.find({}).toArray();
}

// Check if user is admin
async function isAdmin(email) {
  const user = await getUserByEmail(email);
  return user ? user.isAdmin === true : false;
}

// Check if user is super admin
async function isSuperAdmin(email) {
  return email === 'maskiryz23@gmail.com';
}

// Get user role
async function getUserRole(email) {
  if (await isSuperAdmin(email)) {
    return 'superadmin';
  } else if (await isAdmin(email)) {
    return 'admin';
  } else {
    return 'user';
  }
}

// Set admin status
async function setAdmin(email, isAdminStatus) {
  const database = await initClient();
  const users = database.collection('users');
  
  const result = await users.updateOne(
    { email: email.toLowerCase() },
    { $set: { isAdmin: isAdminStatus } }
  );
  
  return result.modifiedCount > 0;
}

// Update user
async function updateUser(email, updates) {
  const database = await initClient();
  const users = database.collection('users');
  
  const result = await users.updateOne(
    { email: email.toLowerCase() },
    { $set: updates }
  );
  
  return result.modifiedCount > 0;
}

// Delete user
async function deleteUser(email) {
  const database = await initClient();
  const users = database.collection('users');
  
  const result = await users.deleteOne({ email: email.toLowerCase() });
  return result.deletedCount > 0;
}

// Delete user by ID
async function deleteUserById(id) {
  const database = await initClient();
  const users = database.collection('users');
  
  const result = await users.deleteOne({ id: id });
  return result.deletedCount > 0;
}

// Create order
async function createOrder(orderData) {
  const database = await initClient();
  const orders = database.collection('orders');
  
  const order = {
    ...orderData,
    createdAt: orderData.createdAt || new Date().toISOString()
  };
  
  await orders.insertOne(order);
  return order;
}

// Get all orders
async function getAllOrders() {
  const database = await initClient();
  const orders = database.collection('orders');
  return await orders.find({}).sort({ createdAt: -1 }).toArray();
}

// Get order by ID
async function getOrderById(id) {
  const database = await initClient();
  const orders = database.collection('orders');
  return await orders.findOne({ id: id });
}

// Update order status
async function updateOrderStatus(orderId, status) {
  const database = await initClient();
  const orders = database.collection('orders');
  
  const result = await orders.updateOne(
    { id: orderId },
    { $set: { status: status, updatedAt: new Date().toISOString() } }
  );
  
  return result.modifiedCount > 0;
}

// PDF Management Functions

// Create PDF document
async function createPDF(pdfData) {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  return await pdfs.insertOne({
    ...pdfData,
    id: Date.now().toString(),
    createdAt: new Date()
  });
}

// Get all PDFs
async function getAllPDFs() {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  return await pdfs.find({}).sort({ uploadedAt: -1 }).toArray();
}

// Get PDF by ID
async function getPDFById(id) {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  
  // Try MongoDB _id first
  if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
    const { ObjectId } = require('mongodb');
    let pdf = await pdfs.findOne({ _id: new ObjectId(id) });
    if (pdf) return pdf;
  }
  
  // Try custom id
  return await pdfs.findOne({ id: id });
}

// Select PDF (mark as active)
async function selectPDF(pdfId) {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  
  // Unselect all PDFs first
  await pdfs.updateMany({}, { $set: { selected: false } });
  
  // Select the specified PDF
  if (pdfId && pdfId.match(/^[0-9a-fA-F]{24}$/)) {
    const { ObjectId } = require('mongodb');
    return await pdfs.updateOne({ _id: new ObjectId(pdfId) }, { $set: { selected: true } });
  } else {
    return await pdfs.updateOne({ id: pdfId }, { $set: { selected: true } });
  }
}

// Get selected PDF
async function getSelectedPDF() {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  return await pdfs.findOne({ selected: true });
}

// Delete PDF
async function deletePDF(pdfId) {
  const database = await initClient();
  const pdfs = database.collection('pdfs');
  
  if (pdfId && pdfId.match(/^[0-9a-fA-F]{24}$/)) {
    const { ObjectId } = require('mongodb');
    return await pdfs.deleteOne({ _id: new ObjectId(pdfId) });
  } else {
    return await pdfs.deleteOne({ id: pdfId });
  }
}

// Close connection
async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

module.exports = {
  initClient,
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  isAdmin,
  isSuperAdmin,
  getUserRole,
  setAdmin,
  updateUser,
  deleteUser,
  deleteUserById,
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  createPDF,
  getAllPDFs,
  getPDFById,
  selectPDF,
  getSelectedPDF,
  deletePDF,
  closeConnection
};
