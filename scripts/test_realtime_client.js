const io = require('socket.io-client');

const SERVER = 'http://localhost:4000';
const socket = io(SERVER, { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('Connected to server via socket.io, id=', socket.id);
  // Request a realtime session
  socket.emit('connect-realtime', { sessionId: 'test-client-1' });
});

socket.on('realtime-connected', (data) => {
  console.log('realtime-connected', data);
});

socket.on('audio-delta', (d) => {
  console.log('audio-delta received, delta length:', d.delta?.length ?? 'unknown');
});

socket.on('text-delta', (d) => {
  console.log('text-delta:', d.delta);
});

socket.on('response-done', (d) => {
  console.log('response-done', d);
});

socket.on('realtime-disconnected', (d) => {
  console.log('realtime-disconnected', d);
});

socket.on('error', (e) => {
  console.error('socket error', e);
});

socket.on('disconnect', (reason) => {
  console.log('socket disconnect', reason);
  process.exit(0);
});

// keep alive
setTimeout(() => {
  console.log('Test client finished after timeout');
  process.exit(0);
}, 20000);
