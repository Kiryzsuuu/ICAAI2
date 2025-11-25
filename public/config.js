// config.js - Frontend configuration
window.APP_CONFIG = {
  BACKEND_URL: 'https://icaai-backend1-c3evfuava8budyhx.indonesiacentral-01.azurewebsites.net',
  API_URL: window.location.origin, // Vercel frontend API
  ENABLE_REALTIME: false, // Socket.IO disabled on Vercel serverless
  ENABLE_VOICE: false // Voice features disabled for now
};
