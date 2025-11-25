// cosmosdb.js - Azure Cosmos DB Client
const { CosmosClient } = require('@azure/cosmos');

let client;
let database;
let usersContainer;
let ordersContainer;

// Lazy initialization function
function initClient() {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    const databaseId = process.env.COSMOS_DATABASE || 'icaai-db';
    
    // Validate required environment variables
    if (!endpoint || !key) {
      throw new Error('Missing required Cosmos DB environment variables: COSMOS_ENDPOINT and COSMOS_KEY must be set');
    }
    
    client = new CosmosClient({ endpoint, key });
    database = client.database(databaseId);
    usersContainer = database.container('users');
    ordersContainer = database.container('orders');
  }
  return { usersContainer, ordersContainer };
}

// User Operations
async function createUser(user) {
  const { usersContainer } = initClient();
  const { resource } = await usersContainer.items.create(user);
  return resource;
}

async function getUserByEmail(email) {
  const { usersContainer } = initClient();
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.email = @email',
    parameters: [{ name: '@email', value: email }]
  };
  const { resources } = await usersContainer.items.query(querySpec).fetchAll();
  return resources[0];
}

async function getUserById(id) {
  const { usersContainer } = initClient();
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.id = @id',
    parameters: [{ name: '@id', value: id }]
  };
  const { resources } = await usersContainer.items.query(querySpec).fetchAll();
  return resources[0];
}

async function getAllUsers() {
  const { usersContainer } = initClient();
  const { resources } = await usersContainer.items.readAll().fetchAll();
  return resources;
}

async function updateUser(email, updates) {
  const { usersContainer } = initClient();
  const user = await getUserByEmail(email);
  if (!user) throw new Error('User not found');
  
  const updated = { ...user, ...updates };
  const { resource } = await usersContainer.item(user.id, email).replace(updated);
  return resource;
}

async function deleteUser(id, email) {
  const { usersContainer } = initClient();
  await usersContainer.item(id, email).delete();
}

// Admin Operations
async function isAdmin(email) {
  const user = await getUserByEmail(email);
  return user?.isAdmin === true;
}

async function setAdmin(email, isAdmin) {
  return await updateUser(email, { isAdmin });
}

// Reset Token Operations
async function saveResetToken(token, email, expiry) {
  await updateUser(email, {
    resetToken: token,
    resetTokenExpiry: expiry
  });
}

async function getUserByResetToken(token) {
  const { usersContainer } = initClient();
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.resetToken = @token AND c.resetTokenExpiry > @now',
    parameters: [
      { name: '@token', value: token },
      { name: '@now', value: Date.now() }
    ]
  };
  const { resources } = await usersContainer.items.query(querySpec).fetchAll();
  return resources[0];
}

async function clearResetToken(email) {
  return await updateUser(email, {
    resetToken: null,
    resetTokenExpiry: null
  });
}

// Order Operations
async function createOrder(order) {
  const { ordersContainer } = initClient();
  const { resource } = await ordersContainer.items.create(order);
  return resource;
}

async function getOrdersByUser(userEmail) {
  const { ordersContainer } = initClient();
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.userEmail = @email ORDER BY c.createdAt DESC',
    parameters: [{ name: '@email', value: userEmail }]
  };
  const { resources } = await ordersContainer.items.query(querySpec).fetchAll();
  return resources;
}

async function getAllOrders() {
  const { ordersContainer } = initClient();
  const querySpec = {
    query: 'SELECT * FROM c ORDER BY c.createdAt DESC'
  };
  const { resources } = await ordersContainer.items.query(querySpec).fetchAll();
  return resources;
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  isAdmin,
  setAdmin,
  saveResetToken,
  getUserByResetToken,
  clearResetToken,
  createOrder,
  getOrdersByUser,
  getAllOrders
};
